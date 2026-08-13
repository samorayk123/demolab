const express = require('express');
const pool = require('../config/db');
const { ah } = require('../middleware/errorHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const { genId } = require('../utils/ids');

const router = express.Router();

async function fetchFullInvoice(id) {
  const [[inv]] = await pool.query('SELECT * FROM invoices WHERE id=?', [id]);
  if (!inv) return null;
  const [cases] = await pool.query('SELECT case_id FROM invoice_cases WHERE invoice_id=?', [id]);
  const [payments] = await pool.query('SELECT * FROM invoice_payments WHERE invoice_id=? ORDER BY date', [id]);
  return { ...inv, caseIds: cases.map(c => c.case_id), payments };
}

router.get('/', requireAuth, ah(async (req, res) => {
  const { status, docId } = req.query;
  let sql = 'SELECT * FROM invoices WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (docId) { sql += ' AND doctor_id=?'; params.push(docId); }
  sql += ' ORDER BY date DESC';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));

router.get('/:id', requireAuth, ah(async (req, res) => {
  const full = await fetchFullInvoice(req.params.id);
  if (!full) return res.status(404).json({ error: 'Facture introuvable' });
  res.json(full);
}));

// POST /api/invoices — { num, doctorId, caseIds:[...], total, date }
router.post('/', requireAuth, ah(async (req, res) => {
  const { num, doctorId, caseIds, total, date } = req.body;
  if (!num || !doctorId || !total || !date) return res.status(400).json({ error: 'Champs requis manquants' });
  const id = genId('i');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      'INSERT INTO invoices (id,num,doctor_id,total,paid,status,date) VALUES (?,?,?,?,0,?,?)',
      [id, num, doctorId, total, 'UNPAID', date]
    );
    if (Array.isArray(caseIds) && caseIds.length) {
      await conn.query('INSERT INTO invoice_cases (invoice_id, case_id) VALUES ?', [caseIds.map(cid => [id, cid])]);
    }
    await conn.commit();
    res.status(201).json(await fetchFullInvoice(id));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// POST /api/invoices/:id/payments — enregistre un paiement et recalcule le statut
router.post('/:id/payments', requireAuth, ah(async (req, res) => {
  const { amount, date, method } = req.body;
  if (!amount || !date) return res.status(400).json({ error: 'amount et date requis' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[inv]] = await conn.query('SELECT * FROM invoices WHERE id=? FOR UPDATE', [req.params.id]);
    if (!inv) { await conn.rollback(); return res.status(404).json({ error: 'Facture introuvable' }); }

    const payId = genId('pay');
    await conn.query(
      'INSERT INTO invoice_payments (id,invoice_id,amount,date,method,recorded_by) VALUES (?,?,?,?,?,?)',
      [payId, req.params.id, amount, date, method||null, req.user.id]
    );
    const newPaid = Number(inv.paid) + Number(amount);
    const status = newPaid >= Number(inv.total) ? 'PAID' : (newPaid > 0 ? 'PARTIAL' : 'UNPAID');
    const paidDate = status === 'PAID' ? date : inv.paid_date;
    await conn.query('UPDATE invoices SET paid=?, status=?, paid_date=? WHERE id=?', [newPaid, status, paidDate, req.params.id]);

    await conn.commit();
    res.status(201).json(await fetchFullInvoice(req.params.id));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// PUT /api/invoices/:id — édition directe (date, statut, paiement) réservée à ADMIN.
// À utiliser avec prudence : ce n'est pas le flux normal de paiement (POST /:id/payments),
// c'est un correctif manuel (ex: erreur de saisie, régularisation).
router.put('/:id', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  const { date, status, paid, paidDate } = req.body;
  const fields = [];
  const vals = [];
  if (date !== undefined) { fields.push('date=?'); vals.push(date); }
  if (status !== undefined) { fields.push('status=?'); vals.push(status); }
  if (paid !== undefined) { fields.push('paid=?'); vals.push(paid); }
  if (paidDate !== undefined) { fields.push('paid_date=?'); vals.push(paidDate); }
  if (!fields.length) return res.status(400).json({ error: 'Rien à mettre à jour' });
  await pool.query(`UPDATE invoices SET ${fields.join(', ')} WHERE id=?`, [...vals, req.params.id]);
  const full = await fetchFullInvoice(req.params.id);
  if (!full) return res.status(404).json({ error: 'Facture introuvable' });
  res.json(full);
}));

router.delete('/:id', requireAuth, ah(async (req, res) => {
  const [result] = await pool.query('DELETE FROM invoices WHERE id=?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Introuvable' });
  res.status(204).end();
}));

module.exports = router;
