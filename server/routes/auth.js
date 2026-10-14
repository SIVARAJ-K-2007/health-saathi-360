const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { authenticateToken, JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials. Please check username and password.' });
    }

    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials. Please check username and password.' });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        facility: user.facility
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        facility: user.facility
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
});

// POST /api/auth/register - Register a new health worker / staff member
router.post('/register', (req, res) => {
  try {
    const { name, username, password, role, facility } = req.body;

    const errors = [];
    if (!name || !name.trim()) errors.push('Full name is required.');
    if (!username || !username.trim()) errors.push('Username is required.');
    if (!password || password.length < 6) errors.push('Password must be at least 6 characters.');
    
    const validRoles = ['asha_worker', 'phc_staff', 'admin'];
    if (!role || !validRoles.includes(role)) {
      errors.push('Valid role is required (asha_worker, phc_staff, or admin).');
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' ') });
    }

    const cleanUsername = username.trim().toLowerCase();

    // Check if username is already taken
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      return res.status(409).json({ error: 'This username is already taken. Please choose another username.' });
    }

    const userId = `USR-${Date.now().toString().slice(-5)}`;
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const userFacility = facility && facility.trim() ? facility.trim() : 'Primary Health Centre';

    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, name, facility)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, cleanUsername, passwordHash, role, name.trim(), userFacility);

    // Issue JWT token so new user is signed in immediately
    const token = jwt.sign(
      {
        id: userId,
        username: cleanUsername,
        role: role,
        name: name.trim(),
        facility: userFacility
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.status(201).json({
      message: 'Account registered successfully! Welcome to Health Saathi 360.',
      token,
      user: {
        id: userId,
        username: cleanUsername,
        role: role,
        name: name.trim(),
        facility: userFacility
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Failed to create user account. Please try again.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  return res.json({ user: req.user });
});

// GET /api/auth/demo-accounts
router.get('/demo-accounts', (req, res) => {
  const users = db.prepare('SELECT id, username, role, name, facility FROM users').all();
  const demoAccounts = users.map(u => ({
    ...u,
    password: u.role === 'admin' ? 'Admin@5678' : 'Demo@1234'
  }));
  return res.json({ demoAccounts });
});

module.exports = router;
