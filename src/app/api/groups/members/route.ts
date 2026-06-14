import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const groupId = searchParams.get("groupId") || "default-group-id";

    const members = await prisma.groupMember.findMany({
      where: { groupId },
      include: { user: true },
      orderBy: { joinedAt: "asc" }
    });

    return NextResponse.json({
      success: true,
      members
    });
  } catch (error: any) {
    console.error("GroupMembers GET API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch group members" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      groupId = "default-group-id",
      name,
      email,
      joinedAt,
      leftAt = null
    } = body;

    if (!name || !email || !joinedAt) {
      return NextResponse.json(
        { error: "Missing required fields: name, email, joinedAt" },
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

    const membership = await prisma.$transaction(async (tx) => {
      // Find or create user
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({
          data: { email, name }
        });
      }

      // Create GroupMember
      const gm = await tx.groupMember.create({
        data: {
          groupId,
          userId: user.id,
          joinedAt: new Date(joinedAt),
          leftAt: leftAt ? new Date(leftAt) : null
        },
        include: { user: true }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: systemUser.id,
          action: "ADD_GROUP_MEMBER",
          entityType: "GroupMember",
          entityId: gm.id,
          newValue: JSON.stringify(gm)
        }
      });

      return gm;
    });

    return NextResponse.json({
      success: true,
      membership
    });
  } catch (error: any) {
    console.error("GroupMembers POST API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to add group member" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const {
      id, // GroupMember record ID
      joinedAt,
      leftAt
    } = body;

    if (!id || !joinedAt) {
      return NextResponse.json(
        { error: "Missing required fields: id, joinedAt" },
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

    const oldMembership = await prisma.groupMember.findUnique({
      where: { id }
    });

    if (!oldMembership) {
      return NextResponse.json({ error: "Group membership record not found" }, { status: 404 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const gm = await tx.groupMember.update({
        where: { id },
        data: {
          joinedAt: new Date(joinedAt),
          leftAt: leftAt ? new Date(leftAt) : null
        },
        include: { user: true }
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: systemUser.id,
          action: "UPDATE_GROUP_MEMBER_TIMELINE",
          entityType: "GroupMember",
          entityId: id,
          oldValue: JSON.stringify(oldMembership),
          newValue: JSON.stringify(gm)
        }
      });

      return gm;
    });

    return NextResponse.json({
      success: true,
      membership: updated
    });
  } catch (error: any) {
    console.error("GroupMembers PUT API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update group member timeline" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Query parameter 'id' (membership ID) is required" }, { status: 400 });
    }

    const authUser = await getAuthUser(request);
    const actorEmail = authUser?.email || "system@example.com";
    let systemUser = await prisma.user.findFirst({ where: { email: actorEmail } });
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: { email: actorEmail, name: actorEmail.split("@")[0] }
      });
    }

    const oldMembership = await prisma.groupMember.findUnique({
      where: { id }
    });

    if (!oldMembership) {
      return NextResponse.json({ error: "Group membership record not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.groupMember.delete({ where: { id } });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: systemUser.id,
          action: "REMOVE_GROUP_MEMBER",
          entityType: "GroupMember",
          entityId: id,
          oldValue: JSON.stringify(oldMembership)
        }
      });
    });

    return NextResponse.json({
      success: true,
      message: "Group member removed successfully"
    });
  } catch (error: any) {
    console.error("GroupMembers DELETE API Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to remove group member" },
      { status: 500 }
    );
  }
}
