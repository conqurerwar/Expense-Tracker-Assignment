# Expense Tracker 💸

A full-stack, production-ready application designed to seamlessly manage group expenses, handle complex currency conversions, and calculate exact per-person debts. Built for the Flatmates Expense Tracker Assignment.

## 🌟 Key Features
This app was built to fulfill all the specific requests of the flatmates:
* **Aisha's Request (Simple Balances):** A dedicated Balances page showing exactly who owes whom in a single number.
* **Rohan's Request (No Magic Numbers):** Clickable explanations on the Balances page detailing the exact expenses that make up a debt.
* **Priya's Request (Accurate Currency):** Full support for multi-currency imports (USD to INR) using historical exchange rates based on the exact date of the expense.
* **Sam's Request (Timeline Awareness):** Group Membership timelines. Expenses are only split among flatmates who were actively living in the flat on the date the expense occurred.
* **Meera's Request (Data Cleanup & Audit):** A robust CSV import engine that detects anomalies (duplicates, invalid dates, inactive members) and prompts for manual approval before applying changes to the database.

## 🛠️ Tech Stack
* **Frontend:** Next.js 16 (React), TailwindCSS, Recharts (for Dashboard data visualization)
* **Backend:** Next.js Serverless API Routes
* **Database:** TiDB Serverless Cloud (MySQL)
* **ORM:** Prisma
* **Authentication:** Custom JWT-based secure authentication

## 🚀 Local Setup Instructions

1. **Clone the repository**
   `ash
   git clone https://github.com/conqurerwar/Expense-Tracker-Assignment.git
   cd Expense-Tracker-Assignment
   `

2. **Install dependencies**
   `ash
   npm install
   `

3. **Environment Variables**
   Create a .env file in the root directory and add the following:
   `env
   # Your TiDB MySQL connection string
   DATABASE_URL="mysql://3VhtaXe2zGNC8k9.root:FQ60eNWHhXyLva7t@gateway01.ap-southeast-1.prod.alicloud.tidbcloud.com:4000/test?sslaccept=strict"
   
   # JWT Secret for Authentication
   JWT_SECRET="super_secret_assignment_token_2026"
   `

4. **Initialize the Database**
   Push the Prisma schema to the TiDB database and generate the client:
   `ash
   npx prisma db push
   npx prisma generate
   `

5. **Start the Development Server**
   `ash
   npm run dev
   `
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🤖 AI Assistance
This project was developed with the assistance of **Gemini 3.1 Pro / Claude 4.6 Sonnet (Agentic Coding AI)**. 

The AI was utilized for:
* Architecting the Next.js App Router structure and Serverless API routes.
* Designing the complex database schema in Prisma to handle membership timelines and multi-currency splits.
* Generating the UI components using TailwindCSS with a premium dark-mode aesthetic.
* Writing the CSV import engine and balance calculation algorithms.
* Debugging deployment errors and resolving strict TypeScript warnings on Vercel.
