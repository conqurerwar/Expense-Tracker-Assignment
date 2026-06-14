"use client";

import React, { useState, useEffect } from "react";
import {
  Receipt,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Search,
  Filter,
  DollarSign,
  Info,
  Loader2,
  X,
  FileText,
  User,
  PlusCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  TrendingDown
} from "lucide-react";

interface UserInfo {
  id: string;
  name: string;
}

interface Participant {
  user: UserInfo;
}

interface Split {
  userId: string;
  user: UserInfo;
  amount: number;
  originalAmount: number;
  ratio: number | null;
  percentage: number | null;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  originalAmount: number;
  originalCurrency: string;
  exchangeRate: number;
  splitType: string;
  notes: string | null;
  date: string;
  paidById: string;
  paidBy: UserInfo;
  participants: Participant[];
  splits: Split[];
  importId: string | null;
}

export default function ExpenseTimeline() {
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<UserInfo[]>([]);

  // Filtering state
  const [filterUser, setFilterUser] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [filterSplitType, setFilterSplitType] = useState("");
  const [filterSource, setFilterSource] = useState(""); // manual or importId
  const [filterCategory, setFilterCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Add/Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  
  const [description, setDescription] = useState("");
  const [paidById, setPaidById] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [splitType, setSplitType] = useState("equal");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("2026-02-01");
  const [participants, setParticipants] = useState<string[]>([]);
  
  // Custom split values
  const [customSplits, setCustomSplits] = useState<Record<string, { amount: string; ratio: string; percentage: string }>>({});
  const [savingExpense, setSavingExpense] = useState(false);

  // Detail Drawer state
  const [drawerExpense, setDrawerExpense] = useState<Expense | null>(null);

  const fetchMembers = async () => {
    try {
      const res = await fetch("/api/groups/members?groupId=default-group-id");
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members?.map((m: any) => m.user) || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      let url = "/api/expenses?groupId=default-group-id";
      if (filterUser) url += `&userId=${filterUser}`;
      if (filterCurrency) url += `&currency=${filterCurrency}`;
      if (filterSplitType) url += `&splitType=${filterSplitType}`;
      if (filterSource) url += `&importId=${filterSource}`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;

      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        let list = data.expenses || [];
        
        // Front-end Category filtering
        if (filterCategory) {
          list = list.filter((e: Expense) => {
            const desc = e.description.toLowerCase();
            if (filterCategory === "Rent") return desc.includes("rent");
            if (filterCategory === "Food") {
              return (
                desc.includes("groceries") ||
                desc.includes("bigbasket") ||
                desc.includes("dmart") ||
                desc.includes("dinner") ||
                desc.includes("lunch") ||
                desc.includes("brunch") ||
                desc.includes("pizza") ||
                desc.includes("snacks") ||
                desc.includes("shack")
              );
            }
            if (filterCategory === "Utilities") {
              return (
                desc.includes("wifi") ||
                desc.includes("electricity") ||
                desc.includes("cylinder") ||
                desc.includes("maid") ||
                desc.includes("cleaning") ||
                desc.includes("supplies")
              );
            }
            if (filterCategory === "Travel") {
              return (
                desc.includes("trip") ||
                desc.includes("villa") ||
                desc.includes("flight") ||
                desc.includes("cab") ||
                desc.includes("scooter") ||
                desc.includes("parasailing") ||
                desc.includes("airport")
              );
            }
            return true;
          });
        }
        setExpenses(list);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    fetchExpenses();
  }, [filterUser, filterCurrency, filterSplitType, filterSource, filterCategory, startDate, endDate]);

  // Initializing splits object whenever participants or members list changes
  useEffect(() => {
    const nextCustom: typeof customSplits = {};
    members.forEach(m => {
      nextCustom[m.id] = customSplits[m.id] || { amount: "", ratio: "1", percentage: "" };
    });
    setCustomSplits(nextCustom);
  }, [members, participants]);

  // Open Add Modal
  const openAddModal = () => {
    setEditingExpenseId(null);
    setDescription("");
    setPaidById(members[0]?.id || "");
    setAmount("");
    setCurrency("INR");
    setSplitType("equal");
    setNotes("");
    setDate(new Date().toISOString().split("T")[0]);
    setParticipants(members.map(m => m.id)); // Default split with everyone
    
    const nextCustom: typeof customSplits = {};
    members.forEach(m => {
      nextCustom[m.id] = { amount: "", ratio: "1", percentage: "" };
    });
    setCustomSplits(nextCustom);

    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (e: Expense) => {
    setEditingExpenseId(e.id);
    setDescription(e.description);
    setPaidById(e.paidById);
    setAmount(e.originalAmount.toString());
    setCurrency(e.originalCurrency);
    setSplitType(e.splitType);
    setNotes(e.notes || "");
    setDate(e.date.split("T")[0]);
    setParticipants(e.participants.map(p => p.user.id));
    
    // Fill custom splits
    const nextCustom: typeof customSplits = {};
    members.forEach(m => {
      const matchSplit = e.splits.find(s => s.userId === m.id);
      nextCustom[m.id] = {
        amount: matchSplit ? matchSplit.originalAmount.toString() : "",
        ratio: matchSplit && matchSplit.ratio ? matchSplit.ratio.toString() : "1",
        percentage: matchSplit && matchSplit.percentage ? matchSplit.percentage.toString() : ""
      };
    });
    setCustomSplits(nextCustom);

    setIsModalOpen(true);
  };

  // Handle participant checkboxes toggle
  const toggleParticipant = (uId: string) => {
    setParticipants(prev => {
      if (prev.includes(uId)) {
        return prev.filter(id => id !== uId);
      } else {
        return [...prev, uId];
      }
    });
  };

  // Handle Split value inputs
  const handleSplitValueChange = (userId: string, field: "amount" | "ratio" | "percentage", val: string) => {
    setCustomSplits(prev => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        [field]: val
      }
    }));
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingExpense(true);

    try {
      // Structure splits payload
      const splitsPayload = participants.map(uId => {
        const item = customSplits[uId] || { amount: "0", ratio: "1", percentage: "0" };
        return {
          userId: uId,
          amount: parseFloat(item.amount) || 0,
          ratio: parseFloat(item.ratio) || 0,
          percentage: parseFloat(item.percentage) || 0
        };
      });

      const payload = {
        groupId: "default-group-id",
        description,
        paidById,
        amount: parseFloat(amount),
        currency,
        splitType,
        notes,
        date: new Date(date).toISOString(),
        participants,
        splits: splitsPayload
      };

      const url = editingExpenseId ? `/api/expenses/${editingExpenseId}` : "/api/expenses";
      const method = editingExpenseId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchExpenses();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to save expense");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to save expense");
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense? This will recalculate balances.")) {
      return;
    }

    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDrawerExpense(null);
        fetchExpenses();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to delete expense");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Expenses Timeline</span>
            <Receipt className="h-5.5 w-5.5 text-blue-500" />
          </h1>
          <p className="text-slate-500 text-sm mt-1">Audit trail and timelines of all logged expenses.</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center space-x-1.5 px-4.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/15 active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Add Manual Expense</span>
        </button>
      </div>

      {/* Filter Options */}
      <div className="bg-slate-900/50 border border-slate-700 p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-3">
          <Filter className="h-4 w-4 text-blue-600" />
          <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Timeline Filters</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
          {/* Member */}
          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Involved Member</label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 p-2 rounded-xl text-slate-200 outline-none"
            >
              <option value="">All Members</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Currency */}
          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Currency</label>
            <select
              value={filterCurrency}
              onChange={(e) => setFilterCurrency(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 p-2 rounded-xl text-slate-200 outline-none"
            >
              <option value="">All Currencies</option>
              <option value="INR">INR</option>
              <option value="USD">USD</option>
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 p-2 rounded-xl text-slate-200 outline-none"
            >
              <option value="">All Categories</option>
              <option value="Rent">Rent</option>
              <option value="Food">Food & Groceries</option>
              <option value="Utilities">Utilities & Housekeeping</option>
              <option value="Travel">Travel & Outings</option>
            </select>
          </div>

          {/* Source */}
          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Source</label>
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 p-2 rounded-xl text-slate-200 outline-none"
            >
              <option value="">All Sources</option>
              <option value="manual">Manual Expense</option>
              {/* If we have a past import run we can list here, otherwise map as imported */}
              <option value="imported">Imported CSV</option>
            </select>
          </div>

          {/* Dates */}
          <div>
            <label className="text-slate-400 font-semibold mb-1 block">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 p-2 rounded-xl text-slate-200 outline-none"
            />
          </div>

          <div>
            <label className="text-slate-400 font-semibold mb-1 block">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 p-2 rounded-xl text-slate-200 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Main Layout: Split list and detail drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Expenses List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900/50 border border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-900/50 border-b border-slate-700 flex justify-between items-center">
              <h3 className="font-bold text-slate-100 text-xs uppercase tracking-wider">Expense Logs</h3>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {expenses.length} Records
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {loading ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
                </div>
              ) : expenses.length > 0 ? (
                expenses.map((e) => (
                  <div
                    key={e.id}
                    onClick={() => setDrawerExpense(e)}
                    className={`px-6 py-4 flex items-center justify-between hover:bg-slate-800 cursor-pointer transition-colors duration-150 ${
                      drawerExpense?.id === e.id ? "bg-slate-800 border-l-4 border-blue-500 pl-5" : ""
                    }`}
                  >
                    <div className="flex items-center space-x-4 min-w-0">
                      <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                        <Receipt className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-slate-100 font-bold truncate">{e.description}</p>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-1 font-medium">
                          <span className="font-semibold text-slate-300">Paid by {e.paidBy?.name}</span>
                          <span>•</span>
                          <span>{new Date(e.date).toLocaleDateString()}</span>
                          {e.importId && (
                            <>
                              <span>•</span>
                              <span className="px-1.5 py-0.2 bg-indigo-50 border border-indigo-100 rounded text-indigo-500 text-[8px] font-bold tracking-wide uppercase">
                                Imported
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-sm font-extrabold text-slate-100 block">
                        ₹{Math.round(e.amount).toLocaleString()}
                      </span>
                      {e.originalCurrency !== "INR" && (
                        <span className="text-[10px] text-slate-400 block mt-0.5">
                          {e.originalAmount} {e.originalCurrency}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-12 text-center text-slate-400 text-sm">
                  No expenses matching filters found. Add a manual expense or load the CSV file.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Details Drawer */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-2xl shadow-sm overflow-hidden p-6 space-y-6">
          <div className="border-b border-slate-100 pb-4 flex justify-between items-center">
            <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <Info className="h-4.5 w-4.5 text-blue-500" />
              <span>Expense Audit details</span>
            </h3>
            {drawerExpense && (
              <div className="flex space-x-2">
                <button
                  onClick={() => openEditModal(drawerExpense)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
                  title="Edit Expense"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteExpense(drawerExpense.id)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-rose-500 hover:text-rose-600 transition-colors"
                  title="Delete Expense"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {drawerExpense ? (
            <div className="space-y-6 text-xs">
              {/* Description & Date */}
              <div>
                <h4 className="text-base font-extrabold text-slate-100">{drawerExpense.description}</h4>
                <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-1.5 font-medium">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Logged date: {new Date(drawerExpense.date).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Converted details */}
              <div className="bg-slate-900/50 border border-slate-700/60 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-semibold">Total Amount (INR)</span>
                  <span className="font-extrabold text-slate-100 text-base">
                    ₹{drawerExpense.amount.toLocaleString()}
                  </span>
                </div>
                {drawerExpense.originalCurrency !== "INR" && (
                  <div className="border-t border-slate-200/50 pt-2.5 space-y-1.5 text-[11px] text-slate-500">
                    <div className="flex justify-between">
                      <span>Original Cost</span>
                      <span className="font-semibold text-slate-200">
                        {drawerExpense.originalAmount} {drawerExpense.originalCurrency}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Exchange Rate</span>
                      <span className="font-semibold text-slate-200">
                        1 USD = {drawerExpense.exchangeRate} INR
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Payer and splits type */}
              <div className="space-y-2">
                <h5 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Split Strategy</h5>
                <div className="flex justify-between font-medium">
                  <span>Paid By</span>
                  <span className="font-bold text-slate-100">{drawerExpense.paidBy?.name}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Split Formula</span>
                  <span className="font-bold text-slate-100 capitalize">{drawerExpense.splitType}</span>
                </div>
              </div>

              {/* Splits Breakdown */}
              <div className="space-y-3.5">
                <h5 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Allocated Shares</h5>
                <div className="space-y-2.5">
                  {drawerExpense.splits.map((s) => (
                    <div key={s.userId} className="flex justify-between items-center text-xs">
                      <div className="flex items-center space-x-2">
                        <div className="h-6 w-6 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-500 text-[10px]">
                          {s.user?.name.charAt(0)}
                        </div>
                        <span className="font-semibold text-slate-200">{s.user?.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-slate-100">
                          ₹{Math.round(s.amount).toLocaleString()}
                        </span>
                        {s.percentage && (
                          <span className="text-[10px] text-slate-400 block">{s.percentage}%</span>
                        )}
                        {s.ratio && !s.percentage && (
                          <span className="text-[10px] text-slate-400 block">{s.ratio} share</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              {drawerExpense.notes && (
                <div className="space-y-1.5 border-t border-slate-100 pt-4">
                  <h5 className="font-bold text-[10px] text-slate-400 uppercase tracking-wider">Notes & Comments</h5>
                  <p className="text-slate-500 italic leading-relaxed bg-slate-900/50 p-2.5 rounded-lg border border-slate-700">
                    "{drawerExpense.notes}"
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-24 text-center text-slate-400 text-xs">
              Select an expense from the list to display audit details and split breakdowns.
            </div>
          )}
        </div>
      </div>

      {/* Manual Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form
            onSubmit={handleSaveExpense}
            className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-xl max-w-lg w-full space-y-4 max-h-[95vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Receipt className="h-4.5 w-4.5 text-blue-600" />
                <h3 className="font-bold text-slate-100 text-sm">
                  {editingExpenseId ? "Modify Expense" : "Add Manual Expense"}
                </h3>
              </div>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="col-span-2">
                <label className="block text-slate-400 font-semibold mb-1.5">Description</label>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Feb Rent"
                  className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-xl font-medium outline-none focus:border-blue-500 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Paid By (Payer)</label>
                <select
                  value={paidById}
                  onChange={(e) => setPaidById(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-xl font-semibold outline-none focus:border-blue-500 text-slate-200"
                >
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Date</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-xl font-medium outline-none focus:border-blue-500 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Amount</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 48000"
                  className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-xl font-medium outline-none focus:border-blue-500 text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-xl font-semibold outline-none focus:border-blue-500 text-slate-200"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1.5">Split Type</label>
                <select
                  value={splitType}
                  onChange={(e) => setSplitType(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-xl font-semibold outline-none focus:border-blue-500 text-slate-200"
                >
                  <option value="equal">Split Equally</option>
                  <option value="percentage">Percentages (%)</option>
                  <option value="share">Ratios / Shares (1:2)</option>
                  <option value="unequal">Unequal / Fixed Values</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-slate-400 font-semibold mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Notes or trip details..."
                  className="w-full bg-slate-900 border border-slate-700 p-2.5 rounded-xl font-medium outline-none focus:border-blue-500 h-16 resize-none text-slate-200"
                />
              </div>
            </div>

            {/* Split Participants check-list */}
            <div className="space-y-3.5">
              <label className="block text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                Split Participants
              </label>
              <div className="grid grid-cols-2 gap-3.5">
                {members.map(m => {
                  const involved = participants.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                        involved
                          ? "bg-blue-950 border-blue-700 text-blue-200"
                          : "bg-slate-900 border-slate-700 text-slate-400"
                      }`}
                    >
                      <label className="flex items-center space-x-2.5 cursor-pointer font-semibold w-full">
                        <input
                          type="checkbox"
                          checked={involved}
                          onChange={() => toggleParticipant(m.id)}
                          className="rounded text-blue-600 border-slate-300"
                        />
                        <span>{m.name}</span>
                      </label>

                      {/* Custom value inputs depending on SplitType */}
                      {involved && splitType !== "equal" && (
                        <div className="w-20">
                          {splitType === "percentage" && (
                            <input
                              type="number"
                              required
                              placeholder="%"
                              value={customSplits[m.id]?.percentage || ""}
                              onChange={(e) => handleSplitValueChange(m.id, "percentage", e.target.value)}
                              className="w-full bg-slate-900 border border-blue-500 p-1.5 rounded-lg text-center font-bold text-slate-100"
                            />
                          )}
                          {splitType === "share" && (
                            <input
                              type="number"
                              required
                              placeholder="share"
                              value={customSplits[m.id]?.ratio || "1"}
                              onChange={(e) => handleSplitValueChange(m.id, "ratio", e.target.value)}
                              className="w-full bg-slate-900 border border-blue-500 p-1.5 rounded-lg text-center font-bold text-slate-100"
                            />
                          )}
                          {splitType === "unequal" && (
                            <input
                              type="number"
                              required
                              placeholder="value"
                              value={customSplits[m.id]?.amount || ""}
                              onChange={(e) => handleSplitValueChange(m.id, "amount", e.target.value)}
                              className="w-full bg-slate-900 border border-blue-500 p-1.5 rounded-lg text-center font-bold text-slate-100"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end space-x-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingExpense || participants.length === 0}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/15 transition-all flex items-center space-x-2 cursor-pointer"
              >
                {savingExpense && <Loader2 className="h-4 w-4 animate-spin text-white" />}
                <span>Save Expense</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
