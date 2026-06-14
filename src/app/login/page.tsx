"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Lock, Mail, Loader2, Sparkles, ArrowRight } from "lucide-react";

export default function Login() {
  const { user, login, signup, loading } = useAuth();
  const router = useRouter();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // If user is already logged in, redirect to dashboard
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setSubmitting(true);

    try {
      if (isSignUp) {
        await signup(email, password);
      } else {
        await login(email, password);
      }
      router.push("/dashboard");
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || "Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center space-y-3">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500 mx-auto" />
        <p className="text-sm font-medium text-slate-400">Loading session...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Brand Header */}
      <div className="text-center mb-8 relative">
        <div className="inline-flex bg-gradient-to-tr from-blue-500 to-indigo-600 p-3 rounded-2xl text-white shadow-xl shadow-indigo-500/20 mb-4">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">{isSignUp ? "Create an account" : "Welcome back"}</h2>
        <p className="text-sm text-slate-400 mt-1.5">Manage and audit your group expenses</p>
      </div>

      {/* Error Alert */}
      {authError && (
        <div className="mb-6 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl text-xs font-medium text-red-400">
          {authError}
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-4 relative">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Email Address
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="e.g. name@example.com"
              className="w-full pl-11 pr-4 py-3 bg-slate-950/50 hover:bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-xl text-sm text-slate-100 placeholder-slate-600 outline-none transition-all"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full pl-11 pr-4 py-3 bg-slate-950/50 hover:bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 rounded-xl text-sm text-slate-100 placeholder-slate-600 outline-none transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/15 disabled:shadow-none hover:shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center space-x-2 mt-6 cursor-pointer"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : (
            <>
              <span>{isSignUp ? "Sign Up" : "Sign In"}</span>
              <ArrowRight className="h-4 w-4 text-white" />
            </>
          )}
        </button>

        <p className="text-center text-sm text-slate-400 mt-6">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-blue-400 hover:text-blue-300 font-semibold transition-colors"
          >
            {isSignUp ? "Sign In" : "Create one"}
          </button>
        </p>
      </form>
    </div>
  );
}
