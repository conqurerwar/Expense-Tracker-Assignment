"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { ArrowRight, DollarSign, ExternalLink, ShieldAlert, ArrowDownRight, ArrowUpRight, CheckCircle2 } from "lucide-react";

export default function BalancesPage() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [explainUserId, setExplainUserId] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<any[]>([]);
  const [explaining, setExplaining] = useState(false);

  const [settlingDebt, setSettlingDebt] = useState<any>(null);
  const [settleAmount, setSettleAmount] = useState<string>("");
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    fetchBalances();
  }, []);

  const fetchBalances = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/balances");
      if (!res.ok) throw new Error("Failed to fetch balances");
      const data = await res.json();
      if (data.success) {
        setBalances(data.balances);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchExplanation = async (uid: string) => {
    try {
      setExplainUserId(uid);
      setExplaining(true);
      const res = await fetch(`/api/balances/explain?userId=${uid}`);
      if (!res.ok) throw new Error("Failed to fetch explanation");
      const data = await res.json();
      if (data.success) {
        setExplanation(data.explanation);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message);
    } finally {
      setExplaining(false);
    }
  };

  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settlingDebt) return;
    try {
      setSettling(true);
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payerId: settlingDebt.fromUserId,
          payeeId: settlingDebt.toUserId,
          amount: parseFloat(settleAmount),
          currency: "INR",
          date: new Date().toISOString()
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to settle");
      }
      setSettlingDebt(null);
      setSettleAmount("");
      await fetchBalances(); // Refresh balances
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSettling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-6 text-red-700 dark:bg-red-900/20 dark:text-red-400">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-6 w-6" />
          <h3 className="text-lg font-medium">Failed to load balances</h3>
        </div>
        <p className="mt-2">{error}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Balances & Settlements</h1>
          <p className="mt-2 text-slate-400">View net balances and settle up debts effortlessly.</p>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Net Balances */}
        <div className="glass-card">
          <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-white">Net Balances</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {balances?.memberBalances?.map((mb: any) => (
              <div
                key={mb.userId}
                className="flex items-center justify-between p-6 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                onClick={() => fetchExplanation(mb.userId)}
              >
                <div>
                  <div className="font-medium text-white">{mb.userName}</div>
                  <div className="text-sm text-gray-500">
                    Paid: ₹{mb.totalPaid.toFixed(2)} • Owed: ₹{mb.totalOwed.toFixed(2)}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className={`text-right text-lg font-bold ${mb.netBalance > 0 ? "text-emerald-600" : mb.netBalance < 0 ? "text-red-600" : "text-gray-600"}`}>
                    {mb.netBalance > 0 ? "+" : ""}
                    ₹{mb.netBalance.toFixed(2)}
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Simplified Debts */}
        <div className="glass-card">
          <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
            <h3 className="text-lg font-semibold text-white">Suggested Settlements</h3>
            <p className="text-sm text-gray-500">Optimized minimum cash flow</p>
          </div>
          <div className="p-6 space-y-4">
            {balances?.simplifiedBalances?.length === 0 ? (
              <div className="text-center py-10 text-gray-500 flex flex-col items-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
                <p>All settled up!</p>
              </div>
            ) : (
              balances?.simplifiedBalances?.map((debt: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{debt.fromUserName}</span>
                    <ArrowRight className="h-4 w-4 text-gray-400" />
                    <span className="font-medium text-white">{debt.toUserName}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-white">₹{debt.amount.toFixed(2)}</span>
                    <button
                      onClick={() => {
                        setSettlingDebt(debt);
                        setSettleAmount(debt.amount.toFixed(2));
                      }}
                      className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Settle
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Explanation Modal */}
      {explainUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-gray-100 p-6 dark:border-gray-800">
              <div>
                <h3 className="text-xl font-bold text-white">Balance Traceability</h3>
                <p className="text-sm text-gray-500">Step-by-step breakdown</p>
              </div>
              <button
                onClick={() => setExplainUserId(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                Close
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {explaining ? (
                <div className="py-10 text-center text-gray-500">Loading audit trail...</div>
              ) : (
                <div className="space-y-4">
                  {explanation.map((item, idx) => (
                    <div key={idx} className="rounded-lg border border-gray-100 p-4 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            item.type === "EXPENSE" ? "bg-blue-100 text-blue-700" :
                            item.type === "SETTLEMENT" ? "bg-purple-100 text-purple-700" :
                            "bg-gray-100 text-gray-700"
                          }`}>
                            {item.type}
                          </span>
                          <span className="ml-2 text-sm font-medium text-white">{item.description}</span>
                          <span className="ml-2 text-xs text-gray-500">{new Date(item.date).toLocaleDateString()}</span>
                          <span className="ml-2 text-xs text-slate-500">{new Date(item.date).toLocaleDateString()}</span>
                        </div>
                        <div className={`font-bold ${item.impact > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {item.impact > 0 ? "+" : ""}₹{item.impact.toFixed(2)}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 font-mono glass-panel p-2 rounded border border-slate-800/50">
                        {item.calculationChain}
                      </div>
                    </div>
                  ))}
                  {explanation.length === 0 && (
                    <div className="text-center py-10 text-slate-400">No transactions found for this user.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Settle Modal */}
      {settlingDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <form onSubmit={handleSettleSubmit}>
              <div className="border-b border-gray-100 p-6 dark:border-gray-800">
                <h3 className="text-xl font-bold text-white">Record Settlement</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {settlingDebt.fromUserName} pays {settlingDebt.toUserName}
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount (INR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 p-2.5 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900/50">
                <button
                  type="button"
                  onClick={() => setSettlingDebt(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {settling ? "Recording..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
