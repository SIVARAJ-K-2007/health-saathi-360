const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Helper to generate sequential patient ID
function generatePatientId() {
  const row = db.prepare('SELECT id FROM patients ORDER BY created_at DESC, id DESC LIMIT 1').get();
  if (!row || !row.id) {
    return 'PAT-1001';
  }
  const match = row.id.match(/^PAT-(\d+)$/);
  if (match) {
    const nextNum = parseInt(match[1], 10) + 1;
    return `PAT-${nextNum}`;
  }
  return `PAT-${Date.now().toString().slice(-5)}`;
}

// GET /api/patients - list with search, filter, pagination
router.get('/', authenticateToken, (req, res) => {
  try {
    const { search, village, gender, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let conditions = ['1=1'];
    let params = [];

    if (search && search.trim()) {
      conditions.push('(id LIKE ? OR name LIKE ? OR contact LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (village && village.trim()) {
      conditions.push('village = ?');
      params.push(village.trim());
    }

    if (gender && gender.trim()) {
      conditions.push('gender = ?');
      params.push(gender.trim());
    }

    const whereClause = conditions.join(' AND ');

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM patients WHERE ${whereClause}`).get(...params);
    const total = countRow ? countRow.total : 0;

    const listQuery = `
      SELECT p.*, u.name as worker_name 
      FROM patients p
      LEFT JOIN users u ON p.assigned_worker = u.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const patients = db.prepare(listQuery).all(...params, parsedLimit, offset);

    return res.json({
      patients,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (err) {
    console.error('Error fetching patients:', err);
    return res.status(500).json({ error: 'Failed to retrieve patient records.' });
  }
});

// GET /api/patients/:id - single patient with recent referrals
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const patient = db.prepare(`
      SELECT p.*, u.name as worker_name 
      FROM patients p
      LEFT JOIN users u ON p.assigned_worker = u.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!patient) {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    const referrals = db.prepare(`
      SELECT * FROM referrals WHERE patient_id = ? ORDER BY referral_date DESC
    `).all(patient.id);

    const followups = db.prepare(`
      SELECT * FROM followups WHERE patient_id = ? ORDER BY due_date DESC
    `).all(patient.id);

    return res.json({
      patient,
      referrals,
      followups
    });
  } catch (err) {
    console.error('Error fetching patient details:', err);
    return res.status(500).json({ error: 'Failed to fetch patient details.' });
  }
});

// POST /api/patients - register new patient
router.post('/', authenticateToken, (req, res) => {
  try {
    const {
      name,
      age,
      dob,
      gender,
      village,
      preferred_language = 'ta',
      contact,
      symptoms,
      duration,
      medical_history,
      vitals,
      assigned_worker,
      client_id // for offline-generated ID support
    } = req.body;

    // Validation
    const errors = [];
    if (!name || !name.trim()) errors.push('Patient name is required.');
    if (!gender || !gender.trim()) errors.push('Gender is required.');
    if (!village || !village.trim()) errors.push('Village / town / address is required.');
    if (!symptoms || !symptoms.trim()) errors.push('Symptoms are required.');

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const patientId = client_id && client_id.startsWith('PAT-') ? client_id : generatePatientId();
    const workerId = assigned_worker || req.user.id;

    // Check if ID already exists (idempotency for offline sync)
    const existing = db.prepare('SELECT id FROM patients WHERE id = ?').get(patientId);
    if (existing) {
      return res.status(200).json({
        message: 'Patient record already exists (synced).',
        patient: db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId)
      });
    }

    const insert = db.prepare(`
      INSERT INTO patients (
        id, name, age, dob, gender, village, preferred_language, 
        contact, symptoms, duration, medical_history, vitals, 
        assigned_worker, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      patientId,
      name.trim(),
      age ? parseInt(age, 10) : null,
      dob || null,
      gender.trim(),
      village.trim(),
      preferred_language || 'ta',
      contact ? contact.trim() : null,
      symptoms.trim(),
      duration ? duration.trim() : null,
      medical_history ? medical_history.trim() : null,
      vitals ? vitals.trim() : null,
      workerId,
      req.user.id
    );

    const created = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
    return res.status(201).json({
      message: 'Patient registered successfully.',
      patient: created
    });
  } catch (err) {
    console.error('Error creating patient:', err);
    return res.status(500).json({ error: 'Failed to save patient record.' });
  }
});

// PUT /api/patients/:id - update existing patient
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const patientId = req.params.id;
    const existing = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
    if (!existing) {
      return res.status(404).json({ error: 'Patient not found.' });
    }

    const {
      name,
      age,
      dob,
      gender,
      village,
      preferred_language,
      contact,
      symptoms,
      duration,
      medical_history,
      vitals,
      assigned_worker
    } = req.body;

    const update = db.prepare(`
      UPDATE patients SET
        name = COALESCE(?, name),
        age = COALESCE(?, age),
        dob = COALESCE(?, dob),
        gender = COALESCE(?, gender),
        village = COALESCE(?, village),
        preferred_language = COALESCE(?, preferred_language),
        contact = COALESCE(?, contact),
        symptoms = COALESCE(?, symptoms),
        duration = COALESCE(?, duration),
        medical_history = COALESCE(?, medical_history),
        vitals = COALESCE(?, vitals),
        assigned_worker = COALESCE(?, assigned_worker),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    update.run(
      name ? name.trim() : null,
      age ? parseInt(age, 10) : null,
      dob || null,
      gender ? gender.trim() : null,
      village ? village.trim() : null,
      preferred_language || null,
      contact ? contact.trim() : null,
      symptoms ? symptoms.trim() : null,
      duration ? duration.trim() : null,
      medical_history ? medical_history.trim() : null,
      vitals ? vitals.trim() : null,
      assigned_worker || null,
      patientId
    );

    const updated = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
    return res.json({
      message: 'Patient updated successfully.',
      patient: updated
    });
  } catch (err) {
    console.error('Error updating patient:', err);
    return res.status(500).json({ error: 'Failed to update patient record.' });
  }
});

module.exports = router;
