import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const imports = await prisma.import.findMany({
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({
      success: true,
      imports
    });
  } catch (error: any) {
    console.error("ImportHistory GET API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch import history" },
      { status: 500 }
    );
  }
}
