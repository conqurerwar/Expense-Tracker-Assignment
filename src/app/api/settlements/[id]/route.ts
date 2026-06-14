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
      payerId,
      payeeId,
      amount,
      currency = "INR",
      date,
      notes = ""
    } = body;

    const authUser = await getAuthUser(request);
    const actorEmail = authUser?.email || "system@example.com";
    let systemUser = await prisma.user.findFirst({ where: { email: actorEmail } });
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: { email: actorEmail, name: actorEmail.split("@")[0] }
      });
    }

    const settlementDate = new Date(date);

    // Fetch existing
    const oldSettlement = await prisma.settlement.findUnique({
      where: { id }
    });

    if (!oldSettlement) {
      return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
    }

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

    const updated = await prisma.$transaction(async (tx) => {
      const settle = await tx.settlement.update({
        where: { id },
        data: {
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
          action: "UPDATE_SETTLEMENT",
          entityType: "Settlement",
          entityId: id,
          oldValue: JSON.stringify(oldSettlement),
          newValue: JSON.stringify(settle)
        }
      });

      return settle;
    });

    return NextResponse.json({
      success: true,
      settlement: updated
    });
  } catch (error: any) {
    console.error("Settlement PUT API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update settlement" },
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

    const authUser = await getAuthUser(request);
    const actorEmail = authUser?.email || "system@example.com";
    let systemUser = await prisma.user.findFirst({ where: { email: actorEmail } });
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: { email: actorEmail, name: actorEmail.split("@")[0] }
      });
    }

    const oldSettlement = await prisma.settlement.findUnique({
      where: { id }
    });

    if (!oldSettlement) {
      return NextResponse.json({ error: "Settlement not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.settlement.delete({ where: { id } });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: systemUser.id,
          action: "DELETE_SETTLEMENT",
          entityType: "Settlement",
          entityId: id,
          oldValue: JSON.stringify(oldSettlement)
        }
      });
    });

    return NextResponse.json({
      success: true,
      message: "Settlement deleted successfully"
    });
  } catch (error: any) {
    console.error("Settlement DELETE API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete settlement" },
      { status: 500 }
    );
  }
}
