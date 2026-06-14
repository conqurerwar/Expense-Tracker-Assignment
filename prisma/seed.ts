import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding started...");

  // 1. Create Default Group
  const group = await prisma.group.upsert({
    where: { id: "default-group-id" },
    update: {},
    create: {
      id: "default-group-id",
      name: "Shared Apartment & Goa Trip",
      description: "Apartment expenses and Goa vacation group sharing."
    }
  });
  console.log(`Created group: ${group.name}`);

  // 2. Create Users
  const usersData = [
    { id: "user-aisha-id", email: "aisha@example.com", name: "Aisha" },
    { id: "user-rohan-id", email: "rohan@example.com", name: "Rohan" },
    { id: "user-priya-id", email: "priya@example.com", name: "Priya" },
    { id: "user-meera-id", email: "meera@example.com", name: "Meera" },
    { id: "user-sam-id", email: "sam@example.com", name: "Sam" },
    { id: "user-dev-id", email: "dev@example.com", name: "Dev" },
  ];

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: {
        id: u.id,
        email: u.email,
        name: u.name
      }
    });
    console.log(`Created user: ${user.name}`);
  }

  // 3. Create Group Memberships with timelines
  const memberships = [
    {
      id: "member-aisha-id",
      groupId: group.id,
      userId: "user-aisha-id",
      joinedAt: new Date("2026-02-01T00:00:00Z"),
      leftAt: null
    },
    {
      id: "member-rohan-id",
      groupId: group.id,
      userId: "user-rohan-id",
      joinedAt: new Date("2026-02-01T00:00:00Z"),
      leftAt: null
    },
    {
      id: "member-priya-id",
      groupId: group.id,
      userId: "user-priya-id",
      joinedAt: new Date("2026-02-01T00:00:00Z"),
      leftAt: null
    },
    {
      id: "member-meera-id",
      groupId: group.id,
      userId: "user-meera-id",
      joinedAt: new Date("2026-02-01T00:00:00Z"),
      leftAt: new Date("2026-03-31T23:59:59Z") // Meera leaves end of March
    },
    {
      id: "member-sam-id",
      groupId: group.id,
      userId: "user-sam-id",
      joinedAt: new Date("2026-04-15T00:00:00Z"), // Sam joins mid-April
      leftAt: null
    },
    {
      id: "member-dev-id",
      groupId: group.id,
      userId: "user-dev-id",
      joinedAt: new Date("2026-02-01T00:00:00Z"),
      leftAt: new Date("2026-03-31T23:59:59Z") // Dev temporary active during Feb/Mar
    }
  ];

  for (const m of memberships) {
    await prisma.groupMember.upsert({
      where: {
        groupId_userId: {
          groupId: m.groupId,
          userId: m.userId
        }
      },
      update: {
        joinedAt: m.joinedAt,
        leftAt: m.leftAt
      },
      create: {
        id: m.id,
        groupId: m.groupId,
        userId: m.userId,
        joinedAt: m.joinedAt,
        leftAt: m.leftAt
      }
    });
  }
  console.log("Group memberships created.");

  // 4. Create Default Exchange Rate
  await prisma.exchangeRate.upsert({
    where: {
      fromCurrency_toCurrency_effectiveDate: {
        fromCurrency: "USD",
        toCurrency: "INR",
        effectiveDate: new Date("2026-02-01T00:00:00Z")
      }
    },
    update: { rate: 83.0 },
    create: {
      fromCurrency: "USD",
      toCurrency: "INR",
      rate: 83.0,
      effectiveDate: new Date("2026-02-01T00:00:00Z")
    }
  });
  console.log("Default exchange rate (USD->INR = 83.0) seeded.");

  console.log("Seeding complete successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
