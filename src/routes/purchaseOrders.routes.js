const express = require('express');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { ah } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { genId } = require('../utils/ids');
const { uploader, UPLOAD_ROOT } = require('../config/upload');

const router = express.Router();
const upload = uploader('po');

async function fetchFullPO(id) {
  const [[po]] = await pool.query('SELECT * FROM purchase_orders WHERE id=?', [id]);
  if (!po) return null;
  const [items] = await pool.query('SELECT * FROM po_items WHERE po_id=?', [id]);
  const [payments] = await pool.query('SELECT * FROM po_payments WHERE po_id=? ORDER BY date', [id]);
  const [attachments] = await pool.query('SELECT * FROM po_attachments WHERE po_id=?', [id]);
  return { ...po, items, payments, attachments };
}

router.get('/', requireAuth, ah(async (req, res) => {
  const { status, supplierId } = req.query;
  let sql = 'SELECT * FROM purchase_orders WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (supplierId) { sql += ' AND supplier_id=?'; params.push(supplierId); }
  sql += ' ORDER BY order_date DESC';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));

router.get('/:id', requireAuth, ah(async (req, res) => {
  const full = await fetchFullPO(req.params.id);
  if (!full) return res.status(404).json({ error: 'Bon de commande introuvable' });
  res.json(full);
}));

// POST /api/purchase-orders — { poNum, supplierId, orderDate, expectedDate, items:[{materialId,name,category,qty,unit,unitPrice,discountPct,taxPct}], shipping, notes }
router.post('/', requireAuth, ah(async (req, res) => {
  const { poNum, supplierId, orderDate, expectedDate, items, shipping, notes } = req.body;
  if (!poNum || !supplierId || !orderDate || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'poNum, supplierId, orderDate et items sont requis' });
  }
  const id = genId('o');
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO purchase_orders (id,po_num,supplier_id,order_date,expected_date,status,payment_status,shipping,notes)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, poNum, supplierId, orderDate, expectedDate||null, 'DRAFT', 'UNPAID', shipping||0, notes||null]
    );
    const itemRows = items.map(it => [
      genId('it'), id, it.materialId||null, it.name, it.category||null,
      it.qty||1, 0, it.unit||null, it.unitPrice||0, it.discountPct||0, it.taxPct||0
    ]);
    await conn.query(
      `INSERT INTO po_items (id,po_id,material_id,name,category,qty,received,unit,unit_price,discount_pct,tax_pct) VALUES ?`,
      [itemRows]
    );
    await conn.commit();
    res.status(201).json(await fetchFullPO(id));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// PUT /api/purchase-orders/:id — met à jour les champs généraux + remplace la liste d'articles
// (seuls les articles pas encore reçus peuvent être librement modifiés côté métier ; on ne
// bloque pas ici pour rester simple, à surveiller côté frontend)
router.put('/:id', requireAuth, ah(async (req, res) => {
  const { supplierId, orderDate, expectedDate, status, paymentStatus, shipping, notes, items } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const fields = [];
    const vals = [];
    if (supplierId !== undefined) { fields.push('supplier_id=?'); vals.push(supplierId); }
    if (orderDate !== undefined) { fields.push('order_date=?'); vals.push(orderDate); }
    if (expectedDate !== undefined) { fields.push('expected_date=?'); vals.push(expectedDate); }
    if (status !== undefined) { fields.push('status=?'); vals.push(status); }
    if (paymentStatus !== undefined) { fields.push('payment_status=?'); vals.push(paymentStatus); }
    if (shipping !== undefined) { fields.push('shipping=?'); vals.push(shipping); }
    if (notes !== undefined) { fields.push('notes=?'); vals.push(notes); }
    if (fields.length) {
      await conn.query(`UPDATE purchase_orders SET ${fields.join(', ')} WHERE id=?`, [...vals, req.params.id]);
    }
    if (Array.isArray(items)) {
      // Remplace entièrement les articles — les quantités déjà reçues (received) sont perdues
      // si l'article correspondant est retiré ; à utiliser seulement avant toute réception.
      await conn.query('DELETE FROM po_items WHERE po_id=?', [req.params.id]);
      if (items.length) {
        const itemRows = items.map(it => [
          it.id && it.id.length < 20 ? it.id : genId('it'), req.params.id, it.materialId || null, it.name, it.category || null,
          it.qty || 1, it.received || 0, it.unit || null, it.unitPrice || 0, it.discountPct || 0, it.taxPct || 0
        ]);
        await conn.query(
          `INSERT INTO po_items (id,po_id,material_id,name,category,qty,received,unit,unit_price,discount_pct,tax_pct) VALUES ?`,
          [itemRows]
        );
      }
    }
    await conn.commit();
    res.json(await fetchFullPO(req.params.id));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// PATCH /api/purchase-orders/:id/status — change le statut (workflow d'approbation/envoi)
router.patch('/:id/status', requireAuth, ah(async (req, res) => {
  const { status } = req.body;
  const valid = ['DRAFT','PENDING_APPROVAL','APPROVED','SENT','PARTIAL','RECEIVED','CANCELLED'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  await pool.query('UPDATE purchase_orders SET status=? WHERE id=?', [status, req.params.id]);
  res.json(await fetchFullPO(req.params.id));
}));

// POST /api/purchase-orders/:id/receive — { receipts: [{itemId, qtyReceived}] }
// Réceptionne des quantités : met à jour po_items.received, le stock du matériau lié,
// et le statut global de la commande (PARTIAL ou RECEIVED).
router.post('/:id/receive', requireAuth, ah(async (req, res) => {
  const { receipts } = req.body;
  if (!Array.isArray(receipts) || !receipts.length) return res.status(400).json({ error: 'receipts requis' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [items] = await conn.query('SELECT * FROM po_items WHERE po_id=? FOR UPDATE', [req.params.id]);
    const itemMap = Object.fromEntries(items.map(it => [it.id, it]));
    const today = new Date().toISOString().slice(0,10);

    for (const r of receipts) {
      const item = itemMap[r.itemId];
      if (!item) continue;
      const newReceived = Number(item.received) + Number(r.qtyReceived);
      await conn.query('UPDATE po_items SET received=? WHERE id=?', [newReceived, r.itemId]);
      if (item.material_id) {
        await conn.query('UPDATE materials SET stock = stock + ? WHERE id=?', [r.qtyReceived, item.material_id]);
        await conn.query(
          'INSERT INTO stock_movements (id,material_id,type,qty,date,reason,ref,performed_by) VALUES (?,?,?,?,?,?,?,?)',
          [require('../utils/ids').genId('sm'), item.material_id, 'IN', r.qtyReceived, today, 'Réception commande', req.params.id, req.user.id]
        );
      }
    }

    const [freshItems] = await conn.query('SELECT * FROM po_items WHERE po_id=?', [req.params.id]);
    const fullyReceived = freshItems.every(it => Number(it.received) >= Number(it.qty));
    const partiallyReceived = freshItems.some(it => Number(it.received) > 0);
    const newStatus = fullyReceived ? 'RECEIVED' : (partiallyReceived ? 'PARTIAL' : 'SENT');
    await conn.query(
      `UPDATE purchase_orders SET status=?${fullyReceived ? ', received_date=?' : ''} WHERE id=?`,
      fullyReceived ? [newStatus, today, req.params.id] : [newStatus, req.params.id]
    );

    await conn.commit();
    res.json(await fetchFullPO(req.params.id));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// POST /api/purchase-orders/:id/payments
router.post('/:id/payments', requireAuth, ah(async (req, res) => {
  const { amount, date, method } = req.body;
  if (!amount || !date) return res.status(400).json({ error: 'amount et date requis' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[po]] = await conn.query('SELECT * FROM purchase_orders WHERE id=? FOR UPDATE', [req.params.id]);
    if (!po) { await conn.rollback(); return res.status(404).json({ error: 'Introuvable' }); }
    await conn.query('INSERT INTO po_payments (id,po_id,amount,date,method) VALUES (?,?,?,?,?)', [genId('pop'), req.params.id, amount, date, method||null]);
    const newPaid = Number(po.paid_amount) + Number(amount);
    // total approximatif = somme items + shipping (le calcul précis avec remises/taxes se fait côté client ou via une vue dédiée)
    await conn.query('UPDATE purchase_orders SET paid_amount=? WHERE id=?', [newPaid, req.params.id]);
    await conn.commit();
    res.json(await fetchFullPO(req.params.id));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// POST /api/purchase-orders/:id/attachments — upload d'un fichier (multipart/form-data)
// Champs: file (le fichier), kind (QUOTATION|INVOICE|DELIVERY_NOTE)
router.post('/:id/attachments', requireAuth, upload.single('file'), ah(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' });
  const kind = ['QUOTATION','INVOICE','DELIVERY_NOTE'].includes(req.body.kind) ? req.body.kind : 'QUOTATION';
  const id = genId('poa');
  const filePath = path.join('po', req.params.id, req.file.filename).replace(/\\/g, '/');
  await pool.query(
    'INSERT INTO po_attachments (id,po_id,kind,file_name,file_path) VALUES (?,?,?,?,?)',
    [id, req.params.id, kind, req.file.originalname, filePath]
  );
  res.status(201).json({ id, kind, fileName: req.file.originalname, url: '/uploads/' + filePath });
}));

// DELETE /api/purchase-orders/:id/attachments/:attId
router.delete('/:id/attachments/:attId', requireAuth, ah(async (req, res) => {
  const [[att]] = await pool.query('SELECT * FROM po_attachments WHERE id=? AND po_id=?', [req.params.attId, req.params.id]);
  if (!att) return res.status(404).json({ error: 'Introuvable' });
  await pool.query('DELETE FROM po_attachments WHERE id=?', [req.params.attId]);
  const abs = path.join(UPLOAD_ROOT, att.file_path);
  fs.unlink(abs, () => {}); // best-effort — on ne bloque pas la réponse si le fichier est déjà absent
  res.status(204).end();
}));

module.exports = router;
