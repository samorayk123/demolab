const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { ah } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { genId } = require('../utils/ids');

const router = express.Router();

router.get('/', requireAuth, ah(async (req, res) => {
  const [rows] = await pool.query('SELECT id,name,email,address,phone,color,active,created_at FROM clinics');
  res.json(rows);
}));

router.get('/:id', requireAuth, ah(async (req, res) => {
  const [rows] = await pool.query('SELECT id,name,email,address,phone,color,active,created_at FROM clinics WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
  res.json(rows[0]);
}));

// Création — réservé à ADMIN, hache le mot de passe (identifiant de connexion de la clinique)
router.post('/', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  const { name, email, password, address, phone, color } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'name, email et password requis' });
  const id = genId('cl');
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO clinics (id,name,email,password_hash,address,phone,color) VALUES (?,?,?,?,?,?,?)',
    [id, name, email, hash, address || null, phone || null, color || '#0e7490']
  );
  res.status(201).json({ id, name, email, address, phone, color: color || '#0e7490', active: true });
}));

router.put('/:id', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  const fields = ['name', 'email', 'address', 'phone', 'color', 'active'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (req.body.password) {
    const hash = await bcrypt.hash(req.body.password, 10);
    await pool.query('UPDATE clinics SET password_hash=? WHERE id=?', [hash, req.params.id]);
  }
  if (updates.length) {
    const setClause = updates.map(f => `${f}=?`).join(', ');
    await pool.query(`UPDATE clinics SET ${setClause} WHERE id=?`, [...updates.map(f => req.body[f]), req.params.id]);
  }
  const [rows] = await pool.query('SELECT id,name,email,address,phone,color,active FROM clinics WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
  res.json(rows[0]);
}));

router.delete('/:id', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  await pool.query('UPDATE clinics SET active=FALSE WHERE id=?', [req.params.id]); // soft delete
  res.status(204).end();
}));

module.exports = router;
