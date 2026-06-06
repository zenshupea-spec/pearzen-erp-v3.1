🚀 PEARZEN ERP: MASTER PRODUCT REQUIREMENTS DOCUMENT
MODULE: THE OM COMMAND CENTER (PORTAL 2 - FINALIZED V3.7)
🛡️ 1. CORE ARCHITECTURAL STANDARDS
The Shared Edit Traceability: This portal is editable by HR, FM, OM, MD, and OD. Every single editable setting, form, or route parameter explicitly renders a metadata label next to it: [Last Edited By: User Name (Role) - Date].
Speed & Action Optimization: Designed purely for field triage, logistics allocation, and discrepancy resolution without financial data clutter.
The Global Date Range Engine: Every statistical view and data table on the primary dashboard is controlled by a master [START_DATE] to [END_DATE] selector fixed to the top navigation bar.
Zero-Trust Data Resolution: Because the SM manual check-in override was killed, the OM acts as the supreme judge. Any conflict between what an SM plans and what a Guard physically authenticates drops directly onto the OM's desk for manual resolution.
📊 2. PAGE 1: THE TACTICAL OPERATIONS DASHBOARD
Accessible by: OM, MD, OD, and HQ Staff. The overarching view of field health.
Aggregate Sector Health Card: The first modular card acts as the macro view, aggregating "All Sector Managers" together to show total company field health.
Individual Sector Manager Cards: Following the aggregate card, individual data cards are generated for each specific Sector Manager (e.g., SM Dissanayake, SM Perera). Each card displays:
Shortage Average: Rolling average of "SHORT" shifts over the last 7 days.
Active Deficits: Exact number of missing guards for the current and upcoming shift.
30-Day Disciplinary Health: Running tally of penalties issued in that sector over the last 30 days. Drill-Down: Clicking the stat reveals the exact Guard names, IDs, and dates.
Recruitment & Long-Term Vacancy Radar: Highlights sites consistently lacking their permanent guard quota. Links directly to the HR & Secretary workspace as their immediate prompt to trigger the Automated Ad Generation engine.
🗺️ 3. PAGE 2: SITE ALLOCATION & GEOFENCING MATRIX
Unassigned Sites Queue: A holding zone on the right side (or stacked on mobile) displaying new sites added by the MD that lack a commanding SM.
Drag-and-Drop Assignment: The OM drags a pending site and drops it onto a Sector Manager to assign jurisdiction.
The Master Site Sync Table: A horizontal list of all active sites. The OM can rapidly change the assigned SM using an inline dropdown.
GPS Coordinate Ingestion: Next to every site, the OM inputs exact Latitude and Longitude coordinates. This creates the 50-meter geofence used for Guard Check-Ins, SM validations, and Google Maps routing.
🗓️ 4. PAGE 3: MONTHLY PATROL ROUTE BUILDER & LOGISTICS ENGINE
The predictive fleet management tool replacing daily dispatch lists.
Visual "Day Bins" (Avoiding the Giant List): The UI is broken into collapsible tabs or calendar rows (e.g., [Day 1], [Day 2]). The OM builds vertical drag-and-drop lists within each specific day bin.
Automated Distance & Time Calculation (Google Maps API): When the OM drags Site B under Site A, the server queries the Google Maps API (TWO_WHEELER mode). It automatically populates the UI with the exact KM distance and predicted driving time between the points.
On-Site Duration Target: Next to each assigned site, the OM inputs the expected inspection time (e.g., 30 mins vs 1 hour).
The Predictive Timeline: Based on the SM's shift start time, driving distance, and on-site duration, the UI generates a predictive timeline (e.g., Arrive Site A: 06:30, Arrive Site B: 07:15).
SM Home Node & Multiple Visits: The SM's personal home address is treated as a routable coordinate. The OM can insert it to end a day's route. A [+] button allows duplicating a site to assign multiple visits in a month.
The Priority Spillover Queue (Anti-Cascade Protocol): If an SM calls in sick or runs out of time on a shift, the route does not automatically push to the next day. The missed sites drop into the Spillover Queue. The OM must manually drag them into a future day or assign them to a different SM.
🚨 5. PAGE 4: RAPID-RESPONSE & TRIAGE DESK
Live Tactical Deficits (Today's Shorts): Auto-refreshing list of locations currently missing guards.
10km Radius Loaning Logic: Tapping a "SHORT" row opens a cross-sector dispatch drawer. The system finds available loaner guards by checking if their default assigned site is located within a 10km radius of the short site.
Incident Command Queue: A split-column interface displaying high-priority security problems. Features the custom HTML5 inline audio player for SM voice notes. Cards remain locked on the feed until the OM, SM, and MD individually click [Mark as Read].
⚖️ 6. PAGE 5: INTEGRITY & DISCREPANCY QUEUE
The biometric and temporal verification engine to prevent ghost-billing.
The 3-Point Visual Verification Grid: A side-by-side photo audit tool displaying: 1) HR Master ID Photo, 2) Geofenced Check-In Selfie, 3) Geofenced Check-Out Selfie.
Time Variance Discrepancy Desk (45-Minute Rule): If a guard's biometric check-in deviates more than ±45 minutes from the SM's CONFIRMED roster time (or if the biometrics are completely blank due to a dead phone), the shift freezes here.
Zero-Trust Resolution Overrides: The OM investigates and clicks one of two buttons to unlock payroll:
[Trust Form]: Overrides biometrics and applies the SM's scheduled hours.
[Trust Check-In]: Overrides the SM's roster and applies the exact device timestamp hours.
📦 7. PAGE 6: LOGISTICS & DISCIPLINARY DESK
Uniform & Equipment Approvals: OM reviews inbound asset requests and verifies the guard's watermarked "Selfie Signature". Approving Sector Stock routes debt directly to payroll. Approving HQ Dispatch routes to the General Admin for physical packaging.
Silent Disciplinary Execution (Mobile Quick-Action): A highly accessible form for OMs in the field. Select Guard -> Select Site -> Select violation from the MD's strict catalog. Clicking submit silently deducts the exact LKR amount from the guard's MTD widget and queues it for the FM's payroll, without requiring a guard signature.
🗃️ 8. DATABASE SCHEMA APPENDICES (LATEST INJECTIONS)



SQL
-- SITE ALLOCATION & GEOFENCING
ALTER TABLE site_profiles ADD COLUMN assigned_sm_id UUID REFERENCES users(id);
ALTER TABLE site_profiles ADD COLUMN latitude NUMERIC(10, 8);
ALTER TABLE site_profiles ADD COLUMN longitude NUMERIC(11, 8);

-- MONTHLY PATROL ROUTE BUILDER
CREATE TABLE monthly_patrol_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sm_id UUID REFERENCES users(id) NOT NULL,
    target_date DATE NOT NULL, -- The specific 'Day Bin' date
    route_sequence_jsonb JSONB NOT NULL, -- Array of site_ids, expected durations, and 'SM_HOME' nodes
    last_edited_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- SPILLOVER QUEUE
CREATE TABLE patrol_spillover_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    original_sm_id UUID REFERENCES users(id),
    target_site_id UUID REFERENCES site_profiles(id),
    missed_date DATE NOT NULL,
    status TEXT DEFAULT 'PENDING_REASSIGNMENT',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- DISCREPANCY QUEUE RESOLUTION LOGS
CREATE TABLE discrepancy_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    shift_id UUID NOT NULL,
    resolved_by_om_id UUID REFERENCES users(id),
    resolution_choice TEXT NOT NULL CHECK (resolution_choice IN ('TRUST_FORM', 'TRUST_CHECK_IN', 'REJECT_SHIFT')),
    variance_minutes INT NOT NULL,
    resolved_at TIMESTAMPTZ DEFAULT NOW()
);


