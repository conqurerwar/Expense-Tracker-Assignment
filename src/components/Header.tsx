"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Database, Loader2, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export const Header: React.FC = () => {
  const pathname = usePathname();
  const { user } = useAuth();
  
  const [seedingStatus, setSeedingStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [dbState, setDbState] = useState<{ users: number; expenses: number } | null>(null);

  // Derive page title from pathname
  const getPageTitle = () => {
    if (pathname === "/") return "Welcome";
    const segment = pathname.split("/")[1];
    if (!segment) return "Dashboard";
    return segment.charAt(0).toUpperCase() + segment.slice(1).replace("-", " ");
  };

  const checkDbStatus = async () => {
    try {
      const res = await fetch("/api/groups/members?groupId=default-group-id");
      if (res.ok) {
        const data = await res.json();
        const membersCount = data.members?.length || 0;
        
        const expRes = await fetch("/api/expenses?groupId=default-group-id");
        const expData = await expRes.json();
        const expCount = expData.expenses?.length || 0;

        setDbState({ users: membersCount, expenses: expCount });
      }
    } catch (e) {
      console.warn("Could not check database status:", e);
    }
  };

  useEffect(() => {
    checkDbStatus();
  }, [pathname, seedingStatus]);

  const handleSeed = async () => {
    setSeedingStatus("loading");
    try {
      // We can trigger the seeding by making a request to a helper API or just invoking it
      // Let's create an API route /api/settings/seed specifically for this
      const res = await fetch("/api/settings/seed", { method: "POST" });
      if (res.ok) {
        setSeedingStatus("success");
        setTimeout(() => setSeedingStatus("idle"), 3000);
      } else {
        setSeedingStatus("error");
      }
    } catch (e) {
      console.error(e);
      setSeedingStatus("error");
    }
  };

  return (
    <header className="h-16 bg-slate-950 border-b border-slate-700 px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Breadcrumb / Title */}
      <div className="flex items-center space-x-2">
        <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Pages</span>
        <span className="text-slate-300">/</span>
        <h2 className="text-slate-100 font-bold text-base tracking-tight">{getPageTitle()}</h2>
      </div>

      {/* Database State & Seeding helpers */}
      <div className="flex items-center space-x-4">
        {dbState && dbState.users === 0 && (
          <div className="flex items-center space-x-2 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg text-amber-700 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Database needs seeding</span>
          </div>
        )}

        {dbState && dbState.users > 0 && (
          <div className="text-xs font-medium text-slate-500 hidden md:block">
            Group: <strong className="text-slate-100 font-semibold">{dbState.users} Members</strong>
            {dbState.expenses > 0 && (
              <span>, <strong className="text-slate-100 font-semibold">{dbState.expenses} Expenses</strong></span>
            )}
          </div>
        )}

        <button
          onClick={handleSeed}
          disabled={seedingStatus === "loading"}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all duration-200 ${
            seedingStatus === "loading"
              ? "bg-slate-900/50 border-slate-700 text-slate-400 cursor-not-allowed"
              : seedingStatus === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-600"
              : seedingStatus === "error"
              ? "bg-rose-50 border-rose-200 text-rose-600"
              : "bg-slate-900/50 hover:bg-slate-800 border-slate-700 text-slate-200 hover:text-white active:scale-95"
          }`}
        >
          {seedingStatus === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : seedingStatus === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Database className="h-3.5 w-3.5" />
          )}
          <span>
            {seedingStatus === "loading"
              ? "Seeding DB..."
              : seedingStatus === "success"
              ? "DB Seeded!"
              : seedingStatus === "error"
              ? "Seed Failed"
              : "Seed Database"}
          </span>
        </button>
      </div>
    </header>
  );
};
