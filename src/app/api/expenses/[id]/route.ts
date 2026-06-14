import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      description,
      paidById,
      amount,
      currency = "INR",
      splitType = "equal",
      notes = "",
      date,
      participants = [] as string[],
      splits = [] as Array<{ userId: string; amount: number; ratio?: number; percentage?: number }>
    } = body;

    const authUser = getAuthUser(request);
    const actorEmail = authUser?.email || "system@example.com";
    let systemUser = await prisma.user.findFirst({ where: { email: actorEmail } });
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: { email: actorEmail, name: actorEmail.split("@")[0] }
      });
    }

    const expenseDate = new Date(date);

    // Fetch existing expense to log old values
    const oldExpense = await prisma.expense.findUnique({
      where: { id },
      include: { participants: true, splits: true }
    });

    if (!oldExpense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    // Currency conversion
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

    // Calculate Splits
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

    // Save modifications in transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Delete old participants and splits
      await tx.expenseParticipant.deleteMany({ where: { expenseId: id } });
      await tx.expenseSplit.deleteMany({ where: { expenseId: id } });

      // Update basic details
      const exp = await tx.expense.update({
        where: { id },
        data: {
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

      // Create new participants
      for (const pId of participants) {
        await tx.expenseParticipant.create({
          data: {
            expenseId: id,
            userId: pId
          }
        });
      }

      // Create new splits
      for (const split of calculatedSplits) {
        await tx.expenseSplit.create({
          data: {
            expenseId: id,
            userId: split.userId,
            amount: Math.round(split.amountInr * 100) / 100,
            originalAmount: Math.round(split.amountOriginal * 100) / 100,
            ratio: split.ratio || null,
            percentage: split.percentage || null
          }
        });
      }

      // Create Audit Log
      await tx.auditLog.create({
        data: {
          userId: systemUser.id,
          action: "UPDATE_EXPENSE",
          entityType: "Expense",
          entityId: id,
          oldValue: JSON.stringify(oldExpense),
          newValue: JSON.stringify({ exp, splits: calculatedSplits })
        }
      });

      return exp;
    });

    return NextResponse.json({
      success: true,
      expense: updated
    });
  } catch (error: any) {
    console.error("Expense PUT API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update expense" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const authUser = getAuthUser(request);
    const actorEmail = authUser?.email || "system@example.com";
    let systemUser = await prisma.user.findFirst({ where: { email: actorEmail } });
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: { email: actorEmail, name: actorEmail.split("@")[0] }
      });
    }

    // Fetch existing to save in AuditLog
    const oldExpense = await prisma.expense.findUnique({
      where: { id },
      include: { participants: true, splits: true }
    });

    if (!oldExpense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    // Delete in transaction
    await prisma.$transaction(async (tx) => {
      // Prisma cascade onDelete will delete participants and splits
      await tx.expense.delete({ where: { id } });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: systemUser.id,
          action: "DELETE_EXPENSE",
          entityType: "Expense",
          entityId: id,
          oldValue: JSON.stringify(oldExpense)
        }
      });
    });

    return NextResponse.json({
      success: true,
      message: "Expense deleted successfully"
    });
  } catch (error: any) {
    console.error("Expense DELETE API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete expense" },
      { status: 500 }
    );
  }
}
