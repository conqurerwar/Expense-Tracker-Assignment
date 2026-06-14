"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Mail,
  User,
  Loader2,
  Sparkles,
  Check,
  X,
  Clock
} from "lucide-react";

interface Member {
  id: string;
  groupId: string;
  userId: string;
  joinedAt: string;
  leftAt: string | null;
  user: {
    name: string;
    email: string;
  };
}

export default function GroupManagement() {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);

  // Add Member form state
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [joinedAt, setJoinedAt] = useState("2026-02-01");
  const [leftAt, setLeftAt] = useState("");
  const [savingMember, setSavingMember] = useState(false);

  // Edit Member timeline state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJoinedAt, setEditJoinedAt] = useState("");
  const [editLeftAt, setEditLeftAt] = useState("");

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/groups/members?groupId=default-group-id");
      const data = await res.json();
      if (res.ok) {
        setMembers(data.members || []);
      }
    } catch (e) {
      console.error("Failed to fetch group members:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMember(true);
    try {
      const payload = {
        groupId: "default-group-id",
        name,
        email,
        joinedAt: new Date(joinedAt).toISOString(),
        leftAt: leftAt ? new Date(leftAt).toISOString() : null
      };

      const res = await fetch("/api/groups/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setName("");
        setEmail("");
        setJoinedAt("2026-02-01");
        setLeftAt("");
        setIsAdding(false);
        fetchMembers();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to add member");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to add member");
    } finally {
      setSavingMember(false);
    }
  };

  const handleStartEdit = (m: Member) => {
    setEditingId(m.id);
    setEditJoinedAt(m.joinedAt.split("T")[0]);
    setEditLeftAt(m.leftAt ? m.leftAt.split("T")[0] : "");
  };

  const handleSaveEdit = async (id: string) => {
    try {
      const payload = {
        id,
        joinedAt: new Date(editJoinedAt).toISOString(),
        leftAt: editLeftAt ? new Date(editLeftAt).toISOString() : null
      };

      const res = await fetch("/api/groups/members", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setEditingId(null);
        fetchMembers();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to update member");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update member");
    }
  };

  const handleRemoveMember = async (id: string) => {
    if (!confirm("Are you sure you want to remove this member? This will delete all their memberships, but they may remain linked to expenses they participated in.")) {
      return;
    }

    try {
      const res = await fetch(`/api/groups/members?id=${id}`, {
        method: "DELETE"
      });

      if (res.ok) {
        fetchMembers();
      } else {
        const d = await res.json();
        alert(d.error || "Failed to remove member");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to remove member");
    }
  };

  // Convert Date string for readable display
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Present (Active)";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
          <p className="text-sm font-medium text-slate-500">Loading Group Members...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <span>Group Members & Timeline</span>
            <Sparkles className="h-5 w-5 text-indigo-500" />
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Manage sharing partners and active intervals for splits.
          </p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center space-x-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/15 active:scale-95 transition-all cursor-pointer"
        >
          {isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          <span>{isAdding ? "Cancel" : "Add Group Member"}</span>
        </button>
      </div>

      {/* Add Member Form */}
      {isAdding && (
        <form
          onSubmit={handleAddMember}
          className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-sm space-y-4 max-w-xl"
        >
          <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
            <User className="h-4.5 w-4.5 text-blue-600" />
            <span>Add New Member Details</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-2">Full Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sam"
                className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl font-medium text-slate-200 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-2">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. sam@example.com"
                className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl font-medium text-slate-200 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-2">Group Join Date</label>
              <input
                type="date"
                required
                value={joinedAt}
                onChange={(e) => setJoinedAt(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl font-medium text-slate-200 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-semibold mb-2">Group Leave Date (Optional)</label>
              <input
                type="date"
                value={leftAt}
                onChange={(e) => setLeftAt(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 p-3 rounded-xl font-medium text-slate-200 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingMember}
              className="flex items-center space-x-1.5 px-4.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/15"
            >
              {savingMember ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span>Save Member</span>
            </button>
          </div>
        </form>
      )}

      {/* Visual Timeline representation */}
      <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl shadow-sm space-y-4">
        <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
          <Clock className="h-4.5 w-4.5 text-blue-600" />
          <span>Membership Durations (2026 Calendar)</span>
        </h3>
        <p className="text-xs text-slate-400">
          Visual trace of when members are active in the group. Aisha, Rohan, and Priya are always active. Meera left at the end of March. Sam joined in mid-April.
        </p>

        {/* Timeline Visualization Bars */}
        <div className="space-y-3.5 pt-4">
          {members.map((m) => {
            // Calculate active timeline bars representation
            // We assume a timeline of Feb 1 to Jun 1, 2026 (4 months = 120 days)
            const startDate = new Date("2026-02-01T00:00:00Z").getTime();
            const endDate = new Date("2026-06-30T00:00:00Z").getTime();
            const totalDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

            const joinedTime = new Date(m.joinedAt).getTime();
            const leftTime = m.leftAt ? new Date(m.leftAt).getTime() : endDate;

            const startPct = Math.max(0, ((joinedTime - startDate) / (1000 * 60 * 60 * 24) / totalDays) * 100);
            const durationPct = Math.min(100 - startPct, ((leftTime - joinedTime) / (1000 * 60 * 60 * 24) / totalDays) * 100);

            return (
              <div key={m.id} className="flex items-center space-x-4 text-xs">
                <span className="w-20 font-semibold text-slate-200 truncate">{m.user.name}</span>
                <div className="flex-1 bg-slate-800 h-6 rounded-lg relative overflow-hidden">
                  <div
                    className="absolute h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg shadow-sm border-l border-r border-blue-400"
                    style={{ left: `${startPct}%`, width: `${durationPct}%` }}
                  />
                  {/* Monthly division marks */}
                  <div className="absolute inset-0 flex justify-between pointer-events-none text-[8px] text-slate-300 font-bold px-1 items-center">
                    <span>Feb</span>
                    <span>Mar</span>
                    <span>Apr</span>
                    <span>May</span>
                    <span>Jun</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-slate-900/50 border-b border-slate-700">
          <h3 className="font-bold text-slate-100 text-sm">Membership Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-800/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-700">
                <th className="py-3.5 px-6">Name</th>
                <th className="py-3.5 px-6">Email</th>
                <th className="py-3.5 px-6">Joined Date</th>
                <th className="py-3.5 px-6">Left Date</th>
                <th className="py-3.5 px-6 w-32 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {members.map((m) => {
                const isEditing = editingId === m.id;
                return (
                  <tr key={m.id} className="hover:bg-slate-800/50 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-100">{m.user.name}</td>
                    <td className="py-4 px-6 text-slate-500">{m.user.email}</td>
                    <td className="py-4 px-6 font-medium text-slate-300">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editJoinedAt}
                          onChange={(e) => setEditJoinedAt(e.target.value)}
                          className="bg-slate-900 border border-slate-700 p-1.5 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-200"
                        />
                      ) : (
                        formatDate(m.joinedAt)
                      )}
                    </td>
                    <td className="py-4 px-6 font-medium text-slate-300">
                      {isEditing ? (
                        <input
                          type="date"
                          value={editLeftAt}
                          onChange={(e) => setEditLeftAt(e.target.value)}
                          className="bg-slate-900 border border-slate-700 p-1.5 rounded-lg outline-none focus:border-blue-500 font-medium text-slate-200"
                          placeholder="Active"
                        />
                      ) : (
                        formatDate(m.leftAt)
                      )}
                    </td>
                    <td className="py-4 px-6 text-center space-x-2">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(m.id)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-emerald-600 transition-colors"
                            title="Save Changes"
                          >
                            <Check className="h-4.5 w-4.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 rounded-lg text-rose-600 transition-colors"
                            title="Cancel Edit"
                          >
                            <X className="h-4.5 w-4.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => handleStartEdit(m)}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-300 transition-colors"
                            title="Edit Active Interval"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveMember(m.id)}
                            className="p-1.5 hover:bg-slate-800 rounded-lg text-rose-500 hover:text-rose-600 transition-colors"
                            title="Remove Member"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
