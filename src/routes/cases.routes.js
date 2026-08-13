const express = require('express');
const pool = require('../config/db');
const { ah } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { genId } = require('../utils/ids');

const router = express.Router();

const STAGES = ['RECEIVED','DESIGN','MILLING','SINTERING','FINISHING','MAQUILLAGE','QC','READY','DELIVERED'];

// Recharge un dossier complet (dents, workflow, commentaires) — utilisé après create/update
async function fetchFullCase(id) {
  const [[c]] = await pool.query('SELECT * FROM cases WHERE id=?', [id]);
  if (!c) return null;
  const [teeth] = await pool.query('SELECT tooth FROM case_teeth WHERE case_id=?', [id]);
  const [wf] = await pool.query('SELECT * FROM case_workflow_steps WHERE case_id=? ORDER BY step_order', [id]);
  const [comments] = await pool.query('SELECT * FROM case_comments WHERE case_id=? ORDER BY created_at', [id]);
  const [attachments] = await pool.query('SELECT * FROM case_attachments WHERE case_id=?', [id]);
  return { ...c, teeth: teeth.map(t => t.tooth), workflow: wf, comments, attachments };
}

// GET /api/cases — liste avec filtres optionnels (?status=&docId=&techId=)
router.get('/', requireAuth, ah(async (req, res) => {
  const { status, docId, techId, search } = req.query;
  let sql = 'SELECT * FROM cases WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status=?'; params.push(status); }
  if (docId) { sql += ' AND doctor_id=?'; params.push(docId); }
  if (techId) { sql += ' AND tech_id=?'; params.push(techId); }
  if (search) { sql += ' AND (num LIKE ? OR patient_first LIKE ? OR patient_last LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
  sql += ' ORDER BY created_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json(rows);
}));

router.get('/:id', requireAuth, ah(async (req, res) => {
  const full = await fetchFullCase(req.params.id);
  if (!full) return res.status(404).json({ error: 'Dossier introuvable' });
  res.json(full);
}));

// POST /api/cases — crée un dossier + initialise le workflow complet à partir de stage_defs
router.post('/', requireAuth, ah(async (req, res) => {
  const { num, patientFirst, patientLast, doctorId, restoTypeId, shade, priority, dueDate, techId, notes, teeth } = req.body;
  if (!num || !doctorId || !restoTypeId) return res.status(400).json({ error: 'num, doctorId et restoTypeId sont requis' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const id = genId('c');
    await conn.query(
      `INSERT INTO cases (id,num,patient_first,patient_last,doctor_id,resto_type_id,shade,priority,status,due_date,tech_id,notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, num, patientFirst||null, patientLast||null, doctorId, restoTypeId, shade||null, priority||'NORMAL', 'RECEIVED', dueDate||null, techId||null, notes||null]
    );
    if (Array.isArray(teeth) && teeth.length) {
      await conn.query('INSERT INTO case_teeth (case_id, tooth) VALUES ?', [teeth.map(t => [id, t])]);
    }
    // Initialise une ligne de workflow par étape définie dans stage_defs
    const [stages] = await conn.query('SELECT id FROM stage_defs ORDER BY sort_order');
    const wfRows = stages.map((s, i) => [id, s.id, i === 0 ? techId||null : null, null, null, null, i===0, null, null, i]);
    await conn.query(
      `INSERT INTO case_workflow_steps (case_id,stage_id,tech_id,start_date,end_date,duration_min,done,notes,elapsed_days,step_order) VALUES ?`,
      [wfRows]
    );
    await conn.commit();
    res.status(201).json(await fetchFullCase(id));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// PUT /api/cases/:id — mise à jour des champs généraux du dossier
router.put('/:id', requireAuth, ah(async (req, res) => {
  const fields = ['patient_first','patient_last','doctor_id','resto_type_id','shade','priority','due_date','tech_id','notes','remake','material_cost','labor_cost'];
  const map = { patientFirst:'patient_first', patientLast:'patient_last', doctorId:'doctor_id', restoTypeId:'resto_type_id', dueDate:'due_date', techId:'tech_id', materialCost:'material_cost', laborCost:'labor_cost' };
  const updates = [];
  const vals = [];
  for (const [key, val] of Object.entries(req.body)) {
    const col = map[key] || (fields.includes(key) ? key : null);
    if (col && fields.includes(col)) { updates.push(`${col}=?`); vals.push(val); }
  }
  if (Array.isArray(req.body.teeth)) {
    await pool.query('DELETE FROM case_teeth WHERE case_id=?', [req.params.id]);
    if (req.body.teeth.length) await pool.query('INSERT INTO case_teeth (case_id, tooth) VALUES ?', [req.body.teeth.map(t => [req.params.id, t])]);
  }
  if (updates.length) {
    await pool.query(`UPDATE cases SET ${updates.join(', ')} WHERE id=?`, [...vals, req.params.id]);
  }
  res.json(await fetchFullCase(req.params.id));
}));

// PATCH /api/cases/:id/advance — fait avancer le dossier à l'étape suivante
// body: { techId?, notes? } — clôture l'étape courante, ouvre la suivante
router.patch('/:id/advance', requireAuth, ah(async (req, res) => {
  const [[c]] = await pool.query('SELECT * FROM cases WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Dossier introuvable' });
  const idx = STAGES.indexOf(c.status);
  if (idx === -1 || idx === STAGES.length - 1) return res.status(400).json({ error: 'Dossier déjà à la dernière étape' });
  const nextStage = STAGES[idx + 1];
  const today = new Date().toISOString().slice(0,10);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // clôture l'étape courante
    await conn.query(
      `UPDATE case_workflow_steps SET end_date=?, done=TRUE, notes=COALESCE(?,notes) WHERE case_id=? AND stage_id=?`,
      [today, req.body.notes||null, req.params.id, c.status]
    );
    // ouvre la suivante
    await conn.query(
      `UPDATE case_workflow_steps SET start_date=?, tech_id=? WHERE case_id=? AND stage_id=?`,
      [today, req.body.techId||c.tech_id||null, req.params.id, nextStage]
    );
    const deliveredFields = nextStage === 'DELIVERED' ? ', delivered_date=?, delivered_by=?' : '';
    const deliveredVals = nextStage === 'DELIVERED' ? [today, req.user.id] : [];
    await conn.query(
      `UPDATE cases SET status=?, tech_id=?${deliveredFields} WHERE id=?`,
      [nextStage, req.body.techId||c.tech_id, ...deliveredVals, req.params.id]
    );
    await conn.commit();
    res.json(await fetchFullCase(req.params.id));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// PATCH /api/cases/:id/status — définit un statut arbitraire (le frontend permet de choisir
// n'importe quelle étape, pas uniquement la suivante). Clôture l'étape courante, ouvre celle visée.
// body: { status, techId?, notes? }
router.patch('/:id/status', requireAuth, ah(async (req, res) => {
  const { status, techId, notes } = req.body;
  if (!STAGES.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  const [[c]] = await pool.query('SELECT * FROM cases WHERE id=?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Dossier introuvable' });
  const today = new Date().toISOString().slice(0,10);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE case_workflow_steps SET end_date=COALESCE(end_date,?), done=TRUE WHERE case_id=? AND stage_id=? AND done=FALSE`,
      [today, req.params.id, c.status]
    );
    await conn.query(
      `UPDATE case_workflow_steps SET start_date=COALESCE(start_date,?), tech_id=COALESCE(?,tech_id), notes=COALESCE(?,notes) WHERE case_id=? AND stage_id=?`,
      [today, techId||null, notes||null, req.params.id, status]
    );
    const deliveredFields = status === 'DELIVERED' ? ', delivered_date=?, delivered_by=?' : '';
    const deliveredVals = status === 'DELIVERED' ? [today, req.user.id] : [];
    await conn.query(
      `UPDATE cases SET status=?, tech_id=COALESCE(?,tech_id)${deliveredFields} WHERE id=?`,
      [status, techId||null, ...deliveredVals, req.params.id]
    );
    await conn.commit();
    res.json(await fetchFullCase(req.params.id));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// PATCH /api/cases/:id/assign-all — assigne un même technicien à toutes les étapes restantes
router.patch('/:id/assign-all', requireAuth, ah(async (req, res) => {
  const { techId } = req.body;
  if (!techId) return res.status(400).json({ error: 'techId requis' });
  await pool.query(
    `UPDATE case_workflow_steps SET tech_id=? WHERE case_id=? AND stage_id NOT IN ('RECEIVED')`,
    [techId, req.params.id]
  );
  await pool.query('UPDATE cases SET tech_id=? WHERE id=?', [techId, req.params.id]);
  res.json(await fetchFullCase(req.params.id));
}));

// POST /api/cases/:id/comments — ajoute un commentaire au fil du dossier
router.post('/:id/comments', requireAuth, ah(async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Texte requis' });
  const id = genId('cm');
  await pool.query(
    'INSERT INTO case_comments (id,case_id,user_id,user_type,text) VALUES (?,?,?,?,?)',
    [id, req.params.id, req.user.id, req.user.accountType === 'CLINIC' ? 'DOCTOR' : 'USER', text]
  );
  res.status(201).json({ id });
}));

router.delete('/:id', requireAuth, ah(async (req, res) => {
  const [result] = await pool.query('DELETE FROM cases WHERE id=?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ error: 'Introuvable' });
  res.status(204).end();
}));

module.exports = router;
