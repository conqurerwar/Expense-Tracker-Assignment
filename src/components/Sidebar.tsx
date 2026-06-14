"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  UploadCloud,
  Users,
  Receipt,
  Landmark,
  ShieldCheck,
  Settings,
  LogOut,
  Sparkles
} from "lucide-react";

export const Sidebar: React.FC = () => {
  const pathname = usePathname();
  const { user, logout, isPlaceholder } = useAuth();

  const menuItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Import Wizard", href: "/import", icon: UploadCloud },
    { name: "Groups & Timeline", href: "/group", icon: Users },
    { name: "Expenses Timeline", href: "/expenses", icon: Receipt },
    { name: "Balances & Settle", href: "/balances", icon: Landmark },
    { name: "Audit Logs", href: "/audit", icon: ShieldCheck },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="w-64 glass-panel border-r-0 text-slate-200 flex flex-col h-screen fixed left-0 top-0 z-30 shadow-[4px_0_24px_rgba(0,0,0,0.5)]">
      <div className="h-6"></div>
      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm group ${
                isActive
                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-600/10"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <item.icon
                className={`h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-110 ${
                  isActive ? "text-white" : "text-slate-400 group-hover:text-white"
                }`}
              />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Session Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40">
        {isPlaceholder && (
          <div className="mb-3 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-center">
            <span className="text-[10px] font-semibold text-yellow-500 tracking-wide uppercase">
              Auth: Placeholder Mode
            </span>
          </div>
        )}
        
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-3 px-2">
              <div className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center font-bold text-indigo-400 border border-slate-700">
                {user.email?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">
                  {user.email?.split("@")[0] || "User"}
                </p>
                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            
            <button
              onClick={logout}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-red-950/20 hover:text-red-400 hover:border-red-900/30 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        ) : (
          <div className="text-center py-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-md shadow-blue-600/15 transition-colors"
            >
              Log In to Protect
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
};
