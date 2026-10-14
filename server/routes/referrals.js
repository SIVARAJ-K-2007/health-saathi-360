const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

function generateReferralId() {
  const currentYear = new Date().getFullYear();
  const prefix = `REF-${currentYear}-`;
  const row = db.prepare(`SELECT id FROM referrals WHERE id LIKE ? ORDER BY created_at DESC, id DESC LIMIT 1`).get(`${prefix}%`);
  if (!row || !row.id) {
    return `${prefix}001`;
  }
  const match = row.id.match(new RegExp(`^REF-${currentYear}-(\\d+)$`));
  if (match) {
    const nextNum = parseInt(match[1], 10) + 1;
    return `${prefix}${String(nextNum).padStart(3, '0')}`;
  }
  return `${prefix}${Date.now().toString().slice(-4)}`;
}

// GET /api/referrals - list with search, status filters
router.get('/', authenticateToken, (req, res) => {
  try {
    const { status, urgency, patient_id, search, page = 1, limit = 20 } = req.query;
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let conditions = ['1=1'];
    let params = [];

    if (status && status !== 'all') {
      conditions.push('r.status = ?');
      params.push(status);
    }

    if (urgency && urgency !== 'all') {
      conditions.push('r.urgency = ?');
      params.push(urgency);
    }

    if (patient_id) {
      conditions.push('r.patient_id = ?');
      params.push(patient_id);
    }

    if (search && search.trim()) {
      conditions.push('(r.id LIKE ? OR r.patient_id LIKE ? OR p.name LIKE ? OR r.facility_name LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = db.prepare(`
      SELECT COUNT(*) as total 
      FROM referrals r
      JOIN patients p ON r.patient_id = p.id
      WHERE ${whereClause}
    `).get(...params);
    const total = countRow ? countRow.total : 0;

    const listQuery = `
      SELECT r.*, p.name as patient_name, p.gender as patient_gender, p.age as patient_age, p.village as patient_village,
             u.name as worker_name
      FROM referrals r
      JOIN patients p ON r.patient_id = p.id
      LEFT JOIN users u ON r.referring_worker_id = u.id
      WHERE ${whereClause}
      ORDER BY r.referral_date DESC, r.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const referrals = db.prepare(listQuery).all(...params, parsedLimit, offset);

    return res.json({
      referrals,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parsedLimit,
        totalPages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (err) {
    console.error('Error fetching referrals:', err);
    return res.status(500).json({ error: 'Failed to retrieve referrals.' });
  }
});

// GET /api/referrals/:id - details of referral including verification payload
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const referralId = req.params.id;
    const referral = db.prepare(`
      SELECT r.*, p.name as patient_name, p.age as patient_age, p.gender as patient_gender,
             p.village as patient_village, p.contact as patient_contact,
             u.name as worker_name, u.facility as worker_facility
      FROM referrals r
      JOIN patients p ON r.patient_id = p.id
      LEFT JOIN users u ON r.referring_worker_id = u.id
      WHERE r.id = ?
    `).get(referralId);

    if (!referral) {
      return res.status(404).json({ error: 'Referral record not found.' });
    }

    // Follow-ups associated with this referral
    const followups = db.prepare(`
      SELECT * FROM followups WHERE referral_id = ? ORDER BY due_date ASC
    `).all(referralId);

    // Non-sensitive QR code content: only referral ID token
    const qrPayload = JSON.stringify({
      refId: referral.id,
      patientId: referral.patient_id,
      issued: referral.referral_date
    });

    return res.json({
      referral,
      followups,
      qrPayload
    });
  } catch (err) {
    console.error('Error fetching referral details:', err);
    return res.status(500).json({ error: 'Failed to retrieve referral details.' });
  }
});

// POST /api/referrals - create new referral
router.post('/', authenticateToken, (req, res) => {
  try {
    const {
      patient_id,
      facility_id,
      facility_name,
      referral_date,
      reason,
      urgency,
      instructions,
      follow_up_date,
      client_id // for offline support
    } = req.body;

    const errors = [];
    if (!patient_id) errors.push('Patient ID is required.');
    if (!facility_name) errors.push('Facility name is required.');
    if (!reason || !reason.trim()) errors.push('Reason for referral is required.');
    if (!urgency || !['routine', 'urgent', 'emergency'].includes(urgency)) {
      errors.push('Urgency must be routine, urgent, or emergency.');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    // Verify patient exists
    const patient = db.prepare('SELECT id, name FROM patients WHERE id = ?').get(patient_id);
    if (!patient) {
      return res.status(400).json({ error: 'Referenced patient does not exist.' });
    }

    const referralId = client_id && client_id.startsWith('REF-') ? client_id : generateReferralId();

    // Idempotency check for offline sync
    const existing = db.prepare('SELECT id FROM referrals WHERE id = ?').get(referralId);
    if (existing) {
      return res.status(200).json({
        message: 'Referral already exists (synced).',
        referral: db.prepare('SELECT * FROM referrals WHERE id = ?').get(referralId)
      });
    }

    const refDate = referral_date || new Date().toISOString().split('T')[0];

    const insert = db.prepare(`
      INSERT INTO referrals (
        id, patient_id, referring_worker_id, facility_id, facility_name,
        referral_date, reason, urgency, instructions, follow_up_date, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    insert.run(
      referralId,
      patient_id,
      req.user.id,
      facility_id || 'FAC-GEN-001',
      facility_name.trim(),
      refDate,
      reason.trim(),
      urgency,
      instructions ? instructions.trim() : null,
      follow_up_date || null
    );

    // If follow-up date was provided, create a follow-up item
    if (follow_up_date) {
      const fuId = `FU-${Date.now().toString().slice(-6)}`;
      db.prepare(`
        INSERT INTO followups (
          id, referral_id, patient_id, due_date, status, notes, worker_id
        ) VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `).run(
        fuId,
        referralId,
        patient_id,
        follow_up_date,
        `Follow-up for referral ${referralId} (${facility_name})`,
        req.user.id
      );
    }

    const created = db.prepare('SELECT * FROM referrals WHERE id = ?').get(referralId);
    return res.status(201).json({
      message: 'Referral created successfully.',
      referral: created
    });
  } catch (err) {
    console.error('Error creating referral:', err);
    return res.status(500).json({ error: 'Failed to create referral.' });
  }
});

// PATCH /api/referrals/:id/status - update status by authorized worker / PHC staff
router.patch('/:id/status', authenticateToken, (req, res) => {
  try {
    const referralId = req.params.id;
    const { status, status_notes } = req.body;

    const validStatuses = ['pending', 'completed', 'not_attended', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    const existing = db.prepare('SELECT * FROM referrals WHERE id = ?').get(referralId);
    if (!existing) {
      return res.status(404).json({ error: 'Referral record not found.' });
    }

    const update = db.prepare(`
      UPDATE referrals SET
        status = ?,
        status_notes = COALESCE(?, status_notes),
        updated_by = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    update.run(status, status_notes ? status_notes.trim() : null, req.user.id, referralId);

    // If referral is marked completed, update associated follow-ups if appropriate
    if (status === 'completed') {
      db.prepare(`
        UPDATE followups SET status = 'completed', completed_date = CURRENT_TIMESTAMP 
        WHERE referral_id = ? AND status = 'pending'
      `).run(referralId);
    } else if (status === 'not_attended') {
      db.prepare(`
        UPDATE followups SET status = 'missed' 
        WHERE referral_id = ? AND status = 'pending'
      `).run(referralId);
    }

    const updated = db.prepare('SELECT * FROM referrals WHERE id = ?').get(referralId);
    return res.json({
      message: `Referral status updated to ${status}.`,
      referral: updated
    });
  } catch (err) {
    console.error('Error updating referral status:', err);
    return res.status(500).json({ error: 'Failed to update referral status.' });
  }
});

module.exports = router;
