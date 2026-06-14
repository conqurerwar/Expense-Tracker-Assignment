import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId") || "default-group-id";

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      include: {
        payer: { select: { id: true, name: true, email: true } },
        payee: { select: { id: true, name: true, email: true } },
        import: true
      },
      orderBy: { date: "desc" }
    });

    return NextResponse.json({
      success: true,
      settlements
    });
  } catch (error: any) {
    console.error("Settlements GET API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch settlements" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      groupId = "default-group-id",
      payerId,
      payeeId,
      amount,
      currency = "INR",
      date,
      notes = ""
    } = body;

    if (!payerId || !payeeId || !amount || !date) {
      return NextResponse.json(
        { error: "Missing required fields: payerId, payeeId, amount, date" },
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

    const settlementDate = new Date(date);

    // Currency conversion
    let exchangeRate = 1.0;
    let convertedAmount = amount;
    if (currency.toUpperCase() === "USD") {
      const rateRecord = await prisma.exchangeRate.findFirst({
        where: {
          fromCurrency: "USD",
          toCurrency: "INR",
          effectiveDate: { lte: settlementDate }
        },
        orderBy: { effectiveDate: "desc" }
      });
      exchangeRate = rateRecord ? rateRecord.rate : 83.0;
      convertedAmount = amount * exchangeRate;
    }

    const settlement = await prisma.$transaction(async (tx) => {
      const settle = await tx.settlement.create({
        data: {
          groupId,
          payerId,
          payeeId,
          amount: Math.round(convertedAmount * 100) / 100,
          originalAmount: amount,
          originalCurrency: currency.toUpperCase(),
          exchangeRate,
          date: settlementDate,
          notes
        }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: systemUser.id,
          action: "CREATE_SETTLEMENT",
          entityType: "Settlement",
          entityId: settle.id,
          newValue: JSON.stringify(settle)
        }
      });

      return settle;
    });

    return NextResponse.json({
      success: true,
      settlement
    });
  } catch (error: any) {
    console.error("Settlement POST API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create settlement" },
      { status: 500 }
    );
  }
}
