const express = require('express');
const path = require('path');
const cors = require('cors');
require('./database'); // Ensures DB and schema are initialized

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const referralRoutes = require('./routes/referrals');
const facilityRoutes = require('./routes/facilities');
const followupRoutes = require('./routes/followups');
const statsRoutes = require('./routes/stats');
const syncRoutes = require('./routes/sync');

const app = express();
const PORT = process.env.PORT || 3000;

// Security and utility middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Standard security headers without heavy external deps
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Static assets and Frontend SPA Shell
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/referrals', referralRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/followups', followupRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/sync', syncRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'Health Saathi 360',
    mode: 'offline-first',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Single Page Application fallback: any non-API route returns index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]:', err);
  res.status(500).json({
    error: 'An unexpected internal error occurred on the server.',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🏥 Health Saathi 360 - Offline-First Healthcare Platform`);
  console.log(`📡 Server running at: http://localhost:${PORT}`);
  console.log(`📱 Access from local network: http://0.0.0.0:${PORT}`);
  console.log(`======================================================`);
  console.log(`Demo Logins:`);
  console.log(`  1) ASHA Worker : asha_meena / Demo@1234`);
  console.log(`  2) PHC Staff   : phc_ravi   / Demo@1234`);
  console.log(`  3) Admin       : admin      / Admin@5678`);
  console.log(`======================================================\n`);
});

module.exports = server;
