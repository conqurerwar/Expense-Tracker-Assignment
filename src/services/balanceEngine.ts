import { prisma } from "../lib/db";

export interface MemberBalance {
  userId: string;
  userName: string;
  totalPaid: number; // in INR
  totalOwed: number; // in INR
  netBalance: number; // totalPaid - totalOwed
}

export interface DebtRelation {
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  amount: number; // in INR
}

export interface BalanceExplanationItem {
  id: string; // Expense or Settlement ID
  type: "EXPENSE" | "SETTLEMENT" | "REFUND";
  date: Date;
  description: string;
  originalAmount: number;
  originalCurrency: string;
  exchangeRate: number;
  convertedAmount: number; // Total in INR
  payerId: string;
  payerName: string;
  userShare: number; // User's share in INR (0 for settlements)
  impact: number; // How this item changed the user's balance
  calculationChain: string; // Text description of the formula used
}

export interface GroupBalanceSummary {
  asOfDate: Date;
  memberBalances: MemberBalance[];
  rawBalances: DebtRelation[];
  simplifiedBalances: DebtRelation[];
}

// core calculation logic (decoupled from Prisma for reproducibility & unit testing)
export function computeBalances(
  members: Array<{ id: string; name: string; joinedAt: Date; leftAt: Date | null }>,
  expenses: Array<{
    id: string;
    description: string;
    paidById: string;
    amount: number; // Converted to INR
    originalAmount: number;
    originalCurrency: string;
    exchangeRate: number;
    splitType: string;
    date: Date;
    participants: Array<{ userId: string }>;
    splits: Array<{ userId: string; amount: number; ratio?: number | null; percentage?: number | null }>;
  }>,
  settlements: Array<{
    id: string;
    payerId: string;
    payeeId: string;
    amount: number; // Converted to INR
    originalAmount: number;
    originalCurrency: string;
    exchangeRate: number;
    date: Date;
  }>,
  asOfDate: Date = new Date()
): GroupBalanceSummary {
  
  // Filter active members as of the query date
  // Also filter expenses & settlements up to asOfDate
  const queryDateStr = asOfDate.toISOString();
  const queryTimestamp = asOfDate.getTime();

  // Find all active members up to the query date
  const activeMembers = members.filter(m => {
    const joined = new Date(m.joinedAt).getTime();
    return joined <= queryTimestamp;
  });

  const filteredExpenses = expenses.filter(e => new Date(e.date).getTime() <= queryTimestamp);
  const filteredSettlements = settlements.filter(s => new Date(s.date).getTime() <= queryTimestamp);

  // Initialize balances
  const balances: Record<string, { totalPaid: number; totalOwed: number }> = {};
  members.forEach(m => {
    balances[m.id] = { totalPaid: 0, totalOwed: 0 };
  });

  // Keep track of pairwise debts (raw balances)
  // key: fromUserId -> toUserId -> amount
  const rawDebts: Record<string, Record<string, number>> = {};
  members.forEach(m1 => {
    rawDebts[m1.id] = {};
    members.forEach(m2 => {
      if (m1.id !== m2.id) {
        rawDebts[m1.id][m2.id] = 0;
      }
    });
  });

  // Process expenses
  filteredExpenses.forEach(exp => {
    const payerId = exp.paidById;
    
    // Add to payer's total paid
    if (balances[payerId]) {
      balances[payerId].totalPaid += exp.amount;
    }

    // Process splits
    exp.splits.forEach(split => {
      const participantId = split.userId;
      const shareAmount = split.amount;

      if (balances[participantId]) {
        balances[participantId].totalOwed += shareAmount;
      }

      // Add to pairwise debt (participant owes payer)
      if (participantId !== payerId && rawDebts[participantId] && rawDebts[payerId]) {
        rawDebts[participantId][payerId] += shareAmount;
      }
    });
  });

  // Process settlements
  filteredSettlements.forEach(settle => {
    const payerId = settle.payerId;
    const payeeId = settle.payeeId;
    const amt = settle.amount;

    // A settlement is a payment from Payer to Payee.
    // In terms of Net Balance:
    // Payer's net balance goes up (they paid money out) -> so we count it as "total paid" increasing
    // Payee's net balance goes down (they received money) -> so we count it as "total owed" increasing or "total paid" decreasing
    // To keep the formula: Net Balance = Total Paid - Total Owed
    if (balances[payerId]) {
      balances[payerId].totalPaid += amt;
    }
    if (balances[payeeId]) {
      balances[payeeId].totalOwed += amt;
    }

    // A settlement directly reduces the debt from Payer to Payee
    if (rawDebts[payerId] && rawDebts[payeeId]) {
      rawDebts[payerId][payeeId] -= amt;
    }
  });

  // Clean up pairwise debts (if A owes B X and B owes A Y, net them)
  const netRawRelations: DebtRelation[] = [];
  const memberIds = members.map(m => m.id);
  
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const u1 = memberIds[i];
      const u2 = memberIds[j];
      
      const u1OwesU2 = rawDebts[u1][u2] || 0;
      const u2OwesU1 = rawDebts[u2][u1] || 0;
      
      const netOwed = u1OwesU2 - u2OwesU1;
      const m1Name = members.find(m => m.id === u1)?.name || "";
      const m2Name = members.find(m => m.id === u2)?.name || "";

      if (netOwed > 0.005) {
        netRawRelations.push({
          fromUserId: u1,
          fromUserName: m1Name,
          toUserId: u2,
          toUserName: m2Name,
          amount: Math.round(netOwed * 100) / 100
        });
      } else if (netOwed < -0.005) {
        netRawRelations.push({
          fromUserId: u2,
          fromUserName: m2Name,
          toUserId: u1,
          toUserName: m1Name,
          amount: Math.round(Math.abs(netOwed) * 100) / 100
        });
      }
    }
  }

  // Construct MemberBalance list
  const memberBalances: MemberBalance[] = members.map(m => {
    const b = balances[m.id] || { totalPaid: 0, totalOwed: 0 };
    return {
      userId: m.id,
      userName: m.name,
      totalPaid: Math.round(b.totalPaid * 100) / 100,
      totalOwed: Math.round(b.totalOwed * 100) / 100,
      netBalance: Math.round((b.totalPaid - b.totalOwed) * 100) / 100
    };
  });

  // Simplify Debts (Min Cash Flow Algorithm)
  const simplifiedBalances: DebtRelation[] = [];
  
  // Create a mutable copy of net balances
  const nets = memberBalances.map(mb => ({
    userId: mb.userId,
    userName: mb.userName,
    net: mb.netBalance
  }));

  // Helper to find min and max net balances
  const getMinMax = () => {
    let minIdx = 0;
    let maxIdx = 0;
    for (let k = 1; k < nets.length; k++) {
      if (nets[k].net < nets[minIdx].net) minIdx = k;
      if (nets[k].net > nets[maxIdx].net) maxIdx = k;
    }
    return { minIdx, maxIdx };
  };

  // Greedy simplification loop
  let iterations = 0;
  const maxIterations = nets.length * 2; // Safeguard

  while (iterations < maxIterations) {
    const { minIdx, maxIdx } = getMinMax();

    const minNet = nets[minIdx].net;
    const maxNet = nets[maxIdx].net;

    // If both are close to zero, we are fully settled
    if (Math.abs(minNet) < 0.01 && Math.abs(maxNet) < 0.01) {
      break;
    }

    const settledAmount = Math.min(Math.abs(minNet), maxNet);
    
    // Record simplified transaction: debtor (minIdx) pays creditor (maxIdx)
    simplifiedBalances.push({
      fromUserId: nets[minIdx].userId,
      fromUserName: nets[minIdx].userName,
      toUserId: nets[maxIdx].userId,
      toUserName: nets[maxIdx].userName,
      amount: Math.round(settledAmount * 100) / 100
    });

    // Update balances
    nets[minIdx].net += settledAmount;
    nets[maxIdx].net -= settledAmount;

    iterations++;
  }

  return {
    asOfDate,
    memberBalances,
    rawBalances: netRawRelations,
    simplifiedBalances
  };
}

// Function to generate the explainability trail of contributions for a single user's balance
export function explainUserBalance(
  userId: string,
  members: Array<{ id: string; name: string }>,
  expenses: Array<{
    id: string;
    description: string;
    paidById: string;
    amount: number;
    originalAmount: number;
    originalCurrency: string;
    exchangeRate: number;
    splitType: string;
    date: Date;
    participants: Array<{ userId: string }>;
    splits: Array<{ userId: string; amount: number; ratio?: number | null; percentage?: number | null }>;
  }>,
  settlements: Array<{
    id: string;
    payerId: string;
    payeeId: string;
    amount: number;
    originalAmount: number;
    originalCurrency: string;
    exchangeRate: number;
    date: Date;
    notes?: string | null;
  }>
): BalanceExplanationItem[] {
  const explanation: BalanceExplanationItem[] = [];

  const getUserName = (id: string) => members.find(m => m.id === id)?.name || "Unknown";

  // Process Expenses
  expenses.forEach(exp => {
    const payerName = getUserName(exp.paidById);
    const userSplit = exp.splits.find(s => s.userId === userId);
    const isPayer = exp.paidById === userId;

    if (!userSplit && !isPayer) {
      return; // Not involved in this expense
    }

    const totalInr = exp.amount;
    const userShare = userSplit ? userSplit.amount : 0;
    const userPaid = isPayer ? totalInr : 0;
    const impact = userPaid - userShare;

    if (Math.abs(impact) < 0.001) return; // No net impact on balance

    let chain = "";
    if (isPayer && userSplit) {
      // User paid and is in the split
      chain = `You paid ${exp.originalAmount} ${exp.originalCurrency}`;
      if (exp.originalCurrency !== "INR") {
        chain += ` (converted to ${totalInr.toFixed(2)} INR at 1 USD = ${exp.exchangeRate} INR)`;
      }
      chain += `. Your share is ${userShare.toFixed(2)} INR. Net balance impact: +${(totalInr - userShare).toFixed(2)} INR (Paid - Share).`;
    } else if (isPayer && !userSplit) {
      // User paid but is not in split
      chain = `You paid ${exp.originalAmount} ${exp.originalCurrency}`;
      if (exp.originalCurrency !== "INR") {
        chain += ` (converted to ${totalInr.toFixed(2)} INR at 1 USD = ${exp.exchangeRate} INR)`;
      }
      chain += `. You were excluded from the split. Net balance impact: +${totalInr.toFixed(2)} INR (Paid).`;
    } else {
      // User did not pay but is in split
      chain = `Paid by ${payerName}: ${exp.originalAmount} ${exp.originalCurrency}`;
      if (exp.originalCurrency !== "INR") {
        chain += ` (converted to ${totalInr.toFixed(2)} INR at 1 USD = ${exp.exchangeRate} INR)`;
      }
      chain += `. Your computed share is ${userShare.toFixed(2)} INR. Net balance impact: -${userShare.toFixed(2)} INR (Share).`;
    }

    explanation.push({
      id: exp.id,
      type: impact < 0 ? "EXPENSE" : "REFUND",
      date: new Date(exp.date),
      description: exp.description,
      originalAmount: exp.originalAmount,
      originalCurrency: exp.originalCurrency,
      exchangeRate: exp.exchangeRate,
      convertedAmount: totalInr,
      payerId: exp.paidById,
      payerName,
      userShare,
      impact: Math.round(impact * 100) / 100,
      calculationChain: chain
    });
  });

  // Process Settlements
  settlements.forEach(settle => {
    const isPayer = settle.payerId === userId;
    const isPayee = settle.payeeId === userId;

    if (!isPayer && !isPayee) return;

    const payerName = getUserName(settle.payerId);
    const payeeName = getUserName(settle.payeeId);
    const impact = isPayer ? settle.amount : -settle.amount;

    let chain = "";
    if (isPayer) {
      chain = `You paid settlement of ${settle.originalAmount} ${settle.originalCurrency}`;
      if (settle.originalCurrency !== "INR") {
        chain += ` (converted to ${settle.amount.toFixed(2)} INR at 1 USD = ${settle.exchangeRate} INR)`;
      }
      chain += ` to ${payeeName}. Net balance impact: +${settle.amount.toFixed(2)} INR.`;
    } else {
      chain = `You received settlement of ${settle.originalAmount} ${settle.originalCurrency}`;
      if (settle.originalCurrency !== "INR") {
        chain += ` (converted to ${settle.amount.toFixed(2)} INR at 1 USD = ${settle.exchangeRate} INR)`;
      }
      chain += ` from ${payerName}. Net balance impact: -${settle.amount.toFixed(2)} INR.`;
    }

    explanation.push({
      id: settle.id,
      type: "SETTLEMENT",
      date: new Date(settle.date),
      description: settle.notes || `Settlement: ${payerName} paid ${payeeName}`,
      originalAmount: settle.originalAmount,
      originalCurrency: settle.originalCurrency,
      exchangeRate: settle.exchangeRate,
      convertedAmount: settle.amount,
      payerId: settle.payerId,
      payerName,
      userShare: 0,
      impact: Math.round(impact * 100) / 100,
      calculationChain: chain
    });
  });

  // Sort by date ascending
  return explanation.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Prisma Database-integrated wrapper functions
export async function getGroupBalancesFromDb(groupId: string, asOfDateStr?: string): Promise<GroupBalanceSummary> {
  const asOfDate = asOfDateStr ? new Date(asOfDateStr) : new Date();

  // Fetch all members
  const dbMembers = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true }
  });

  const members = dbMembers.map(dm => ({
    id: dm.userId,
    name: dm.user.name,
    joinedAt: dm.joinedAt,
    leftAt: dm.leftAt
  }));

  // Fetch all expenses and their splits
  const dbExpenses = await prisma.expense.findMany({
    where: { groupId },
    include: {
      participants: true,
      splits: true
    }
  });

  const expenses = dbExpenses.map(de => ({
    id: de.id,
    description: de.description,
    paidById: de.paidById,
    amount: de.amount,
    originalAmount: de.originalAmount,
    originalCurrency: de.originalCurrency,
    exchangeRate: de.exchangeRate,
    splitType: de.splitType,
    date: de.date,
    participants: de.participants.map(p => ({ userId: p.userId })),
    splits: de.splits.map(s => ({
      userId: s.userId,
      amount: s.amount,
      ratio: s.ratio,
      percentage: s.percentage
    }))
  }));

  // Fetch all settlements
  const dbSettlements = await prisma.settlement.findMany({
    where: { groupId }
  });

  return computeBalances(members, expenses, dbSettlements, asOfDate);
}

export async function getUserBalanceExplanationFromDb(groupId: string, userId: string): Promise<{
  userName: string;
  netBalance: number;
  history: BalanceExplanationItem[];
}> {
  const dbMembers = await prisma.groupMember.findMany({
    where: { groupId },
    include: { user: true }
  });

  const members = dbMembers.map(dm => ({
    id: dm.userId,
    name: dm.user.name
  }));

  const user = dbMembers.find(dm => dm.userId === userId)?.user;
  const userName = user ? user.name : "Unknown";

  const dbExpenses = await prisma.expense.findMany({
    where: { groupId },
    include: {
      participants: true,
      splits: true
    }
  });

  const expenses = dbExpenses.map(de => ({
    id: de.id,
    description: de.description,
    paidById: de.paidById,
    amount: de.amount,
    originalAmount: de.originalAmount,
    originalCurrency: de.originalCurrency,
    exchangeRate: de.exchangeRate,
    splitType: de.splitType,
    date: de.date,
    participants: de.participants.map(p => ({ userId: p.userId })),
    splits: de.splits.map(s => ({
      userId: s.userId,
      amount: s.amount,
      ratio: s.ratio,
      percentage: s.percentage
    }))
  }));

  const dbSettlements = await prisma.settlement.findMany({
    where: { groupId }
  });

  const history = explainUserBalance(userId, members, expenses, dbSettlements);
  
  // Calculate current net balance
  const fullBalances = computeBalances(
    dbMembers.map(dm => ({
      id: dm.userId,
      name: dm.user.name,
      joinedAt: dm.joinedAt,
      leftAt: dm.leftAt
    })),
    expenses,
    dbSettlements
  );

  const netBalance = fullBalances.memberBalances.find(mb => mb.userId === userId)?.netBalance || 0;

  return {
    userName,
    netBalance,
    history
  };
}
