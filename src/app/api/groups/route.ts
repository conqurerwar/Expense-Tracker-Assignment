import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  try {
    const groups = await prisma.group.findMany({
      include: {
        members: { include: { user: true } },
        _count: { select: { expenses: true, settlements: true } }
      }
    });

    return NextResponse.json({
      success: true,
      groups
    });
  } catch (error: any) {
    console.error("Groups GET API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch groups" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }

    const authUser = getAuthUser(request);
    const actorEmail = authUser?.email || "system@example.com";
    let systemUser = await prisma.user.findFirst({ where: { email: actorEmail } });
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: { email: actorEmail, name: actorEmail.split("@")[0] }
      });
    }

    const newGroup = await prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: { name, description }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: systemUser.id,
          action: "CREATE_GROUP",
          entityType: "Group",
          entityId: g.id,
          newValue: JSON.stringify(g)
        }
      });

      return g;
    });

    return NextResponse.json({
      success: true,
      group: newGroup
    });
  } catch (error: any) {
    console.error("Groups POST API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create group" },
      { status: 500 }
    );
  }
}
