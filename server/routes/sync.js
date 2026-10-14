const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

// POST /api/sync - Process queued offline operations idempotently
router.post('/', authenticateToken, (req, res) => {
  try {
    const { operations = [] } = req.body;
    if (!Array.isArray(operations) || operations.length === 0) {
      return res.json({ message: 'No operations to sync.', results: [] });
    }

    const results = [];

    const recordSync = db.prepare(`
      INSERT INTO sync_queue (id, operation, entity_type, entity_id, payload, client_timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET synced_at = CURRENT_TIMESTAMP
    `);

    for (const op of operations) {
      const { id: opId, type, entity_id, payload, client_timestamp } = op;
      try {
        if (type === 'create_patient') {
          const { id, name, age, dob, gender, village, preferred_language, contact, symptoms, duration, medical_history, vitals } = payload;
          const patientId = id || entity_id;

          const existing = db.prepare('SELECT id FROM patients WHERE id = ?').get(patientId);
          if (!existing) {
            db.prepare(`
              INSERT INTO patients (id, name, age, dob, gender, village, preferred_language, contact, symptoms, duration, medical_history, vitals, assigned_worker, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              patientId,
              name,
              age ? parseInt(age, 10) : null,
              dob || null,
              gender,
              village,
              preferred_language || 'ta',
              contact || null,
              symptoms,
              duration || null,
              medical_history || null,
              vitals || null,
              req.user.id,
              req.user.id
            );
            results.push({ opId, entity_id: patientId, status: 'created', message: 'Patient synced successfully' });
          } else {
            // Already exists - idempotent success
            results.push({ opId, entity_id: patientId, status: 'synced', message: 'Patient already existed, deduplicated' });
          }
        } else if (type === 'create_referral') {
          const { id, patient_id, facility_id, facility_name, referral_date, reason, urgency, instructions, follow_up_date } = payload;
          const referralId = id || entity_id;

          const existing = db.prepare('SELECT id FROM referrals WHERE id = ?').get(referralId);
          if (!existing) {
            db.prepare(`
              INSERT INTO referrals (id, patient_id, referring_worker_id, facility_id, facility_name, referral_date, reason, urgency, instructions, follow_up_date, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `).run(
              referralId,
              patient_id,
              req.user.id,
              facility_id || 'FAC-GEN-001',
              facility_name,
              referral_date || new Date().toISOString().split('T')[0],
              reason,
              urgency,
              instructions || null,
              follow_up_date || null
            );

            if (follow_up_date) {
              const fuId = `FU-${Date.now().toString().slice(-6)}`;
              db.prepare(`
                INSERT INTO followups (id, referral_id, patient_id, due_date, status, notes, worker_id)
                VALUES (?, ?, ?, ?, 'pending', ?, ?)
              `).run(fuId, referralId, patient_id, follow_up_date, `Offline-created follow up for ${referralId}`, req.user.id);
            }

            results.push({ opId, entity_id: referralId, status: 'created', message: 'Referral synced successfully' });
          } else {
            results.push({ opId, entity_id: referralId, status: 'synced', message: 'Referral already existed, deduplicated' });
          }
        } else if (type === 'update_referral_status') {
          const { referral_id, status, status_notes } = payload;
          const targetId = referral_id || entity_id;

          db.prepare(`
            UPDATE referrals SET
              status = ?,
              status_notes = COALESCE(?, status_notes),
              updated_by = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(status, status_notes || null, req.user.id, targetId);

          results.push({ opId, entity_id: targetId, status: 'updated', message: 'Referral status updated' });
        } else if (type === 'update_followup') {
          const { followup_id, status, notes, barriers, assistance_provided } = payload;
          const targetId = followup_id || entity_id;

          db.prepare(`
            UPDATE followups SET
              status = COALESCE(?, status),
              notes = COALESCE(?, notes),
              barriers = COALESCE(?, barriers),
              assistance_provided = COALESCE(?, assistance_provided),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(status || null, notes || null, barriers || null, assistance_provided || null, targetId);

          results.push({ opId, entity_id: targetId, status: 'updated', message: 'Follow-up updated' });
        } else {
          results.push({ opId, entity_id, status: 'ignored', message: 'Unknown operation type' });
        }

        // Record in sync queue table
        recordSync.run(
          opId || `SYNC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          type,
          type.split('_')[1] || 'entity',
          entity_id || 'unknown',
          JSON.stringify(payload),
          client_timestamp || new Date().toISOString()
        );
      } catch (opErr) {
        console.error(`Error syncing op ${opId}:`, opErr);
        results.push({ opId, entity_id, status: 'error', message: opErr.message });
      }
    }

    return res.json({
      message: `Sync completed: ${results.filter(r => r.status !== 'error').length} succeeded, ${results.filter(r => r.status === 'error').length} failed.`,
      results
    });
  } catch (err) {
    console.error('Fatal sync error:', err);
    return res.status(500).json({ error: 'Server failed to process synchronization batch.' });
  }
});

// GET /api/sync/status - Server health check for connectivity detection
router.get('/status', (req, res) => {
  return res.json({
    status: 'online',
    server_time: new Date().toISOString(),
    version: '1.0.0'
  });
});

module.exports = router;
