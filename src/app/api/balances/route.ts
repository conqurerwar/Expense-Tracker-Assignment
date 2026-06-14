import { NextResponse } from "next/server";
import { getGroupBalancesFromDb } from "@/services/balanceEngine";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId") || "default-group-id";
    const asOf = searchParams.get("asOf") || undefined;

    const balances = await getGroupBalancesFromDb(groupId, asOf);

    return NextResponse.json({
      success: true,
      balances
    });
  } catch (error: any) {
    console.error("Balances API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch balances" },
      { status: 500 }
    );
  }
}
