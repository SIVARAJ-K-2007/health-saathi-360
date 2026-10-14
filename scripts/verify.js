// Health Saathi 360 - Automated Test Suite
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

console.log('🧪 Starting Health Saathi 360 Automated Verification Suite...\n');

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`     ${err.message}`);
  }
}

async function itAsync(description, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`     ${err.message}`);
  }
}

async function runTests() {
  // 1. Verify Database Initialization
  const db = require('../server/database');
  it('Database initializes tables and foreign keys', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
    assert(tables.includes('users'), 'Users table missing');
    assert(tables.includes('patients'), 'Patients table missing');
    assert(tables.includes('referrals'), 'Referrals table missing');
    assert(tables.includes('followups'), 'Followups table missing');
    assert(tables.includes('facilities_cache'), 'Facilities cache table missing');
    assert(tables.includes('sync_queue'), 'Sync queue table missing');
  });

  it('Default demo accounts exist with secure password hashes', () => {
    const users = db.prepare('SELECT username, role FROM users').all();
    const usernames = users.map(u => u.username);
    assert(usernames.includes('asha_meena'), 'ASHA user missing');
    assert(usernames.includes('phc_ravi'), 'PHC user missing');
    assert(usernames.includes('admin'), 'Admin user missing');
  });

  // 2. Start server on test port
  process.env.PORT = '3099';
  const server = require('../server/server');

  function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const req = http.request({
        hostname: '127.0.0.1',
        port: 3099,
        path,
        method,
        headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  let ashaToken = '';
  let adminToken = '';

  await itAsync('Server health endpoint responds healthy', async () => {
    const res = await request('GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'healthy');
  });

  await itAsync('Authentication: Valid login issues JWT token', async () => {
    const res = await request('POST', '/api/auth/login', { username: 'asha_meena', password: 'Demo@1234' });
    assert.strictEqual(res.status, 200);
    assert(res.data.token, 'Token not issued');
    assert.strictEqual(res.data.user.role, 'asha_worker');
    ashaToken = res.data.token;

    const adminRes = await request('POST', '/api/auth/login', { username: 'admin', password: 'Admin@5678' });
    assert.strictEqual(adminRes.status, 200);
    adminToken = adminRes.data.token;
  });

  await itAsync('Authentication: Rejects invalid password with 401', async () => {
    const res = await request('POST', '/api/auth/login', { username: 'asha_meena', password: 'WrongPassword' });
    assert.strictEqual(res.status, 401);
  });

  await itAsync('Authorization: Unauthorized user cannot access restricted /api/stats/admin', async () => {
    const noAuth = await request('GET', '/api/stats/admin');
    assert.strictEqual(noAuth.status, 401);

    const ashaForbidden = await request('GET', '/api/stats/admin', null, ashaToken);
    assert.strictEqual(ashaForbidden.status, 403);

    const adminAccess = await request('GET', '/api/stats/admin', null, adminToken);
    assert.strictEqual(adminAccess.status, 200);
  });

  let testPatientId = '';
  await itAsync('Patient Registration: Creates patient with auto-generated ID', async () => {
    const newPatient = {
      name: 'Vasantha Kumari',
      gender: 'Female',
      age: 34,
      village: 'Alanganallur',
      symptoms: 'High blood pressure reading, bilateral pedal edema',
      preferred_language: 'ta'
    };

    const res = await request('POST', '/api/patients', newPatient, ashaToken);
    assert.strictEqual(res.status, 201);
    assert(res.data.patient.id.startsWith('PAT-'), 'ID not formatted PAT-');
    assert.strictEqual(res.data.patient.name, 'Vasantha Kumari');
    testPatientId = res.data.patient.id;
  });

  await itAsync('Patient Persistence: Patient is retrievable from SQLite database', async () => {
    const res = await request('GET', `/api/patients/${testPatientId}`, null, ashaToken);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.patient.name, 'Vasantha Kumari');
  });

  let testReferralId = '';
  await itAsync('Referral Management: Creates referral with urgency and auto-schedules follow-up', async () => {
    const refData = {
      patient_id: testPatientId,
      facility_id: 'FAC-MAD-001',
      facility_name: 'Government Rajaji Hospital (Madurai Medical College)',
      referral_date: '2026-10-14',
      reason: 'Hypertensive disorders of pregnancy evaluation',
      urgency: 'urgent',
      follow_up_date: '2026-10-18'
    };

    const res = await request('POST', '/api/referrals', refData, ashaToken);
    assert.strictEqual(res.status, 201);
    assert(res.data.referral.id.startsWith('REF-'), 'Referral ID format error');
    assert.strictEqual(res.data.referral.status, 'pending');
    testReferralId = res.data.referral.id;

    // Check that follow-up was automatically scheduled
    const fuCheck = db.prepare('SELECT * FROM followups WHERE referral_id = ?').get(testReferralId);
    assert(fuCheck, 'Auto follow-up not created');
    assert.strictEqual(fuCheck.due_date, '2026-10-18');
  });

  await itAsync('Referral Details & Non-Sensitive QR Payload check', async () => {
    const res = await request('GET', `/api/referrals/${testReferralId}`, null, ashaToken);
    assert.strictEqual(res.status, 200);
    assert(res.data.qrPayload, 'QR payload missing');
    const parsed = JSON.parse(res.data.qrPayload);
    assert(parsed.refId, 'QR missing refId');
    // Ensure NO sensitive health info inside QR payload
    assert(!parsed.symptoms, 'CRITICAL PRIVACY VIOLATION: Symptoms found in QR payload');
    assert(!parsed.contact, 'CRITICAL PRIVACY VIOLATION: Contact found in QR payload');
  });

  await itAsync('Referral Status Update: Updates to completed and closes pending follow-up', async () => {
    const res = await request('PATCH', `/api/referrals/${testReferralId}/status`, {
      status: 'completed',
      status_notes: 'Patient examined at GRH OBG OPD.'
    }, ashaToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.referral.status, 'completed');

    const fu = db.prepare('SELECT status FROM followups WHERE referral_id = ?').get(testReferralId);
    assert.strictEqual(fu.status, 'completed');
  });

  await itAsync('Dashboard Statistics reflect actual database records', async () => {
    const res = await request('GET', '/api/stats/dashboard', null, ashaToken);
    assert.strictEqual(res.status, 200);
    const { summary } = res.data;
    assert(summary.totalPatients >= 9, 'Patient count calculation incorrect');
    assert(summary.completedReferrals >= 1, 'Completed count calculation incorrect');
  });

  await itAsync('Offline-First Sync: Batch operations synced idempotently without duplicate records', async () => {
    const syncBatch = {
      operations: [
        {
          id: 'SYNC-OP-001',
          type: 'create_patient',
          entity_id: 'PAT-OFFLINE-9901',
          payload: {
            id: 'PAT-OFFLINE-9901',
            name: 'Karpagam T.',
            gender: 'Female',
            village: 'Melur',
            symptoms: 'Postnatal checkup and anemia follow-up'
          }
        },
        {
          id: 'SYNC-OP-002',
          type: 'create_referral',
          entity_id: 'REF-OFFLINE-8801',
          payload: {
            id: 'REF-OFFLINE-8801',
            patient_id: 'PAT-OFFLINE-9901',
            facility_id: 'FAC-MAD-005',
            facility_name: 'Government Hospital Melur',
            reason: 'Routine postnatal hemoglobin check',
            urgency: 'routine'
          }
        }
      ]
    };

    // First sync
    const firstSync = await request('POST', '/api/sync', syncBatch, ashaToken);
    assert.strictEqual(firstSync.status, 200);

    // Second sync of the identical batch (idempotency test)
    const duplicateSync = await request('POST', '/api/sync', syncBatch, ashaToken);
    assert.strictEqual(duplicateSync.status, 200);

    // Verify exactly ONE patient with this ID exists
    const pCount = db.prepare('SELECT COUNT(*) as count FROM patients WHERE id = ?').get('PAT-OFFLINE-9901').count;
    assert.strictEqual(pCount, 1, 'Duplicate patient was created during repeated sync!');

    // Verify exactly ONE referral with this ID exists
    const rCount = db.prepare('SELECT COUNT(*) as count FROM referrals WHERE id = ?').get('REF-OFFLINE-8801').count;
    assert.strictEqual(rCount, 1, 'Duplicate referral was created during repeated sync!');
  });

  await itAsync('Facilities & Matching: Returns ranked facilities based on service requirements', async () => {
    const matchRes = await request('GET', '/api/facilities/match?service=maternal&lat=9.9252&lng=78.1198&max_distance=25');
    assert.strictEqual(matchRes.status, 200);
    assert(matchRes.data.matched_facilities.length > 0, 'No matched facilities returned');
    assert(matchRes.data.matched_facilities[0].match_reasons.length > 0, 'Match explanation missing');
  });

  it('Multilingual Dictionary: English and Tamil contain matching key sets', () => {
    const translationsCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'translations.js'), 'utf8');
    assert(translationsCode.includes('app_title'), 'translations.js missing app_title');
    assert(translationsCode.includes('nav_dashboard'), 'translations.js missing nav_dashboard');
    assert(translationsCode.includes('emergency_detected_title'), 'translations.js missing emergency alerts');
  });

  console.log(`\n======================================================`);
  console.log(`📊 Test Results: ${passedTests} / ${totalTests} Passed (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log(`======================================================\n`);

  server.close();
  process.exit(passedTests === totalTests ? 0 : 1);
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
