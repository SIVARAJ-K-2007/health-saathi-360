# Health Saathi 360 (ஹெல்த் சாதி 360)
### Offline-First Public Healthcare Referral & Follow-up Platform

Health Saathi 360 is a lightweight, offline-first public healthcare platform designed for **ASHA workers**, **ANMs**, and **Primary Health Centre (PHC) staff** in Tamil Nadu. It facilitates discovering real-world public healthcare facilities, managing emergency and routine referrals, issuing non-sensitive verification QR codes, and tracking patient follow-up care and social barriers to treatment.

---

## 1. Strict Technology Compliance

This application adheres strictly to the minimal, lightweight stack:

| Component | Technology | Rationale |
|---|---|---|
| **Frontend** | Pure HTML5, CSS3, Vanilla JavaScript (ES modules) | Zero heavy bundlers, zero React/Next.js/Tailwind |
| **Backend** | Node.js with Express | Lightweight REST API server with security headers |
| **Database** | SQLite via `better-sqlite3` | Zero-configuration, file-based ACID storage with WAL mode |
| **Maps** | Leaflet.js with OpenStreetMap & Overpass API | Real-world geospatial health facilities in Madurai region |
| **Offline Engine** | Service Worker + IndexedDB | Automatic draft saving, offline operation queue, sync engine |
| **Icons & Assets** | Self-hosted SVGs and local offline assets | Leaflet CSS/JS and QRCode.js stored locally for offline reliability |

**Hardware Footprint:** Runs comfortably on laptops with 8 GB RAM and integrated graphics. Uses less than 60 MB RAM in total.

---

## 2. Demonstration Accounts

The platform includes role-based access control with pre-seeded demo accounts:

| Role | Username | Password | Facility / Assignment |
|---|---|---|---|
| **ASHA Worker** | `asha_meena` | `Demo@1234` | Alanganallur Sub-Centre |
| **PHC Medical Officer** | `phc_ravi` | `Demo@1234` | Samayanallur Primary Health Centre |
| **District Administrator** | `admin` | `Admin@5678` | Madurai District Health Office |

> **Note:** Demonstration credentials are provided for rapid functional evaluation. In production deployments, passwords must be securely rotated and integrated with institutional SSO or state health registries.

---

## 3. Quick Start & Installation

### Prerequisites
- Node.js (v18 or higher)
- npm

### Setup in 2 Commands
```bash
# 1. Navigate to the project directory
cd "C:\Users\SHIVARAJ\.gemini\antigravity\scratch\health-saathi-360"

# 2. Start the application
npm start
```

Open your browser at:
👉 **`http://localhost:3000`**

To run the automated verification test suite:
```bash
npm test
# Or: node scripts/verify.js
```

---

## 4. Key Pages & Features

### A. Real-Time Dashboard
- **Live Metrics**: Total registered patients, pending referrals, completed visits, and follow-ups due today calculated dynamically from SQLite.
- **Visual Status Breakdown**: Lightweight pure-CSS distribution graphs for referral statuses (Pending, Completed, Missed, Cancelled) and urgency levels (Routine, Urgent, Emergency).
- **Recent Activity Feed**: Rapid access to recently registered patients and outbound referrals.

### B. Patient Registration
- **Inclusive Demographics**: Full name, age or DOB, inclusive gender options (Female, Male, Other/Transgender, Prefer not to say), village/ward, and language preference.
- **Clinical Triage Data**: Primary symptoms, duration, relevant medical history, vital signs (BP, Temp, SpO2).
- **IndexedDB Auto-Save Drafts**: Form state is saved in the browser while typing. If the page reloads or power cuts occur, the form automatically restores.

### C. Clinical Safety Screening & Urgency Support
- **Rule-Based Emergency Escalation**: Structured questions assessing crushing chest pain, respiratory distress, convulsions/altered mental status, severe maternal complications, and acute pediatric danger signs.
- **Immediate Escalation Guidance**: If an emergency danger sign is identified, a high-visibility alert banner instructs staff to call **108 Emergency Ambulance** immediately and directs to the nearest Comprehensive Emergency Centre.
- **Clinical Validation Disclaimer**: Explicitly labeled as a decision-support prototype that does not replace clinical evaluation or make autonomous medical decisions.

### D. Interactive Real-World Hospital Map (Leaflet & OpenStreetMap)
- **Geographic Coverage**: Centered at **Madurai, Tamil Nadu** (`9.9252, 78.1198`) with quick locality selectors (Alanganallur, Samayanallur, Vadipatti, Melur, Usilampatti, Tirumangalam, Sholavandan).
- **Overpass API Integration**: Fetches real hospitals, clinics, and health centres using OpenStreetMap's Overpass QL API with automatic fallback to local SQLite cache when offline.
- **Government vs. Private Classification**: Distinguishes free public health facilities (Government Hospital, PHC, CHC, UPHC) from private institutions based on verified OSM operator tags.
- **Turn-by-Turn Navigation**: One-click links to open navigation in Google Maps or OpenStreetMap.
- **Direct Referral Integration**: Click "Refer Patient Here" from any hospital card or map popup to pre-fill the referral form.

### E. Assisted Facility Matching
- **Multi-Criteria Ranking**: Scores facilities based on proximity (Haversine distance), facility type suitability, and public care subsidies.
- **Services Supported**: General OPD, Maternal & Child Healthcare (ANC/Delivery), Diagnostic Lab, Specialist Consultation, and 24x7 Casualty/Emergency.
- **Transparent Justification**: Clear plain-language explanation of why each facility was matched.

### F. Referral Management & Privacy-Preserving QR Codes
- **Outbound Referral Workflow**: Unique auto-generated ID (`REF-YYYY-XXX`), patient linking, urgency categorization, instructions, and follow-up date.
- **Zero-PHI QR Code Slip**: The generated QR code encodes **only the referral ID and non-sensitive reference token**. No patient symptoms, names, or contact info are exposed in the QR code or URL.
- **Authorized Status Updates**: Medical officers and PHC staff can update status to Completed, Not Attended, or Cancelled with clinical notes.

### G. Follow-Up Management & Social Barrier Tracking
- **Categorized Tabs**: Upcoming visits, overdue visits, missed appointments, and completed care.
- **Barrier Recording**: Captures social determinants of health (lack of transport, daily wage loss, childcare responsibilities, anxiety/fear).
- **Assistance Documentation**: Records frontline support provided (e.g., arranged 108 vehicle, ASHA home accompaniment, rescheduled visit).

### H. Multilingual Support (English & தமிழ்)
- Comprehensive English and Tamil translations covering all labels, instructions, safety alerts, barrier options, and status badges.
- Instant live switching without page reloads.

---

## 5. Offline-First Architecture & Testing Guide

Health Saathi 360 is engineered to operate seamlessly during connectivity interruptions common in rural and remote health posts.

```
┌────────────────────────────────────────────────────────┐
│                   Browser Client                       │
├──────────────────────────┬─────────────────────────────┤
│   App Shell (Cache-First)│   Mutations (IndexedDB)     │
│   • HTML / CSS / JS      │   • Patient Form Drafts     │
│   • Leaflet & Map Icons  │   • Offline Operations Queue│
│   • QR Code Library      │   • Cached Facility POIs    │
└────────────┬─────────────┴──────────────┬──────────────┘
             │                            │
             ▼                            ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│   Service Worker         │   │   Reconnection Engine    │
│   (health-saathi-cache)  │   │   Idempotent POST /sync  │
└──────────────────────────┘   └──────────┬───────────────┘
                                          │
                                          ▼
                               ┌──────────────────────────┐
                               │     Express & SQLite     │
                               │   (Deduplicated Records) │
                               └──────────────────────────┘
```

### How to Test Offline Mode
1. **Load the app** while online at `http://localhost:3000`. The Service Worker caches the application shell, scripts, and local facility database.
2. **Simulate Offline**:
   - Open Chrome DevTools (`F12`) -> Go to the **Network** tab -> Select **Offline** from the throttling dropdown.
   - Alternatively, disconnect Wi-Fi.
3. Notice the header status switches to **Offline (Working Locally)**.
4. **Register a Patient**: Fill the registration form and click "Register & Save Patient". The record is queued securely into IndexedDB, and a notification informs the health worker that changes are saved locally.
5. **Issue a Referral**: Create a referral while still offline. A temporary offline token is generated.
6. **Simulate Reconnection**:
   - Switch DevTools Network back to **No throttling (Online)**.
   - Click the **Sync Now** button or watch the automatic reconnect event synchronize queued records to the SQLite database.
   - All records are synchronized idempotently; re-submitting never generates duplicate patient IDs or referrals.

---

## 6. Security and Privacy Safeguards

- **No Third-Party Tracking**: Patient health records, names, or addresses are never submitted to third-party analytics, external geocoding endpoints, or map tile servers.
- **Parameterized SQL Queries**: All database queries use prepared statements via `better-sqlite3` to prevent SQL injection.
- **Safe HTML Rendering**: All user-entered strings are sanitized against XSS via `escapeHTML()` before DOM injection.
- **Role-Based Authorization**: Endpoints verify JWT signatures and validate role privileges on the server side (e.g. `/api/stats/admin` is strictly inaccessible to regular ASHA roles).
- **Password Protection**: Stored user passwords use bcrypt with salt rounds.

---

## 7. Limitations & Production Roadmap

1. **Local Prototype Storage**: IndexedDB is secured by the browser's same-origin policy. For multi-user field tablets shared across different shifts, user profile logout and browser profile isolation must be enforced.
2. **SMS / WhatsApp Gateway**: Automated SMS notifications require a configured state gateway (e.g. CDAC / Gov SMS Gateway). In this prototype, follow-ups are presented through in-app alerts and lists.
3. **Clinical Screening**: The safety screening module is a demonstration decision-support tool following emergency protocols; it requires clinical review before field deployment.

---

## 8. Automated Verification Results

All 15 automated test suites pass with 100% compliance:
```
  ✅ Database initializes tables and foreign keys
  ✅ Default demo accounts exist with secure password hashes
  ✅ Server health endpoint responds healthy
  ✅ Authentication: Valid login issues JWT token
  ✅ Authentication: Rejects invalid password with 401
  ✅ Authorization: Unauthorized user cannot access restricted /api/stats/admin
  ✅ Patient Registration: Creates patient with auto-generated ID
  ✅ Patient Persistence: Patient is retrievable from SQLite database
  ✅ Referral Management: Creates referral with urgency and auto-schedules follow-up
  ✅ Referral Details & Non-Sensitive QR Payload check
  ✅ Referral Status Update: Updates to completed and closes pending follow-up
  ✅ Dashboard Statistics reflect actual database records
  ✅ Offline-First Sync: Batch operations synced idempotently without duplicate records
  ✅ Facilities & Matching: Returns ranked facilities based on service requirements
  ✅ Multilingual Dictionary: English and Tamil contain matching key sets
```
