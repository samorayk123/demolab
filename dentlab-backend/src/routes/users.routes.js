const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { ah } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { genId } = require('../utils/ids');

const router = express.Router();

// Liste du personnel labo (sans le hash de mot de passe)
router.get('/', requireAuth, ah(async (req, res) => {
  const [rows] = await pool.query('SELECT id,name,email,role,spec,color,rate,active,created_at FROM users');
  res.json(rows);
}));

router.get('/:id', requireAuth, ah(async (req, res) => {
  const [rows] = await pool.query('SELECT id,name,email,role,spec,color,rate,active,created_at FROM users WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
  // Étapes accessibles pour un technicien
  const [access] = await pool.query('SELECT stage_id FROM user_stage_access WHERE user_id=?', [req.params.id]);
  res.json({ ...rows[0], stageAccess: access.map(a => a.stage_id) });
}));

// Création — réservé à ADMIN (crée aussi les accès aux étapes pour un technicien)
router.post('/', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  const { name, email, password, role, spec, color, rate, stageAccess } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Champs requis manquants' });
  const id = genId(role === 'TECHNICIAN' ? 't' : 'u');
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (id,name,email,password_hash,role,spec,color,rate) VALUES (?,?,?,?,?,?,?,?)',
    [id, name, email, hash, role, spec || null, color || '#1a56db', rate || 0]
  );
  if (Array.isArray(stageAccess) && stageAccess.length) {
    const vals = stageAccess.map(s => [id, s]);
    await pool.query('INSERT INTO user_stage_access (user_id, stage_id) VALUES ?', [vals]);
  }
  res.status(201).json({ id });
}));

// Mise à jour — ADMIN, ou l'utilisateur lui-même pour son propre profil (hors rôle)
router.put('/:id', requireAuth, ah(async (req, res) => {
  const isSelf = req.user.id === req.params.id;
  if (req.user.role !== 'ADMIN' && !isSelf) return res.status(403).json({ error: 'Accès refusé' });

  const fields = ['name','spec','color','rate'];
  if (req.user.role === 'ADMIN') fields.push('role','active');
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (req.body.password) {
    const hash = await bcrypt.hash(req.body.password, 10);
    await pool.query('UPDATE users SET password_hash=? WHERE id=?', [hash, req.params.id]);
  }
  if (updates.length) {
    const setClause = updates.map(f => `${f}=?`).join(', ');
    await pool.query(`UPDATE users SET ${setClause} WHERE id=?`, [...updates.map(f => req.body[f]), req.params.id]);
  }
  if (req.user.role === 'ADMIN' && Array.isArray(req.body.stageAccess)) {
    await pool.query('DELETE FROM user_stage_access WHERE user_id=?', [req.params.id]);
    if (req.body.stageAccess.length) {
      const vals = req.body.stageAccess.map(s => [req.params.id, s]);
      await pool.query('INSERT INTO user_stage_access (user_id, stage_id) VALUES ?', [vals]);
    }
  }
  res.json({ ok: true });
}));

router.delete('/:id', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  await pool.query('UPDATE users SET active=FALSE WHERE id=?', [req.params.id]); // soft delete
  res.status(204).end();
}));

module.exports = router;
