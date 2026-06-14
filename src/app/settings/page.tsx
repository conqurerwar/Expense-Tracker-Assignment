"use client";

import React, { useEffect, useState } from "react";
import { Settings, Shield, Activity, Filter, Clock, User, Database } from "lucide-react";

export default function SettingsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterAction, setFilterAction] = useState("");

  useEffect(() => {
    fetchLogs();
  }, [filterAction]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const url = new URL("/api/audit-logs", window.location.origin);
      if (filterAction) url.searchParams.set("action", filterAction);

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      if (data.success) {
        setLogs(data.auditLogs);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Settings & Audit Logs</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">View system configuration and comprehensive audit trails.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Sidebar Settings Menu */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">System Preferences</h3>
            <nav className="space-y-2">
              <button className="flex w-full items-center gap-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400">
                <Shield className="h-4 w-4" />
                Audit Logs
              </button>
              <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50">
                <Settings className="h-4 w-4" />
                Import Policies
              </button>
              <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/50">
                <Database className="h-4 w-4" />
                Exchange Rates
              </button>
            </nav>
          </div>
        </div>

        {/* Main Content Area - Audit Logs */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex flex-col gap-4 border-b border-gray-200 p-6 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-indigo-500" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Audit Log</h3>
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800"
                >
                  <option value="">All Actions</option>
                  <option value="CREATE_EXPENSE">Create Expense</option>
                  <option value="UPDATE_EXPENSE">Update Expense</option>
                  <option value="DELETE_EXPENSE">Delete Expense</option>
                  <option value="CREATE_SETTLEMENT">Create Settlement</option>
                  <option value="UPDATE_MEMBERSHIP">Update Membership</option>
                  <option value="IMPORT_CSV">Import CSV</option>
                </select>
              </div>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Loading audit trail...</div>
              ) : error ? (
                <div className="p-8 text-center text-red-500">{error}</div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No logs found matching criteria.</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-6 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                          {log.action}
                        </span>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <span className="font-medium text-gray-900 dark:text-gray-200">
                            {log.entityType} ({log.entityId.slice(0, 8)}...)
                          </span>{" "}
                          was modified.
                        </p>
                        <div className="mt-3 overflow-x-auto rounded border border-gray-100 bg-gray-50 p-3 font-mono text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/50">
                          <pre className="max-w-[600px] overflow-hidden text-ellipsis">
                            {log.newValue}
                          </pre>
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {log.user?.name || "System"}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {new Date(log.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
