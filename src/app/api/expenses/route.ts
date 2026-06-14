import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId") || "default-group-id";
    const userId = searchParams.get("userId"); // Filter by user involved
    const currency = searchParams.get("currency");
    const splitType = searchParams.get("splitType");
    const importId = searchParams.get("importId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    
    // Build filter
    const where: any = { groupId };

    if (currency) {
      where.originalCurrency = currency;
    }
    if (splitType) {
      where.splitType = splitType;
    }
    if (importId) {
      where.importId = importId === "manual" ? null : importId;
    }
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    if (userId) {
      where.OR = [
        { paidById: userId },
        { participants: { some: { userId } } }
      ];
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        participants: { include: { user: { select: { id: true, name: true } } } },
        splits: { include: { user: { select: { id: true, name: true } } } },
        import: true
      },
      orderBy: { date: "desc" }
    });

    return NextResponse.json({
      success: true,
      expenses
    });
  } catch (error: any) {
    console.error("Expenses GET API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch expenses" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      groupId = "default-group-id",
      description,
      paidById,
      amount, // original currency amount
      currency = "INR",
      splitType = "equal",
      notes = "",
      date,
      participants = [] as string[], // user IDs
      splits = [] as Array<{ userId: string; amount: number; ratio?: number; percentage?: number }>
    } = body;

    if (!description || !paidById || !amount || !date || participants.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: description, paidById, amount, date, participants" },
        { status: 400 }
      );
    }

    const authUser = getAuthUser(request);
    const actorEmail = authUser?.email || "system@example.com";
    let systemUser = await prisma.user.findFirst({ where: { email: actorEmail } });
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: { email: actorEmail, name: actorEmail.split("@")[0] }
      });
    }

    const expenseDate = new Date(date);

    // Calculate Currency Conversion
    let exchangeRate = 1.0;
    let convertedAmount = amount;
    if (currency.toUpperCase() === "USD") {
      const rateRecord = await prisma.exchangeRate.findFirst({
        where: {
          fromCurrency: "USD",
          toCurrency: "INR",
          effectiveDate: { lte: expenseDate }
        },
        orderBy: { effectiveDate: "desc" }
      });
      exchangeRate = rateRecord ? rateRecord.rate : 83.0;
      convertedAmount = amount * exchangeRate;
    }

    // Process Splits
    interface ComputedSplit {
      userId: string;
      amountInr: number;
      amountOriginal: number;
      ratio?: number;
      percentage?: number;
    }

    const calculatedSplits: ComputedSplit[] = [];

    if (splitType === "equal") {
      const count = participants.length;
      const shareOriginal = amount / count;
      const shareInr = convertedAmount / count;
      participants.forEach((uId: string) => {
        calculatedSplits.push({
          userId: uId,
          amountOriginal: shareOriginal,
          amountInr: shareInr
        });
      });
    } else if (splitType === "percentage") {
      let totalPct = 0;
      splits.forEach((s: any) => {
        const pct = s.percentage || 0;
        totalPct += pct;
        calculatedSplits.push({
          userId: s.userId,
          amountOriginal: (pct / 100) * amount,
          amountInr: (pct / 100) * convertedAmount,
          percentage: pct
        });
      });
      if (Math.abs(totalPct - 100) > 0.01) {
        return NextResponse.json({ error: "Percentages must sum to 100%" }, { status: 400 });
      }
    } else if (splitType === "share") {
      const totalShares = splits.reduce((sum: number, s: any) => sum + (s.ratio || 0), 0);
      if (totalShares <= 0) {
        return NextResponse.json({ error: "Total shares must be greater than 0" }, { status: 400 });
      }
      splits.forEach((s: any) => {
        const ratio = s.ratio || 0;
        calculatedSplits.push({
          userId: s.userId,
          amountOriginal: (ratio / totalShares) * amount,
          amountInr: (ratio / totalShares) * convertedAmount,
          ratio
        });
      });
    } else if (splitType === "unequal") {
      let totalSplitsOriginal = 0;
      splits.forEach((s: any) => {
        totalSplitsOriginal += s.amount || 0;
        calculatedSplits.push({
          userId: s.userId,
          amountOriginal: s.amount || 0,
          amountInr: (s.amount || 0) * exchangeRate
        });
      });
      if (Math.abs(totalSplitsOriginal - amount) > 0.05) {
        return NextResponse.json({ error: "Split amounts must sum to total expense amount" }, { status: 400 });
      }
    }

    // Save in transaction
    const newExpense = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          groupId,
          description,
          paidById,
          amount: Math.round(convertedAmount * 100) / 100,
          originalAmount: amount,
          originalCurrency: currency.toUpperCase(),
          exchangeRate,
          splitType,
          notes,
          date: expenseDate
        }
      });

      // Create Participants
      for (const pId of participants) {
        await tx.expenseParticipant.create({
          data: {
            expenseId: exp.id,
            userId: pId
          }
        });
      }

      // Create Splits
      for (const split of calculatedSplits) {
        await tx.expenseSplit.create({
          data: {
            expenseId: exp.id,
            userId: split.userId,
            amount: Math.round(split.amountInr * 100) / 100,
            originalAmount: Math.round(split.amountOriginal * 100) / 100,
            ratio: split.ratio || null,
            percentage: split.percentage || null
          }
        });
      }

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: systemUser.id,
          action: "CREATE_EXPENSE",
          entityType: "Expense",
          entityId: exp.id,
          newValue: JSON.stringify({ exp, splits: calculatedSplits })
        }
      });

      return exp;
    });

    return NextResponse.json({
      success: true,
      expense: newExpense
    });
  } catch (error: any) {
    console.error("Expenses POST API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create expense" },
      { status: 500 }
    );
  }
}
