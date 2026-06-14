# AI Usage Log

This document details the AI tools utilized, key prompts given to the AI, and three specific instances where the AI generated incorrect code, how it was detected, and how it was resolved.

## AI Tools Utilized
*   **Gemini 3.1 Pro / Claude 4.6 Sonnet (Agentic Coding AI):** Used for full-stack Next.js generation, Prisma schema design, and algorithmic problem solving (CSV import matching).
*   **V0 by Vercel (Conceptual):** Used to draw inspiration for the dark-mode aesthetic and glassmorphism UI components.

## Key Prompts Used
1.  *"Initialize a Next.js 16 app with Prisma and Tailwind. The app must have a premium dark-mode aesthetic with glassmorphism."*
2.  *"Build a CSV parsing engine that reads 'expenses export.csv'. If split_type is 'settlement', do not create an expense; create a Settlement record instead."*
3.  *"Write a balance calculation algorithm that fetches all Expenses and Settlements, converts USD to INR using historical rates from the date of the expense, and outputs who owes whom."*

---

## Where the AI Failed & How It Was Fixed

### Case 1: Dark Mode Text Invisibility
*   **What the AI did wrong:** When generating the UI components (Dashboard, Import page), the AI successfully applied dark backgrounds (`bg-slate-900`) but hardcoded the text colors to `text-slate-800`.
*   **How it was caught:** Upon running `npm run dev` and viewing the app in the browser, the text was completely invisible against the dark background.
*   **How it was fixed:** I instructed the AI: *"Fix ALL dark-on-dark text in the Dashboard. Map text-slate-800 to text-slate-200 and fix any bg-white cards to glass-card."* The AI then spawned specialized `text_fixer` subagents to sweep the codebase and apply proper `dark:` tailwind variants.

### Case 2: Vercel Deployment Prisma Crash
*   **What the AI did wrong:** The AI set up the standard `package.json` build scripts (`"build": "next build"`). However, on Vercel, `node_modules` is cached, which means Prisma's auto-generated client was stale, causing the entire app to crash in production.
*   **How it was caught:** After deploying to Vercel, visiting any page returned a 500 Server Error. The Vercel logs showed: `PrismaClientInitializationError: Prisma has detected that this project was built on Vercel, which caches dependencies.`
*   **How it was fixed:** I prompted the AI with the exact Vercel error log. The AI correctly diagnosed the caching issue and modified the `package.json` build script to `"build": "prisma generate && next build"`, ensuring the Prisma client was fresh on every deploy.

### Case 3: TiDB Cloud Transaction Timeout
*   **What the AI did wrong:** The AI wrote the CSV Import engine cleanly, but wrapped the *entire* 100+ row import loop inside a single `prisma.$transaction(async tx => { ... })` to ensure atomic rollbacks. It did not account for TiDB Serverless having a strict 5-second transaction timeout limit.
*   **How it was caught:** When uploading the actual CSV file and clicking "Commit", the API threw a 500 error. The server logs read: `invalid prisma.user.create() invocation and transaction api error : transaction not found`.
*   **How it was fixed:** I informed the AI about the transaction error. The AI realized the batch was taking longer than 5 seconds. I instructed it to remove the global `$transaction` wrapper and process the rows sequentially. We shifted to using the `ImportIssue` table to handle partial errors instead of a hard database-level rollback.
