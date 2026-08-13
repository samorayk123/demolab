const express = require('express');
const pool = require('../config/db');
const { ah } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, ah(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM settings WHERE id=1');
  res.json(rows[0] || {});
}));

router.put('/', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  const fields = ['lang','currency','currency_symbol','font_size','theme','primary_color','company_name',
    'company_phone','company_address','company_nif','company_nis','company_ai','company_rc','logo_path',
    'date_format','time_format','timezone','fiscal_year_start'];
  const updates = fields.filter(f => req.body[f] !== undefined);
  if (!updates.length) return res.status(400).json({ error: 'Rien à mettre à jour' });
  const setClause = updates.map(f => `${f}=?`).join(', ');
  await pool.query(`UPDATE settings SET ${setClause} WHERE id=1`, updates.map(f => req.body[f]));
  const [rows] = await pool.query('SELECT * FROM settings WHERE id=1');
  res.json(rows[0]);
}));

module.exports = router;
