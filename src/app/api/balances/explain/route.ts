import { NextResponse } from "next/server";
import { getUserBalanceExplanationFromDb } from "@/services/balanceEngine";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId") || "default-group-id";
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "Query parameter 'userId' is required" },
        { status: 400 }
      );
    }

    const explanation = await getUserBalanceExplanationFromDb(groupId, userId);

    return NextResponse.json({
      success: true,
      explanation
    });
  } catch (error: any) {
    console.error("Balance Explain API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch balance explanation" },
      { status: 500 }
    );
  }
}
