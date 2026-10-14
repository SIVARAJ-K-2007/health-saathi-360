const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken, requireRole } = require('../middleware/auth');

// GET /api/stats/dashboard - General summary statistics for regular users & ASHA
router.get('/dashboard', authenticateToken, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const totalPatients = db.prepare('SELECT COUNT(*) as count FROM patients').get().count;
    const pendingReferrals = db.prepare("SELECT COUNT(*) as count FROM referrals WHERE status = 'pending'").get().count;
    const completedReferrals = db.prepare("SELECT COUNT(*) as count FROM referrals WHERE status = 'completed'").get().count;
    const followupsDue = db.prepare("SELECT COUNT(*) as count FROM followups WHERE status = 'pending' AND due_date <= ?").get(today).count;
    const missedAppointments = db.prepare("SELECT COUNT(*) as count FROM followups WHERE status = 'missed'").get().count;

    // Distribution of referrals by status
    const statusDistribution = db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM referrals 
      GROUP BY status
    `).all();

    // Distribution of referrals by urgency
    const urgencyDistribution = db.prepare(`
      SELECT urgency, COUNT(*) as count 
      FROM referrals 
      GROUP BY urgency
    `).all();

    // Recent 5 patient activities
    const recentPatients = db.prepare(`
      SELECT id, name, village, created_at, symptoms 
      FROM patients 
      ORDER BY created_at DESC 
      LIMIT 5
    `).all();

    // Recent 5 referrals
    const recentReferrals = db.prepare(`
      SELECT r.id, r.patient_id, p.name as patient_name, r.facility_name, r.status, r.urgency, r.referral_date 
      FROM referrals r
      JOIN patients p ON r.patient_id = p.id
      ORDER BY r.referral_date DESC, r.created_at DESC 
      LIMIT 5
    `).all();

    return res.json({
      summary: {
        totalPatients,
        pendingReferrals,
        completedReferrals,
        followupsDue,
        missedAppointments
      },
      statusDistribution,
      urgencyDistribution,
      recentPatients,
      recentReferrals
    });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    return res.status(500).json({ error: 'Failed to retrieve dashboard statistics.' });
  }
});

// GET /api/stats/admin - Aggregated administrative metrics without exposing individual PHI
router.get('/admin', authenticateToken, requireRole('admin', 'phc_staff'), (req, res) => {
  try {
    const totalReferrals = db.prepare('SELECT COUNT(*) as count FROM referrals').get().count;
    const completedReferrals = db.prepare("SELECT COUNT(*) as count FROM referrals WHERE status = 'completed'").get().count;
    const completionRate = totalReferrals > 0 ? Math.round((completedReferrals / totalReferrals) * 100) : 0;

    // Facility usage distribution
    const facilityUsage = db.prepare(`
      SELECT facility_name, COUNT(*) as referral_count,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
      FROM referrals
      GROUP BY facility_name
      ORDER BY referral_count DESC
    `).all();

    // Localities with barriers / missed follow-ups
    const localityBarriers = db.prepare(`
      SELECT p.village, 
             COUNT(f.id) as total_followups,
             SUM(CASE WHEN f.status = 'missed' THEN 1 ELSE 0 END) as missed_count,
             GROUP_CONCAT(DISTINCT f.barriers) as common_barriers
      FROM patients p
      JOIN followups f ON p.id = f.patient_id
      GROUP BY p.village
      ORDER BY missed_count DESC
    `).all();

    // Referral urgency breakdown
    const urgencyBreakdown = db.prepare(`
      SELECT urgency, COUNT(*) as count,
             SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count
      FROM referrals
      GROUP BY urgency
    `).all();

    return res.json({
      metrics: {
        totalReferrals,
        completedReferrals,
        completionRate: `${completionRate}%`,
        activeFacilitiesCount: facilityUsage.length
      },
      facilityUsage,
      localityBarriers,
      urgencyBreakdown
    });
  } catch (err) {
    console.error('Error fetching admin metrics:', err);
    return res.status(500).json({ error: 'Failed to retrieve administrative analytics.' });
  }
});

module.exports = router;
