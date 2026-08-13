const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { ah } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function sign(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

// POST /api/auth/login  { email, password }
// Cherche d'abord dans users (labo), puis dans clinics (compte clinique).
router.post('/login', ah(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const [users] = await pool.query('SELECT * FROM users WHERE email = ? AND active = TRUE', [email]);
  if (users.length) {
    const u = users[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = sign({ id: u.id, role: u.role, name: u.name, accountType: 'USER' });
    delete u.password_hash;
    return res.json({ token, account: { ...u, accountType: 'USER' } });
  }

  const [clinics] = await pool.query('SELECT * FROM clinics WHERE email = ? AND active = TRUE', [email]);
  if (clinics.length) {
    const c = clinics[0];
    const ok = await bcrypt.compare(password, c.password_hash);
    if (!ok) return res.status(401).json({ error: 'Identifiants incorrects' });
    const token = sign({ id: c.id, role: 'CLINIC', name: c.name, accountType: 'CLINIC' });
    delete c.password_hash;
    return res.json({ token, account: { ...c, role: 'CLINIC', accountType: 'CLINIC' } });
  }

  return res.status(401).json({ error: 'Identifiants incorrects' });
}));

// GET /api/auth/me — vérifie le token courant et renvoie l'utilisateur
router.get('/me', requireAuth, ah(async (req, res) => {
  const table = req.user.accountType === 'CLINIC' ? 'clinics' : 'users';
  const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Compte introuvable' });
  const account = rows[0];
  delete account.password_hash;
  res.json({ account: { ...account, accountType: req.user.accountType, role: req.user.role } });
}));

module.exports = router;
