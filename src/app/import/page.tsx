"use client";

import React, { useState, useEffect } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Edit2,
  Trash2,
  Play,
  RotateCcw,
  Sparkles,
  UserPlus,
  ArrowRight,
  Download,
  Calendar,
  Check,
  X,
  Plus,
  Loader2
} from "lucide-react";
import { RawRow, ImportIssueDetail } from "@/services/importEngine";

interface DecisionDetail {
  decision: "APPLY_FIX" | "IMPORT_AS_IS" | "SKIP_ROW" | "MANUAL_EDIT";
  issueType: string;
  confidence: number;
  description: string;
  recommendedAction: string;
  resolvedValue: RawRow;
}

export default function ImportWizard() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  
  // Data parsed from CSV
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [issues, setIssues] = useState<ImportIssueDetail[]>([]);
  
  // User decisions
  const [decisions, setDecisions] = useState<Record<string, DecisionDetail>>({});
  const [nameMappings, setNameMappings] = useState<Record<string, string>>({});
  const [memberPeriods, setMemberPeriods] = useState<Record<string, { joinedAt: string; leftAt: string | null }>>({
    Aisha: { joinedAt: "2026-02-01", leftAt: null },
    Rohan: { joinedAt: "2026-02-01", leftAt: null },
    Priya: { joinedAt: "2026-02-01", leftAt: null },
    Meera: { joinedAt: "2026-02-01", leftAt: "2026-03-31" },
    Sam: { joinedAt: "2026-04-15", leftAt: null },
    Dev: { joinedAt: "2026-02-08", leftAt: "2026-03-15" } // Editable!
  });

  // UI helpers
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [editingRowValue, setEditingRowValue] = useState<RawRow | null>(null);
  const [importReport, setImportReport] = useState<any>(null);

  // Auto-detect names in CSV that are not in default lists and prompt active periods
  useEffect(() => {
    if (rawRows.length > 0) {
      const allNamesInCsv = new Set<string>();
      rawRows.forEach(r => {
        if (r.paid_by) allNamesInCsv.add(r.paid_by.trim());
        if (r.split_with) {
          r.split_with.split(";").forEach(name => {
            if (name.trim()) allNamesInCsv.add(name.trim());
          });
        }
      });

      // Normalize names
      const normalizedNames = Array.from(allNamesInCsv).map(name => {
        // Clean name
        const clean = name.replace(/"/g, "").trim();
        // Capitalize
        return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
      }).filter(name => name !== "");

      // For any name not currently in memberPeriods, add a default entry
      setMemberPeriods(prev => {
        const next = { ...prev };
        let updated = false;
        
        normalizedNames.forEach(name => {
          // Exclude known weird names or aliases that will be mapped (like Priya S, priya, rohan )
          if (name === "Priya s" || name === "Priya S" || name === "Rohan " || name === "Priya" || name === "Rohan" || name === "Aisha" || name === "Meera" || name === "Sam" || name === "Dev") {
            return;
          }
          
          if (!next[name]) {
            // Check if name contains other words, e.g. "Dev's friend Kabir" -> Kabir
            let keyName = name;
            if (name.includes("Kabir")) {
              keyName = "Kabir";
            }
            
            if (!next[keyName]) {
              next[keyName] = { joinedAt: "2026-03-11", leftAt: "2026-03-11" }; // Dev's friend Kabir joined just for March 11
              updated = true;
            }
          }
        });

        return updated ? next : prev;
      });
    }
  }, [rawRows]);

  // Parse CSV file (uploaded or local disk)
  const parseCSV = async (fileToParse?: File) => {
    setLoading(true);
    try {
      let reqBody = {};
      if (fileToParse) {
        const text = await fileToParse.text();
        reqBody = { csvContent: text };
      }

      const res = await fetch("/api/import/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse CSV");

      setRawRows(data.rawRows || []);
      setIssues(data.issues || []);

      // Initialize decisions and mappings
      const initialDecisions: Record<string, DecisionDetail> = {};
      const initialNameMappings: Record<string, string> = {};

      // Auto-populate name mappings for obvious ones
      rawRows.forEach((r, idx) => {
        const payer = r.paid_by?.trim();
        if (payer) {
          if (payer.toLowerCase() === "priya s" || payer.toLowerCase() === "priya s.") {
            initialNameMappings[payer] = "Priya";
          } else if (payer.toLowerCase() === "priya") {
            initialNameMappings[payer] = "Priya";
          } else if (payer.toLowerCase() === "rohan ") {
            initialNameMappings[payer] = "Rohan";
          }
        }
      });

      // Map issue recommendations into initial decisions
      data.issues.forEach((issue: ImportIssueDetail) => {
        initialDecisions[issue.rowIndex.toString()] = {
          decision: "APPLY_FIX", // Default to apply fix
          issueType: issue.issueType,
          confidence: issue.confidence,
          description: issue.description,
          recommendedAction: issue.recommendedAction,
          resolvedValue: issue.recommendedFix
        };
      });

      setDecisions(initialDecisions);
      setNameMappings(prev => ({ ...prev, ...initialNameMappings }));
      setStep(2);
    } catch (e: any) {
      alert(e.message || "Failed to parse CSV file");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setCsvFile(file);
      parseCSV(file);
    }
  };

  const handleLoadDefault = () => {
    parseCSV(); // No file passed triggers local expenses export.csv read
  };

  // Toggle details row
  const toggleRow = (index: number) => {
    setExpandedRows(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // Decision selector
  const handleDecisionChange = (rowIndex: number, decision: DecisionDetail["decision"], issue: ImportIssueDetail) => {
    setDecisions(prev => {
      const current = prev[rowIndex.toString()];
      let resolvedValue = { ...issue.affectedRowData };

      if (decision === "APPLY_FIX") {
        resolvedValue = issue.recommendedFix;
      } else if (decision === "SKIP_ROW") {
        // Handled in backend
      }

      return {
        ...prev,
        [rowIndex.toString()]: {
          decision,
          issueType: issue.issueType,
          confidence: issue.confidence,
          description: issue.description,
          recommendedAction: issue.recommendedAction,
          resolvedValue
        }
      };
    });
  };

  // Name mapping adjustments
  const handleNameMapChange = (csvName: string, dbName: string) => {
    setNameMappings(prev => ({ ...prev, [csvName]: dbName }));
  };

  // Member Period adjustments
  const handlePeriodChange = (member: string, field: "joinedAt" | "leftAt", value: string) => {
    setMemberPeriods(prev => ({
      ...prev,
      [member]: {
        ...prev[member],
        [field]: value === "" ? null : value
      }
    }));
  };

  // Manual Row Editor open
  const openEditor = (rowIndex: number, rowData: RawRow) => {
    setEditingRowIndex(rowIndex);
    setEditingRowValue({ ...rowData });
  };

  // Manual Row Editor save
  const saveEditedRow = () => {
    if (editingRowIndex !== null && editingRowValue) {
      // Find the issue related to this row, if any
      const relatedIssue = issues.find(i => i.rowIndex === editingRowIndex);
      
      setDecisions(prev => ({
        ...prev,
        [editingRowIndex.toString()]: {
          decision: "MANUAL_EDIT",
          issueType: relatedIssue?.issueType || "Manual correction",
          confidence: 1.0,
          description: "Manually corrected fields.",
          recommendedAction: "None",
          resolvedValue: editingRowValue
        }
      }));

      // Update the rawRows representation
      setRawRows(prev => {
        const next = [...prev];
        next[editingRowIndex - 1] = editingRowValue;
        return next;
      });

      setEditingRowIndex(null);
      setEditingRowValue(null);
    }
  };

  // Trigger final import submission
  const executeImport = async () => {
    setStep(3);
    setLoading(true);
    try {
      // Map member periods into ISO string formats
      const formattedMemberPeriods: Record<string, { joinedAt: string; leftAt: string | null }> = {};
      Object.entries(memberPeriods).forEach(([name, val]) => {
        formattedMemberPeriods[name] = {
          joinedAt: new Date(val.joinedAt + "T00:00:00.000Z").toISOString(),
          leftAt: val.leftAt ? new Date(val.leftAt + "T23:59:59.999Z").toISOString() : null
        };
      });

      const payload = {
        groupId: "default-group-id",
        fileName: csvFile?.name || "expenses export.csv",
        rows: rawRows,
        decisions,
        nameMappings,
        memberPeriods: formattedMemberPeriods
      };

      const res = await fetch("/api/import/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to finalize import");

      setImportReport(data.report);
      setStep(4);
    } catch (e: any) {
      alert(e.message || "Import execution failed");
      setStep(2); // Rollback to review
    } finally {
      setLoading(false);
    }
  };

  const resetImport = () => {
    setCsvFile(null);
    setRawRows([]);
    setIssues([]);
    setDecisions({});
    setImportReport(null);
    setStep(1);
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Wizard Step Progress */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-500/10 p-2.5 rounded-xl text-blue-600">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">CSV Import System</h1>
              <p className="text-slate-500 text-xs">Upload, audit anomalies, and import expense logs.</p>
            </div>
          </div>

          {/* Stepper indicator */}
          <div className="flex items-center space-x-2">
            {[1, 2, 3, 4].map((num) => (
              <div key={num} className="flex items-center">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    step === num
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 scale-105"
                      : step > num
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {step > num ? <Check className="h-3.5 w-3.5" /> : num}
                </div>
                {num < 4 && (
                  <div
                    className={`w-8 h-[2px] mx-1 transition-all duration-300 ${
                      step > num ? "bg-emerald-300" : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* STEP 1: Upload / Load Default */}
      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Main Upload Box */}
          <div className="glass-card dashed border-2 hover:border-blue-400 rounded-3xl p-12 text-center transition-all flex flex-col items-center justify-center space-y-5 bg-slate-50/20 group">
            <div className="p-5 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-105 transition-transform duration-200">
              <UploadCloud className="h-8 w-8" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Upload Expenses CSV</h3>
              <p className="text-slate-400 text-xs mt-1">Accepts tabular columns: date, amount, payer, split_type...</p>
            </div>
            <label className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/15 cursor-pointer active:scale-95 transition-all">
              <span>Choose CSV File</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {/* Seed Pre-loaded CSV Box */}
          <div className="glass-card p-8 rounded-3xl flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-xl inline-block">
                <Sparkles className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Pre-load Local CSV</h3>
                <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                  The project folder contains the default <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-[10px]">Data/expenses export.csv</code>. Click below to load, analyze all anomalies instantly, and proceed with review.
                </p>
              </div>
            </div>
            <button
              onClick={handleLoadDefault}
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 py-3 border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30 hover:bg-indigo-50 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold transition-all active:scale-[0.98] cursor-pointer"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Analyze pre-loaded 'expenses export.csv'</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Interactive Review */}
      {step === 2 && (
        <div className="space-y-8">
          {/* Member Configuration Timelines Card */}
          <div className="glass-card p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <Calendar className="h-4.5 w-4.5 text-blue-600" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Configure Membership Timelines</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Verify the active dates for group members. Expenses only split among members active on the expense date.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
              {Object.keys(memberPeriods).map((member) => (
                <div key={member} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3.5 rounded-xl space-y-2">
                  <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">{member}</span>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <label className="text-slate-400 block font-semibold mb-1">Joined Date</label>
                      <input
                        type="date"
                        value={memberPeriods[member].joinedAt}
                        onChange={(e) => handlePeriodChange(member, "joinedAt", e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1 rounded font-medium text-slate-700 dark:text-slate-300"
                      />
                    </div>
                    <div>
                      <label className="text-slate-400 block font-semibold mb-1">Left Date</label>
                      <input
                        type="date"
                        value={memberPeriods[member].leftAt || ""}
                        onChange={(e) => handlePeriodChange(member, "leftAt", e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-1 rounded font-medium text-slate-700 dark:text-slate-300"
                        placeholder="Active"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Anomaly list */}
          <div className="glass-card rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                Anomaly Audit Table ({issues.length} Issues Found)
              </h3>
              <span className="text-xs text-slate-500">{rawRows.length} Total CSV Rows Analyzed</span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-6 w-16 text-center">Row</th>
                    <th className="py-3 px-6 w-44">Issue Type</th>
                    <th className="py-3 px-6 w-20 text-center">Confidence</th>
                    <th className="py-3 px-6">Description & Action</th>
                    <th className="py-3 px-6 w-48">Decision</th>
                    <th className="py-3 px-6 w-24 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {issues.map((issue) => {
                    const idx = issue.rowIndex;
                    const isExpanded = !!expandedRows[idx];
                    const decision = decisions[idx.toString()]?.decision || "APPLY_FIX";

                    // Determine confidence color
                    const confPct = Math.round(issue.confidence * 100);
                    const confColor =
                      confPct >= 95
                        ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-600 border border-emerald-200/50"
                        : confPct >= 85
                        ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-600 border border-indigo-200/50"
                        : "bg-amber-50 dark:bg-amber-950 text-amber-600 border border-amber-200/50";

                    return (
                      <React.Fragment key={idx + "-" + issue.issueType}>
                        <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors text-xs align-top">
                          <td className="py-4 px-6 text-center font-bold text-slate-400">{idx}</td>
                          <td className="py-4 px-6 font-bold text-slate-800 dark:text-slate-200">
                            <span className="flex items-center space-x-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                              <span>{issue.issueType}</span>
                            </span>
                          </td>
                          <td className="py-4 px-6 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${confColor}`}>
                              {confPct}%
                            </span>
                          </td>
                          <td className="py-4 px-6 space-y-2">
                            <p className="text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                              {issue.description}
                            </p>
                            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 p-2.5 rounded-lg space-y-1">
                              <span className="text-[10px] font-bold text-slate-400 uppercase block tracking-wider">
                                Recommended Fix
                              </span>
                              <p className="text-slate-500 dark:text-slate-400 leading-normal text-[11px]">
                                {issue.recommendedAction}
                              </p>
                            </div>
                          </td>
                          <td className="py-4 px-6">
                            <select
                              value={decision}
                              onChange={(e) => handleDecisionChange(idx, e.target.value as any, issue)}
                              className="w-full text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-xl text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 font-semibold"
                            >
                              <option value="APPLY_FIX">Apply Recommended Fix</option>
                              <option value="IMPORT_AS_IS">Import As Is</option>
                              <option value="SKIP_ROW">Skip Row</option>
                              <option value="MANUAL_EDIT">Manual Edit</option>
                            </select>
                          </td>
                          <td className="py-4 px-6 text-center space-x-1">
                            <button
                              onClick={() => toggleRow(idx)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                              title="Toggle Original CSV Data"
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            <button
                              onClick={() => openEditor(idx, decisions[idx.toString()]?.resolvedValue || issue.affectedRowData)}
                              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-blue-500 hover:text-blue-600 transition-colors"
                              title="Edit Row Details"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>

                        {/* Expanded details containing original CSV and resolved details */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} className="bg-slate-50 dark:bg-slate-900/50 p-6 border-t border-b border-slate-200 dark:border-slate-800/60 text-xs">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2.5">
                                  <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                                    Original CSV Row Data
                                  </h4>
                                  <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-xl space-y-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                                    <div><strong className="text-slate-400">Date:</strong> {issue.affectedRowData.date}</div>
                                    <div><strong className="text-slate-400">Description:</strong> {issue.affectedRowData.description}</div>
                                    <div><strong className="text-slate-400">Payer:</strong> {issue.affectedRowData.paid_by || "(empty)"}</div>
                                    <div><strong className="text-slate-400">Amount:</strong> {issue.affectedRowData.amount}</div>
                                    <div><strong className="text-slate-400">Currency:</strong> {issue.affectedRowData.currency || "(empty)"}</div>
                                    <div><strong className="text-slate-400">Split Type:</strong> {issue.affectedRowData.split_type || "(empty)"}</div>
                                    <div><strong className="text-slate-400">Split With:</strong> {issue.affectedRowData.split_with || "(empty)"}</div>
                                    <div><strong className="text-slate-400">Split Details:</strong> {issue.affectedRowData.split_details || "(empty)"}</div>
                                    <div><strong className="text-slate-400">Notes:</strong> {issue.affectedRowData.notes || "(empty)"}</div>
                                  </div>
                                </div>
                                <div className="space-y-2.5">
                                  <h4 className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                                    Resolved Import Values (Based on Decision)
                                  </h4>
                                  <div className="bg-white dark:bg-slate-950 border border-indigo-100 dark:border-indigo-900 p-4 rounded-xl space-y-1.5 font-mono text-[11px] text-indigo-900 dark:text-indigo-300">
                                    <div><strong className="text-indigo-300">Date:</strong> {decisions[idx.toString()]?.resolvedValue.date}</div>
                                    <div><strong className="text-indigo-300">Description:</strong> {decisions[idx.toString()]?.resolvedValue.description}</div>
                                    <div><strong className="text-indigo-300">Payer:</strong> {decisions[idx.toString()]?.resolvedValue.paid_by || "(empty)"}</div>
                                    <div><strong className="text-indigo-300">Amount:</strong> {decisions[idx.toString()]?.resolvedValue.amount}</div>
                                    <div><strong className="text-indigo-300">Currency:</strong> {decisions[idx.toString()]?.resolvedValue.currency || "(empty)"}</div>
                                    <div><strong className="text-indigo-300">Split Type:</strong> {decisions[idx.toString()]?.resolvedValue.split_type || "(empty)"}</div>
                                    <div><strong className="text-indigo-300">Split With:</strong> {decisions[idx.toString()]?.resolvedValue.split_with || "(empty)"}</div>
                                    <div><strong className="text-indigo-300">Split Details:</strong> {decisions[idx.toString()]?.resolvedValue.split_details || "(empty)"}</div>
                                    <div><strong className="text-indigo-300">Notes:</strong> {decisions[idx.toString()]?.resolvedValue.notes || "(empty)"}</div>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* User Name mapping helper box */}
          <div className="glass-card p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <UserPlus className="h-4.5 w-4.5 text-blue-600" />
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Payer & Member Name Mapping Rules</h3>
            </div>
            <p className="text-xs text-slate-400">
              Align names discovered in the CSV with actual group database members.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Csv Name: 'Priya S'</label>
                <select
                  value={nameMappings["Priya S"] || "Priya"}
                  onChange={(e) => handleNameMapChange("Priya S", e.target.value)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-xl text-slate-700 dark:text-slate-200 outline-none"
                >
                  <option value="Priya">Map to Priya</option>
                  <option value="Aisha">Map to Aisha</option>
                  <option value="Rohan">Map to Rohan</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Csv Name: 'priya'</label>
                <select
                  value={nameMappings["priya"] || "Priya"}
                  onChange={(e) => handleNameMapChange("priya", e.target.value)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-xl text-slate-700 dark:text-slate-200 outline-none"
                >
                  <option value="Priya">Map to Priya</option>
                  <option value="Aisha">Map to Aisha</option>
                  <option value="Rohan">Map to Rohan</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 block mb-1">Csv Name: 'rohan '</label>
                <select
                  value={nameMappings["rohan "] || "Rohan"}
                  onChange={(e) => handleNameMapChange("rohan ", e.target.value)}
                  className="w-full text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-xl text-slate-700 dark:text-slate-200 outline-none"
                >
                  <option value="Rohan">Map to Rohan</option>
                  <option value="Aisha">Map to Aisha</option>
                  <option value="Priya">Map to Priya</option>
                </select>
              </div>
            </div>
          </div>

          {/* Control Footer */}
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-6">
            <button
              onClick={resetImport}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Reset Wizard</span>
            </button>
            <button
              onClick={executeImport}
              className="flex items-center space-x-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/15 active:scale-95 transition-all cursor-pointer"
            >
              <span>Commit Audited Import</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Progress Indicator */}
      {step === 3 && (
        <div className="glass-card p-12 rounded-3xl text-center space-y-6 max-w-md mx-auto shadow-sm">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base">Processing Import Transactions</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Applying resolving decisions, running currency exchange, calculating user splits, enforcing membership timelines, and saving to database...
            </p>
          </div>
        </div>
      )}

      {/* STEP 4: Import Report */}
      {step === 4 && importReport && (
        <div className="space-y-8">
          {/* Main Stats Card */}
          <div className="glass-card p-8 rounded-3xl shadow-sm space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex bg-emerald-50 dark:bg-emerald-950 text-emerald-600 p-3 rounded-2xl border border-emerald-200 dark:border-emerald-800 mb-2">
                <CheckCircle className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">CSV Import Completed!</h2>
              <p className="text-slate-400 text-xs">A comprehensive report has been created and logged in the database.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-b border-slate-100 dark:border-slate-800 py-6">
              <div className="text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Processed</span>
                <span className="text-2xl font-black text-slate-800 mt-1">{importReport.rowsProcessed}</span>
              </div>
              <div className="text-center border-l border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-emerald-600">Imported</span>
                <span className="text-2xl font-black text-emerald-600 mt-1">{importReport.imported}</span>
              </div>
              <div className="text-center border-l border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-amber-500">Warnings</span>
                <span className="text-2xl font-black text-amber-500 mt-1">{importReport.warnings}</span>
              </div>
              <div className="text-center border-l border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block text-rose-500">Errors</span>
                <span className="text-2xl font-black text-rose-500 mt-1">{importReport.errors}</span>
              </div>
            </div>

            {/* Decisions applied */}
            {importReport.appliedDecisions?.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">Applied Fixes</h4>
                <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-2xl max-h-48 overflow-y-auto space-y-2 text-[11px] font-mono text-slate-600">
                  {importReport.appliedDecisions.map((dec: string, dIdx: number) => (
                    <div key={dIdx} className="flex items-start space-x-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>{dec}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Export buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4">
              <button
                onClick={resetImport}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all text-center"
              >
                Start Another Import
              </button>
              <div className="flex space-x-2.5">
                <a
                  href={`/api/import/report/${importReport.importId}`}
                  target="_blank"
                  className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
                >
                  <Download className="h-4 w-4" />
                  <span>Download JSON Report</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Row Editor Dialog */}
      {editingRowIndex !== null && editingRowValue && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Edit2 className="h-4 text-blue-600" />
                <h3 className="font-bold text-slate-800 text-sm">Manual Row Editor (Row {editingRowIndex})</h3>
              </div>
              <button
                onClick={() => {
                  setEditingRowIndex(null);
                  setEditingRowValue(null);
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Editor fields */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Date</label>
                <input
                  type="text"
                  value={editingRowValue.date}
                  onChange={(e) => setEditingRowValue(prev => prev ? { ...prev, date: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Payer (paid_by)</label>
                <input
                  type="text"
                  value={editingRowValue.paid_by}
                  onChange={(e) => setEditingRowValue(prev => prev ? { ...prev, paid_by: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-medium"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-400 font-semibold mb-1">Description</label>
                <input
                  type="text"
                  value={editingRowValue.description}
                  onChange={(e) => setEditingRowValue(prev => prev ? { ...prev, description: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Amount</label>
                <input
                  type="text"
                  value={editingRowValue.amount}
                  onChange={(e) => setEditingRowValue(prev => prev ? { ...prev, amount: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Currency</label>
                <input
                  type="text"
                  value={editingRowValue.currency}
                  onChange={(e) => setEditingRowValue(prev => prev ? { ...prev, currency: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Split Type</label>
                <input
                  type="text"
                  value={editingRowValue.split_type}
                  onChange={(e) => setEditingRowValue(prev => prev ? { ...prev, split_type: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-medium"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">Split With</label>
                <input
                  type="text"
                  value={editingRowValue.split_with}
                  onChange={(e) => setEditingRowValue(prev => prev ? { ...prev, split_with: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-medium"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-400 font-semibold mb-1">Split Details</label>
                <input
                  type="text"
                  value={editingRowValue.split_details}
                  onChange={(e) => setEditingRowValue(prev => prev ? { ...prev, split_details: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-medium"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-400 font-semibold mb-1">Notes</label>
                <input
                  type="text"
                  value={editingRowValue.notes}
                  onChange={(e) => setEditingRowValue(prev => prev ? { ...prev, notes: e.target.value } : null)}
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-medium"
                />
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="flex items-center justify-end space-x-2 border-t border-slate-100 pt-4">
              <button
                onClick={() => {
                  setEditingRowIndex(null);
                  setEditingRowValue(null);
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={saveEditedRow}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/15 transition-all"
              >
                Apply Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
