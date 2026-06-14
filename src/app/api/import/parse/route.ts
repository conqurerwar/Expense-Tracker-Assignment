import { NextResponse } from "next/server";
import { parseCsvFile, detectAnomalies, KNOWN_MEMBERS_DEFAULT } from "@/services/importEngine";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";

export async function POST(request: Request) {
  try {
    let csvContent = "";
    
    try {
      const body = await request.json();
      csvContent = body.csvContent || "";
    } catch (e) {
      // If JSON parsing fails, try reading as raw text or multipart
    }

    // If no CSV content was sent, load the local expenses export.csv file
    if (!csvContent) {
      const workspaceRoot = process.cwd();
      const csvPath = path.join(workspaceRoot, "Data", "expenses export.csv");
      
      if (fs.existsSync(csvPath)) {
        csvContent = fs.readFileSync(csvPath, "utf-8");
      } else {
        return NextResponse.json(
          { error: "No CSV content provided and default expenses export.csv not found at Data/expenses export.csv" },
          { status: 400 }
        );
      }
    }

    // Parse the CSV content
    const rawRows = await parseCsvFile(csvContent);

    // Fetch active member names from the database if they exist
    // If not, use the default known members
    let activeMembers: string[] = [];
    try {
      const dbMembers = await prisma.user.findMany({
        select: { name: true }
      });
      activeMembers = dbMembers.map(m => m.name);
    } catch (dbErr) {
      console.warn("Could not fetch users from database, using defaults:", dbErr);
    }

    if (activeMembers.length === 0) {
      activeMembers = KNOWN_MEMBERS_DEFAULT.map(m => m.name);
    }

    // Detect anomalies
    const issues = detectAnomalies(rawRows, activeMembers);

    return NextResponse.json({
      success: true,
      rawRows,
      issues
    });
  } catch (error: any) {
    console.error("Parse API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse CSV file" },
      { status: 500 }
    );
  }
}
