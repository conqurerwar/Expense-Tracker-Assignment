# DECISIONS - Architecture & Engineering Log

This document records the major technical and architectural decisions made during the development of the Expense Tracker, outlining the options considered and the rationale behind the final choices.

---

## 1. Framework Architecture: Next.js App Router

*   **Context:** The application required both a robust frontend for data visualization and a backend to handle complex CSV parsing, fuzzy-matching, and financial calculations.
*   **Options Considered:**
    1.  *MERN Stack (React + Express + MongoDB):* Traditional approach. Separates concerns but requires managing two separate codebases and deployments.
    2.  *Next.js Pages Router:* Mature, but lacks the latest streaming and server component features.
    3.  *Next.js App Router:* Unified full-stack framework with React Server Components (RSC) and built-in serverless API routes.
*   **Decision:** **Next.js App Router**.
*   **Why:** It allowed us to build a seamless, type-safe full-stack application in a single repository. API routes handled the heavy lifting of CSV parsing, while RSCs provided fast, SEO-friendly page loads for the dashboard. It also deployed flawlessly to Vercel.

## 2. Database Paradigm: Relational (TiDB MySQL) vs. NoSQL

*   **Context:** Financial data is inherently relational. Users belong to Groups, Users pay for Expenses, Expenses are split among Participants, and Settlements resolve Debts.
*   **Options Considered:**
    1.  *MongoDB:* Great for fast iteration, but joining (aggregating) across Users, Groups, Expenses, and Settlements to calculate exact balances would be a nightmare and prone to errors.
    2.  *PostgreSQL (Supabase/Neon):* Excellent relational choice, but we wanted a highly scalable serverless option.
    3.  *TiDB Serverless (MySQL):* Distributed SQL database built for the cloud, offering MySQL compatibility with infinite scalability.
*   **Decision:** **TiDB Serverless with Prisma ORM**.
*   **Why:** TiDB provided a robust, highly available relational backbone. Prisma ORM ensured absolute type safety from the database schema all the way to the frontend React components, preventing runtime errors when dealing with critical financial floats.

## 3. Handling the "Timeline Paradox" (Sam's Move-in)

*   **Context:** Flatmates join and leave at different times. If an expense occurred in March, a user who moved in during April should not be charged, even if the CSV says "split equally".
*   **Options Considered:**
    1.  *Boolean Flag:* An `isActive` boolean on the User table. (Rejected: Doesn't handle historical accuracy—what if you need to recalculate a past month?)
    2.  *Temporal Membership Table:* A `GroupMember` join table that records the exact `joinedAt` and `leftAt` timestamps for every user in the flat.
*   **Decision:** **Temporal Membership Table (`GroupMember`)**.
*   **Why:** When the `ImportEngine` processes a row, it checks the expense `date`. It then queries the `GroupMember` table to find exactly who was living in the flat *on that specific day*. If the CSV requests an "equal" split, the engine automatically excludes inactive members, perfectly solving Sam's timeline requirement.

## 4. Solving "No Magic Numbers" (Rohan's Request)

*   **Context:** Rohan requested that balances show exactly *why* a debt exists, rather than just a final summarized number.
*   **Options Considered:**
    1.  *Store a running balance:* Just keep an `amountOwed` integer on the User model and update it when expenses happen. (Rejected: A black box; impossible to audit).
    2.  *On-the-fly Calculation with Explanation Engine:* Do not store running balances. Instead, calculate them dynamically by summing the raw `ExpenseSplit` and `Settlement` tables, and provide an endpoint that returns the exact rows making up the math.
*   **Decision:** **On-the-fly Calculation with an Explanation Engine (`/api/balances/explain`)**.
*   **Why:** Financial applications must be auditable. By deriving the balance dynamically from the immutable `ExpenseSplit` rows, we guarantee accuracy. When Rohan clicks a balance, the API returns the exact array of expenses and settlements that prove the math, satisfying the "no magic numbers" requirement.

## 5. CSV Import Transaction Handling (The Vercel/TiDB Timeout)

*   **Context:** Importing a 100+ row CSV involves hundreds of database inserts. Initially, the entire import was wrapped in a single Prisma `$transaction` so that if one row failed, the whole import would roll back.
*   **Options Considered:**
    1.  *Keep Single Transaction:* Safer for data integrity, but TiDB Cloud enforces a strict 5-second limit on transactions in serverless tiers. The CSV import was hitting this timeout and crashing ("transaction not found").
    2.  *Sequential Processing without Global Transaction:* Process each row individually. If a row fails or has an anomaly, log it to an `ImportIssue` table but continue processing the rest of the CSV.
*   **Decision:** **Sequential Processing with `ImportIssue` Tracking**.
*   **Why:** Cloud architectures require resilience. Removing the massive database-level transaction prevented the 5-second timeout crashes. To maintain data integrity, we built an application-level state machine: the `Import` and `ImportIssue` tables. If a row is malformed, the engine logs an issue and skips the row, allowing the user to review and fix it later without destroying the entire import process.
