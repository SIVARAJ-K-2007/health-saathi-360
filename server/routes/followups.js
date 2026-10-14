const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

// GET /api/followups - retrieve followups categorized by upcoming, overdue, missed, completed
router.get('/', authenticateToken, (req, res) => {
  try {
    const { filter = 'all', status } = req.query;
    const today = new Date().toISOString().split('T')[0];

    let baseQuery = `
      SELECT f.*, p.name as patient_name, p.village as patient_village, p.contact as patient_contact,
             r.facility_name, r.urgency, r.reason as referral_reason,
             u.name as worker_name
      FROM followups f
      JOIN patients p ON f.patient_id = p.id
      JOIN referrals r ON f.referral_id = r.id
      LEFT JOIN users u ON f.worker_id = u.id
    `;

    let conditions = ['1=1'];
    let params = [];

    if (filter === 'upcoming') {
      conditions.push("f.status = 'pending'");
      conditions.push('f.due_date >= ?');
      params.push(today);
    } else if (filter === 'overdue') {
      conditions.push("f.status = 'pending'");
      conditions.push('f.due_date < ?');
      params.push(today);
    } else if (filter === 'missed') {
      conditions.push("f.status = 'missed'");
    } else if (filter === 'completed') {
      conditions.push("f.status = 'completed'");
    }

    if (status && status !== 'all') {
      conditions.push('f.status = ?');
      params.push(status);
    }

    const query = `${baseQuery} WHERE ${conditions.join(' AND ')} ORDER BY f.due_date ASC`;
    const followups = db.prepare(query).all(...params);

    // Also get quick summary counts
    const counts = {
      upcoming: db.prepare("SELECT COUNT(*) as count FROM followups WHERE status = 'pending' AND due_date >= ?").get(today).count,
      overdue: db.prepare("SELECT COUNT(*) as count FROM followups WHERE status = 'pending' AND due_date < ?").get(today).count,
      missed: db.prepare("SELECT COUNT(*) as count FROM followups WHERE status = 'missed'").get().count,
      completed: db.prepare("SELECT COUNT(*) as count FROM followups WHERE status = 'completed'").get().count
    };

    return res.json({
      followups,
      counts
    });
  } catch (err) {
    console.error('Error fetching follow-ups:', err);
    return res.status(500).json({ error: 'Failed to retrieve follow-up records.' });
  }
});

// POST /api/followups - create a new follow-up
router.post('/', authenticateToken, (req, res) => {
  try {
    const { referral_id, patient_id, due_date, notes } = req.body;

    if (!referral_id || !patient_id || !due_date) {
      return res.status(400).json({ error: 'Referral ID, Patient ID, and due date are required.' });
    }

    const fuId = `FU-${Date.now().toString().slice(-6)}`;
    const insert = db.prepare(`
      INSERT INTO followups (id, referral_id, patient_id, due_date, status, notes, worker_id)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `);

    insert.run(fuId, referral_id, patient_id, due_date, notes || '', req.user.id);

    const created = db.prepare('SELECT * FROM followups WHERE id = ?').get(fuId);
    return res.status(201).json({
      message: 'Follow-up scheduled successfully.',
      followup: created
    });
  } catch (err) {
    console.error('Error creating follow-up:', err);
    return res.status(500).json({ error: 'Failed to schedule follow-up.' });
  }
});

// PATCH /api/followups/:id - update follow-up outcome, barriers, and assistance
router.patch('/:id', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, barriers, assistance_provided } = req.body;

    const existing = db.prepare('SELECT * FROM followups WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Follow-up record not found.' });
    }

    const completedDate = status === 'completed' ? new Date().toISOString().split('T')[0] : existing.completed_date;

    const update = db.prepare(`
      UPDATE followups SET
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        barriers = COALESCE(?, barriers),
        assistance_provided = COALESCE(?, assistance_provided),
        completed_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    update.run(status || null, notes || null, barriers || null, assistance_provided || null, completedDate, id);

    const updated = db.prepare('SELECT * FROM followups WHERE id = ?').get(id);
    return res.json({
      message: 'Follow-up record updated.',
      followup: updated
    });
  } catch (err) {
    console.error('Error updating follow-up:', err);
    return res.status(500).json({ error: 'Failed to update follow-up record.' });
  }
});

module.exports = router;
