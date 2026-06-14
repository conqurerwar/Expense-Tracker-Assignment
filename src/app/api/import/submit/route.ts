import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { RawRow, matchMemberAlias, cleanName, normalizeCapitalization, parseCsvDate, parseAmount, parseSplitDetails } from "@/services/importEngine";

interface DecisionDetail {
  decision: "APPLY_FIX" | "IMPORT_AS_IS" | "SKIP_ROW" | "MANUAL_EDIT";
  issueType?: string;
  confidence?: number;
  description?: string;
  recommendedAction?: string;
  resolvedValue?: RawRow;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      groupId = "default-group-id",
      fileName = "expenses export.csv",
      rows = [] as RawRow[],
      decisions = {} as Record<string, DecisionDetail>, // Keyed by row index (1-based string)
      nameMappings = {} as Record<string, string>, // Maps CSV names to existing member names (or 'CREATE_NEW')
      memberPeriods = {} as Record<string, { joinedAt: string; leftAt: string | null }>, // Configured joined/left dates
    } = body;

    // Get current user if authenticated, or default to a system/admin identifier
    const authUser = await getAuthUser(request);
    const actorEmail = authUser?.email || "system@example.com";
    
    // Find the actor user
    let systemUser = await prisma.user.findFirst({ where: { email: actorEmail } });
    if (!systemUser) {
      // Auto-create system user if not exists to satisfy foreign key in AuditLog
      systemUser = await prisma.user.create({
        data: {
          email: actorEmail,
          name: actorEmail.split("@")[0]
        }
      });
    }

    // 1. Find or auto-create the group
    let dbGroup = await prisma.group.findUnique({ where: { id: groupId } });

    if (!dbGroup) {
      // Try to use the first available group
      dbGroup = await prisma.group.findFirst();
    }

    if (!dbGroup) {
      // Auto-create a default group so the import can proceed
      dbGroup = await prisma.group.create({
        data: {
          name: "Flatmates",
          description: "Auto-created group for CSV import",
        }
      });
    }

    const resolvedGroupId = dbGroup.id;


    // Prepare Name Mapping & User Creation
    const finalUserCache: Record<string, { id: string; name: string }> = {};

    // Get all current users in system
    const existingUsers = await prisma.user.findMany();
    const existingGroupMembers = await prisma.groupMember.findMany({
      where: { groupId: resolvedGroupId },
      include: { user: true }
    });

    // Process import sequentially (no single transaction to avoid TiDB 5s timeout)
    const resultReport = await (async () => {
      // A. Create/Update members & timelines
      for (const name of Object.keys(memberPeriods)) {
        const period = memberPeriods[name];
        const normalized = normalizeCapitalization(name);

        // Check if user exists
        let user = existingUsers.find(u => normalizeCapitalization(u.name) === normalized);
        if (!user) {
          user = await prisma.user.create({
            data: {
              email: `${normalized.toLowerCase()}@example.com`,
              name: normalized
            }
          });
        }

        // Upsert group membership
        await prisma.groupMember.upsert({
          where: {
            groupId_userId: {
              groupId: resolvedGroupId,
              userId: user.id
            }
          },
          update: {
            joinedAt: new Date(period.joinedAt),
            leftAt: period.leftAt ? new Date(period.leftAt) : null
          },
          create: {
            groupId: resolvedGroupId,
            userId: user.id,
            joinedAt: new Date(period.joinedAt),
            leftAt: period.leftAt ? new Date(period.leftAt) : null
          }
        });

        // Audit Log membership timeline change
        await prisma.auditLog.create({
          data: {
            userId: systemUser.id,
            action: "UPDATE_MEMBERSHIP_TIMELINE",
            entityType: "GroupMember",
            entityId: user.id,
            newValue: JSON.stringify({ name: normalized, joinedAt: period.joinedAt, leftAt: period.leftAt })
          }
        });
      }

      // Refresh cache of members in the transaction
      const allGroupMembers = await prisma.groupMember.findMany({
        where: { groupId: resolvedGroupId },
        include: { user: true }
      });

      allGroupMembers.forEach(gm => {
        finalUserCache[normalizeCapitalization(gm.user.name)] = {
          id: gm.userId,
          name: gm.user.name
        };
      });

      // B. Create Import Run Header
      const importRun = await prisma.import.create({
        data: {
          fileName,
          status: "PENDING",
          rowsProcessed: rows.length,
          rowsImported: 0,
          warningsCount: 0,
          errorsCount: 0
        }
      });

      let importedCount = 0;
      let skippedCount = 0;
      let warningsCount = 0;
      let errorsCount = 0;
      const appliedDecisions: string[] = [];

      // C. Process rows
      for (let index = 0; index < rows.length; index++) {
        const rawRow = rows[index];
        const rowIndex = index + 1;
        const rowDecision = decisions[rowIndex.toString()];

        if (rowDecision && rowDecision.decision === "SKIP_ROW") {
          skippedCount++;
          // Record skip in issues
          await prisma.importIssue.create({
            data: {
              importId: importRun.id,
              rowIndex,
              issueType: rowDecision.issueType || "User Skip",
              confidence: rowDecision.confidence || 1.0,
              affectedRowData: JSON.stringify(rawRow),
              description: rowDecision.description || "Row skipped by user during import review.",
              recommendedAction: rowDecision.recommendedAction || "None",
              userDecision: "SKIP_ROW",
              finalResolution: "Skipped",
              resolvedValue: null,
              appliedAt: new Date()
            }
          });
          continue;
        }

        // Use resolved values if fixing/editing
        let rowToImport = rawRow;
        if (rowDecision && (rowDecision.decision === "APPLY_FIX" || rowDecision.decision === "MANUAL_EDIT") && rowDecision.resolvedValue) {
          rowToImport = rowDecision.resolvedValue;
          appliedDecisions.push(`Row ${rowIndex}: Applied decision ${rowDecision.decision} - ${rowDecision.issueType}`);
        }

        // 1. Resolve date
        const dateResult = parseCsvDate(rowToImport.date);
        if (!dateResult.parsedDate) {
          errorsCount++;
          // Save issue and skip due to critical error
          await prisma.importIssue.create({
            data: {
              importId: importRun.id,
              rowIndex,
              issueType: "Invalid Date Error",
              confidence: 1.0,
              affectedRowData: JSON.stringify(rawRow),
              description: `Critical: Date '${rowToImport.date}' could not be parsed.`,
              recommendedAction: "Manually correct the date.",
              userDecision: "SKIP_ROW",
              finalResolution: "Error: Skipped due to invalid date.",
              appliedAt: new Date()
            }
          });
          continue;
        }
        const expenseDate = dateResult.parsedDate;

        // 2. Resolve Payer Name mapping
        const rawPayerName = cleanName(rowToImport.paid_by);
        const normalizedPayer = normalizeCapitalization(rawPayerName);
        let payerName = nameMappings[rawPayerName] || normalizedPayer;
        
        // Find in our member list
        let payerInfo = finalUserCache[normalizeCapitalization(payerName)];
        if (!payerInfo) {
          // Fallback matching alias
          const matchedKey = Object.keys(finalUserCache).find(
            k => matchMemberAlias(payerName, [k]).match !== null
          );
          if (matchedKey) {
            payerInfo = finalUserCache[matchedKey];
          }
        }

        if (!payerInfo) {
          errorsCount++;
          await prisma.importIssue.create({
            data: {
              importId: importRun.id,
              rowIndex,
              issueType: "Missing Payer Database Link",
              confidence: 1.0,
              affectedRowData: JSON.stringify(rawRow),
              description: `Critical: Payer '${rowToImport.paid_by}' could not be resolved to a group member.`,
              recommendedAction: "Resolve name mappings before import.",
              userDecision: "SKIP_ROW",
              finalResolution: "Error: Skipped due to unresolvable payer.",
              appliedAt: new Date()
            }
          });
          continue;
        }

        // 3. Resolve Amount & Currency
        const amtResult = parseAmount(rowToImport.amount);
        const rawAmount = amtResult.amount;
        const currency = (rowToImport.currency || "INR").trim().toUpperCase();

        // Perform currency conversion
        let exchangeRate = 1.0;
        let convertedAmount = rawAmount;
        if (currency === "USD") {
          // Retrieve exchange rate active on the expense date
          const rateRecord = await prisma.exchangeRate.findFirst({
            where: {
              fromCurrency: "USD",
              toCurrency: "INR",
              effectiveDate: { lte: expenseDate }
            },
            orderBy: { effectiveDate: "desc" }
          });
          exchangeRate = rateRecord ? rateRecord.rate : 83.0; // Default to 83.0 if none exists
          convertedAmount = rawAmount * exchangeRate;
        }

        // 4. Handle reclassified settlements
        const isSettlement = rowToImport.split_type?.toLowerCase() === "settlement";
        if (isSettlement) {
          // Reclassified as Settlement
          // Payer is payerInfo.id
          // Payee is the split_with user (only one allowed)
          const rawPayeeName = cleanName(rowToImport.split_with);
          const payeeNameMapped = nameMappings[rawPayeeName] || normalizeCapitalization(rawPayeeName);
          let payeeInfo = finalUserCache[normalizeCapitalization(payeeNameMapped)];
          
          if (!payeeInfo) {
            // Fallback matching alias
            const matchedKey = Object.keys(finalUserCache).find(
              k => matchMemberAlias(payeeNameMapped, [k]).match !== null
            );
            if (matchedKey) {
              payeeInfo = finalUserCache[matchedKey];
            }
          }

          if (!payeeInfo) {
            errorsCount++;
            await prisma.importIssue.create({
              data: {
                importId: importRun.id,
                rowIndex,
                issueType: "Settlement Payee Error",
                confidence: 1.0,
                affectedRowData: JSON.stringify(rawRow),
                description: `Critical: Settlement payee '${rowToImport.split_with}' could not be resolved.`,
                recommendedAction: "Check split_with column and name mappings.",
                userDecision: "SKIP_ROW",
                finalResolution: "Error: Skipped due to unresolvable payee.",
                appliedAt: new Date()
              }
            });
            continue;
          }

          // Create Settlement
          const settlement = await prisma.settlement.create({
            data: {
              groupId: resolvedGroupId,
              payerId: payerInfo.id,
              payeeId: payeeInfo.id,
              amount: Math.round(convertedAmount * 100) / 100,
              originalAmount: rawAmount,
              originalCurrency: currency,
              exchangeRate,
              date: expenseDate,
              notes: rowToImport.notes || rowToImport.description,
              importId: importRun.id
            }
          });

          // Log Audit
          await prisma.auditLog.create({
            data: {
              userId: systemUser.id,
              action: "IMPORT_SETTLEMENT",
              entityType: "Settlement",
              entityId: settlement.id,
              newValue: JSON.stringify(settlement)
            }
          });

          // Record resolved issue if one existed for this row
          if (rowDecision) {
            await prisma.importIssue.create({
              data: {
                importId: importRun.id,
                rowIndex,
                issueType: rowDecision.issueType || "Settlement Reclassification",
                confidence: rowDecision.confidence || 0.95,
                affectedRowData: JSON.stringify(rawRow),
                description: rowDecision.description || "Settlement reclassified.",
                recommendedAction: rowDecision.recommendedAction || "Convert",
                userDecision: rowDecision.decision,
                finalResolution: `Imported as Settlement ID: ${settlement.id}`,
                resolvedValue: JSON.stringify(rowToImport),
                appliedAt: new Date()
              }
            });
          }

          importedCount++;
          continue;
        }

        // 5. Handle regular Expense and Split calculations
        // Resolve participants
        const rawSplitWith = rowToImport.split_with || "";
        const rawParticipantsNames = rawSplitWith.split(";").map((p: string) => cleanName(p)).filter((p: string) => p !== "");

        const participantInfos: Array<{ id: string; name: string }> = [];
        rawParticipantsNames.forEach((rawName: string) => {
          const mappedName = nameMappings[rawName] || normalizeCapitalization(rawName);
          let pInfo = finalUserCache[normalizeCapitalization(mappedName)];
          if (!pInfo) {
            const matchedKey = Object.keys(finalUserCache).find(
              k => matchMemberAlias(mappedName, [k]).match !== null
            );
            if (matchedKey) pInfo = finalUserCache[matchedKey];
          }
          if (pInfo) {
            participantInfos.push(pInfo);
          }
        });

        if (participantInfos.length === 0) {
          errorsCount++;
          await prisma.importIssue.create({
            data: {
              importId: importRun.id,
              rowIndex,
              issueType: "No Participants Error",
              confidence: 1.0,
              affectedRowData: JSON.stringify(rawRow),
              description: `Critical: Expense contains no valid participants.`,
              recommendedAction: "Provide valid group members in split_with.",
              userDecision: "SKIP_ROW",
              finalResolution: "Error: Skipped due to no valid participants.",
              appliedAt: new Date()
            }
          });
          continue;
        }

        // Determine who was active on the expense date
        const activeMemberIdsAtDate = allGroupMembers.filter(gm => {
          const joined = new Date(gm.joinedAt);
          const left = gm.leftAt ? new Date(gm.leftAt) : null;
          return expenseDate >= joined && (left === null || expenseDate <= left);
        }).map(gm => gm.userId);

        const splitType = (rowToImport.split_type || "equal").trim().toLowerCase();
        const splitDetails = parseSplitDetails(rowToImport.split_details);

        // Filter participants to only active members if split type is equal (timeline enforcement)
        let eligibleParticipants = participantInfos;
        if (splitType === "equal") {
          eligibleParticipants = participantInfos.filter(p => activeMemberIdsAtDate.includes(p.id));
          
          // If some participants were inactive, add a warning issue record
          const inactiveParticipants = participantInfos.filter(p => !activeMemberIdsAtDate.includes(p.id));
          if (inactiveParticipants.length > 0) {
            warningsCount++;
            await prisma.importIssue.create({
              data: {
                importId: importRun.id,
                rowIndex,
                issueType: "Inactive Member Excluded",
                confidence: 0.95,
                affectedRowData: JSON.stringify(rawRow),
                description: `Timeline Warning: Inactive participants excluded from equal split: ${inactiveParticipants.map(ip => ip.name).join(", ")}.`,
                recommendedAction: "Exclude inactive member from split.",
                userDecision: "APPLY_FIX",
                finalResolution: `Excluded inactive members: ${inactiveParticipants.map(ip => ip.name).join(", ")}`,
                appliedAt: new Date()
              }
            });
          }
        }

        if (eligibleParticipants.length === 0) {
          errorsCount++;
          await prisma.importIssue.create({
            data: {
              importId: importRun.id,
              rowIndex,
              issueType: "No Active Participants Error",
              confidence: 1.0,
              affectedRowData: JSON.stringify(rawRow),
              description: `Critical: No active members found for expense split on date ${expenseDate.toISOString().split("T")[0]}.`,
              recommendedAction: "Select a date within membership range or adjust membership dates.",
              userDecision: "SKIP_ROW",
              finalResolution: "Error: Skipped due to no active participants on date.",
              appliedAt: new Date()
            }
          });
          continue;
        }

        // Calculate Splits
        interface UserSplitCalc {
          userId: string;
          amountInr: number;
          amountOriginal: number;
          ratio?: number;
          percentage?: number;
        }

        const calculatedSplits: UserSplitCalc[] = [];

        if (splitType === "equal") {
          const count = eligibleParticipants.length;
          const shareOriginal = rawAmount / count;
          const shareInr = convertedAmount / count;

          eligibleParticipants.forEach(p => {
            calculatedSplits.push({
              userId: p.id,
              amountOriginal: shareOriginal,
              amountInr: shareInr
            });
          });
        } else if (splitType === "unequal") {
          // Parse unequal values
          let totalParsedOriginal = 0;
          splitDetails.forEach(d => {
            const mappedName = nameMappings[d.member] || normalizeCapitalization(d.member);
            const pInfo = finalUserCache[normalizeCapitalization(mappedName)];
            if (pInfo) {
              const userAmtOriginal = d.value;
              const userAmtInr = userAmtOriginal * exchangeRate;
              calculatedSplits.push({
                userId: pInfo.id,
                amountOriginal: userAmtOriginal,
                amountInr: userAmtInr
              });
              totalParsedOriginal += userAmtOriginal;
            }
          });

          // Validation: sum must match raw amount
          if (Math.abs(totalParsedOriginal - rawAmount) > 0.01) {
            warningsCount++;
            // Create Warning and adjust slightly
            await prisma.importIssue.create({
              data: {
                importId: importRun.id,
                rowIndex,
                issueType: "Unequal Split Mismatch",
                confidence: 1.0,
                affectedRowData: JSON.stringify(rawRow),
                description: `Split details sum to ${totalParsedOriginal}, but expense amount is ${rawAmount}.`,
                recommendedAction: "Normalize splits or adjust expense total.",
                userDecision: "IMPORT_AS_IS",
                finalResolution: "Imported unequal split despite total mismatch.",
                appliedAt: new Date()
              }
            });
          }
        } else if (splitType === "percentage") {
          let details = splitDetails;
          let totalPct = details.reduce((sum, d) => sum + d.value, 0);

          // If percentages do not equal 100%, check if we normalize based on user decisions
          const shouldNormalize = rowDecision?.issueType === "Invalid Split Percentages" &&
                                  (rowDecision.decision === "APPLY_FIX" || rowDecision.decision === "MANUAL_EDIT");

          if (totalPct !== 100 && shouldNormalize) {
            // Normalize proportionally to 100%
            details = details.map(d => ({
              member: d.member,
              value: (d.value / totalPct) * 100
            }));
            totalPct = 100;
          }

          details.forEach(d => {
            const mappedName = nameMappings[d.member] || normalizeCapitalization(d.member);
            const pInfo = finalUserCache[normalizeCapitalization(mappedName)];
            if (pInfo) {
              const pct = d.value;
              const userAmtOriginal = (pct / 100) * rawAmount;
              const userAmtInr = (pct / 100) * convertedAmount;
              calculatedSplits.push({
                userId: pInfo.id,
                amountOriginal: userAmtOriginal,
                amountInr: userAmtInr,
                percentage: pct
              });
            }
          });

          if (totalPct !== 100) {
            warningsCount++;
            await prisma.importIssue.create({
              data: {
                importId: importRun.id,
                rowIndex,
                issueType: "Percentage Split Warning",
                confidence: 1.0,
                affectedRowData: JSON.stringify(rawRow),
                description: `Imported percentage splits with total sum of ${totalPct}% instead of 100%.`,
                recommendedAction: "Apply proportion scaling.",
                userDecision: "IMPORT_AS_IS",
                finalResolution: `Imported percentages summing to ${totalPct}%.`,
                appliedAt: new Date()
              }
            });
          }
        } else if (splitType === "share") {
          let totalShares = splitDetails.reduce((sum, d) => sum + d.value, 0);
          if (totalShares === 0) totalShares = 1;

          splitDetails.forEach(d => {
            const mappedName = nameMappings[d.member] || normalizeCapitalization(d.member);
            const pInfo = finalUserCache[normalizeCapitalization(mappedName)];
            if (pInfo) {
              const shares = d.value;
              const userAmtOriginal = (shares / totalShares) * rawAmount;
              const userAmtInr = (shares / totalShares) * convertedAmount;
              calculatedSplits.push({
                userId: pInfo.id,
                amountOriginal: userAmtOriginal,
                amountInr: userAmtInr,
                ratio: shares
              });
            }
          });
        }

        // Create Expense record
        const expense = await prisma.expense.create({
          data: {
            groupId: resolvedGroupId,
            description: rowToImport.description,
            paidById: payerInfo.id,
            amount: Math.round(convertedAmount * 100) / 100,
            originalAmount: rawAmount,
            originalCurrency: currency,
            exchangeRate,
            splitType,
            notes: rowToImport.notes,
            date: expenseDate,
            importId: importRun.id
          }
        });

        // Create Expense Participants
        for (const part of eligibleParticipants) {
          await prisma.expenseParticipant.create({
            data: {
              expenseId: expense.id,
              userId: part.id
            }
          });
        }

        // Create Expense Splits
        for (const split of calculatedSplits) {
          await prisma.expenseSplit.create({
            data: {
              expenseId: expense.id,
              userId: split.userId,
              amount: Math.round(split.amountInr * 100) / 100,
              originalAmount: Math.round(split.amountOriginal * 100) / 100,
              ratio: split.ratio || null,
              percentage: split.percentage || null
            }
          });
        }

        // Audit Log expense import
        await prisma.auditLog.create({
          data: {
            userId: systemUser.id,
            action: "IMPORT_EXPENSE",
            entityType: "Expense",
            entityId: expense.id,
            newValue: JSON.stringify({ expense, splits: calculatedSplits })
          }
        });

        // Record resolution of row issues if decision was made
        if (rowDecision) {
          await prisma.importIssue.create({
            data: {
              importId: importRun.id,
              rowIndex,
              issueType: rowDecision.issueType || "Anomaly Resolved",
              confidence: rowDecision.confidence || 1.0,
              affectedRowData: JSON.stringify(rawRow),
              description: rowDecision.description || "Anomaly detected and resolved.",
              recommendedAction: rowDecision.recommendedAction || "None",
              userDecision: rowDecision.decision,
              finalResolution: `Imported as Expense ID: ${expense.id}`,
              resolvedValue: JSON.stringify(rowToImport),
              appliedAt: new Date()
            }
          });
        }

        importedCount++;
      }

      // D. Update Import Run Header status
      const finalImport = await prisma.import.update({
        where: { id: importRun.id },
        data: {
          status: "COMPLETED",
          rowsImported: importedCount,
          warningsCount,
          errorsCount
        }
      });

      return {
        importId: finalImport.id,
        rowsProcessed: rows.length,
        imported: importedCount,
        skipped: skippedCount,
        warnings: warningsCount,
        errors: errorsCount,
        appliedDecisions
      };
    })();

    return NextResponse.json({
      success: true,
      report: resultReport
    });
  } catch (error: any) {
    console.error("Submit Import API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to finalize CSV import" },
      { status: 500 }
    );
  }
}
