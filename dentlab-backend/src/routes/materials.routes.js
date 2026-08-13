const express = require('express');
const pool = require('../config/db');
const { ah } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { genId } = require('../utils/ids');

const router = express.Router();

router.get('/', requireAuth, ah(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM materials ORDER BY name');
  res.json(rows);
}));

router.get('/:id', requireAuth, ah(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM materials WHERE id=?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
  res.json(rows[0]);
}));

router.get('/:id/movements', requireAuth, ah(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM stock_movements WHERE material_id=? ORDER BY date DESC', [req.params.id]);
  res.json(rows);
}));

router.post('/', requireAuth, ah(async (req, res) => {
  const { code, name, category, unit, stock, minStock, cost } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'code et name requis' });
  const id = genId('m');
  await pool.query(
    'INSERT INTO materials (id,code,name,category,unit,stock,min_stock,cost) VALUES (?,?,?,?,?,?,?,?)',
    [id, code, name, category||null, unit||null, stock||0, minStock||0, cost||0]
  );
  res.status(201).json({ id });
}));

router.put('/:id', requireAuth, ah(async (req, res) => {
  const fields = { code:'code', name:'name', category:'category', unit:'unit', minStock:'min_stock', cost:'cost', active:'active' };
  const updates = []; const vals = [];
  for (const [key, col] of Object.entries(fields)) {
    if (req.body[key] !== undefined) { updates.push(`${col}=?`); vals.push(req.body[key]); }
  }
  if (!updates.length) return res.status(400).json({ error: 'Rien à mettre à jour' });
  await pool.query(`UPDATE materials SET ${updates.join(', ')} WHERE id=?`, [...vals, req.params.id]);
  const [rows] = await pool.query('SELECT * FROM materials WHERE id=?', [req.params.id]);
  res.json(rows[0]);
}));

// POST /api/materials/:id/movements — { type: IN|OUT, qty, reason, ref, date }
// Enregistre le mouvement ET ajuste le stock en une transaction, avec verrou pour éviter les races.
router.post('/:id/movements', requireAuth, ah(async (req, res) => {
  const { type, qty, reason, ref, date } = req.body;
  if (!['IN','OUT'].includes(type) || !qty) return res.status(400).json({ error: 'type (IN/OUT) et qty requis' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[mat]] = await conn.query('SELECT * FROM materials WHERE id=? FOR UPDATE', [req.params.id]);
    if (!mat) { await conn.rollback(); return res.status(404).json({ error: 'Matériau introuvable' }); }

    const newStock = type === 'IN' ? Number(mat.stock) + Number(qty) : Number(mat.stock) - Number(qty);
    if (newStock < 0) { await conn.rollback(); return res.status(400).json({ error: 'Stock insuffisant' }); }

    const movId = genId('sm');
    await conn.query(
      'INSERT INTO stock_movements (id,material_id,type,qty,date,reason,ref,performed_by) VALUES (?,?,?,?,?,?,?,?)',
      [movId, req.params.id, type, qty, date || new Date().toISOString().slice(0,10), reason||null, ref||null, req.user.id]
    );
    await conn.query('UPDATE materials SET stock=? WHERE id=?', [newStock, req.params.id]);

    await conn.commit();
    res.status(201).json({ id: movId, newStock });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

module.exports = router;
