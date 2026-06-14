import { prisma } from "../lib/db";
import { parse } from "papaparse";

export interface RawRow {
  date: string;
  description: string;
  paid_by: string;
  amount: string;
  currency: string;
  split_type: string;
  split_with: string;
  split_details: string;
  notes: string;
}

export interface ImportIssueDetail {
  rowIndex: number;
  issueType: string;
  confidence: number;
  affectedRowData: RawRow;
  description: string;
  recommendedAction: string;
  recommendedFix: any; // The proposed fixed values
}

// Known default members and their default active periods
export const KNOWN_MEMBERS_DEFAULT = [
  { name: "Aisha", joinedAt: "2026-02-01T00:00:00.000Z", leftAt: null },
  { name: "Rohan", joinedAt: "2026-02-01T00:00:00.000Z", leftAt: null },
  { name: "Priya", joinedAt: "2026-02-01T00:00:00.000Z", leftAt: null },
  { name: "Meera", joinedAt: "2026-02-01T00:00:00.000Z", leftAt: "2026-03-31T23:59:59.999Z" },
  { name: "Sam", joinedAt: "2026-04-15T00:00:00.000Z", leftAt: null },
  { name: "Dev", joinedAt: "2026-02-01T00:00:00.000Z", leftAt: "2026-03-31T23:59:59.999Z" }, // dev visiting/temporary member
];

// Helper to clean name
export function cleanName(name: string): string {
  if (!name) return "";
  return name.trim();
}

// Helper to normalize capitalization (e.g. priya -> Priya)
export function normalizeCapitalization(name: string): string {
  const cleaned = cleanName(name);
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

// Alias matching with confidence score
export function matchMemberAlias(name: string, activeMembers: string[]): { match: string | null; confidence: number } {
  const normalized = normalizeCapitalization(name);
  if (!normalized) return { match: null, confidence: 0 };
  
  if (activeMembers.includes(normalized)) {
    return { match: normalized, confidence: normalized === cleanName(name) ? 1.0 : 0.99 };
  }

  // Check startsWith/includes aliases like "Priya S" -> "Priya"
  for (const member of activeMembers) {
    if (normalized.startsWith(member) || member.startsWith(normalized)) {
      return { match: member, confidence: 0.82 };
    }
  }

  return { match: null, confidence: 0 };
}

// Helper to parse date formats
export interface DateParseResult {
  parsedDate: Date | null;
  isAmbiguous: boolean;
  ambiguityOptions?: string[];
  description: string;
}

export function parseCsvDate(dateStr: string): DateParseResult {
  const cleanStr = dateStr.trim();
  if (!cleanStr) {
    return { parsedDate: null, isAmbiguous: false, description: "Missing date" };
  }

  // 1. Format: YYYY-MM-DD
  const yyyymmdd = /^\d{4}-\d{2}-\d{2}$/;
  if (yyyymmdd.test(cleanStr)) {
    const d = new Date(cleanStr + "T00:00:00Z");
    if (!isNaN(d.getTime())) {
      return { parsedDate: d, isAmbiguous: false, description: "YYYY-MM-DD" };
    }
  }

  // 2. Format: DD/MM/YYYY or MM/DD/YYYY
  const slashDate = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = cleanStr.match(slashDate);
  if (match) {
    const first = parseInt(match[1]);
    const second = parseInt(match[2]);
    const year = parseInt(match[3]);

    // If first is > 12, it must be DD/MM/YYYY
    if (first > 12) {
      const d = new Date(Date.UTC(year, second - 1, first));
      return { parsedDate: d, isAmbiguous: false, description: "DD/MM/YYYY (Day > 12)" };
    }

    // If second is > 12, it must be MM/DD/YYYY
    if (second > 12) {
      const d = new Date(Date.UTC(year, first - 1, second));
      return { parsedDate: d, isAmbiguous: false, description: "MM/DD/YYYY (Month > 12)" };
    }

    // Otherwise, both first and second are <= 12. Ambiguity!
    const option1 = new Date(Date.UTC(year, second - 1, first)); // DD/MM/YYYY
    const option2 = new Date(Date.UTC(year, first - 1, second)); // MM/DD/YYYY
    
    return {
      parsedDate: option1, // Default to option 1
      isAmbiguous: true,
      ambiguityOptions: [
        option1.toISOString().split("T")[0],
        option2.toISOString().split("T")[0]
      ],
      description: "Ambiguous DD/MM/YYYY or MM/DD/YYYY"
    };
  }

  // 3. Format: Month DD (e.g. "Mar 14")
  const monthDd = /^([a-zA-Z]{3,9})\s(\d{1,2})$/i;
  const matchMonth = cleanStr.match(monthDd);
  if (matchMonth) {
    const monthStr = matchMonth[1].toLowerCase();
    const day = parseInt(matchMonth[2]);
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = months.findIndex(m => monthStr.startsWith(m));
    if (monthIndex !== -1) {
      // Infer year 2026 based on general context of CSV
      const d = new Date(Date.UTC(2026, monthIndex, day));
      return {
        parsedDate: d,
        isAmbiguous: true,
        ambiguityOptions: [d.toISOString().split("T")[0]],
        description: "Missing year, inferred 2026"
      };
    }
  }

  return { parsedDate: null, isAmbiguous: false, description: "Unknown date format" };
}

// Function to clean raw amount string
export function parseAmount(amountStr: string): { amount: number; issues: string[] } {
  const issues: string[] = [];
  let cleanStr = amountStr.trim().replace(/"/g, "").replace(/,/g, "");
  
  const parsed = parseFloat(cleanStr);
  if (isNaN(parsed)) {
    return { amount: 0, issues: ["Invalid number format"] };
  }

  // Rounding check (e.g. 899.995)
  const decimalPart = cleanStr.split(".")[1];
  if (decimalPart && decimalPart.length > 2) {
    issues.push("Rounding required (more than 2 decimal places)");
  }

  return { amount: parsed, issues };
}

// Parse split details percentages or ratios
export interface ParsedSplitDetail {
  member: string;
  value: number; // percentage or ratio
}

export function parseSplitDetails(detailsStr: string): ParsedSplitDetail[] {
  if (!detailsStr) return [];
  // Rohan 700; Priya 400; Meera 400 or Aisha 30%; Rohan 30% or Rohan 1; Priya 1
  return detailsStr.split(";").map(part => {
    const cleanPart = part.trim();
    const match = cleanPart.match(/^(.+?)\s+([\d.-]+)%?$/);
    if (match) {
      return {
        member: cleanPart.replace(/\s+[\d.-]+%?$/, "").trim(),
        value: parseFloat(match[2])
      };
    }
    return { member: cleanPart, value: 0 };
  }).filter(d => d.member !== "");
}

// Main Anomaly Detection function
export function detectAnomalies(rows: RawRow[], activeMembers: string[] = KNOWN_MEMBERS_DEFAULT.map(m => m.name)): ImportIssueDetail[] {
  const issues: ImportIssueDetail[] = [];

  // Track parsed rows for duplicate detection
  const seenRows: Array<{
    index: number;
    date: string;
    paid_by: string;
    amount: number;
    description: string;
    split_with: string;
  }> = [];

  rows.forEach((row, index) => {
    const rowIndex = index + 1; // 1-indexed

    // 1. Missing Payer
    if (!row.paid_by || !row.paid_by.trim()) {
      issues.push({
        rowIndex,
        issueType: "Missing Payer",
        confidence: 1.0,
        affectedRowData: row,
        description: `Row ${rowIndex} is missing the payer ('paid_by').`,
        recommendedAction: "Assign to Aisha (or another group member) or skip row.",
        recommendedFix: { ...row, paid_by: "Aisha" }
      });
    }

    // 2. Missing Currency
    if (!row.currency || !row.currency.trim()) {
      issues.push({
        rowIndex,
        issueType: "Missing Currency",
        confidence: 1.0,
        affectedRowData: row,
        description: `Row ${rowIndex} is missing the currency.`,
        recommendedAction: "Default currency to 'INR'.",
        recommendedFix: { ...row, currency: "INR" }
      });
    }

    // 3. Name mappings / Case inconsistencies
    if (row.paid_by && row.paid_by.trim()) {
      const trimmedPayer = row.paid_by.trim();
      const mapped = matchMemberAlias(trimmedPayer, activeMembers);
      if (mapped.match && mapped.match !== trimmedPayer) {
        issues.push({
          rowIndex,
          issueType: "Name Inconsistency",
          confidence: mapped.confidence,
          affectedRowData: row,
          description: `Payer name '${trimmedPayer}' is inconsistent with group member '${mapped.match}'.`,
          recommendedAction: `Map '${trimmedPayer}' to '${mapped.match}'.`,
          recommendedFix: { ...row, paid_by: mapped.match }
        });
      } else if (!mapped.match) {
        issues.push({
          rowIndex,
          issueType: "Unknown Member",
          confidence: 0.8,
          affectedRowData: row,
          description: `Payer '${trimmedPayer}' is not a recognized member of the group.`,
          recommendedAction: `Add '${trimmedPayer}' to the group or map to an existing member.`,
          recommendedFix: { ...row } // Keep original, let user resolve
        });
      }
    }

    // Check participants in split_with for unknown members
    if (row.split_with && row.split_with.trim()) {
      const parts = row.split_with.split(";").map(p => p.trim());
      const unknownParts = parts.filter(p => !matchMemberAlias(p, activeMembers).match);
      if (unknownParts.length > 0) {
        issues.push({
          rowIndex,
          issueType: "Unknown Member in Split",
          confidence: 0.85,
          affectedRowData: row,
          description: `Split includes unknown member(s): ${unknownParts.join(", ")}.`,
          recommendedAction: "Map to existing member(s) or add as temporary guest(s).",
          recommendedFix: { ...row }
        });
      }
    }

    // 4. Date Formatting and Ambiguity
    const dateResult = parseCsvDate(row.date);
    if (!dateResult.parsedDate) {
      issues.push({
        rowIndex,
        issueType: "Invalid Date Format",
        confidence: 1.0,
        affectedRowData: row,
        description: `Date '${row.date}' could not be parsed.`,
        recommendedAction: "Manually correct the date.",
        recommendedFix: { ...row }
      });
    } else if (dateResult.isAmbiguous) {
      issues.push({
        rowIndex,
        issueType: "Ambiguous Date Format",
        confidence: 0.95,
        affectedRowData: row,
        description: `Date '${row.date}' is ambiguous (${dateResult.description}).`,
        recommendedAction: `Choose date format: ${dateResult.ambiguityOptions?.join(" or ")}.`,
        recommendedFix: { ...row, date: dateResult.ambiguityOptions ? dateResult.ambiguityOptions[0] : row.date }
      });
    }

    // 5. Amount parsing issues (comma, rounding, negative, zero)
    const amountResult = parseAmount(row.amount);
    if (amountResult.issues.includes("Invalid number format")) {
      issues.push({
        rowIndex,
        issueType: "Invalid Amount Format",
        confidence: 1.0,
        affectedRowData: row,
        description: `Amount '${row.amount}' is not a valid number.`,
        recommendedAction: "Enter a valid amount.",
        recommendedFix: { ...row }
      });
    } else {
      const parsedAmt = amountResult.amount;

      // Rounding check
      if (amountResult.issues.some(i => i.startsWith("Rounding required"))) {
        const roundedAmt = Math.round(parsedAmt * 100) / 100;
        issues.push({
          rowIndex,
          issueType: "Rounding Issue",
          confidence: 1.0,
          affectedRowData: row,
          description: `Amount '${row.amount}' has more than 2 decimal places.`,
          recommendedAction: `Round amount to '${roundedAmt}'.`,
          recommendedFix: { ...row, amount: roundedAmt.toString() }
        });
      }

      // Negative amount
      if (parsedAmt < 0) {
        issues.push({
          rowIndex,
          issueType: "Negative Amount",
          confidence: 1.0,
          affectedRowData: row,
          description: `Amount '${row.amount}' is negative (refund).`,
          recommendedAction: "Import as a negative expense (refund) or reverse split.",
          recommendedFix: { ...row }
        });
      }

      // Zero amount
      if (parsedAmt === 0) {
        issues.push({
          rowIndex,
          issueType: "Zero Amount",
          confidence: 1.0,
          affectedRowData: row,
          description: `Amount is 0 INR.`,
          recommendedAction: "Skip row or import as is.",
          recommendedFix: { ...row }
        });
      }
    }

    // 6. Settlement Reclassification
    const descLower = row.description.toLowerCase();
    const notesLower = row.notes.toLowerCase();
    const isSettlementKeyword = descLower.includes("paid back") || descLower.includes("settle") || descLower.includes("returned") || descLower.includes("repaid") || notesLower.includes("settlement");
    const isSplitEmpty = !row.split_type || row.split_type.trim() === "";
    const isSingleSplit = row.split_with && row.split_with.split(";").length === 1;

    if (isSettlementKeyword || (isSplitEmpty && isSingleSplit)) {
      issues.push({
        rowIndex,
        issueType: "Settlement Recorded as Expense",
        confidence: 0.95,
        affectedRowData: row,
        description: `Description indicates this is a settlement/debt payment rather than a split expense.`,
        recommendedAction: "Reclassify as a Settlement.",
        recommendedFix: { ...row, split_type: "settlement" }
      });
    }

    // 7. Split percentage check
    if (row.split_type && row.split_type.trim().toLowerCase() === "percentage") {
      const details = parseSplitDetails(row.split_details);
      const totalPct = details.reduce((sum, d) => sum + d.value, 0);
      if (totalPct !== 100) {
        issues.push({
          rowIndex,
          issueType: "Invalid Split Percentages",
          confidence: 1.0,
          affectedRowData: row,
          description: `Split percentages sum to ${totalPct}%, which does not equal 100%.`,
          recommendedAction: "Scale percentages proportionally to 100% or edit manually.",
          recommendedFix: { ...row } // Keep original, let user normalize
        });
      }
    }

    // Check redundant equal splits with details
    if (row.split_type && row.split_type.trim().toLowerCase() === "equal" && row.split_details && row.split_details.trim()) {
      issues.push({
        rowIndex,
        issueType: "Redundant Split Details",
        confidence: 0.85,
        affectedRowData: row,
        description: `Split type is 'equal', but split details ('${row.split_details}') were also provided.`,
        recommendedAction: "Clear split details and perform automatic equal split.",
        recommendedFix: { ...row, split_details: "" }
      });
    }

    // 8. Inactive Member Check based on membership timeline
    if (dateResult.parsedDate) {
      const expDate = dateResult.parsedDate;
      const parsedAmt = amountResult.amount;

      // Helper to find membership dates
      const getMemberTimeline = (name: string) => {
        const normName = matchMemberAlias(name, activeMembers).match || normalizeCapitalization(name);
        // Fallback search in our default timeline
        return KNOWN_MEMBERS_DEFAULT.find(m => m.name === normName);
      };

      // Check payer
      if (row.paid_by && row.paid_by.trim()) {
        const timeline = getMemberTimeline(row.paid_by);
        if (timeline) {
          const joined = new Date(timeline.joinedAt);
          const left = timeline.leftAt ? new Date(timeline.leftAt) : null;
          if (expDate < joined || (left && expDate > left)) {
            issues.push({
              rowIndex,
              issueType: "Inactive Member Payer",
              confidence: 0.95,
              affectedRowData: row,
              description: `Payer '${row.paid_by}' was not active in the group on the expense date (${expDate.toISOString().split("T")[0]}).`,
              recommendedAction: "Extend membership dates or change date/payer.",
              recommendedFix: { ...row }
            });
          }
        }
      }

      // Check participants in split_with
      if (row.split_with && row.split_with.trim()) {
        const parts = row.split_with.split(";").map(p => p.trim());
        const inactiveParts: string[] = [];
        parts.forEach(p => {
          const timeline = getMemberTimeline(p);
          if (timeline) {
            const joined = new Date(timeline.joinedAt);
            const left = timeline.leftAt ? new Date(timeline.leftAt) : null;
            if (expDate < joined || (left && expDate > left)) {
              inactiveParts.push(p);
            }
          }
        });

        if (inactiveParts.length > 0) {
          issues.push({
            rowIndex,
            issueType: "Inactive Member in Split",
            confidence: 0.95,
            affectedRowData: row,
            description: `Split includes inactive member(s) on this date: ${inactiveParts.join(", ")}.`,
            recommendedAction: "Exclude inactive member(s) from split or adjust membership dates.",
            recommendedFix: { ...row }
          });
        }
      }
    }

    // 9. Duplicate Expense Detection
    if (dateResult.parsedDate && amountResult.amount) {
      const parsedAmt = amountResult.amount;
      // Search for matches in previous parsed rows
      const duplicate = seenRows.find(
        r =>
          r.date === row.date &&
          Math.abs(r.amount - parsedAmt) < 0.01 &&
          normalizeCapitalization(r.paid_by) === normalizeCapitalization(row.paid_by) &&
          r.split_with === row.split_with
      );

      if (duplicate) {
        issues.push({
          rowIndex,
          issueType: "Duplicate Expense",
          confidence: 0.91,
          affectedRowData: row,
          description: `Duplicate of row ${duplicate.index} (same date, payer, amount, and split participants).`,
          recommendedAction: "Skip this duplicate row.",
          recommendedFix: { ...row }
        });
      } else {
        // Also look for potential conflicting duplicates with different payer/amount
        const conflict = seenRows.find(
          r =>
            r.date === row.date &&
            r.description.toLowerCase().slice(0, 5) === descLower.slice(0, 5) &&
            (Math.abs(r.amount - parsedAmt) > 0.01 || r.paid_by !== row.paid_by)
        );

        if (conflict) {
          issues.push({
            rowIndex,
            issueType: "Conflicting Duplicate",
            confidence: 0.88,
            affectedRowData: row,
            description: `Potential conflict with row ${conflict.index} ('${conflict.description}' paid by ${conflict.paid_by} of ${conflict.amount}).`,
            recommendedAction: "Keep both, merge them, or skip one.",
            recommendedFix: { ...row }
          });
        }
      }

      // Add to seen rows
      seenRows.push({
        index: rowIndex,
        date: row.date,
        paid_by: row.paid_by,
        amount: parsedAmt,
        description: row.description,
        split_with: row.split_with,
      });
    }
  });

  return issues;
}

// Function to parse the raw CSV file
export async function parseCsvFile(csvContent: string): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data as RawRow[]);
      },
      error: (err) => {
        reject(err);
      }
    });
  });
}
