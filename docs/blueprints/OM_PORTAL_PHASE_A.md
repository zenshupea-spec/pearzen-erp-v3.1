# OM COMMAND CENTER: PHASE A (TACTICAL DASHBOARD)
Target File: @apps/back-office/app/executive/operations/page.tsx

## Task 1: Build the OM Master Layout & Architecture (PRD Sec 1)
1. Convert `operations/page.tsx` to a tabbed interface. The tabs should be: "Tactical Dashboard", "Site Allocation", "Patrol Route Builder", "Discrepancy Queue", and "Logistics".
2. Above the tabs, build the "Global Date Range Engine": A top-level date picker `[ START_DATE ]` to `[ END_DATE ]` that controls the data below it.
3. Implement the "Shared Edit Traceability" standard. Create a reusable UI component or text style for: `[Last Edited By: User Name (Role) - Date]`.

## Task 2: Build the Tactical Operations Dashboard (PRD Sec 2)
1. Inside the first tab, build the "Aggregate Sector Health Card" showing total company field health.
2. Below it, build a grid of "Individual Sector Manager Cards" (e.g., SM Dissanayake, SM Perera).
3. Each SM card must display: "Shortage Average (7-Day)", "Active Deficits (Missing Guards)", and "30-Day Disciplinary Health" (clickable drill-down stat).

## Task 3: Build the Rapid-Response & Triage Desk (PRD Sec 5)
1. Below the SM cards, build the "Live Tactical Deficits" table (Today's Shorts).
2. Add a `[ Find Loaner (10km) ]` button to each short row to represent the cross-sector dispatch drawer.
3. Build the "Incident Command Queue" as a split-column interface.
4. Each incident card must feature the "Tri-Role Acknowledgement" badges: `[ OM: Read | SM: Pending | MD: Pending ]`.
5. Ensure strictly NO emojis are used anywhere in this file. Use `lucide-react` icons.
