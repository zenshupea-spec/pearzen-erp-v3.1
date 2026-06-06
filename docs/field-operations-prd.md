# MASTER PRODUCT REQUIREMENTS DOCUMENT (PRD)
## Phase 10: Field Operations & ISO Compliance Framework
**Modules:** Guard Edge App, Sector Manager (SM) Portal, OM Command Center, Client Portal

### 1. COMPLIANCE & GOVERNANCE ARCHITECTURE
The system must inherently enforce and document compliance for three major standards:
* **ISO 18788 (Security Operations):** Enforced via mandatory risk assessments, digital SOPs, and strict CAPA (Corrective and Preventive Action) logs tracking incident resolution.
* **ISO 9001 (Quality Management):** Enforced via automated SLA compliance tracking (Fulfillment %, MTTR metrics) piped directly to the Client Portal.
* **ISO 27001 (Information Security):** Enforced via Role-Based Access Control (RBAC), secure edge-device data caching, and motion-triggered NOC locks for executive dashboards.

### 2. THE GUARD PORTAL (Edge Web App / PWA)
**Target Hardware:** Budget Mobile Phones (Low-Bandwidth Optimized)
**Core Functions:**
* **Progressive Web App (PWA):** Must support offline caching. If a guard loses 3G/4G signal, timestamps/scans are saved locally and synced instantly upon reconnection.
* **Anti-Spoofing Engine:** Camera inputs must strictly utilize `<input type="file" capture="user">` to force live front-camera capture. Gallery uploads and mock GPS locations are strictly blocked and flagged.
* **Localization Engine:** UI dynamically switches between English, Sinhala, and Tamil.
* **SOS / Panic Override:** A high-visibility panic button transmitting live GPS coordinates to the OM Command Center.
* **Shift Telemetry & Patrols:** Captures Actual Clock-In/Out, Geofence Validation, Post Abandonment Flags, and RFID/QR Checkpoint timestamps.

### 3. THE SECTOR MANAGER (SM) PORTAL (Field Commander)
**Target Hardware:** Standard Mobile Phones and Tablets (Strictly Responsive)
**Core Functions:**
* **The T-24 / T-1 Roster Engine:** SM receives HR-assigned default rosters, executes call-off adjustments, and submits final shift lists.
* **SM Verification Audit:** When an SM submits a site audit or inspection, they are held to the same Anti-Spoofing standard: they must authenticate their presence via GPS + Live Selfie or RFID + Live Selfie.

### 4. THE OM COMMAND CENTER (Desktop NOC)
**Target Hardware:** Desktop / Ultra-Wide Monitors
**Core Functions:**
* **The Unassigned Bench:** Drag-and-drop UI matrix for live deployment. 
* **The 45-Day Early Warning Radar:** Highlights guards whose MoD or Police Clearances are expiring within 45 days.
* **Hard Compliance Block:** The UI physically locks the drag-and-drop card of any guard with an expired clearance, preventing deployment to any site.
* **Live Incident Management:** Calculates Mean Time to Respond (MTTR) using Trigger, Dispatch, Arrival, and Resolution timestamps.

### 5. EXECUTIVE VAULT (MD/OD Configurations)
**Core Functions:**
* **Site-Specific Attendance Modes:** The MD defines the exact verification required per client site in the Site Directory.
  * Mode A: SM Roster Only (Ground truth for payroll).
  * Mode B: SM Roster + Guard Edge App (Live Selfie + GPS).
  * Mode C: SM Roster + Guard Edge App (RFID Scan + Live Selfie).
* **MD Compliance Override:** A master toggle allowing the MD to bypass the OM's "Hard Compliance Block" for expired vetting, assuming executive risk for deployment.

### 6. THE CLIENT PORTAL (Transparency Engine)
**Core Functions:**
* **Live SLA Dashboard:** Replaces manual email reports. Clients log in to see live fulfillment metrics (e.g., "5/5 guards on site"), MTTR stats for their specific incidents, and completed patrol logs, ensuring total operational transparency.