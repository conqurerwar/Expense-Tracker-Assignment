import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const importRun = await prisma.import.findUnique({
      where: { id },
      include: {
        issues: { orderBy: { rowIndex: "asc" } },
        expenses: { include: { paidBy: { select: { name: true } } } },
        settlements: { include: { payer: { select: { name: true } }, payee: { select: { name: true } } } }
      }
    });

    if (!importRun) {
      return NextResponse.json({ error: "Import report not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      report: importRun
    });
  } catch (error: any) {
    console.error("ImportReport GET API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch import report" },
      { status: 500 }
    );
  }
}
