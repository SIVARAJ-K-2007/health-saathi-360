const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'health_saathi.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
try {
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');
} catch (pragmaErr) {
  console.warn('SQLite pragma warning:', pragmaErr.message);
}

function initSchema() {
  db.exec(`
    -- Users table for role-based authentication
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('asha_worker', 'phc_staff', 'admin')),
      name TEXT NOT NULL,
      facility TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Patients table
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER,
      dob TEXT,
      gender TEXT NOT NULL,
      village TEXT NOT NULL,
      preferred_language TEXT DEFAULT 'ta',
      contact TEXT,
      symptoms TEXT NOT NULL,
      duration TEXT,
      medical_history TEXT,
      vitals TEXT,
      assigned_worker TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Facilities cache table
    CREATE TABLE IF NOT EXISTS facilities_cache (
      id TEXT PRIMARY KEY,
      osm_id TEXT,
      name TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      facility_type TEXT NOT NULL,
      operator_type TEXT DEFAULT 'unknown',
      address TEXT,
      phone TEXT,
      emergency_services INTEGER DEFAULT 0,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      search_query TEXT
    );

    -- Referrals table
    CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      referring_worker_id TEXT NOT NULL,
      facility_id TEXT NOT NULL,
      facility_name TEXT NOT NULL,
      referral_date TEXT NOT NULL,
      reason TEXT NOT NULL,
      urgency TEXT NOT NULL CHECK(urgency IN ('routine', 'urgent', 'emergency')),
      instructions TEXT,
      follow_up_date TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'not_attended', 'cancelled')),
      status_notes TEXT,
      updated_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    -- Follow-ups table
    CREATE TABLE IF NOT EXISTS followups (
      id TEXT PRIMARY KEY,
      referral_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'missed', 'cancelled')),
      notes TEXT,
      barriers TEXT,
      assistance_provided TEXT,
      completed_date TEXT,
      worker_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE,
      FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
    );

    -- Screening logs table
    CREATE TABLE IF NOT EXISTS screenings (
      id TEXT PRIMARY KEY,
      patient_id TEXT,
      patient_name TEXT,
      worker_id TEXT,
      urgency_level TEXT NOT NULL,
      red_flags TEXT,
      responses_json TEXT,
      action_taken TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Sync operations table for idempotency
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      client_timestamp TEXT,
      synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(created_at);
    CREATE INDEX IF NOT EXISTS idx_patients_village ON patients(village);
    CREATE INDEX IF NOT EXISTS idx_referrals_patient ON referrals(patient_id);
    CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
    CREATE INDEX IF NOT EXISTS idx_referrals_date ON referrals(referral_date);
    CREATE INDEX IF NOT EXISTS idx_followups_due_date ON followups(due_date);
    CREATE INDEX IF NOT EXISTS idx_followups_status ON followups(status);
    CREATE INDEX IF NOT EXISTS idx_facilities_coords ON facilities_cache(lat, lng);
  `);

  seedDefaultData();
}

function seedDefaultData() {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    const defaultPasswordHash = bcrypt.hashSync('Demo@1234', salt);
    const adminPasswordHash = bcrypt.hashSync('Admin@5678', salt);

    const insertUser = db.prepare(`
      INSERT INTO users (id, username, password_hash, role, name, facility)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertUser.run('USR-001', 'asha_meena', defaultPasswordHash, 'asha_worker', 'Meenakshi Sundaram (ASHA)', 'Alanganallur Sub-Centre');
    insertUser.run('USR-002', 'phc_ravi', defaultPasswordHash, 'phc_staff', 'Dr. Ravichandran (Medical Officer)', 'Samayanallur Primary Health Centre');
    insertUser.run('USR-003', 'admin', adminPasswordHash, 'admin', 'Senthil Kumar (District Admin)', 'Madurai District Health Office');

    console.log('[DB] Default demo users created.');
  }

  // Seed sample synthetic patients if table is empty
  const patientCount = db.prepare('SELECT COUNT(*) as count FROM patients').get().count;
  if (patientCount === 0) {
    const insertPatient = db.prepare(`
      INSERT INTO patients (id, name, age, dob, gender, village, preferred_language, contact, symptoms, duration, medical_history, vitals, assigned_worker, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const patients = [
      ['PAT-1001', 'Anbuselvi M.', 28, '1998-05-14', 'Female', 'Alanganallur', 'ta', '9842100001', 'High fever, severe headache, joint pain', '4 days', 'None reported', 'BP: 118/76, Temp: 102.4 F, Pulse: 88', 'USR-001', 'USR-001'],
      ['PAT-1002', 'Muthukumar S.', 54, '1972-11-20', 'Male', 'Samayanallur', 'ta', '9842100002', 'Persistent dry cough, mild shortness of breath upon exertion', '3 weeks', 'Type 2 Diabetes (5 yrs)', 'BP: 142/90, SpO2: 96%', 'USR-001', 'USR-001'],
      ['PAT-1003', 'Kavitha R.', 24, '2002-02-18', 'Female', 'Palamedu', 'ta', '9842100003', 'Third trimester pregnancy, ankle swelling, headache', '2 days', 'Primigravida, 32 weeks', 'BP: 138/88, Fetal HR: 144 bpm', 'USR-001', 'USR-001'],
      ['PAT-1004', 'Ramasamy K.', 68, '1958-08-05', 'Male', 'Vadipatti', 'ta', '9842100004', 'Dizziness, reduced urine output, generalized weakness', '5 days', 'Hypertension (10 yrs)', 'BP: 160/98, Pulse: 64', 'USR-001', 'USR-001'],
      ['PAT-1005', 'Deepa P.', 31, '1995-04-12', 'Female', 'Sholavandan', 'ta', '9842100005', 'Acute watery diarrhea, severe fatigue, dry mouth', '1 day', 'None', 'BP: 100/68, Temp: 99.1 F, Pulse: 96', 'USR-001', 'USR-001'],
      ['PAT-1006', 'Velmurugan T.', 42, '1984-09-30', 'Male', 'Alanganallur', 'ta', '9842100006', 'Chest heaviness on walking, profuse sweating', '1 hour', 'Tobacco user (15 yrs)', 'BP: 150/94, Pulse: 104', 'USR-001', 'USR-001'],
      ['PAT-1007', 'Selvi G.', 19, '2007-01-25', 'Female', 'Palamedu', 'ta', '9842100007', 'Severe pallor, fatigue, dizzy spells', '2 months', 'Iron deficiency anemia', 'Hb: 7.2 g/dL, BP: 106/70', 'USR-001', 'USR-001'],
      ['PAT-1008', 'Karthik N.', 8, '2018-07-10', 'Male', 'Samayanallur', 'ta', '9842100008', 'High fever with rash on trunk, poor oral intake', '3 days', 'Routine childhood immunizations up to date', 'Temp: 103.1 F, Pulse: 112', 'USR-001', 'USR-001']
    ];

    for (const p of patients) {
      insertPatient.run(...p);
    }

    console.log('[DB] Seeded 8 demonstration patients.');
  }

  // Seed sample referrals
  const refCount = db.prepare('SELECT COUNT(*) as count FROM referrals').get().count;
  if (refCount === 0) {
    const insertRef = db.prepare(`
      INSERT INTO referrals (id, patient_id, referring_worker_id, facility_id, facility_name, referral_date, reason, urgency, instructions, follow_up_date, status, status_notes, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const referrals = [
      ['REF-2026-001', 'PAT-1001', 'USR-001', 'FAC-MAD-001', 'Government Rajaji Hospital (Madurai Medical College)', '2026-10-10', 'Suspected dengue / acute febrile illness with thrombocytopenia signs', 'urgent', 'Immediate CBC and NS1 antigen test. Maintain oral rehydration.', '2026-10-15', 'completed', 'Patient examined at GRH Outpatient; Dengue negative, treated for viral fever.', 'USR-002'],
      ['REF-2026-002', 'PAT-1002', 'USR-001', 'FAC-MAD-002', 'Samayanallur Primary Health Centre', '2026-10-11', 'Sputum evaluation for tuberculosis and glycemic control review', 'routine', 'Submit 2 early morning sputum samples. Fasting blood sugar check.', '2026-10-16', 'pending', 'Awaiting lab test results.', 'USR-001'],
      ['REF-2026-003', 'PAT-1003', 'USR-001', 'FAC-MAD-001', 'Government Rajaji Hospital (Madurai Medical College)', '2026-10-12', 'Pre-eclampsia evaluation in high risk pregnancy', 'urgent', 'Urgent obstetric ultrasound and urine protein analysis.', '2026-10-14', 'pending', 'Referred to OBG triage.', 'USR-001'],
      ['REF-2026-004', 'PAT-1006', 'USR-001', 'FAC-MAD-001', 'Government Rajaji Hospital (Madurai Medical College)', '2026-10-13', 'Acute Coronary Syndrome (ACS) suspected - urgent cardiology consult', 'emergency', 'Emergency 108 ambulance called. Keep patient in resting position.', '2026-10-14', 'completed', 'Admitted to ICCU. Stent placed.', 'USR-002'],
      ['REF-2026-005', 'PAT-1004', 'USR-001', 'FAC-MAD-003', 'Vadipatti Community Health Centre (CHC)', '2026-10-08', 'Renal function tests & severe hypertension management', 'routine', 'Serum creatinine and electrolyte panel required.', '2026-10-12', 'not_attended', 'Patient reported lack of transport on appointment day.', 'USR-001'],
      ['REF-2026-006', 'PAT-1005', 'USR-001', 'FAC-MAD-002', 'Samayanallur Primary Health Centre', '2026-10-13', 'Moderate dehydration due to acute gastroenteritis', 'urgent', 'Start IV Ringer Lactate and ORS packet distribution.', '2026-10-16', 'pending', 'Under observation.', 'USR-001']
    ];

    for (const r of referrals) {
      insertRef.run(...r);
    }
    console.log('[DB] Seeded 6 demonstration referrals.');
  }

  // Seed sample follow-ups
  const fuCount = db.prepare('SELECT COUNT(*) as count FROM followups').get().count;
  if (fuCount === 0) {
    const insertFu = db.prepare(`
      INSERT INTO followups (id, referral_id, patient_id, due_date, status, notes, barriers, assistance_provided, completed_date, worker_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const followups = [
      ['FU-3001', 'REF-2026-001', 'PAT-1001', '2026-10-15', 'pending', 'Check if fever resolved and medications taken.', '', '', null, 'USR-001'],
      ['FU-3002', 'REF-2026-002', 'PAT-1002', '2026-10-16', 'pending', 'Follow up on sputum test collection.', '', '', null, 'USR-001'],
      ['FU-3003', 'REF-2026-003', 'PAT-1003', '2026-10-14', 'pending', 'Check BP readings and confirm hospital admission.', '', '', null, 'USR-001'],
      ['FU-3004', 'REF-2026-005', 'PAT-1004', '2026-10-12', 'missed', 'Did not attend Vadipatti CHC appointment.', 'No direct bus; mobility difficulty', 'Arranged community auto-rickshaw assistance for next visit.', null, 'USR-001'],
      ['FU-3005', 'REF-2026-004', 'PAT-1006', '2026-10-14', 'completed', 'Post-ICCU discharge follow up; patient stable at home on aspirin/atorvastatin.', 'None', 'Prescriptions verified with family.', '2026-10-14', 'USR-001']
    ];

    for (const fu of followups) {
      insertFu.run(...fu);
    }
    console.log('[DB] Seeded 5 demonstration followups.');
  }

  // Seed verified local public facilities in Madurai region for offline fallback
  const facCount = db.prepare('SELECT COUNT(*) as count FROM facilities_cache').get().count;
  if (facCount === 0) {
    const insertFac = db.prepare(`
      INSERT INTO facilities_cache (id, osm_id, name, lat, lng, facility_type, operator_type, address, phone, emergency_services, search_query)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultFacilities = [
      ['FAC-MAD-001', 'osm-node-123456', 'Government Rajaji Hospital (Madurai Medical College)', 9.9272, 78.1345, 'hospital', 'government', 'Panagal Road, Goripalayam, Madurai - 625020', '0452-2532535', 1, 'Madurai'],
      ['FAC-MAD-002', 'osm-node-123457', 'Samayanallur Primary Health Centre (PHC)', 9.9984, 78.0465, 'clinic', 'government', 'National Highway 7, Samayanallur, Madurai - 625402', '0452-2462230', 0, 'Madurai'],
      ['FAC-MAD-003', 'osm-node-123458', 'Vadipatti Community Health Centre (CHC)', 10.0573, 77.9620, 'hospital', 'government', 'Dindigul Main Road, Vadipatti, Madurai - 625218', '04543-254240', 1, 'Madurai'],
      ['FAC-MAD-004', 'osm-node-123459', 'Alanganallur Primary Health Centre', 10.0462, 78.0827, 'clinic', 'government', 'Alanganallur Main Road, Madurai - 625501', '04543-241220', 0, 'Madurai'],
      ['FAC-MAD-005', 'osm-node-123460', 'Government Hospital Melur', 10.0336, 78.3378, 'hospital', 'government', 'Trichy Main Road, Melur, Madurai - 625106', '0452-241525', 1, 'Madurai'],
      ['FAC-MAD-006', 'osm-node-123461', 'Government Hospital Usilampatti', 9.9702, 77.7952, 'hospital', 'government', 'Theni Main Road, Usilampatti, Madurai - 625532', '04552-252230', 1, 'Madurai'],
      ['FAC-MAD-007', 'osm-node-123462', 'Urban Primary Health Centre Anuppanadi', 9.9078, 78.1523, 'clinic', 'government', 'Teppakulam Road, Anuppanadi, Madurai - 625009', '0452-2311200', 0, 'Madurai'],
      ['FAC-MAD-008', 'osm-node-123463', 'Aravind Eye Hospital', 9.9298, 78.1415, 'specialized_hospital', 'private', '1, Anna Nagar, Madurai - 625020', '0452-4356100', 1, 'Madurai'],
      ['FAC-MAD-009', 'osm-node-123464', 'Meenakshi Mission Hospital and Research Centre', 9.9482, 78.1634, 'hospital', 'private', 'Lake Area, Melur Road, Madurai - 625107', '0452-2588741', 1, 'Madurai'],
      ['FAC-MAD-010', 'osm-node-123465', 'Apollo Speciality Hospitals Madurai', 9.9231, 78.1505, 'hospital', 'private', 'Lake View Road, K.K. Nagar, Madurai - 625020', '0452-2580880', 1, 'Madurai']
    ];

    for (const f of defaultFacilities) {
      insertFac.run(...f);
    }
    console.log('[DB] Seeded 10 verified local healthcare facilities in Madurai.');
  }
}

initSchema();

module.exports = db;
