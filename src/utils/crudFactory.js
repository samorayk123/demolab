const express = require('express');
const pool = require('../config/db');
const { ah } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { genId } = require('./ids');

// Génère un routeur CRUD standard pour une table simple (pas de relations complexes).
// options: { table, idPrefix, allowedFields: [...], readRoles: [...]|null, writeRoles: [...]|null,
//            orderBy: 'colonne' }
// readRoles/writeRoles = null => accessible à tout utilisateur authentifié.
function crudFactory({ table, idPrefix = '', allowedFields, readRoles = null, writeRoles = null, orderBy = null }) {
  const router = express.Router();
  const readGuard = readRoles ? [requireAuth, requireRole(...readRoles)] : [requireAuth];
  const writeGuard = writeRoles ? [requireAuth, requireRole(...writeRoles)] : [requireAuth];

  router.get('/', ...readGuard, ah(async (req, res) => {
    const order = orderBy ? ` ORDER BY ${orderBy}` : '';
    const [rows] = await pool.query(`SELECT * FROM ${table}${order}`);
    res.json(rows);
  }));

  router.get('/:id', ...readGuard, ah(async (req, res) => {
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
    res.json(rows[0]);
  }));

  router.post('/', ...writeGuard, ah(async (req, res) => {
    const id = req.body.id || genId(idPrefix);
    const fields = allowedFields.filter(f => req.body[f] !== undefined);
    const cols = ['id', ...fields];
    const vals = [id, ...fields.map(f => req.body[f])];
    const placeholders = cols.map(() => '?').join(',');
    await pool.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, vals);
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    res.status(201).json(rows[0]);
  }));

  router.put('/:id', ...writeGuard, ah(async (req, res) => {
    const fields = allowedFields.filter(f => req.body[f] !== undefined);
    if (!fields.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const vals = fields.map(f => req.body[f]);
    await pool.query(`UPDATE ${table} SET ${setClause} WHERE id = ?`, [...vals, req.params.id]);
    const [rows] = await pool.query(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Introuvable' });
    res.json(rows[0]);
  }));

  router.delete('/:id', ...writeGuard, ah(async (req, res) => {
    const [result] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Introuvable' });
    res.status(204).end();
  }));

  return router;
}

module.exports = { crudFactory };
