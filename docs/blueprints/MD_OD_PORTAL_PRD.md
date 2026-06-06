🚀 PEARZEN ERP: MASTER PRODUCT REQUIREMENTS DOCUMENT
MODULE: THE MD/OD EXECUTIVE VAULT & SHARED DASHBOARDS (FINALIZED V6.0)
🛡️ 1. CORE ARCHITECTURAL SECURITY & AESTHETICS
Absolute Route Isolation: Next.js middleware enforces a strict boundary at apps/back-office/app/executive. Non-executive tokens are instantly dropped.
Strict Financial Separation: While the MD sees the Master Site Directory here, the OM Portal uses a restricted, financially blind clone. Ops never sees billing or profit margins.
Executive UI/UX Design Language: The MD Vault utilizes a highly premium, modern aesthetic:
Background: A light-colored canvas featuring a subtle grey dotted matrix (tech-grid).
Accents: Ambient, soft green beaming lights (glowing gradients) emanating from the background.
Components: Beautiful frosted glassmorphism cards with crisp, dark typography to make the financial data pop against the light theme.
📊 2. PAGE 1: 3-COMPANY MONETARY HEALTH DASHBOARD
The apex data layout tracking real-time cash flow, upgraded with exception monitoring.
Master Context Selectors: Isolate data via Company Toggle ([Security], [Café Tasha], [Shalom Residence]) and Date Range.
Enterprise Performance Cards: Gross Accrued Revenue, Gross Corporate Liabilities, and Net EBITDA.
The Cashflow Gap Analyzer (Billing vs. Payroll):
Compares Target Invoices vs Actual Invoices Issued vs Cash Received vs Upcoming Payroll Requirement.
Delegated Red-Alert Buffer: If cash is too low by the MD's Warning Threshold Date, the system pushes a high-priority collection alert directly to the Executive Admin’s Portal.
HR & Payroll Exception Radar:
Flagged profiles marked YELLOW (e.g., HR overrides a default rank salary during hiring). The MD must click [Approve Exception] or [Reject Override] before the FM can process payroll.
Pending Resignation Debt: Lists recently terminated guards with outstanding uniform/advance debt. Locked here until the FM confirms final debt is recovered or MD approves a write-off.

🧾 3. PAGE 2: ACCOUNTS PAYABLE (OPEX & BILLS LEDGER)
The master outflow control desk. No company money leaves without going through this queue.
Company Filter: A top-level dropdown isolates the queue by entity — [All Companies], [Security], [Café Tasha], [Shalom Residence].
The Inbound Bill Queue: General Admins or Caretakers submit operational bills (e.g., Shalom Electricity, Café Groceries, HQ Stationary).
Data Attached: Each entry features a [Photo of Physical Receipt], [Exact LKR Amount], and [Cost Center: Security / Café / BnB].
The Execution Lock: Bills enter as PENDING_APPROVAL. The MD visually verifies the receipt photo and clicks [Approve for Payment]. Only then does the row unlock on the FM's portal to officially release the funds.
Storage Optimization Rule: Receipt images are automatically deleted 60 days after upload to conserve server storage. EXCEPTION: Bills exceeding LKR 30,000 are flagged as PERMANENT RECORD and their receipt photos are retained indefinitely for audit compliance. Bills above the threshold display a distinct "Permanent Record" badge in the queue.
🏢 4. PAGE 3: THE MASTER SITE DIRECTORY & MARGIN DESK
The unified God-Mode view for the MD. Combines financial margins, contracts, and field logistics into one beautiful, glowing glassmorphism table.
The God-Mode Grid: A master table listing every active site. For each site, the MD can see and edit:
Client details & Contract terms.
Assigned Sector Manager & GPS Coordinates.
Rank requirements & quotas.
The Margin Analyzer (Hidden from OM): * (Client Invoice Rate * Completed Shifts) - Client Deductions - (Guard Pay Rate * Completed Shifts) = Net Site Profit
The row flashes RED if net profit drops below 0 LKR.
Protected Contract Configurator: Register new sites, cluster under a Parent Client for consolidated billing, and set exact Guard/Invoice rates.
Client Visit Billing Charge: Input a specific [Per Visit Charge LKR]. Automatically adds to the client's monthly bill based on successfully tracked Sector Manager patrols.
💰 5. PAGE 4: SHARED INVOICING & AR COLLECTIONS LEDGER
Accessible by: MD, OD, and Executive Admin. (Finance Manager is payroll-only — bank export and salary release; not AR collections.)
Maker/Checker split: Executive Admin places dispute holds, logs client payments (paid / partial), and submits proof. MD verifies proof and approves final status (paid in full, partial with rollover, or settled fined).
The 12-Month Traffic-Light Grid: Displays clients mapped against 12 months. RED (Unpaid/Pending) or GREEN (Paid in Full).
3-Tier Drill-Down View:
Surface View: Total invoice amount itemized by rank shifts.
Deep Click View: Opens ledger revealing exact guards, individual pay rates, total hours worked, and any billed Executive Patrol Visits.
🏨 6. PAGE 5: SHALOM RESIDENCE RENTAL MANAGEMENT DESK
Unified Channel Calendar & Pricing: 15-minute sync grid integrating Airbnb/Booking.com and .ics feeds.
Break-Even Base Rate Calculator: (Monthly Overhead) / (Days in Month * Occupancy %) = Minimum Nightly Base Rate. Blocks dynamic pricing algorithms from suggesting rates below this floor.
🧑‍🍳 7. PAGE 6: CAFÉ TASHA COMPLIANCE AUDITOR
The oversight desk for hospitality labor, operations, and visual sanitation proof.
Labor Roster & MTD Salary Tracker:
Displays the finalized weekly hospitality schedule.
Live MTD Accrual: A live calculated field displays exact accrued salary from the 1st of the month to the current date.
Visual Task Auditor & Auto-Purge Memory:
Displays daily operational tasks and weekly deep-cleaning checklists.
The Proof Lock: Staff must upload a live photo of the cleaned station or prepped food to complete a task.
The 14-Day Purge: Images are permanently deleted 14 days after upload to save server space, but the mathematical "Compliance Score" remains forever.
Blind Float & Void Discrepancy Tracker: Tracks the exact variance between the Cashier's blind physical cash input and the POS theoretical total. Highlights all POS "Voids" to catch theft.
🏦 8. PAGE 7: FM SUBMITTED PAYROLLS (THE AUDIT & BANK LOCK DESK)
The Maker/Checker financial control room. The FM prepares the math, but the MD holds the ultimate key to the bank file.
The State Machine (Approval Pipeline): * The MD views payroll batches in a SUBMITTED_FOR_REVIEW state.
Approval Lock: Once the MD hits [Approve Payroll], the system permanently locks the records. No further edits can be made.
Bank File Generation: Approving the batch immediately unlocks the [Generate Bank Transfer .TXT] button on the FM's dashboard (replacing the old Excel macro).
The Macro Deductions Summary Block: Top-level visual card showing: Gross Payroll vs Uniform Recoveries vs Disciplinary Fines vs Net Bank Transfer.
The AI Variance Warning Flag: Scans proposed salaries against a rolling 3-month average. If a guard's pay is ±20% different than usual, the row is automatically flagged AMBER for immediate visual audit.
⚙️ 9. PAGE 8: SHARED SETTINGS & COMPENSATIONS CONFIGURATOR
The master control room for enterprise-wide formulas and pricing.
Café Overtime Time-Cutoff Kill-Switch: MD sets the [OT Cutoff Time] (e.g., 19:00). Mathematically blocks the OT multiplier for any minutes worked past this exact time.
Dynamic Billing Cycle Parameters: Set Invoice Dispatch Date (Default: 1st), Payroll Target Date (Default: 10th), and Collection Warning Threshold (Default: 6th).
Master Rank Basic Pay Ledger: Defines the flat foundational basic salary for every rank in the company.
Sector Manager Pay Structuring: Choose [Fixed Basic Only], [Per-Visit Bonus Only], or [Fixed Basic + Per-Visit Bonus].
Automated Fuel Surplus Correction: Toggle. Subtracts unverified Google Maps mileage payouts from the next month's fuel advance.
Café Menu Pricing Engine: Overhead Injectors (e.g., Service Charge +10%), Margin Toggles (Fixed % Margin vs Manual LKR Amount), and Bulk Select actions.
Statutory Modifiers: Manage global invoice taxes (VAT, SSCL) and payroll deductions (EPF, ETF) via dynamic % widgets.
Pre-Defined Asset Catalogs: Hardcode penalty LKR fines and Shalom Residence broken item replacement costs.
🚨 10. PORTAL 7 (SHARED): THE OPERATIONS DASHBOARD
Accessible by: MD, OD, OM, and HQ Staff. Tactical field command center.
Sector Health Cards: Dashboard broken into cards for each geographical Sector displaying Shortage Averages, Active Deficits, and 30-Day Disciplinary Health.
Rapid-Response Incident Queue: Live list of all sector incidents, requiring a mandatory [Mark as Read] from the OM, SM, and MD.
