# SCOPE - Anomaly Log & Database Architecture

This document outlines the anomalies detected in the original CSV import and how the system's Import Engine automatically handles them to maintain data integrity. It also details the robust database schema designed to support these features.

---

## 🛑 Anomaly Log (Data Problems Found & Handled)

The flatmates' original spreadsheet (`expenses export.csv`) contained several inconsistencies, human errors, and edge cases. Our advanced Import Engine detects these anomalies and safely resolves them.

### 1. The Timeline Paradox (Sam's Move-In)
*   **The Problem:** The CSV blindly splits expenses equally across all members, even for dates when a member wasn't living in the flat (e.g., Sam moved in mid-April, but was being charged for March electricity).
*   **The Resolution:** 
    *   The `ImportEngine` introduced **Membership Timelines**. It checks the exact `date` of the expense against each flatmate's `joinedAt` and `leftAt` records.
    *   If the CSV requests an `equal` split that includes Sam in March, the system flags an **"Inactive Member Excluded"** anomaly. It automatically corrects the split by distributing the cost equally *only* among the members who were actively living in the flat on that specific date.

### 2. The Multi-Currency Mismatch (Priya's USD Expenses)
*   **The Problem:** Half of a trip's expenses were recorded in USD, but the spreadsheet calculated balances as if 1 USD = 1 INR (pretending dollars are rupees), throwing the entire debt calculation off by thousands.
*   **The Resolution:** 
    *   The system parses the `currency` column. If an expense is marked as `USD`, the system fetches historical exchange rates from the database matched precisely to the `date` of the expense.
    *   It preserves the `originalAmount` (e.g., $50) for exact record-keeping but converts the actual debt balances into the base currency (`INR`) using the real-world exchange rate.

### 3. Identity Crisis & Typos (Meera's Cleanup Request)
*   **The Problem:** The CSV is riddled with typos and capitalization errors in the `paid_by` and `split_with` columns (e.g., "Rohan", "rohan", "Rohin", "Priya K").
*   **The Resolution:** 
    *   The engine runs a `normalizeCapitalization` and Levenshtein-distance string matching algorithm (`matchMemberAlias`) to fuzzy-match typos to the actual user IDs. 
    *   It safely groups "rohan" and "Rohin" to the exact same User record, preventing duplicate accounts from being created.

### 4. Settlement Reclassifications
*   **The Problem:** Flatmates logged debt repayments (e.g., Aisha paying back Rohan) as standard "Expenses", inflating the total group spending charts.
*   **The Resolution:** 
    *   If `split_type` is identified as `settlement`, the engine skips creating an `Expense` entirely. Instead, it reclassifies the row and saves it to the dedicated `Settlement` table. This correctly reduces the debt balance between the two users without falsely inflating the "Total Group Expenses" metric.

### 5. Unequal Split Mathematical Mismatches
*   **The Problem:** Some rows claim an expense costs ₹500, but the custom split amounts (₹200 to Aisha, ₹250 to Rohan) only add up to ₹450.
*   **The Resolution:** 
    *   The engine calculates the sum of all parsed split allocations and compares it to the total row amount. If they do not match, it flags a **"Unequal Split Mismatch"** warning and prompts the user for manual review (via the Import Verification UI) before writing to the database.

---

## 🏛️ Database Schema Architecture

To support these advanced features and provide a production-ready application, the database was architected using **Prisma** on top of a **TiDB Serverless (MySQL)** cloud database.

### 1. Core User & Group Models
*   **`User`**: Represents a physical person. Stores their `email`, `name`, and authentication credentials.
*   **`Group`**: Represents the flat or trip (e.g., "Flatmates").
*   **`GroupMember`**: A join table that links a `User` to a `Group`. Crucially, it includes `joinedAt` and `leftAt` timestamps to support timeline-aware expense splitting (fixing Sam's issue).

### 2. Expense Core
*   **`Expense`**: The main record. Stores the `amount` (normalized to INR), `originalAmount` (e.g. 50 USD), `originalCurrency`, the exact `exchangeRate` used, and the `splitType` (equal, percentage, share, unequal).
*   **`ExpenseParticipant`**: The list of users involved in an expense.
*   **`ExpenseSplit`**: The exact calculated debt allocation. Stores both the computed `amount` (INR) and `originalAmount` (USD) for each specific user.

### 3. Settlement & Exchange Rates
*   **`Settlement`**: Records a direct repayment from one user to another (`payerId` to `payeeId`). Kept entirely separate from the `Expense` table to avoid inflating spending charts.
*   **`ExchangeRate`**: A historical ledger of daily currency exchange rates (USD to INR) ensuring that an expense from three months ago uses that day's exchange rate, not today's.

### 4. Audit & Import Tracking (Meera's Approval Request)
*   **`Import`**: Tracks the status of a CSV file upload.
*   **`ImportIssue`**: When the `ImportEngine` detects an anomaly (like a duplicate or a missing user), it creates an `ImportIssue`. These issues are presented in a UI where the user can choose to `APPLY_FIX`, `SKIP_ROW`, or `MANUAL_EDIT`.
*   **`AuditLog`**: A strict ledger that records every action (`UPDATE_EXPENSE`, `DELETE_EXPENSE`, `UPDATE_MEMBERSHIP_TIMELINE`). Stores `oldValue` and `newValue` JSON strings. This fulfills the requirement that everything the app deletes or changes is fully auditable.
