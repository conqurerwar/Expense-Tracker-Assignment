"use client";

import React, { useEffect, useState } from "react";
import {
  TrendingUp,
  Receipt,
  Users,
  AlertCircle,
  Database,
  ArrowUpRight,
  TrendingDown,
  Activity,
  Calendar,
  Sparkles,
  Loader2,
  Landmark
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid
} from "recharts";
import Link from "next/link";

interface Member {
  userId: string;
  user: { name: string };
  joinedAt: string;
  leftAt: string | null;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  originalAmount: number;
  originalCurrency: string;
  date: string;
  paidBy: { name: string };
}

interface Settlement {
  id: string;
  amount: number;
  date: string;
  payer: { name: string };
  payee: { name: string };
}

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  newValue?: string;
  user?: { name: string };
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [imports, setImports] = useState<any[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch members
      const mRes = await fetch("/api/groups/members?groupId=default-group-id");
      const mData = await mRes.json();
      setMembers(mData.members || []);

      // Fetch expenses
      const eRes = await fetch("/api/expenses?groupId=default-group-id");
      const eData = await eRes.json();
      setExpenses(eData.expenses || []);

      // Fetch settlements
      const sRes = await fetch("/api/settlements?groupId=default-group-id");
      const sData = await sRes.json();
      setSettlements(sData.settlements || []);

      // Fetch audit logs
      const aRes = await fetch("/api/audit-logs");
      const aData = await aRes.json();
      setAuditLogs(aData.auditLogs?.slice(0, 10) || []);

      // Fetch imports
      const iRes = await fetch("/api/import/history");
      const iData = await iRes.json();
      setImports(iData.imports || []);
    } catch (e) {
      console.error("Dashboard failed to load stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Category Classifier Helper
  const getCategory = (desc: string): string => {
    const d = desc.toLowerCase();
    if (d.includes("rent")) return "Rent";
    if (
      d.includes("groceries") ||
      d.includes("bigbasket") ||
      d.includes("dmart") ||
      d.includes("brunch") ||
      d.includes("pizza") ||
      d.includes("dinner") ||
      d.includes("lunch") ||
      d.includes("snacks") ||
      d.includes("shack")
    )
      return "Food & Groceries";
    if (
      d.includes("wifi") ||
      d.includes("electricity") ||
      d.includes("cylinder") ||
      d.includes("cleaning") ||
      d.includes("maid") ||
      d.includes("supplies")
    )
      return "Utilities & Maid";
    if (
      d.includes("trip") ||
      d.includes("villa") ||
      d.includes("flight") ||
      d.includes("scooter") ||
      d.includes("parasailing") ||
      d.includes("cab") ||
      d.includes("airport")
    )
      return "Travel & Goa Trip";
    return "Others";
  };

  // 1. Calculate Metrics
  const totalExpensesInr = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalSettlementsInr = settlements.reduce((sum, s) => sum + s.amount, 0);
  const activeMembersCount = members.filter(m => !m.leftAt || new Date(m.leftAt) > new Date()).length;
  
  // Calculate total pending issues from imports
  const totalWarnings = imports.reduce((sum, imp) => sum + (imp.warningsCount || 0), 0);
  const totalErrors = imports.reduce((sum, imp) => sum + (imp.errorsCount || 0), 0);
  const lastImportDate = imports.length > 0 ? new Date(imports[0].createdAt).toLocaleDateString() : "Never";

  // 2. Spending by Member
  const spendingByMemberMap: Record<string, number> = {};
  expenses.forEach(e => {
    const name = e.paidBy?.name || "System";
    spendingByMemberMap[name] = (spendingByMemberMap[name] || 0) + e.amount;
  });
  const spendingByMemberData = Object.entries(spendingByMemberMap).map(([name, value]) => ({
    name,
    value: Math.round(value)
  }));

  // 3. Spending by Category
  const spendingByCategoryMap: Record<string, number> = {};
  expenses.forEach(e => {
    const category = getCategory(e.description);
    spendingByCategoryMap[category] = (spendingByCategoryMap[category] || 0) + e.amount;
  });
  const spendingByCategoryData = Object.entries(spendingByCategoryMap).map(([name, value]) => ({
    name,
    value: Math.round(value)
  }));

  // 4. Monthly Spending Trend
  const monthlySpendingMap: Record<string, number> = {};
  expenses.forEach(e => {
    const date = new Date(e.date);
    const month = date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }); // e.g. Feb 26
    monthlySpendingMap[month] = (monthlySpendingMap[month] || 0) + e.amount;
  });
  const monthlySpendingData = Object.entries(monthlySpendingMap)
    .map(([month, amount]) => ({ month, amount: Math.round(amount) }))
    // Sort chronologically (Feb, Mar, Apr, etc.)
    .reverse();

  // 5. Currency Breakdown
  let countInr = 0;
  let countUsd = 0;
  expenses.forEach(e => {
    if (e.originalCurrency === "USD") countUsd += e.amount;
    else countInr += e.amount;
  });
  const currencyData = [
    { name: "INR Native", value: Math.round(countInr) },
    { name: "USD Converted", value: Math.round(countUsd) }
  ];

  // Colors for charts
  const COLORS = ["#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899"];

  // Activity Feed
  const activityFeed = [
    ...expenses.map(e => ({
      id: e.id,
      type: "EXPENSE",
      text: `${e.paidBy?.name} logged '${e.description}'`,
      amount: `₹${e.amount.toLocaleString()}`,
      date: new Date(e.date),
      icon: Receipt,
      color: "bg-blue-500/10 text-blue-600"
    })),
    ...settlements.map(s => ({
      id: s.id,
      type: "SETTLEMENT",
      text: `${s.payer?.name} settled with ${s.payee?.name}`,
      amount: `₹${s.amount.toLocaleString()}`,
      date: new Date(s.date),
      icon: Landmark,
      color: "bg-emerald-500/10 text-emerald-600"
    })),
    ...auditLogs.map(l => ({
      id: l.id,
      type: "AUDIT",
      text: `Audit: ${l.action.replace(/_/g, " ")} on ${l.entityType}`,
      amount: null,
      date: new Date(l.createdAt),
      icon: Activity,
      color: "bg-purple-500/10 text-purple-600"
    }))
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 7);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
          <p className="text-sm font-medium text-slate-500">Loading Dashboard Metrics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Expenses Overview</span>
            <Sparkles className="h-5 w-5 text-indigo-500" />
          </h1>
          <p className="text-slate-500 text-sm mt-1">Real-time statistics and sharing metrics.</p>
        </div>
        <div className="flex space-x-3">
          <Link
            href="/import"
            className="flex items-center space-x-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/15 active:scale-95 transition-all"
          >
            <Database className="h-4 w-4" />
            <span>Launch Import Wizard</span>
          </Link>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* Total Expenses */}
        <div className="glass-card p-6 rounded-2xl group">
          <div className="flex justify-between items-start">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-105 transition-transform duration-200">
              <TrendingUp className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">INR Total</span>
          </div>
          <div className="mt-4">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Spent</h3>
            <p className="text-2xl font-black text-white mt-1">
              ₹{Math.round(totalExpensesInr).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Total Settlements */}
        <div className="glass-card p-6 rounded-2xl group">
          <div className="flex justify-between items-start">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-105 transition-transform duration-200">
              <TrendingDown className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Settled</span>
          </div>
          <div className="mt-4">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Total Settled</h3>
            <p className="text-2xl font-black text-white mt-1">
              ₹{Math.round(totalSettlementsInr).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Active Members */}
        <div className="glass-card p-6 rounded-2xl group">
          <div className="flex justify-between items-start">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600 group-hover:scale-105 transition-transform duration-200">
              <Users className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Timeline</span>
          </div>
          <div className="mt-4">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Active Members</h3>
            <p className="text-2xl font-black text-white mt-1">{activeMembersCount}</p>
          </div>
        </div>

        {/* Pending Issues */}
        <div className="glass-card p-6 rounded-2xl group">
          <div className="flex justify-between items-start">
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 group-hover:scale-105 transition-transform duration-200">
              <AlertCircle className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Audit</span>
          </div>
          <div className="mt-4">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Import Issues</h3>
            <p className="text-2xl font-black text-white mt-1">
              {totalWarnings + totalErrors}
              <span className="text-xs font-medium text-slate-400 ml-1">({totalErrors} Err)</span>
            </p>
          </div>
        </div>

        {/* Last Import Run */}
        <div className="glass-card p-6 rounded-2xl group">
          <div className="flex justify-between items-start">
            <div className="p-3 rounded-xl bg-amber-50 text-amber-600 group-hover:scale-105 transition-transform duration-200">
              <Calendar className="h-5 w-5" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sync</span>
          </div>
          <div className="mt-4">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Last Import</h3>
            <p className="text-lg font-extrabold text-slate-200 mt-2 truncate">{lastImportDate}</p>
          </div>
        </div>
      </div>

      {/* Main Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by Member */}
        <div className="glass-card p-6 rounded-2xl shadow-sm">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-6">Spending by Member</h2>
          <div className="h-72">
            {spendingByMemberData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spendingByMemberData} margin={{ left: 10 }}>
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} />
                  <Tooltip formatter={(value: any) => [`₹${value?.toLocaleString()}`, "Paid"]} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#e2e8f0' }} />
                  <Bar dataKey="value" fill="#3B82F6" radius={[8, 8, 0, 0]}>
                    {spendingByMemberData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                No expense data available. Seed database to display chart.
              </div>
            )}
          </div>
        </div>

        {/* Spending by Category */}
        <div className="glass-card p-6 rounded-2xl shadow-sm">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-6">Spending by Category</h2>
          <div className="h-72 flex flex-col md:flex-row items-center">
            {spendingByCategoryData.length > 0 ? (
              <>
                <div className="flex-1 w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={spendingByCategoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {spendingByCategoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => `₹${value?.toLocaleString()}`} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#e2e8f0' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full md:w-56 mt-4 md:mt-0 space-y-2.5">
                  {spendingByCategoryData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-slate-500 font-medium truncate">{entry.name}</span>
                      </div>
                      <span className="text-slate-200 font-bold">₹{entry.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                No expense data available. Seed database to display chart.
              </div>
            )}
          </div>
        </div>

        {/* Monthly Spending Trend */}
        <div className="glass-card p-6 rounded-2xl shadow-sm">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-6">Monthly Spending Trend</h2>
          <div className="h-72">
            {monthlySpendingData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlySpendingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="month" stroke="#94A3B8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94A3B8" fontSize={12} tickLine={false} />
                  <Tooltip formatter={(value: any) => `₹${value?.toLocaleString()}`} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#e2e8f0' }} />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#8B5CF6"
                    strokeWidth={3}
                    dot={{ stroke: "#8B5CF6", strokeWidth: 2, r: 4, fill: "#FFF" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                No monthly data available.
              </div>
            )}
          </div>
        </div>

        {/* Currency Breakdown */}
        <div className="glass-card p-6 rounded-2xl shadow-sm">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-6">
            Currency Breakdown (INR vs USD)
          </h2>
          <div className="h-72 flex flex-col md:flex-row items-center">
            {expenses.length > 0 ? (
              <>
                <div className="flex-1 w-full h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={currencyData}
                        cx="50%"
                        cy="50%"
                        outerRadius={90}
                        label={({ name, percent }: any) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                        dataKey="value"
                      >
                        <Cell fill="#10B981" />
                        <Cell fill="#F59E0B" />
                      </Pie>
                      <Tooltip formatter={(value: any) => `₹${value?.toLocaleString()}`} contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#e2e8f0' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full md:w-56 mt-4 md:mt-0 space-y-2.5">
                  <div className="text-xs bg-slate-900/50 border border-slate-700 p-3 rounded-xl space-y-1">
                    <p className="font-semibold text-slate-200">Audit Conversion Rule</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      All USD expenses are automatically converted to INR on the date of transaction using audited rates.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                No monthly data available.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity and Audit Logs */}
      <div className="glass-card border-none rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-800/50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Recent Activity Feed</h2>
          <span className="text-xs text-slate-400">Refreshed just now</span>
        </div>
        <div className="divide-y divide-slate-800/50">
          {activityFeed.length > 0 ? (
            activityFeed.map((activity) => (
              <div
                key={activity.id + "-" + activity.type}
                className="px-6 py-4 flex items-center justify-between hover:bg-slate-800 transition-colors duration-150"
              >
                <div className="flex items-center space-x-4 min-w-0">
                  <div className={`p-2 rounded-xl shrink-0 ${activity.color}`}>
                    <activity.icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-200 font-semibold truncate">{activity.text}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {activity.date.toLocaleDateString()} at {activity.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                {activity.amount && (
                  <span className="text-sm font-extrabold text-slate-200 shrink-0 ml-4">
                    {activity.amount}
                  </span>
                )}
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm">
              No recent activity. Try importing the CSV export file.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
