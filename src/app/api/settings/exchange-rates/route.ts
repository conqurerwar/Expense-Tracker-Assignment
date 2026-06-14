import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  try {
    const rates = await prisma.exchangeRate.findMany({
      orderBy: { effectiveDate: "desc" }
    });

    return NextResponse.json({
      success: true,
      rates
    });
  } catch (error: any) {
    console.error("ExchangeRates GET API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch exchange rates" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      fromCurrency = "USD",
      toCurrency = "INR",
      rate,
      effectiveDate
    } = body;

    if (!rate || !effectiveDate) {
      return NextResponse.json(
        { error: "Missing required fields: rate, effectiveDate" },
        { status: 400 }
      );
    }

    const authUser = await getAuthUser(request);
    const actorEmail = authUser?.email || "system@example.com";
    let systemUser = await prisma.user.findFirst({ where: { email: actorEmail } });
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: { email: actorEmail, name: actorEmail.split("@")[0] }
      });
    }

    const effDate = new Date(effectiveDate);

    const exchangeRate = await prisma.$transaction(async (tx) => {
      const existing = await tx.exchangeRate.findUnique({
        where: {
          fromCurrency_toCurrency_effectiveDate: {
            fromCurrency: fromCurrency.toUpperCase(),
            toCurrency: toCurrency.toUpperCase(),
            effectiveDate: effDate
          }
        }
      });

      const er = await tx.exchangeRate.upsert({
        where: {
          fromCurrency_toCurrency_effectiveDate: {
            fromCurrency: fromCurrency.toUpperCase(),
            toCurrency: toCurrency.toUpperCase(),
            effectiveDate: effDate
          }
        },
        update: { rate: parseFloat(rate) },
        create: {
          fromCurrency: fromCurrency.toUpperCase(),
          toCurrency: toCurrency.toUpperCase(),
          rate: parseFloat(rate),
          effectiveDate: effDate
        }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: systemUser.id,
          action: existing ? "UPDATE_EXCHANGE_RATE" : "CREATE_EXCHANGE_RATE",
          entityType: "ExchangeRate",
          entityId: er.id,
          oldValue: existing ? JSON.stringify(existing) : null,
          newValue: JSON.stringify(er)
        }
      });

      return er;
    });

    return NextResponse.json({
      success: true,
      exchangeRate
    });
  } catch (error: any) {
    console.error("ExchangeRates POST API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save exchange rate" },
      { status: 500 }
    );
  }
}
