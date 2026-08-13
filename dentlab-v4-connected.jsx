import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// API CLIENT — connexion au backend Node/Express (voir dentlab-backend.zip)
// Traduit entre le format base de données (snake_case, tables séparées) et
// le format que le reste de l'app attend déjà (pf, docId, wf, col, etc.)
// ═══════════════════════════════════════════════════════════════════════════
const API_BASE = (typeof window !== 'undefined' && window.__DENTLAB_API_BASE__) || 'http://localhost:4000/api';
const ASSET_BASE = API_BASE.replace(/\/api\/?$/, ''); // sert à construire les liens vers /uploads/...

function getToken(){ try{ return localStorage.getItem('dl_token'); }catch(e){ return null; } }
function setToken(t){ try{ t?localStorage.setItem('dl_token',t):localStorage.removeItem('dl_token'); }catch(e){} }

async function apiFetch(path, opts={}) {
  const token = getToken();
  const headers = { 'Content-Type':'application/json', ...(opts.headers||{}) };
  if (token) headers.Authorization = 'Bearer '+token;
  const res = await fetch(API_BASE+path, { ...opts, headers, body: opts.body?JSON.stringify(opts.body):undefined });
  if (res.status === 204) return null;
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || ('Erreur API ('+res.status+')'));
  return data;
}

// ─── Mappers: API (snake_case, tables séparées) → format frontend ─────────────
const mapUserRow = u => ({ id:u.id, name:u.name, email:u.email, role:u.role, spec:u.spec||undefined,
  col:u.color, rate:Number(u.rate)||0, active:!!u.active, acc:u.stageAccess||[] });
const mapClinicRow = c => ({ id:c.id, name:c.name, email:c.email, role:'CLINIC',
  address:c.address, phone:c.phone, col:c.color, active:!!c.active });
const mapDoctorRow = (d,clinicsById) => ({ id:d.id, name:d.name, role:'DOCTOR', clinicId:d.clinic_id,
  clinique:clinicsById[d.clinic_id]?.name||'', active:!!d.active, spec:d.spec, phone:d.phone, col:d.color });

const mapWfStep = w => ({ s:w.stage_id, tId:w.tech_id, start:w.start_date, end:w.end_date,
  dur:w.duration_min, done:!!w.done, notes:w.notes||'', el:w.elapsed_days });
const mapComment = c => ({ id:c.id, uid:c.user_id, text:c.text, ts:c.created_at });
const mapCaseRow = c => ({ id:c.id, num:c.num, pf:c.patient_first, pl:c.patient_last, docId:c.doctor_id,
  rtId:c.resto_type_id, teeth:c.teeth||[], sh:c.shade, pri:c.priority, status:c.status, due:c.due_date,
  techId:c.tech_id, remake:!!c.remake, notes:c.notes||'', materialCost:Number(c.material_cost)||0,
  laborCost:Number(c.labor_cost)||0, deliveredDate:c.delivered_date, deliveredBy:c.delivered_by,
  comments:(c.comments||[]).map(mapComment), images:[], attachments:c.attachments||[],
  wf:(c.workflow||[]).map(mapWfStep) });

const mapInvoiceRow = i => ({ id:i.id, docId:i.doctor_id, num:i.num, caseIds:i.caseIds||[],
  total:Number(i.total)||0, paid:Number(i.paid)||0, status:i.status, date:i.date, paidDate:i.paid_date,
  payments:(i.payments||[]).map(p=>({amount:Number(p.amount), date:p.date, method:p.method})) });

const mapMaterialRow = m => ({ id:m.id, code:m.code, name:m.name, cat:m.category, unit:m.unit,
  stock:Number(m.stock)||0, min:Number(m.min_stock)||0, cost:Number(m.cost)||0, active:!!m.active });
const mapStockMovRow = s => ({ id:s.id, matId:s.material_id, type:s.type, qty:Number(s.qty),
  date:s.date, reason:s.reason||'', ref:s.ref||'', by:s.performed_by });

const mapSupplierRow = s => ({ id:s.id, name:s.name, contact:s.contact, email:s.email, phone:s.phone,
  city:s.city, address:s.address, paymentTerms:s.payment_terms, notes:s.notes||'', active:!!s.active });

const mapPoItemRow = it => ({ id:it.id, matId:it.material_id, name:it.name, category:it.category,
  qty:Number(it.qty), received:Number(it.received)||0, unit:it.unit, unitPrice:Number(it.unit_price)||0,
  discount:Number(it.discount_pct)||0, tax:Number(it.tax_pct)||0 });
const KIND_TO_SLOT = { QUOTATION:'quotation', INVOICE:'invoice', DELIVERY_NOTE:'deliveryNote' };
const mapOrderRow = o => {
  const attachments = {};
  (o.attachments||[]).forEach(a=>{
    const slot = KIND_TO_SLOT[a.kind];
    if (slot) attachments[slot] = { attId:a.id, name:a.file_name, url:ASSET_BASE+'/uploads/'+a.file_path };
  });
  return { id:o.id, poNum:o.po_num, supId:o.supplier_id, orderDate:o.order_date,
    expectedDate:o.expected_date, status:o.status, paymentStatus:o.payment_status,
    items:(o.items||[]).map(mapPoItemRow), shipping:Number(o.shipping)||0, paidAmount:Number(o.paid_amount)||0,
    paidHistory:(o.payments||[]).map(p=>({amount:Number(p.amount),date:p.date,method:p.method})),
    notes:o.notes||'', receivedDate:o.received_date, attachments };
};

const mapExpenseRow = e => ({ id:e.id, catId:e.category_id, amount:Number(e.amount), desc:e.description,
  date:e.date, note:e.note||'', by:e.recorded_by });
const mapExpenseCatRow = c => ({ id:c.id, name:c.name, icon:c.icon, color:c.color });
const mapCaisseRow = c => ({ id:c.id, type:c.type, amount:Number(c.amount), desc:c.description,
  date:c.date, ref:c.ref||'', by:c.recorded_by });
const mapEquipmentRow = e => ({ id:e.id, name:e.name, category:e.category, brand:e.brand, serialNo:e.serial_no,
  price:Number(e.price)||0, purchaseDate:e.purchase_date, status:e.status, observation:e.observation||'' });
const mapRestoTypeRow = r => ({ id:r.id, name:r.name, category:r.category, price:Number(r.price)||0, active:!!r.active });
const mapTechPaymentRow = t => ({ id:t.id, techId:t.tech_id, amount:Number(t.amount), note:t.note||'', date:t.date });

const mapSettingsRow = s => ({ lang:s.lang, currency:s.currency, currencySymbol:s.currency_symbol,
  fontSize:Number(s.font_size), theme:s.theme, primaryColor:s.primary_color, companyName:s.company_name,
  companyPhone:s.company_phone, companyAddress:s.company_address, companyNif:s.company_nif,
  companyNis:s.company_nis, companyAi:s.company_ai, companyRc:s.company_rc, logoPath:s.logo_path,
  dateFormat:s.date_format, timeFormat:s.time_format, timezone:s.timezone, fiscalYearStart:s.fiscal_year_start });
const mapSettingsToApi = s => ({ lang:s.lang, currency:s.currency, currency_symbol:s.currencySymbol,
  font_size:s.fontSize, theme:s.theme, primary_color:s.primaryColor, company_name:s.companyName,
  company_phone:s.companyPhone, company_address:s.companyAddress, company_nif:s.companyNif,
  company_nis:s.companyNis, company_ai:s.companyAi, company_rc:s.companyRc, logo_path:s.logoPath,
  date_format:s.dateFormat, time_format:s.timeFormat, timezone:s.timezone, fiscal_year_start:s.fiscalYearStart });

// ─── API namespace : appelé depuis les composants ──────────────────────────
const api = {
  // auth
  login: (email,password)=>apiFetch('/auth/login',{method:'POST',body:{email,password}}),
  me: ()=>apiFetch('/auth/me'),
  setToken, getToken,

  // chargement initial groupé (appelé une fois après connexion)
  async loadAll(){
    const [users, clinics, doctorsRaw, cases, invoices, mats, stockMovs, supps, orders,
      expenseCats, expenses, caisse, equipment, restoTypes, techPayments, settings] = await Promise.all([
      apiFetch('/users'), apiFetch('/clinics'), apiFetch('/doctors'),
      apiFetch('/cases'), apiFetch('/invoices'), apiFetch('/materials'),
      Promise.resolve([]), // stockMovements globaux non exposés en liste plate côté API — chargés par matériau si besoin
      apiFetch('/suppliers'), apiFetch('/purchase-orders'),
      apiFetch('/expense-categories'), apiFetch('/expenses'), apiFetch('/cash-movements'),
      apiFetch('/equipment'), apiFetch('/resto-types'), apiFetch('/tech-payments'),
      apiFetch('/settings'),
    ]);
    const clinicsById = Object.fromEntries(clinics.map(c=>[c.id,c]));
    // Fusionne users(labo) + clinics + doctors dans un seul tableau, comme l'attend le reste de l'app
    const mergedUsers = [
      ...users.map(mapUserRow),
      ...clinics.map(mapClinicRow),
      ...doctorsRaw.map(d=>mapDoctorRow(d,clinicsById)),
    ];
    // Charge le détail complet de chaque dossier/facture/commande (teeth, wf, comments, items...)
    // + l'historique de mouvements de chaque matériau (pas de liste plate globale côté API)
    const [fullCases, fullInvoices, fullOrders, movementsByMat] = await Promise.all([
      Promise.all(cases.map(c=>apiFetch('/cases/'+c.id))),
      Promise.all(invoices.map(i=>apiFetch('/invoices/'+i.id))),
      Promise.all(orders.map(o=>apiFetch('/purchase-orders/'+o.id))),
      Promise.all(mats.map(m=>apiFetch('/materials/'+m.id+'/movements'))),
    ]);
    return {
      users: mergedUsers,
      cases: fullCases.map(mapCaseRow),
      invoices: fullInvoices.map(mapInvoiceRow),
      mats: mats.map(mapMaterialRow),
      stockMovements: movementsByMat.flat().map(mapStockMovRow),
      supps: supps.map(mapSupplierRow),
      orders: fullOrders.map(mapOrderRow),
      expenseCats: expenseCats.map(mapExpenseCatRow),
      expenses: expenses.map(mapExpenseRow),
      caisse: caisse.map(mapCaisseRow),
      equipment: equipment.map(mapEquipmentRow),
      restoTypes: restoTypes.map(mapRestoTypeRow),
      techPayments: techPayments.map(mapTechPaymentRow),
      settings: mapSettingsRow(settings),
    };
  },

  // cases
  createCase: (body)=>apiFetch('/cases',{method:'POST',body}).then(mapCaseRow),
  updateCase: (id,body)=>apiFetch('/cases/'+id,{method:'PUT',body}).then(mapCaseRow),
  setCaseStatus: (id,body)=>apiFetch('/cases/'+id+'/status',{method:'PATCH',body}).then(mapCaseRow),
  assignAllCase: (id,techId)=>apiFetch('/cases/'+id+'/assign-all',{method:'PATCH',body:{techId}}).then(mapCaseRow),
  addCaseComment: (id,text)=>apiFetch('/cases/'+id+'/comments',{method:'POST',body:{text}}),
  deleteCase: (id)=>apiFetch('/cases/'+id,{method:'DELETE'}),

  // invoices
  createInvoice: (body)=>apiFetch('/invoices',{method:'POST',body}).then(mapInvoiceRow),
  updateInvoice: (id,body)=>apiFetch('/invoices/'+id,{method:'PUT',body}).then(mapInvoiceRow),
  payInvoice: (id,body)=>apiFetch('/invoices/'+id+'/payments',{method:'POST',body}).then(mapInvoiceRow),
  deleteInvoice: (id)=>apiFetch('/invoices/'+id,{method:'DELETE'}),

  // materials & stock
  createMaterial: (body)=>apiFetch('/materials',{method:'POST',body}),
  updateMaterial: (id,body)=>apiFetch('/materials/'+id,{method:'PUT',body}).then(mapMaterialRow),
  addStockMovement: (id,body)=>apiFetch('/materials/'+id+'/movements',{method:'POST',body}),
  getMaterialMovements: (id)=>apiFetch('/materials/'+id+'/movements').then(rows=>rows.map(mapStockMovRow)),

  // purchase orders
  createOrder: (body)=>apiFetch('/purchase-orders',{method:'POST',body}).then(mapOrderRow),
  updateOrder: (id,body)=>apiFetch('/purchase-orders/'+id,{method:'PUT',body}).then(mapOrderRow),
  setOrderStatus: (id,status)=>apiFetch('/purchase-orders/'+id+'/status',{method:'PATCH',body:{status}}).then(mapOrderRow),
  receiveOrder: (id,receipts)=>apiFetch('/purchase-orders/'+id+'/receive',{method:'POST',body:{receipts}}).then(mapOrderRow),
  payOrder: (id,body)=>apiFetch('/purchase-orders/'+id+'/payments',{method:'POST',body}).then(mapOrderRow),

  // pièces jointes bon de commande — upload réel (multipart), pas de base64
  uploadPoAttachment: async (orderId, kind, file) => {
    const token = getToken();
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', kind);
    const res = await fetch(API_BASE+'/purchase-orders/'+orderId+'/attachments', {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer '+token } : {},
      body: fd,
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || 'Échec de l\'envoi du fichier');
    return data; // { id, kind, fileName, url }
  },
  deletePoAttachment: (orderId, attId)=>apiFetch('/purchase-orders/'+orderId+'/attachments/'+attId,{method:'DELETE'}),

  // simples (CRUD générique — table => préfixe API)
  simple: {
    clinics: '/clinics', doctors: '/doctors', restoTypes: '/resto-types', stageDefs: '/stage-defs',
    suppliers: '/suppliers', expenses: '/expenses', expenseCategories: '/expense-categories',
    cashMovements: '/cash-movements', equipment: '/equipment', techPayments: '/tech-payments',
  },
  create: (path,body)=>apiFetch(path,{method:'POST',body}),
  update: (path,id,body)=>apiFetch(path+'/'+id,{method:'PUT',body}),
  remove: (path,id)=>apiFetch(path+'/'+id,{method:'DELETE'}),

  // settings
  updateSettings: (body)=>apiFetch('/settings',{method:'PUT',body:mapSettingsToApi(body)}).then(mapSettingsRow),
};

const STAGES = ['RECEIVED','DESIGN','MILLING','SINTERING','FINISHING','MAQUILLAGE','QC','READY','DELIVERED'];
const SC = {
  RECEIVED:   { l:'Reçu',        bg:'#f1f5f9', c:'#475569', d:'#94a3b8' },
  DESIGN:     { l:'Conception',  bg:'#f3f0ff', c:'#7c3aed', d:'#8b5cf6' },
  MILLING:    { l:'Fraisage',    bg:'#eff6ff', c:'#1d4ed8', d:'#3b82f6' },
  SINTERING:  { l:'Frittage',    bg:'#fff7ed', c:'#c2410c', d:'#f97316' },
  FINISHING:  { l:'Finition',    bg:'#fefce8', c:'#a16207', d:'#eab308' },
  MAQUILLAGE: { l:'Maquillage',  bg:'#fdf4ff', c:'#a21caf', d:'#e879f9' },
  QC:         { l:'Contrôle QC', bg:'#fff0f0', c:'#be123c', d:'#fb7185' },
  READY:      { l:'Prêt',        bg:'#f0fdf4', c:'#166534', d:'#22c55e' },
  DELIVERED:  { l:'Livré',       bg:'#ecfdf5', c:'#065f46', d:'#10b981' },
};
const PC = {
  URGENT:{ l:'Urgent', c:'#e02424' }, HIGH:{ l:'Haut', c:'#f97316' },
  NORMAL:{ l:'Normal', c:'#3b82f6' }, LOW:{ l:'Bas',   c:'#94a3b8' },
};
const RATE = { DESIGN:500, MILLING:500, SINTERING:200, FINISHING:300, MAQUILLAGE:400, QC:150 };

const INIT_STAGE_DEFS = [
  { id:'RECEIVED',   label:'Reçu',        bg:'#f1f5f9', c:'#475569', d:'#94a3b8', rate:0,   editable:false },
  { id:'DESIGN',     label:'Conception',  bg:'#f3f0ff', c:'#7c3aed', d:'#8b5cf6', rate:500,  editable:true  },
  { id:'MILLING',    label:'Fraisage',    bg:'#eff6ff', c:'#1d4ed8', d:'#3b82f6', rate:500,  editable:true  },
  { id:'SINTERING',  label:'Frittage',    bg:'#fff7ed', c:'#c2410c', d:'#f97316', rate:200,  editable:true  },
  { id:'FINISHING',  label:'Finition',    bg:'#fefce8', c:'#a16207', d:'#eab308', rate:300,  editable:true  },
  { id:'MAQUILLAGE', label:'Maquillage',  bg:'#fdf4ff', c:'#a21caf', d:'#e879f9', rate:400,  editable:true  },
  { id:'QC',         label:'Contrôle QC', bg:'#fff0f0', c:'#be123c', d:'#fb7185', rate:150,  editable:true  },
  { id:'READY',      label:'Prêt',        bg:'#f0fdf4', c:'#166534', d:'#22c55e', rate:0,   editable:false },
  { id:'DELIVERED',  label:'Livré',       bg:'#ecfdf5', c:'#065f46', d:'#10b981', rate:0,   editable:false },
];
const fmt = n => new Intl.NumberFormat('fr-DZ').format(Math.round(n)) + ' DA';
const fmtDA = n => new Intl.NumberFormat('fr-DZ').format(Math.round(n||0)) + ' DA';
const tod = () => new Date().toISOString().split('T')[0];
const nt  = () => new Date().toLocaleTimeString('fr',{hour:'2-digit',minute:'2-digit'});
const uid = () => Date.now().toString(36);
const fileToDataURL = (file) => new Promise((resolve,reject)=>{
  const r=new FileReader();
  r.onload=()=>resolve(r.result);
  r.onerror=reject;
  r.readAsDataURL(file);
});
const fmtSize = (b) => b<1024?b+' o':b<1048576?(b/1024).toFixed(1)+' Ko':(b/1048576).toFixed(1)+' Mo';
const scopeDocIds = (user,users) => user.role==='CLINIC' ? users.filter(u=>u.role==='DOCTOR'&&u.clinicId===user.id).map(u=>u.id) : [user.id];
const caseDescription = (c,restoTypes) => {
  const rt=(restoTypes||[]).find(r=>r.id===c.rtId);
  const teethStr=(c.teeth&&c.teeth.length)?' — dents '+c.teeth.join(', '):'';
  return (rt?rt.name:'Prestation')+(c.sh?' (teinte '+c.sh+')':'')+teethStr;
};
const makeInvoiceForCase = (c,restoTypes,seq) => {
  const rt=(restoTypes||[]).find(r=>r.id===c.rtId);
  const num='INV-'+new Date().getFullYear()+'-'+String(seq).padStart(4,'0');
  return {id:'i'+uid()+Math.random().toString(36).slice(2,5),docId:c.docId,caseIds:[c.id],num,total:rt?rt.price:0,paid:0,status:'UNPAID',date:tod(),paidDate:null,payments:[]};
};

// ─── ARCHIVE MODULE ─────────────────────────────────────────────────────────
const ARCHIVE_CATS=[
  {v:'cases',l:'Dossiers / Commandes',icon:'📋'},
  {v:'invoices',l:'Factures',icon:'🧾'},
  {v:'payments',l:'Paiements',icon:'💳'},
  {v:'clinics',l:'Cliniques',icon:'🏥'},
  {v:'dentists',l:'Dentistes',icon:'🦷'},
  {v:'patients',l:'Patients',icon:'🧑'},
  {v:'products',l:'Produits',icon:'📦'},
  {v:'materials',l:'Matériaux',icon:'🧱'},
  {v:'suppliers',l:'Fournisseurs',icon:'🚚'},
  {v:'expenses',l:'Dépenses',icon:'💸'},
  {v:'inventory',l:'Mouvements de stock',icon:'↕️'},
  {v:'reports',l:'Rapports',icon:'📊'},
  {v:'documents',l:'Documents',icon:'📄'},
  {v:'stl',l:'Fichiers STL',icon:'🧊'},
  {v:'zip',l:'Fichiers ZIP',icon:'🗜️'},
  {v:'images',l:'Images',icon:'🖼️'},
  {v:'pdf',l:'Fichiers PDF',icon:'📕'},
];
const ARCHIVE_CAT_LABEL=Object.fromEntries(ARCHIVE_CATS.map(c=>[c.v,c.l]));
const ARCHIVE_CAT_ICON=Object.fromEntries(ARCHIVE_CATS.map(c=>[c.v,c.icon]));

const estimateSize = (obj) => { try{return new Blob([JSON.stringify(obj)]).size;}catch(e){return JSON.stringify(obj||{}).length;} };
const fmtBytes = (b) => { if(!b)return '0 o'; if(b<1024)return b+' o'; if(b<1048576)return (b/1024).toFixed(1)+' Ko'; if(b<1073741824)return (b/1048576).toFixed(1)+' Mo'; return (b/1073741824).toFixed(2)+' Go'; };

// Archive a live record: snapshots it, logs the action. Caller is responsible for
// removing the record from its live array (setCases/setInvoices/etc).
function archiveRecord(ctx,category,record,reason) {
  const entry={
    id:'arc'+uid()+Math.random().toString(36).slice(2,5),
    category, recordId:record.id, recordType:ARCHIVE_CAT_LABEL[category]||category,
    data:record,
    archiveDate:tod(), archivedBy:ctx.user?.name||'—', archiveReason:reason||'Suppression manuelle',
    originalCreatedDate:record.date||record.orderDate||record.due||record.createdAt||null,
    lastModifiedDate:tod(),
    fileSize:estimateSize(record),
    status:'ARCHIVED', notes:'',
  };
  ctx.setArchives(p=>[entry,...p]);
  ctx.setAuditLog(p=>[{id:'al'+uid(),action:'ARCHIVE',category,recordId:record.id,recordLabel:archiveRecordLabel(category,record),user:ctx.user?.name||'—',date:new Date().toISOString()},...p]);
  return entry;
}
function archiveRecordLabel(category,data) {
  if(!data) return '—';
  if(category==='cases') return data.num+' — '+data.pf+' '+data.pl;
  if(category==='invoices') return data.num;
  if(category==='clinics'||category==='suppliers'||category==='dentists') return data.name;
  if(category==='expenses') return data.desc;
  return data.name||data.num||data.id||'—';
}
// Restore an archived entry back into the appropriate live array.
function restoreArchiveEntry(ctx,entry) {
  const setterMap={
    cases:ctx.setCases, invoices:ctx.setInvoices, clinics:ctx.setUsers, dentists:ctx.setUsers,
    suppliers:ctx.setSupps, expenses:ctx.setExpenses, inventory:ctx.setStockMovements,
  };
  const setter=setterMap[entry.category];
  if(setter) setter(p=>[entry.data,...p]);
  ctx.setArchives(p=>p.map(a=>a.id===entry.id?{...a,status:'RESTORED',restoredDate:tod(),restoredBy:ctx.user?.name||'—'}:a));
  ctx.setAuditLog(p=>[{id:'al'+uid(),action:'RESTORE',category:entry.category,recordId:entry.recordId,recordLabel:archiveRecordLabel(entry.category,entry.data),user:ctx.user?.name||'—',date:new Date().toISOString()},...p]);
}
function permanentlyDeleteArchiveEntry(ctx,entry) {
  ctx.setArchives(p=>p.filter(a=>a.id!==entry.id));
  ctx.setAuditLog(p=>[{id:'al'+uid(),action:'PERMANENT_DELETE',category:entry.category,recordId:entry.recordId,recordLabel:archiveRecordLabel(entry.category,entry.data),user:ctx.user?.name||'—',date:new Date().toISOString()},...p]);
}

const INIT_RT = [
  { id:'rt1', name:'Couronne Zircone',       cat:'Couronne',  price:4500  },
  { id:'rt2', name:'Couronne PFM',           cat:'Couronne',  price:3500  },
  { id:'rt3', name:'Couronne E-Max',         cat:'Couronne',  price:5000  },
  { id:'rt4', name:'Bridge Zircone 3 unités',cat:'Bridge',    price:12000 },
  { id:'rt5', name:'Bridge PFM 3 unités',    cat:'Bridge',    price:9000  },
  { id:'rt6', name:'Facette Porcelaine',     cat:'Facette',   price:4000  },
  { id:'rt7', name:'Couronne sur Implant',   cat:'Implant',   price:7000  },
  { id:'rt8', name:'Prothèse Totale',        cat:'Prothèse',  price:18000 },
  { id:'rt9', name:'Prothèse Partielle',     cat:'Prothèse',  price:12000 },
  { id:'rt10',name:'PMMA Temporaire',        cat:'Temporaire',price:1500  },
  { id:'rt11',name:'Gouttière Nuit',         cat:'Appareil',  price:3500  },
];
const INIT_USERS = [
  { id:'admin1', name:'Admin Lab',        email:'admin@lab.dz',      pw:'admin123',   role:'ADMIN',       col:'#7c3aed' },
  { id:'t1',     name:'Karim Benali',     email:'karim@lab.dz',      pw:'karim123',   role:'TECHNICIAN',  spec:'Conception & Fraisage',  acc:['DESIGN','MILLING'],      col:'#1d4ed8', rate:500 },
  { id:'t2',     name:'Amira Meziane',    email:'amira@lab.dz',      pw:'amira123',   role:'TECHNICIAN',  spec:'Frittage & Finition',     acc:['SINTERING','FINISHING'], col:'#0891b2', rate:350 },
  { id:'t3',     name:'Sofiane Ait',      email:'sofiane@lab.dz',    pw:'sofiane123', role:'TECHNICIAN',  spec:'Maquillage',              acc:['MAQUILLAGE'],            col:'#d97706', rate:400 },
  { id:'t4',     name:'Lynda Chabane',    email:'lynda@lab.dz',      pw:'lynda123',   role:'TECHNICIAN',  spec:'Contrôle Qualité',        acc:['QC','READY'],            col:'#16a34a', rate:150 },
  { id:'cl1',    name:'Clinique El Fath',   email:'contact@elfath.dz', pw:'elfath123',  role:'CLINIC',      address:'12 Rue Didouche Mourad, Alger', phone:'021 45 67 89', col:'#0e7490' },
  { id:'cl2',    name:'Cabinet Mansouri',   email:'mansouri@clinic.dz',pw:'mansouri123',role:'CLINIC',      address:'8 Boulevard Krim Belkacem, Alger', phone:'021 33 22 11', col:'#c2410c' },
  { id:'d1',     name:'Dr. Ahmed Bouzidi',role:'DOCTOR',clinique:'Clinique El Fath', clinicId:'cl1', active:true, spec:'Prothésiste', phone:'0555 11 22 33', col:'#0891b2' },
  { id:'d2',     name:'Dr. Sara Khelifi', role:'DOCTOR',clinique:'Clinique El Fath', clinicId:'cl1', active:true, spec:'Orthodontiste', phone:'0555 44 55 66', col:'#7c3aed' },
  { id:'d3',     name:'Dr. Omar Mansouri',role:'DOCTOR',clinique:'Cabinet Mansouri', clinicId:'cl2', active:true, spec:'Généraliste',   phone:'0555 77 88 99', col:'#e02424' },
];
const INIT_CASES = [
  { id:'c1', num:'LAB-2024-0047', pf:'Mohammed', pl:'Hadj',    docId:'d1', rtId:'rt1', teeth:['16'],          sh:'A2',  pri:'URGENT', status:'DESIGN',    due:'2024-06-08', techId:'t1', remake:false, notes:'Implant Nobel, verifier axe', materialCost:3500, laborCost:1500, deliveredDate:null, deliveredBy:null, comments:[{id:'cm1',uid:'d1',text:'Patient disponible mardi',ts:'2024-06-05 09:00'}], images:[],
    wf:[{s:'RECEIVED',tId:null,start:'2024-06-05',end:'2024-06-05',dur:5,done:true,notes:'Recu',el:1},{s:'DESIGN',tId:'t1',start:'2024-06-05',end:null,dur:null,done:false,notes:'',el:1},{s:'MILLING',tId:'t1',start:null,end:null,dur:null,done:false,notes:'',el:1},{s:'SINTERING',tId:'t2',start:null,end:null,dur:null,done:false,notes:'',el:1},{s:'FINISHING',tId:'t2',start:null,end:null,dur:null,done:false,notes:'',el:1},{s:'MAQUILLAGE',tId:'t3',start:null,end:null,dur:null,done:false,notes:'',el:1},{s:'QC',tId:'t4',start:null,end:null,dur:null,done:false,notes:'',el:1},{s:'READY',tId:null,start:null,end:null,dur:null,done:false,notes:'',el:1}] },
  { id:'c2', materialCost:15600, laborCost:4500, deliveredDate:null, deliveredBy:null, comments:[], images:[], num:'LAB-2024-0046', pf:'Yasmine',  pl:'Taleb',   docId:'d2', rtId:'rt4', teeth:['14','15','16'],sh:'B1',  pri:'HIGH',   status:'MILLING',   due:'2024-06-09', techId:'t1', remake:false, notes:'',
    wf:[{s:'RECEIVED',tId:null,start:'2024-06-02',end:'2024-06-02',dur:5,done:true,notes:'',el:3},{s:'DESIGN',tId:'t1',start:'2024-06-02',end:'2024-06-02',dur:140,done:true,notes:'Bridge OK',el:3},{s:'MILLING',tId:'t1',start:'2024-06-03',end:null,dur:null,done:false,notes:'Ceramill',el:3},{s:'SINTERING',tId:'t2',start:null,end:null,dur:null,done:false,notes:'',el:3},{s:'FINISHING',tId:'t2',start:null,end:null,dur:null,done:false,notes:'',el:3},{s:'MAQUILLAGE',tId:'t3',start:null,end:null,dur:null,done:false,notes:'',el:3},{s:'QC',tId:'t4',start:null,end:null,dur:null,done:false,notes:'',el:3},{s:'READY',tId:null,start:null,end:null,dur:null,done:false,notes:'',el:3}] },
  { id:'c3', materialCost:5200, laborCost:2800, deliveredDate:null, deliveredBy:null, comments:[], images:[], num:'LAB-2024-0045', pf:'Rachid',   pl:'Boukhari',docId:'d1', rtId:'rt6', teeth:['11','12'],     sh:'BL2', pri:'NORMAL', status:'MAQUILLAGE',due:'2024-06-11', techId:'t1', remake:false, notes:'Photos teinte requises',
    wf:[{s:'RECEIVED',tId:null,start:'2024-06-03',end:'2024-06-03',dur:5,done:true,notes:'',el:2},{s:'DESIGN',tId:'t1',start:'2024-06-03',end:'2024-06-03',dur:90,done:true,notes:'',el:2},{s:'MILLING',tId:'t1',start:'2024-06-04',end:'2024-06-04',dur:90,done:true,notes:'',el:2},{s:'SINTERING',tId:'t2',start:'2024-06-05',end:'2024-06-05',dur:90,done:true,notes:'',el:2},{s:'FINISHING',tId:'t2',start:'2024-06-06',end:'2024-06-06',dur:60,done:true,notes:'',el:2},{s:'MAQUILLAGE',tId:'t3',start:'2024-06-07',end:null,dur:null,done:false,notes:'',el:2},{s:'QC',tId:'t4',start:null,end:null,dur:null,done:false,notes:'',el:2},{s:'READY',tId:null,start:null,end:null,dur:null,done:false,notes:'',el:2}] },
  { id:'c4', materialCost:1800, laborCost:900, deliveredDate:'2024-06-07', deliveredBy:'admin1', comments:[], images:[], num:'LAB-2024-0044', pf:'Nadia',    pl:'Chebli',  docId:'d2', rtId:'rt10',teeth:['26'],          sh:'A3',  pri:'NORMAL', status:'DELIVERED',  due:'2024-06-07', techId:'t1', remake:false, notes:'',
    wf:[{s:'RECEIVED',tId:null,start:'2024-05-28',end:'2024-05-28',dur:5,done:true,notes:'',el:1},{s:'DESIGN',tId:'t1',start:'2024-05-28',end:'2024-05-28',dur:90,done:true,notes:'',el:1},{s:'MILLING',tId:'t1',start:'2024-05-29',end:'2024-05-29',dur:90,done:true,notes:'',el:1},{s:'SINTERING',tId:'t2',start:'2024-05-30',end:'2024-05-30',dur:90,done:true,notes:'',el:1},{s:'FINISHING',tId:'t2',start:'2024-05-31',end:'2024-05-31',dur:60,done:true,notes:'',el:1},{s:'MAQUILLAGE',tId:'t3',start:'2024-06-01',end:'2024-06-01',dur:45,done:true,notes:'',el:1},{s:'QC',tId:'t4',start:'2024-06-02',end:'2024-06-02',dur:45,done:true,notes:'Valide',el:1},{s:'READY',tId:null,start:'2024-06-03',end:'2024-06-03',dur:5,done:true,notes:'',el:1}] },
  { id:'c5', materialCost:22000, laborCost:8400, deliveredDate:null, deliveredBy:null, comments:[], images:[], num:'LAB-2024-0043', pf:'Farid',    pl:'Ouzir',   docId:'d1', rtId:'rt8', teeth:['14','15','16','17','18','24','25','26','27','34','35','36','37','44'],sh:'A2',   pri:'NORMAL', status:'FINISHING', due:'2024-06-13', techId:'t2', remake:false, notes:'',
    wf:[{s:'RECEIVED',tId:null,start:'2024-06-04',end:'2024-06-04',dur:5,done:true,notes:'',el:14},{s:'DESIGN',tId:'t1',start:'2024-06-04',end:'2024-06-04',dur:180,done:true,notes:'',el:14},{s:'MILLING',tId:'t1',start:'2024-06-05',end:'2024-06-05',dur:150,done:true,notes:'',el:14},{s:'SINTERING',tId:'t2',start:'2024-06-06',end:'2024-06-06',dur:90,done:true,notes:'',el:14},{s:'FINISHING',tId:'t2',start:'2024-06-07',end:null,dur:null,done:false,notes:'',el:14},{s:'MAQUILLAGE',tId:'t3',start:null,end:null,dur:null,done:false,notes:'',el:14},{s:'QC',tId:'t4',start:null,end:null,dur:null,done:false,notes:'',el:14},{s:'READY',tId:null,start:null,end:null,dur:null,done:false,notes:'',el:14}] },
  { id:'c6', materialCost:4500, laborCost:2100, deliveredDate:null, deliveredBy:null, comments:[], images:[], num:'LAB-2024-0042', pf:'Amina',    pl:'Djebbar', docId:'d3', rtId:'rt7', teeth:['36'],          sh:'A2',  pri:'HIGH',   status:'QC',        due:'2024-06-10', techId:'t4', remake:true,  notes:'Remake hauteur +1.5mm',
    wf:[{s:'RECEIVED',tId:null,start:'2024-06-01',end:'2024-06-01',dur:5,done:true,notes:'Remake',el:1},{s:'DESIGN',tId:'t1',start:'2024-06-01',end:'2024-06-01',dur:90,done:true,notes:'+1.5mm',el:1},{s:'MILLING',tId:'t1',start:'2024-06-02',end:'2024-06-02',dur:90,done:true,notes:'',el:1},{s:'SINTERING',tId:'t2',start:'2024-06-03',end:'2024-06-03',dur:90,done:true,notes:'',el:1},{s:'MAQUILLAGE',tId:'t3',start:'2024-06-04',end:'2024-06-04',dur:60,done:true,notes:'',el:1},{s:'QC',tId:'t4',start:'2024-06-05',end:null,dur:null,done:false,notes:'',el:1},{s:'READY',tId:null,start:null,end:null,dur:null,done:false,notes:'',el:1}] },
  { id:'c7', materialCost:8000, laborCost:3200, deliveredDate:'2024-05-30', deliveredBy:'admin1', comments:[], images:[], num:'LAB-2024-0041', pf:'Khaled',   pl:'Meziane', docId:'d2', rtId:'rt1', teeth:['14','15'],     sh:'A1',  pri:'NORMAL', status:'DELIVERED', due:'2024-05-30', techId:'t1', remake:false, notes:'',
    wf:[{s:'RECEIVED',tId:null,start:'2024-05-20',end:'2024-05-20',dur:5,done:true,notes:'',el:2},{s:'DESIGN',tId:'t1',start:'2024-05-20',end:'2024-05-20',dur:120,done:true,notes:'',el:2},{s:'MILLING',tId:'t1',start:'2024-05-21',end:'2024-05-21',dur:100,done:true,notes:'',el:2},{s:'SINTERING',tId:'t2',start:'2024-05-22',end:'2024-05-22',dur:80,done:true,notes:'',el:2},{s:'FINISHING',tId:'t2',start:'2024-05-23',end:'2024-05-23',dur:60,done:true,notes:'',el:2},{s:'MAQUILLAGE',tId:'t3',start:'2024-05-24',end:'2024-05-24',dur:50,done:true,notes:'',el:2},{s:'QC',tId:'t4',start:'2024-05-25',end:'2024-05-25',dur:40,done:true,notes:'OK',el:2},{s:'READY',tId:null,start:'2024-05-26',end:'2024-05-26',dur:5,done:true,notes:'',el:2}] },
  { id:'c8', materialCost:6500, laborCost:2600, deliveredDate:'2024-05-15', deliveredBy:'admin1', comments:[], images:[], num:'LAB-2024-0040', pf:'Samira',   pl:'Khelifi', docId:'d1', rtId:'rt4', teeth:['11','12','13'],sh:'BL1', pri:'HIGH',   status:'DELIVERED', due:'2024-05-15', techId:'t3', remake:false, notes:'',
    wf:[{s:'RECEIVED',tId:null,start:'2024-05-05',end:'2024-05-05',dur:5,done:true,notes:'',el:3},{s:'DESIGN',tId:'t1',start:'2024-05-05',end:'2024-05-05',dur:90,done:true,notes:'',el:3},{s:'MILLING',tId:'t1',start:'2024-05-06',end:'2024-05-06',dur:80,done:true,notes:'',el:3},{s:'SINTERING',tId:'t2',start:'2024-05-07',end:'2024-05-07',dur:70,done:true,notes:'',el:3},{s:'FINISHING',tId:'t2',start:'2024-05-08',end:'2024-05-08',dur:55,done:true,notes:'',el:3},{s:'MAQUILLAGE',tId:'t3',start:'2024-05-09',end:'2024-05-09',dur:45,done:true,notes:'',el:3},{s:'QC',tId:'t4',start:'2024-05-10',end:'2024-05-10',dur:35,done:true,notes:'Valide',el:3},{s:'READY',tId:null,start:'2024-05-11',end:'2024-05-11',dur:5,done:true,notes:'',el:3}] },
];
const INIT_INVOICES = [
  { id:'i1', docId:'d1', num:'INV-2024-0012', caseIds:['c1'],     total:4500,  paid:4500,  status:'PAID',    date:'2024-05-28', paidDate:'2024-05-30', payments:[{amount:4500,date:'2024-05-30',method:'Espèces'}] },
  { id:'i2', docId:'d2', num:'INV-2024-0013', caseIds:['c2'],     total:12000, paid:0,     status:'UNPAID',  date:'2024-06-01', paidDate:null, payments:[] },
  { id:'i3', docId:'d1', num:'INV-2024-0014', caseIds:['c5'],     total:18000, paid:0,     status:'UNPAID',  date:'2024-06-03', paidDate:null, payments:[] },
  { id:'i4', docId:'d2', num:'INV-2024-0015', caseIds:['c4'],     total:1500,  paid:0,     status:'UNPAID',  date:'2024-05-15', paidDate:null, payments:[] },
  { id:'i5', docId:'d3', num:'INV-2024-0016', caseIds:['c6'],     total:7000,  paid:7000,  status:'PAID',    date:'2024-05-20', paidDate:'2024-05-22', payments:[{amount:7000,date:'2024-05-22',method:'Virement bancaire'}] },
];
const INIT_MATS = [
  { id:'m1', code:'ZIR-98-14', name:'Zirconia Disc 98mm Ø14mm',  cat:'ZIRCONIA',   unit:'disc',  stock:24, min:5,  cost:3500  },
  { id:'m2', code:'ZIR-98-20', name:'Zirconia Disc 98mm Ø20mm',  cat:'ZIRCONIA',   unit:'disc',  stock:12, min:5,  cost:5200  },
  { id:'m3', code:'PMMA-A2',   name:'PMMA Disc 98mm A2',          cat:'PMMA',        unit:'disc',  stock:18, min:6,  cost:1800  },
  { id:'m4', code:'WAX-71',    name:'Wax Disc 71mm',              cat:'WAX',         unit:'disc',  stock:30, min:10, cost:800   },
  { id:'m5', code:'TI-98',     name:'Titanium Blank Grade 4',     cat:'TITANIUM',    unit:'piece', stock:6,  min:2,  cost:12000 },
  { id:'m6', code:'IMP-ABUT',  name:'Implant Abutment Generic',   cat:'IMPLANT',     unit:'piece', stock:0,  min:5,  cost:4500  },
  { id:'m7', code:'CONS-BUR',  name:'Diamond Burs Set',           cat:'CONSUMABLE',  unit:'set',   stock:3,  min:2,  cost:2200  },
];
const INIT_STOCK_MOVEMENTS = [
  {id:'sm1',matId:'m1',type:'IN', qty:10,  date:'2024-05-25',reason:'Commande fournisseur',ref:'FACT-2024-051',by:'admin1'},
  {id:'sm2',matId:'m1',type:'OUT',qty:2,   date:'2024-06-02',reason:'Utilisation dossier LAB-2024-0047',ref:'c1',by:'t1'},
  {id:'sm3',matId:'m2',type:'IN', qty:6,   date:'2024-05-20',reason:'Commande fournisseur',ref:'FACT-2024-050',by:'admin1'},
  {id:'sm4',matId:'m3',type:'IN', qty:20,  date:'2024-06-01',reason:'Commande fournisseur',ref:'FACT-2024-061',by:'admin1'},
  {id:'sm5',matId:'m3',type:'OUT',qty:3,   date:'2024-06-05',reason:'Utilisation dossier LAB-2024-0046',ref:'c2',by:'t1'},
  {id:'sm6',matId:'m4',type:'OUT',qty:5,   date:'2024-06-03',reason:'Utilisation production',ref:'',by:'t2'},
  {id:'sm7',matId:'m5',type:'OUT',qty:1,   date:'2024-06-07',reason:'Utilisation implant',ref:'c3',by:'t1'},
  {id:'sm8',matId:'m6',type:'OUT',qty:2,   date:'2024-05-28',reason:'Utilisation abutments',ref:'c4',by:'t3'},
  {id:'sm9',matId:'m7',type:'IN', qty:3,   date:'2024-06-01',reason:'Renouvellement burs',ref:'',by:'admin1'},
];

const INIT_SUPPS = [
  { id:'s1', name:'DentMed Algeria',    contact:'Rachid Ouali',   email:'supply@dentmed.dz', phone:'0213214567', city:'Alger', address:'Zone Industrielle Rouiba, Alger', paymentTerms:'30 jours net', notes:'Fournisseur principal zircone et céramique' },
  { id:'s2', name:'IvoclarVivadent DZ', contact:'Farid Tlemceni', email:'info@ivoclar.dz',   phone:'0555123456', city:'Oran',  address:'Route Nationale 4, Oran',        paymentTerms:'Comptant',      notes:'' },
  { id:'s3', name:'3M ESPE Algeria',    contact:'Sara Amrani',    email:'3m@espe.dz',        phone:'0661987654', city:'Alger', address:'Hydra, Alger',                    paymentTerms:'45 jours net', notes:'' },
];
const poItemTotal = it => {
  const base=(it.qty||0)*(it.unitPrice||0);
  const afterDisc=base*(1-(it.discount||0)/100);
  return afterDisc*(1+(it.tax||0)/100);
};
const poTotals = (items,shipping) => {
  const subtotal=items.reduce((s,it)=>s+(it.qty||0)*(it.unitPrice||0),0);
  const discountTotal=items.reduce((s,it)=>s+((it.qty||0)*(it.unitPrice||0))*((it.discount||0)/100),0);
  const taxTotal=items.reduce((s,it)=>{const base=(it.qty||0)*(it.unitPrice||0)*(1-(it.discount||0)/100);return s+base*((it.tax||0)/100);},0);
  const grandTotal=subtotal-discountTotal+taxTotal+(shipping||0);
  return {subtotal,discountTotal,taxTotal,grandTotal};
};
const PO_STATUSES=['DRAFT','PENDING_APPROVAL','APPROVED','SENT','PARTIAL','RECEIVED','CANCELLED'];
const PO_STATUS_LABELS={DRAFT:'Brouillon',PENDING_APPROVAL:'En attente d\'approbation',APPROVED:'Approuvée',SENT:'Envoyée',PARTIAL:'Partiellement reçue',RECEIVED:'Reçue',CANCELLED:'Annulée'};
const PO_STATUS_COLORS={DRAFT:'#6b7280',PENDING_APPROVAL:'#d97706',APPROVED:'#0891b2',SENT:'#7c3aed',PARTIAL:'#ea580c',RECEIVED:'#16a34a',CANCELLED:'#dc2626'};
const PO_PAY_LABELS={UNPAID:'Impayée',PARTIAL:'Partiellement payée',PAID:'Payée'};
const PO_PAY_COLORS={UNPAID:'#dc2626',PARTIAL:'#d97706',PAID:'#16a34a'};
const INIT_ORDERS = [
  { id:'o1', poNum:'PO-2024-0001', supId:'s1', orderDate:'2024-05-20', expectedDate:'2024-05-25', status:'RECEIVED', paymentStatus:'PAID',
    items:[{id:'it1',matId:'m1',name:'Disque Zircone HT 98mm',category:'Zircone',qty:10,unit:'unité',unitPrice:3400,discount:0,tax:0}],
    shipping:0, paidAmount:34000, paidHistory:[{amount:34000,date:'2024-05-25',method:'Virement bancaire'}],
    notes:'', attachments:{quotation:null,invoice:null,deliveryNote:null}, receivedDate:'2024-05-25' },
  { id:'o2', poNum:'PO-2024-0002', supId:'s2', orderDate:'2024-06-01', expectedDate:'2024-06-10', status:'SENT', paymentStatus:'UNPAID',
    items:[{id:'it2',matId:'m3',name:'Cire de coulée',category:'Consommables',qty:20,unit:'kg',unitPrice:1750,discount:0,tax:0}],
    shipping:500, paidAmount:0, paidHistory:[],
    notes:'', attachments:{quotation:null,invoice:null,deliveryNote:null}, receivedDate:null },
  { id:'o3', poNum:'PO-2024-0003', supId:'s1', orderDate:'2024-06-05', expectedDate:'2024-06-15', status:'APPROVED', paymentStatus:'UNPAID',
    items:[{id:'it3',matId:'m6',name:'Résine PMMA',category:'Résine',qty:10,unit:'kg',unitPrice:4400,discount:5,tax:0}],
    shipping:0, paidAmount:0, paidHistory:[],
    notes:'', attachments:{quotation:null,invoice:null,deliveryNote:null}, receivedDate:null },
];


// ─── INIT EXPENSES ────────────────────────────────────────────────────────────
const INIT_expenseCats = [
  {id:'ec1',name:'Matières premières',     icon:'🧱', color:'#1d4ed8'},
  {id:'ec2',name:'Fournitures bureau',     icon:'📎', color:'#0891b2'},
  {id:'ec3',name:'Maintenance équipements',icon:'🔧', color:'#c2410c'},
  {id:'ec4',name:'Loyer & charges',        icon:'🏢', color:'#7c3aed'},
  {id:'ec5',name:'Salaires',               icon:'👥', color:'#166534'},
  {id:'ec6',name:'Transport',              icon:'🚗', color:'#d97706'},
  {id:'ec7',name:'Publicité',              icon:'📢', color:'#a21caf'},
  {id:'ec8',name:'Autres',                 icon:'📦', color:'#6b7280'},
];
const INIT_EXPENSES = [
  {id:'ex1',catId:'ec1',amount:35000,desc:'Zirconia discs × 10 — DentMed',date:'2024-06-01',note:'Facture FACT-2024-061',by:'admin1'},
  {id:'ex2',catId:'ec5',amount:85000,desc:'Salaires techniciens — Juin 2024',date:'2024-06-01',note:'',by:'admin1'},
  {id:'ex3',catId:'ec4',amount:25000,desc:'Loyer laboratoire — Juin 2024',date:'2024-06-01',note:'',by:'admin1'},
  {id:'ex4',catId:'ec3',amount:12000,desc:'Maintenance Ceramill Motion 2',date:'2024-06-05',note:'Contrat annuel proratisé',by:'admin1'},
  {id:'ex5',catId:'ec2',amount:3500,desc:'Consommables bureau & emballages',date:'2024-06-08',note:'',by:'admin1'},
];

// ─── INIT CAISSE MOVEMENTS ────────────────────────────────────────────────────
const INIT_CAISSE = [
  {id:'mv1',type:'IN', amount:9500,  desc:'Paiement Dr. Khelifi — INV-2024-0013',date:'2024-06-01',ref:'INV-2024-0013',by:'admin1'},
  {id:'mv2',type:'OUT',amount:35000, desc:'Achat matières premières DentMed',date:'2024-06-01',ref:'FACT-2024-061',by:'admin1'},
  {id:'mv3',type:'IN', amount:7000,  desc:'Paiement Dr. Mansouri — INV-2024-0016',date:'2024-06-03',ref:'INV-2024-0016',by:'admin1'},
  {id:'mv4',type:'OUT',amount:25000, desc:'Loyer laboratoire Juin 2024',date:'2024-06-01',ref:'',by:'admin1'},
  {id:'mv5',type:'OUT',amount:85000, desc:'Salaires techniciens Juin 2024',date:'2024-06-05',ref:'',by:'admin1'},
  {id:'mv6',type:'IN', amount:4500,  desc:'Paiement Dr. Bouzidi — INV-2024-0012',date:'2024-06-06',ref:'INV-2024-0012',by:'admin1'},
  {id:'mv7',type:'OUT',amount:12000, desc:'Maintenance Ceramill',date:'2024-06-08',ref:'',by:'admin1'},
  {id:'mv8',type:'IN', amount:1500,  desc:'Règlement dossier LAB-2024-0044',date:'2024-06-08',ref:'INV-2024-0015',by:'admin1'},
];

// ─── INIT SETTINGS ────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  lang:'fr',
  currency:'DA',
  currencySymbol:'DA',
  fontSize:13.5,
  theme:'light',
  primaryColor:'#1a56db',
  companyName:'DentLab Pro',
  companyPhone:'0555 123 456',
  companyAddress:'12 Rue des Cliniques, Alger',
  dateFormat:'DD/MM/YYYY',
  timeFormat:'24h',
  timezone:'Africa/Algiers',
  fiscalYear:'01',
};

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
const SBadge = ({st}) => { const x=SC[st]; if(!x) return <span>{st}</span>;
  return <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:10.5,fontWeight:500,padding:'2px 8px',borderRadius:99,background:x.bg,color:x.c}}><span style={{width:5,height:5,borderRadius:'50%',background:x.d}}/>{x.l}</span>; };
const PBadge = ({p}) => { const x=PC[p]; return x?<span style={{fontSize:11,fontWeight:600,color:x.c}}>{x.l}</span>:null; };
const Kpi = ({label,val,col}) => <div style={{background:'#f9fafb',borderRadius:8,padding:'10px 12px'}}>
  <div style={{width:3,height:14,borderRadius:2,background:col,marginBottom:4}}/>
  <div style={{fontSize:18,fontWeight:600,color:col,lineHeight:1}}>{val}</div>
  <div style={{fontSize:10,color:'#6b7280',marginTop:3}}>{label}</div>
</div>;
const Av = ({u,sz=26}) => { if(!u) return null; const ini=u.name.split(' ').map(w=>w[0]).join('').slice(0,2);
  return <div style={{width:sz,height:sz,borderRadius:'50%',background:u.col+'22',color:u.col,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:sz>30?12:9.5,flexShrink:0}}>{ini}</div>; };
const Pb = ({pct,col='#1a56db'}) => <div style={{height:4,background:'#f3f4f6',borderRadius:99,overflow:'hidden',margin:'3px 0'}}><div style={{height:'100%',background:col,borderRadius:99,width:`${Math.min(pct,100)}%`,transition:'width .4s'}}/></div>;
const Card = ({children,style}) => <div style={{background:'#ffffff',borderRadius:12,border:'1px solid #e5e7eb',overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,.04)',flexShrink:0,...style}}>{children}</div>;
const CH = ({title,action}) => <div style={{padding:'11px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,background:'#fafafa',borderRadius:'11px 11px 0 0'}}><span style={{fontSize:12.5,fontWeight:600,color:'#111827'}}>{title}</span>{action}</div>;
const Alert = ({type='i',children}) => { const AMAP={i:{bg:'#eff6ff',bl:'#3b82f6',c:'#1e40af'},info:{bg:'#eff6ff',bl:'#3b82f6',c:'#1e40af'},w:{bg:'#fffbeb',bl:'#f59e0b',c:'#92400e'},warn:{bg:'#fffbeb',bl:'#f59e0b',c:'#92400e'},warning:{bg:'#fffbeb',bl:'#f59e0b',c:'#92400e'},s:{bg:'#f0fdf4',bl:'#22c55e',c:'#166534'},success:{bg:'#f0fdf4',bl:'#22c55e',c:'#166534'},e:{bg:'#fef2f2',bl:'#ef4444',c:'#991b1b'},error:{bg:'#fef2f2',bl:'#ef4444',c:'#991b1b'}}; const m=AMAP[type]||AMAP['i'];
  return <div style={{padding:'9px 12px',borderRadius:8,fontSize:11.5,borderLeft:`3px solid ${m.bl}`,background:m.bg,color:m.c}}>{children}</div>; };
const BtnP = ({children,sm,onClick,style}) => <button onClick={onClick} style={{display:'inline-flex',alignItems:'center',gap:5,padding:sm?'4px 9px':'7px 13px',borderRadius:sm?6:8,fontSize:sm?10.5:12,fontWeight:500,cursor:'pointer',border:'none',background:'#1a56db',color:'#fff',fontFamily:"'DM Sans',sans-serif",...style}}>{children}</button>;
const BtnG = ({children,sm,onClick,style}) => <button onClick={onClick} style={{display:'inline-flex',alignItems:'center',gap:5,padding:sm?'4px 9px':'7px 13px',borderRadius:sm?6:8,fontSize:sm?10.5:12,fontWeight:500,cursor:'pointer',border:'none',background:'#0e9f6e',color:'#fff',fontFamily:"'DM Sans',sans-serif",...style}}>{children}</button>;
const BtnO = ({children,sm,onClick,style}) => <button onClick={onClick} style={{display:'inline-flex',alignItems:'center',gap:5,padding:sm?'4px 9px':'7px 13px',borderRadius:sm?6:8,fontSize:sm?10.5:12,fontWeight:500,cursor:'pointer',border:'1px solid #e5e7eb',background:'#f9fafb',color:'#111827',fontFamily:"'DM Sans',sans-serif",...style}}>{children}</button>;
const BtnR = ({children,sm,onClick,style}) => <button onClick={onClick} style={{display:'inline-flex',alignItems:'center',gap:5,padding:sm?'4px 9px':'7px 13px',borderRadius:sm?6:8,fontSize:sm?10.5:12,fontWeight:500,cursor:'pointer',border:'none',background:'#e02424',color:'#fff',fontFamily:"'DM Sans',sans-serif",...style}}>{children}</button>;
// Universal Btn component (supports variant prop)
const Fr2 = ({children,gap=10}) => <div className="form-row-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap}}>{children}</div>;
const SelEl = ({label,options,required,...p}) => <div style={{marginBottom:10}}>
  {label&&<label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:3}}>{label}{required&&<span style={{color:'#e02424'}}>*</span>}</label>}
  <select {...p} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12.5,padding:'7px 10px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',color:'#111827',width:'100%',outline:'none',...(p.style||{})}}>
    {(options||[]).map(o=><option key={o.v!==undefined?o.v:o} value={o.v!==undefined?o.v:o}>{o.l||o}</option>)}
  </select>
</div>;

const Btn = ({children,variant='primary',sm,onClick,style,disabled}) => {
  const v={
    primary:  {bg:'#1a56db',c:'#fff',  b:'none'},
    success:  {bg:'#059669',c:'#fff',  b:'none'},
    danger:   {bg:'#dc2626',c:'#fff',  b:'none'},
    ghost:    {bg:'#f9fafb',c:'#374151',b:'1px solid #e5e7eb'},
    warning:  {bg:'#d97706',c:'#fff',  b:'none'},
    purple:   {bg:'#7c3aed',c:'#fff',  b:'none'},
  }[variant]||{bg:'#f9fafb',c:'#374151',b:'1px solid #e5e7eb'};
  return <button disabled={disabled} onClick={onClick} style={{
    display:'inline-flex',alignItems:'center',gap:5,
    padding:sm?'4px 10px':'7px 14px',borderRadius:sm?6:8,
    fontSize:sm?11:12,fontWeight:500,
    cursor:disabled?'not-allowed':'pointer',
    border:v.b,background:disabled?'#f3f4f6':v.bg,
    color:disabled?'#9ca3af':v.c,
    fontFamily:"'DM Sans',sans-serif",
    opacity:disabled?0.7:1,...(style||{})
  }}>{children}</button>;
};
const Fr = ({children}) => <div className="form-row-2" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>{children}</div>;
const Inp = ({label,...p}) => <div style={{marginBottom:9}}>
  {label&&<label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:3}}>{label}</label>}
  <input {...p} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12.5,padding:'7px 10px',borderRadius:8,border:'1px solid #e5e7eb',background:'#ffffff',color:'#111827',width:'100%',outline:'none',...p.style}}/>
</div>;
const Sel = ({label,options,...p}) => <div style={{marginBottom:9}}>
  {label&&<label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:3}}>{label}</label>}
  <select {...p} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12.5,padding:'7px 10px',borderRadius:8,border:'1px solid #e5e7eb',background:'#ffffff',color:'#111827',width:'100%',outline:'none',...p.style}}>
    {options.map(o=><option key={o.v||o} value={o.v||o}>{o.l||o}</option>)}
  </select>
</div>;
const Modal = ({title,onClose,children,wide}) => <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
  <div style={{background:'#ffffff',borderRadius:12,width:'100%',maxWidth:wide?620:500,maxHeight:'90vh',overflowY:'auto',border:'1px solid #e5e7eb',boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
    <div style={{padding:'12px 16px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,background:'#ffffff',zIndex:1}}>
      <h3 style={{fontSize:13.5,fontWeight:600}}>{title}</h3>
      <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#6b7280',lineHeight:1}}>×</button>
    </div>
    <div style={{padding:18}}>{children}</div>
  </div>
</div>;
const Toast = ({msg,onDone}) => { useState(()=>{const t=setTimeout(onDone,2800);return()=>clearTimeout(t);}); return <div style={{position:'fixed',bottom:20,right:20,background:'#0f1929',color:'#fff',padding:'10px 16px',borderRadius:10,fontSize:12,fontWeight:500,zIndex:9999,display:'flex',alignItems:'center',gap:8}}>✅ {msg}</div>; };

const UPPER=['18','17','16','15','14','13','12','11','21','22','23','24','25','26','27','28'];
const LOWER=['48','47','46','45','44','43','42','41','31','32','33','34','35','36','37','38'];
const ToothChart = ({selected,onToggle}) => {
  const T=({t})=><button onClick={()=>onToggle(t)} style={{width:24,height:24,borderRadius:4,border:selected.includes(t)?'none':'1px solid #e5e7eb',background:selected.includes(t)?'#1a56db':'#f9fafb',color:selected.includes(t)?'#fff':'#6b7280',fontFamily:"'JetBrains Mono',monospace",fontSize:9,fontWeight:600,cursor:'pointer'}}>{t}</button>;
  return <div><div style={{fontSize:9.5,color:'#6b7280',textAlign:'center',marginBottom:3}}>Arcade supérieure</div>
    <div style={{display:'flex',flexWrap:'wrap',gap:3,justifyContent:'center'}}>{UPPER.map(t=><T key={t} t={t}/>)}</div>
    <div style={{borderTop:'1.5px dashed #e5e7eb',margin:'4px 0'}}/>
    <div style={{display:'flex',flexWrap:'wrap',gap:3,justifyContent:'center'}}>{LOWER.map(t=><T key={t} t={t}/>)}</div>
    <div style={{fontSize:9.5,color:'#6b7280',textAlign:'center',marginTop:3}}>Arcade inférieure</div>
  </div>;
};

// ─── FILE ATTACHMENTS (STL/ZIP/RAR + Photo teinte) ────────────────────────────
const ATTACH_ACCEPT=".stl,.ply,.dcm,.dicom,.3se,.3so,.obj,.zip,.rar,.7z,.dentalproject";
const MAX_ATTACH_MB=60;
function FileAttachSection({attachments,setAttachments,shadePhoto,setShadePhoto,showToast}) {
  const onPickAttachments=async(e)=>{
    const files=Array.from(e.target.files||[]);
    e.target.value='';
    for(const f of files){
      if(f.size>MAX_ATTACH_MB*1024*1024){alert(`⚠ "${f.name}" (${fmtSize(f.size)}) dépasse la limite de ${MAX_ATTACH_MB} Mo et n'a PAS été joint au dossier.`);continue;}
      try{
        const dataUrl=await fileToDataURL(f);
        setAttachments(p=>[...p,{id:'att'+Date.now()+Math.random().toString(36).slice(2,6),name:f.name,size:f.size,dataUrl}]);
      }catch(err){showToast&&showToast('Erreur lecture fichier '+f.name);}
    }
  };
  const onPickShade=async(e)=>{
    const f=e.target.files[0];e.target.value='';
    if(!f)return;
    if(f.size>MAX_ATTACH_MB*1024*1024){alert(`⚠ La photo "${f.name}" (${fmtSize(f.size)}) dépasse ${MAX_ATTACH_MB} Mo et n'a PAS été jointe.`);return;}
    try{const dataUrl=await fileToDataURL(f);setShadePhoto({name:f.name,size:f.size,dataUrl});}
    catch(err){showToast&&showToast('Erreur lecture image');}
  };
  const removeAttachment=(id)=>setAttachments(p=>p.filter(a=>a.id!==id));
  return <div style={{display:'flex',flexDirection:'column',gap:12}}>
    <div>
      <label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:6}}>📁 Fichiers joints <span style={{color:'#9ca3af',fontWeight:400}}>(STL, ZIP, RAR — optionnel, plusieurs fichiers possibles)</span></label>
      <label style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,padding:'16px',border:'1.5px dashed #d1d5db',borderRadius:9,cursor:'pointer',background:'#f9fafb',transition:'all .15s'}}>
        <span style={{fontSize:22}}>📤</span>
        <span style={{fontSize:11.5,fontWeight:500,color:'#6b7280'}}>Glisser ou cliquer pour uploader (multi-fichiers)</span>
        <span style={{fontSize:10,color:'#9ca3af'}}>STL, PLY, DICOM, OBJ, ZIP, RAR... (max {MAX_ATTACH_MB} Mo/fichier)</span>
        <input type="file" multiple style={{display:'none'}} accept={ATTACH_ACCEPT} onChange={onPickAttachments}/>
      </label>
      {attachments.length>0&&<div style={{marginTop:8,display:'flex',flexDirection:'column',gap:5}}>
        {attachments.map(a=><div key={a.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',background:'#f0fdf4',borderRadius:7,border:'1px solid #bbf7d0'}}>
          <span style={{fontSize:15}}>✅</span>
          <span style={{flex:1,fontSize:11.5,fontWeight:500,color:'#166534',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</span>
          <span style={{fontSize:10,color:'#6b7280'}}>{fmtSize(a.size)}</span>
          <button onClick={()=>removeAttachment(a.id)} style={{border:'none',background:'none',cursor:'pointer',color:'#dc2626',fontSize:12}}>✕</button>
        </div>)}
      </div>}
    </div>
    <div>
      <label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:6}}>📷 Photo teinte <span style={{color:'#9ca3af',fontWeight:400}}>(optionnel)</span></label>
      <label style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6,padding:'16px',border:'1.5px dashed #d1d5db',borderRadius:9,cursor:'pointer',background:shadePhoto?'#f0fdf4':'#f9fafb',transition:'all .15s'}}>
        {shadePhoto?<img src={shadePhoto.dataUrl} alt={shadePhoto.name} style={{width:70,height:70,objectFit:'cover',borderRadius:8}}/>:<span style={{fontSize:22}}>📷</span>}
        <span style={{fontSize:11.5,fontWeight:500,color:shadePhoto?'#16a34a':'#6b7280'}}>{shadePhoto?shadePhoto.name:'Photo de teinte (optionnel)'}</span>
        <span style={{fontSize:10,color:'#9ca3af'}}>JPG, PNG, HEIC...</span>
        <input type="file" style={{display:'none'}} accept="image/*" onChange={onPickShade}/>
      </label>
      {shadePhoto&&<button onClick={()=>setShadePhoto(null)} style={{marginTop:4,fontSize:10.5,color:'#e02424',background:'none',border:'none',cursor:'pointer'}}>✕ Retirer</button>}
    </div>
  </div>;
}
function AttachmentsViewer({c}) {
  const hasNew=(c.attachments&&c.attachments.length>0)||c.shadePhoto;
  const hasLegacy=(c.scanFile||c.shadeFile)&&!hasNew;
  if(!hasNew&&!hasLegacy) return null;
  return <div style={{marginBottom:10,padding:'11px 12px',background:'#eff6ff',borderRadius:9,border:'1.5px solid #93c5fd'}}>
    <div style={{fontSize:11,fontWeight:700,color:'#1e40af',marginBottom:8}}>📎 Fichiers du dossier {hasNew&&<span style={{fontWeight:400,color:'#3b82f6'}}>— cliquez pour télécharger</span>}</div>
    {hasLegacy&&<>
      {c.scanFile&&<div style={{fontSize:11.5,color:'#1a56db',marginBottom:3}}>📄 Scan : <b>{c.scanFile}</b> <span style={{color:'#9ca3af',fontStyle:'italic'}}>(non téléchargeable — ancien format)</span></div>}
      {c.shadeFile&&<div style={{fontSize:11.5,color:'#1a56db'}}>🎨 Photo teinte : <b>{c.shadeFile}</b> <span style={{color:'#9ca3af',fontStyle:'italic'}}>(non téléchargeable — ancien format)</span></div>}
    </>}
    {(c.attachments||[]).length>0&&<div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:c.shadePhoto?8:0}}>
      {(c.attachments||[]).map(a=><a key={a.id} href={a.dataUrl} download={a.name}
        style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:'#fff',borderRadius:7,border:'1px solid #bfdbfe',fontSize:12,color:'#1a56db',textDecoration:'none',fontWeight:600,boxShadow:'0 1px 2px rgba(0,0,0,.04)'}}>
        <span style={{fontSize:15}}>⬇</span><span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.name}</span><span style={{color:'#9ca3af',fontSize:10,fontWeight:400}}>{fmtSize(a.size||0)}</span>
      </a>)}
    </div>}
    {c.shadePhoto&&<a href={c.shadePhoto.dataUrl} download={c.shadePhoto.name} style={{display:'flex',alignItems:'center',gap:9,padding:'6px 8px',background:'#fff',borderRadius:7,border:'1px solid #bfdbfe',textDecoration:'none'}}>
      <img src={c.shadePhoto.dataUrl} alt={c.shadePhoto.name} style={{width:44,height:44,objectFit:'cover',borderRadius:6,flexShrink:0}}/>
      <span style={{fontSize:12,color:'#1a56db',fontWeight:600}}>⬇ Photo teinte — {c.shadePhoto.name}</span>
    </a>}
  </div>;
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({onLogin}) {
  const [email,setEmail]=useState(''); const [pw,setPw]=useState(''); const [err,setErr]=useState(''); const [busy,setBusy]=useState(false);
  const HINTS=[{r:'Admin',e:'admin@lab.dz',p:'admin123'},{r:'Tech (Conception)',e:'karim@lab.dz',p:'karim123'},{r:'Tech (Frittage)',e:'amira@lab.dz',p:'amira123'},{r:'Tech (Maquillage)',e:'sofiane@lab.dz',p:'sofiane123'},{r:'🏥 Clinique El Fath (2 praticiens)',e:'contact@elfath.dz',p:'elfath123'},{r:'🏥 Cabinet Mansouri (1 praticien)',e:'mansouri@clinic.dz',p:'mansouri123'}];
  const doLogin=async()=>{
    if(busy)return;
    setErr('');setBusy(true);
    try{
      const {token,account}=await api.login(email.trim(),pw.trim());
      api.setToken(token);
      // NB: comptes DOCTOR (dentistes individuels) ne se connectent pas via /auth/login —
      // seuls les comptes labo (users) et cliniques (clinics) ont email+mdp. Un dentiste
      // se connecte avec le compte de sa clinique.
      onLogin(account);
    }catch(e){
      setErr(e.message||'Email ou mot de passe incorrect');
    }finally{
      setBusy(false);
    }
  };
  return <div style={{position:'fixed',inset:0,background:'#f3f4f6',display:'flex',alignItems:'center',justifyContent:'center'}}>
    <div style={{background:'#ffffff',borderRadius:14,border:'1px solid #e5e7eb',width:'100%',maxWidth:400,padding:28,boxShadow:'0 4px 24px rgba(0,0,0,.08)'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:22,justifyContent:'center'}}>
        <div style={{width:40,height:40,background:'#1a56db',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:13,color:'#fff'}}>DL</div>
        <div><div style={{fontSize:17,fontWeight:700}}>DentLab Pro</div><div style={{fontSize:10.5,color:'#6b7280'}}>Gestion laboratoire dentaire</div></div>
      </div>
      <Inp label="Adresse email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="votre@email.dz" onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
      <Inp label="Mot de passe" type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&doLogin()}/>
      {err&&<div style={{color:'#e02424',fontSize:11.5,marginBottom:10}}>{err}</div>}
      <BtnP onClick={doLogin} style={{width:'100%',justifyContent:'center',padding:9,fontSize:13}}>{busy?'Connexion…':'Connexion →'}</BtnP>
      <div style={{marginTop:14,padding:'10px 12px',background:'#f9fafb',borderRadius:8,fontSize:10.5,color:'#6b7280'}}>
        <b style={{display:'block',marginBottom:6}}>Comptes de démonstration :</b>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
          {HINTS.map(h=><div key={h.r} onClick={()=>{setEmail(h.e);setPw(h.p);}} style={{padding:'4px 7px',background:'#ffffff',borderRadius:5,cursor:'pointer',border:'1px solid #e5e7eb'}}>
            <div style={{fontWeight:600,color:'#111827',fontSize:10}}>{h.r}</div>
            <div style={{color:'#6b7280',fontSize:9.5}}>{h.e}</div>
          </div>)}
        </div>
      </div>
    </div>
  </div>;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const RESP_CSS = "*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{overflow:hidden;margin:0;-webkit-font-smoothing:antialiased}input,select,textarea{font-size:16px!important}@media(min-width:481px){input,select,textarea{font-size:inherit!important}}.app-layout{display:flex;height:100vh;overflow:hidden}.sidebar{transition:transform .3s cubic-bezier(.4,0,.2,1);flex-shrink:0;overflow-y:auto}.sidebar-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:299;backdrop-filter:blur(2px)}.sidebar-overlay.visible{display:block!important}.mobile-menu-btn{display:none;background:none;border:none;cursor:pointer;font-size:22px;padding:4px 6px;color:#374151;align-items:center;justify-content:center;min-height:36px;min-width:36px}.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%}.kpi-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:9px}.form-row-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:13px}.card-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}button{min-height:36px;touch-action:manipulation}@media(max-width:1024px){.kpi-grid{grid-template-columns:repeat(3,1fr)!important}}@media(max-width:768px){.sidebar{position:fixed;left:0;top:0;bottom:0;z-index:300;transform:translateX(-100%);width:240px!important;box-shadow:4px 0 24px rgba(0,0,0,.15)}.sidebar.open{transform:translateX(0)}.mobile-menu-btn{display:flex!important}.main-topbar{padding:0 10px!important}.page-content{padding:10px!important}}@media(max-width:600px){.kpi-grid{grid-template-columns:repeat(2,1fr)!important}.grid-4{grid-template-columns:1fr 1fr!important}.grid-2{grid-template-columns:1fr!important}.card-grid{grid-template-columns:1fr!important}.form-row-2{grid-template-columns:1fr!important}.dash-2col{grid-template-columns:1fr!important}.doc-new-layout{grid-template-columns:1fr!important}th{font-size:9px!important;padding:5px 7px!important}td{font-size:11px!important;padding:6px 7px!important}}html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}";


// ─── WORKCARD ─────────────────────────────────────────────────────────────────
function WorkCard({c,users,restoTypes,onComplete}) {
  const myStep=c._myStep;
  const doc=users.find(u=>u.id===c.docId);
  const rt=restoTypes.find(r=>r.id===c.rtId);
  const cfg=SC[myStep.s]||{l:myStep.s,bg:'#f3f4f6',c:'#374151',d:'#9ca3af'};
  const gain=(myStep.el||c.teeth?.length||1)*(RATE[myStep.s]||0);
  const isLate=c.due&&c.due<tod();
  const fileCount=(c.attachments||[]).length+(c.shadePhoto?1:0);
  return <div style={{borderRadius:10,background:'#fff',marginBottom:10,boxShadow:'0 2px 8px rgba(0,0,0,.08)',border:'1px solid #e5e7eb'}}>
    <div style={{background:cfg.bg,padding:'8px 12px',display:'flex',flexWrap:'wrap',alignItems:'center',gap:6,borderRadius:'10px 10px 0 0',borderBottom:'2px solid '+(cfg.d||'#e5e7eb')}}>
      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'#1a56db',fontWeight:700}}>{c.num}</span>
      <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:99,background:'#fff',color:cfg.c,border:'1px solid '+(cfg.d||cfg.c)}}>{cfg.l}</span>
      {fileCount>0&&<span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:99,background:'#1a56db',color:'#fff'}}>📎 {fileCount} fichier{fileCount>1?'s':''}</span>}
      {c.pri==='URGENT'&&<span style={{fontSize:11,fontWeight:700,color:'#dc2626'}}>URGENT</span>}
      {isLate&&<span style={{fontSize:11,fontWeight:700,color:'#dc2626',marginLeft:'auto'}}>En retard</span>}
    </div>
    <div style={{padding:'12px',overflow:'visible'}}>
      <div style={{fontSize:16,fontWeight:800,color:'#111827',marginBottom:8}}>{c.pf} {c.pl}</div>
      <AttachmentsViewer c={c}/>
      <div style={{fontSize:12,color:'#374151',marginBottom:3}}>Dentiste : <b>{doc?.name||'—'}</b></div>
      <div style={{fontSize:12,color:'#374151',marginBottom:3}}>Type : <b>{rt?.name||'—'}</b> | Teinte : <b>{c.sh||'—'}</b></div>
      <div style={{fontSize:12,color:'#374151',marginBottom:3}}>Dents : <b>{c.teeth?.join(', ')||'—'}</b> ({c.teeth?.length||0} elements)</div>
      <div style={{fontSize:12,color:isLate?'#dc2626':'#374151',marginBottom:10}}>Echeance : <b>{c.due}</b></div>
      {c.notes&&<div style={{fontSize:11,color:'#92400e',background:'#fef3c7',borderRadius:6,padding:'5px 9px',marginBottom:8}}>{c.notes}</div>}
      {(c.images||[]).length>0&&<div style={{marginBottom:10,marginTop:-4,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))',gap:5}}>
        {(c.images||[]).map(img=><div key={img.id} style={{borderRadius:7,overflow:'hidden',border:'1px solid #bfdbfe'}}>
          <img src={img.url} alt={img.name} style={{width:'100%',height:60,objectFit:'cover',display:'block'}}/>
        </div>)}
      </div>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'#f0fdf4',borderRadius:8,marginBottom:12}}>
        <span style={{fontSize:12,color:'#374151'}}>Gain etape</span>
        <span style={{fontSize:17,fontWeight:800,color:'#16a34a'}}>{fmt(gain)}</span>
      </div>
      {c._isActive
        ?<button onClick={()=>onComplete(c.id,myStep.s)} style={{display:'block',width:'100%',padding:'12px',borderRadius:8,border:'none',background:'#1a56db',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer',textAlign:'center'}}>Terminer : {cfg.l}</button>
        :<div style={{padding:'10px',borderRadius:8,background:'#f3f4f6',textAlign:'center',fontSize:12,color:'#6b7280',border:'1px dashed #d1d5db'}}>En attente — votre etape : <b style={{color:'#1a56db'}}>{cfg.l}</b></div>
      }
    </div>
  </div>;
}


// ─── DELIVERY PAGE ────────────────────────────────────────────────────────────
function DeliveryPage({cases,setCases,invoices,users,restoTypes,showToast,user,settings}) {
  const ready=cases.filter(c=>c.status==='READY');
  const delivered=cases.filter(c=>c.status==='DELIVERED').slice(-20).reverse();
  const printInvoiceForCase=(c)=>{
    const inv=invoices.find(i=>i.caseIds?.includes(c.id));
    if(!inv){showToast('Aucune facture trouvée pour ce dossier');return;}
    const doc=users.find(u=>u.id===inv.docId);
    const html=buildInvoiceHTML(inv,cases,[doc||{}],{...(settings||{}),restoTypes});
    openPrintWindow(html);
  };
  const deliverCase=(c)=>{
    setCases(p=>p.map(x=>x.id===c.id?{...x,status:'DELIVERED',deliveredDate:tod(),deliveredBy:user.id}:x));
    showToast('Livré : '+c.num);
    setTimeout(()=>printInvoiceForCase(c),300);
  };
  return <>
    <div className="kpi-grid" style={{gap:9}}>
      <Kpi label="Prets a livrer"   val={ready.length} col="#d97706"/>
      <Kpi label="Livres ce mois"   val={cases.filter(c=>c.deliveredDate&&c.deliveredDate.startsWith(tod().slice(0,7))).length} col="#0e9f6e"/>
      <Kpi label="Total livres"     val={cases.filter(c=>c.status==='DELIVERED').length} col="#1a56db"/>
      <Kpi label="Non payes"        val={cases.filter(c=>c.status==='DELIVERED'&&invoices.some(i=>i.caseIds?.includes(c.id)&&i.status!=='PAID')).length} col="#e02424"/>
    </div>
    {ready.length>0&&<Card><CH title={"En attente de livraison ("+ready.length+")"}/>
      <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}><thead><tr>{['Dossier','Patient','Dentiste','Echeance','Facture','Action'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
      <tbody>{ready.map(c=>{
        const doc=users.find(u=>u.id===c.docId);
        const inv=invoices.find(i=>i.caseIds?.includes(c.id));
        return <tr key={c.id}>
          <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:'#1a56db'}}>{c.num}</td>
          <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:500}}>{c.pf} {c.pl}</td>
          <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6'}}>{doc?.name||'—'}</td>
          <td style={{padding:'8px 11px',fontSize:10.5,borderBottom:'1px solid #f3f4f6',color:c.due<tod()?'#e02424':'#374151',fontFamily:"'JetBrains Mono',monospace"}}>{c.due}</td>
          <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}>{inv?<span style={{fontSize:10.5,padding:'2px 7px',borderRadius:99,background:inv.status==='PAID'?'#f0fdf4':'#fef2f2',color:inv.status==='PAID'?'#16a34a':'#dc2626',fontWeight:600}}>{inv.status==='PAID'?'Paye':'Impaye'}</span>:'—'}</td>
          <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><Btn variant="primary" sm onClick={()=>deliverCase(c)}>Livrer + Imprimer</Btn></td>
        </tr>;
      })}</tbody></table></div>
    </Card>}
    <Card><CH title="Historique des livraisons"/>
      <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:480}}><thead><tr>{['Dossier','Patient','Dentiste','Livre le','Livre par','Facture',''].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
      <tbody>{delivered.length===0?<tr><td colSpan={7} style={{padding:20,textAlign:'center',color:'#6b7280',fontSize:12}}>Aucune livraison</td></tr>:delivered.map(c=>{
        const doc=users.find(u=>u.id===c.docId);const delBy=users.find(u=>u.id===c.deliveredBy);const inv=invoices.find(i=>i.caseIds?.includes(c.id));
        return <tr key={c.id}>
          <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:'#1a56db'}}>{c.num}</td>
          <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:500}}>{c.pf} {c.pl}</td>
          <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6'}}>{doc?.name||'—'}</td>
          <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6',color:'#0e9f6e',fontWeight:500}}>{c.deliveredDate||'—'}</td>
          <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6'}}>{delBy?.name||'—'}</td>
          <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}>{inv?<span style={{fontSize:10.5,padding:'2px 7px',borderRadius:99,background:inv.status==='PAID'?'#f0fdf4':'#fef2f2',color:inv.status==='PAID'?'#16a34a':'#dc2626',fontWeight:600}}>{inv.status==='PAID'?'Paye':'Impaye'}</span>:'—'}</td>
          <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}>{inv&&<button onClick={()=>printInvoiceForCase(c)} style={{border:'none',background:'none',cursor:'pointer',fontSize:14}} title="Imprimer la facture">🖨</button>}</td>
        </tr>;
      })}</tbody></table></div>
    </Card>
  </>;
}

// ─── MAINTENANCE PAGE ─────────────────────────────────────────────────────────
function MaintenancePage({equipment,setEquipment,showToast}) {
  const [selEq,setSelEq]=useState('');const [formOpen,setFormOpen]=useState(false);
  const [mDate,setMDate]=useState(tod());const [mNote,setMNote]=useState('');const [mHours,setMHours]=useState('');const [mNext,setMNext]=useState('');
  const due=equipment.filter(e=>e.nextMaint&&e.nextMaint<=tod());
  return <>
    <div className="kpi-grid" style={{gap:9}}>
      <Kpi label="Total equipements" val={equipment.length} col="#1a56db"/>
      <Kpi label="Maintenance due"   val={due.length}       col="#e02424"/>
      <Kpi label="Actifs"            val={equipment.filter(e=>e.status==='Actif').length} col="#0e9f6e"/>
    </div>
    {due.length>0&&<Alert type="error">Maintenance requise : {due.map(e=>e.name).join(', ')}</Alert>}
    <div style={{display:'flex',justifyContent:'flex-end'}}><Btn variant="primary" onClick={()=>setFormOpen(v=>!v)}>Enregistrer maintenance</Btn></div>
    {formOpen&&<Card><CH title="Nouvelle maintenance"/>
      <div style={{padding:'12px 14px'}}>
        <select value={selEq} onChange={e=>setSelEq(e.target.value)} style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,marginBottom:8}}>
          <option value=''>-- Choisir equipement --</option>{equipment.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <Fr2><Inp label="Date" type="date" value={mDate} onChange={e=>setMDate(e.target.value)}/><Inp label="Heures" type="number" value={mHours} onChange={e=>setMHours(e.target.value)} placeholder="ex: 120"/></Fr2>
        <Inp label="Prochaine maintenance" type="date" value={mNext} onChange={e=>setMNext(e.target.value)}/>
        <Inp label="Observations" value={mNote} onChange={e=>setMNote(e.target.value)} placeholder="Travaux effectues..."/>
        <div style={{display:'flex',gap:8,marginTop:10}}>
          <Btn variant="primary" onClick={()=>{if(!selEq){showToast('Selectionnez un equipement');return;}setEquipment(p=>p.map(e=>e.id!==selEq?e:{...e,lastMaint:mDate,nextMaint:mNext||null,runHours:(e.runHours||0)+Number(mHours||0),maintHistory:[...(e.maintHistory||[]),{date:mDate,hours:Number(mHours||0),note:mNote}]}));showToast('Maintenance enregistree');setFormOpen(false);}}>Enregistrer</Btn>
          <Btn variant="ghost" onClick={()=>setFormOpen(false)}>Annuler</Btn>
        </div>
      </div>
    </Card>}
    <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}><thead><tr>{['Equipement','Statut','Derniere maintenance','Prochaine','Heures','Alerte'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
    <tbody>{equipment.map(e=>{const isDue=e.nextMaint&&e.nextMaint<=tod();const isSoon=e.nextMaint&&e.nextMaint>tod()&&e.nextMaint<=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
      return <tr key={e.id} style={{background:isDue?'#fef2f2':isSoon?'#fffbeb':'transparent'}}>
        <td style={{padding:'10px 12px',borderBottom:'1px solid #f3f4f6'}}><div style={{fontWeight:600,fontSize:12.5}}>{e.name}</div><div style={{fontSize:10,color:'#6b7280'}}>{e.brand}</div></td>
        <td style={{padding:'10px 12px',borderBottom:'1px solid #f3f4f6'}}><span style={{fontSize:11,fontWeight:500,padding:'2px 8px',borderRadius:99,background:e.status==='Actif'?'#f0fdf4':'#fef2f2',color:e.status==='Actif'?'#16a34a':'#dc2626'}}>{e.status}</span></td>
        <td style={{padding:'10px 12px',fontSize:11,borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace"}}>{e.lastMaint||'—'}</td>
        <td style={{padding:'10px 12px',fontSize:11,borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace",color:isDue?'#dc2626':isSoon?'#d97706':'#374151',fontWeight:isDue||isSoon?700:400}}>{e.nextMaint||'—'}</td>
        <td style={{padding:'10px 12px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:600,textAlign:'center'}}>{e.runHours||0} h</td>
        <td style={{padding:'10px 12px',borderBottom:'1px solid #f3f4f6'}}>{isDue?<span style={{fontSize:10.5,fontWeight:700,padding:'2px 8px',borderRadius:99,background:'#fef2f2',color:'#dc2626'}}>DUE</span>:isSoon?<span style={{fontSize:10.5,fontWeight:700,padding:'2px 8px',borderRadius:99,background:'#fffbeb',color:'#d97706'}}>Bientot</span>:<span style={{fontSize:10.5,color:'#6b7280'}}>OK</span>}</td>
      </tr>;})}
    </tbody></table></div>
  </>;
}

// ─── DOCTOR MESSAGES PAGE ─────────────────────────────────────────────────────
function DocMessagesPage({user,cases,setCases,users,showToast}) {
  const [selCase,setSelCase]=useState('');const [txt,setTxt]=useState('');
  const myCases=cases.filter(c=>c.docId===user.id);
  const c=myCases.find(x=>x.id===selCase)||myCases[0]||null;
  const send=()=>{if(!txt.trim()||!c)return;const cm={id:'cm'+Date.now(),uid:user.id,text:txt.trim(),ts:new Date().toLocaleString('fr-DZ')};setCases(p=>p.map(x=>x.id===c.id?{...x,comments:[...(x.comments||[]),cm]}:x));setTxt('');showToast('Message envoye');};
  return <>
    <Alert type="info">Communiquez avec le laboratoire via vos dossiers.</Alert>
    <div className="grid-2" style={{gap:13}}>
      <Card style={{maxHeight:500,display:'flex',flexDirection:'column'}}>
        <CH title="Mes dossiers"/>
        <div style={{flex:1,overflowY:'auto'}}>
          {myCases.length===0?<div style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun dossier</div>:
          myCases.map(cs=><div key={cs.id} onClick={()=>setSelCase(cs.id)} style={{padding:'10px 14px',borderBottom:'1px solid #f3f4f6',cursor:'pointer',background:c?.id===cs.id?'#eff6ff':'transparent',borderLeft:c?.id===cs.id?'3px solid #1a56db':'3px solid transparent'}}>
            <div style={{fontWeight:600,fontSize:12}}>{cs.num}</div>
            <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{cs.pf} {cs.pl}</div>
            {(cs.comments||[]).length>0&&<div style={{fontSize:10.5,color:'#9ca3af',marginTop:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{(cs.comments||[]).slice(-1)[0]?.text}</div>}
          </div>)}
        </div>
      </Card>
      <Card style={{display:'flex',flexDirection:'column',maxHeight:500}}>
        {!c?<div style={{padding:40,textAlign:'center',color:'#9ca3af',fontSize:12}}>Selectionnez un dossier</div>:<>
          <CH title={c.num+" — "+c.pf+" "+c.pl}/>
          <div style={{flex:1,overflowY:'auto',padding:'8px 14px',maxHeight:340}}>
            {(c.comments||[]).length===0?<div style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun message</div>:
            (c.comments||[]).map(cm=>{const isMe=cm.uid===user.id;const u=users.find(x=>x.id===cm.uid);return <div key={cm.id} style={{marginBottom:10,display:'flex',flexDirection:isMe?'row-reverse':'row',gap:8,alignItems:'flex-end'}}>
              <div style={{width:28,height:28,borderRadius:99,background:u?.col||'#6b7280',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'#fff',flexShrink:0}}>{(u?.name||'?').split(' ').map(n=>n[0]).join('').slice(0,2)}</div>
              <div style={{maxWidth:'70%'}}><div style={{fontSize:9.5,color:'#9ca3af',marginBottom:3,textAlign:isMe?'right':'left'}}>{u?.name||'?'} · {cm.ts}</div><div style={{padding:'8px 12px',borderRadius:10,background:isMe?'#1a56db':'#f3f4f6',color:isMe?'#fff':'#111827',fontSize:12,lineHeight:1.5}}>{cm.text}</div></div>
            </div>;})}
          </div>
          <div style={{padding:'10px 14px',borderTop:'1px solid #f3f4f6',display:'flex',gap:8}}>
            <input value={txt} onChange={e=>setTxt(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Ecrire au laboratoire..." style={{flex:1,padding:'7px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,outline:'none'}}/>
            <Btn variant="primary" onClick={send}>Envoyer</Btn>
          </div>
        </>}
      </Card>
    </div>
  </>;
}


// ─── TECH PAY ADMIN PAGE ──────────────────────────────────────────────────────
function TechPayAdminPage({users,cases,invoices,techPayments,setTechPayments,showToast,settings,setModal}) {
  const techs = users.filter(u=>u.role==='TECHNICIAN');
  const [selTech, setSelTech] = useState(techs[0]?.id||'');
  const [period, setPeriod]   = useState('all');
  const [payModal, setPayModal] = useState(null);
  const [view, setView] = useState('summary'); // 'summary' | 'detail'
  const [editPay, setEditPay] = useState(null); // {id,amount,note,date}

  const now = new Date();
  const curMonth = now.toISOString().slice(0,7);
  const curYear  = now.getFullYear().toString();

  // Build step records for every tech
  const buildSteps = (t) =>
    cases.flatMap(c =>
      c.wf
        .filter(w => w.done && w.s!=='RECEIVED' && w.s!=='READY' &&
          (w.tId===t.id || (c.techId===t.id && !w.tId)))
        .map(w => {
          const gain = (w.el||c.teeth?.length||1) * (RATE[w.s]||t.rate||0);
          // month from step end date, fallback to case due, fallback to curMonth
          const stepDate = (w.end&&w.end.length>=7?w.end:null)||(w.start&&w.start.length>=7?w.start:null)||c.due||curMonth+'-01';
          const month    = stepDate.slice(0,7);
          return { ...w, gain, month, caseObj: c };
        })
    );

  // Per-tech stats
  const techStats = techs.map(t => {
    const steps       = buildSteps(t);
    const earned      = steps.reduce((s,w)=>s+w.gain, 0);
    const versed      = (techPayments||[]).filter(p=>p.techId===t.id).reduce((s,p)=>s+p.amount,0);
    const due         = Math.max(0, earned - versed);
    const monthEarned = steps.filter(w=>w.month===curMonth).reduce((s,w)=>s+w.gain,0);
    const yearEarned  = steps.filter(w=>w.month.startsWith(curYear)).reduce((s,w)=>s+w.gain,0);
    const payments    = (techPayments||[]).filter(p=>p.techId===t.id).sort((a,b)=>b.date.localeCompare(a.date));
    return { tech:t, steps, earned, versed, due, monthEarned, yearEarned, payments };
  });

  const sel = techStats.find(x=>x.tech.id===selTech) || techStats[0];

  // Filter steps for detail view
  const allMonths=[...new Set((sel?.steps||[]).map(w=>w.month))].sort().reverse();
  const latestMonth=allMonths[0]||curMonth;
  const latestYear=latestMonth.slice(0,4);
  let filtSteps = sel?.steps||[];
  if(period==='month') filtSteps = filtSteps.filter(w=>w.month===latestMonth);
  if(period==='year')  filtSteps = filtSteps.filter(w=>w.month.startsWith(latestYear));

  // Group by month
  const byMonth = {};
  filtSteps.forEach(w=>{
    if(!byMonth[w.month]) byMonth[w.month]={steps:[],total:0};
    byMonth[w.month].steps.push(w);
    byMonth[w.month].total+=w.gain;
  });
  const months = Object.keys(byMonth).sort().reverse();

  // Group by case (for case view)
  const byCase = {};
  filtSteps.forEach(w=>{
    const id=w.caseObj.id;
    if(!byCase[id]) byCase[id]={c:w.caseObj,steps:[],total:0};
    byCase[id].steps.push(w);
    byCase[id].total+=w.gain;
  });
  const caseList = Object.values(byCase).sort((a,b)=>b.total-a.total);

  const openPay=(stat)=>setPayModal({techId:stat.tech.id,techName:stat.tech.name,due:stat.due,amount:stat.due,note:'Paiement salaire'});

  return <>
    {/* ── SUMMARY TABLE ─────────────────────────────────── */}
    <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
      <div style={{padding:'11px 14px',borderBottom:'1px solid #f3f4f6',background:'#fafafa',borderRadius:'11px 11px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontWeight:700,fontSize:14,color:'#111827'}}>Tous les techniciens ({techs.length})</span>
        <button onClick={()=>{
          const rows=techStats.map(({tech,earned,versed,due,monthEarned,yearEarned})=>[
            tech.name,tech.spec||'—',fmtDA(monthEarned),fmtDA(yearEarned),fmtDA(earned),fmtDA(versed),due>0?fmtDA(due):'À jour'
          ]);
          const totEarned=techStats.reduce((s,t)=>s+t.earned,0);
          const totVersed=techStats.reduce((s,t)=>s+t.versed,0);
          const totDue=techStats.reduce((s,t)=>s+t.due,0);
          const inner=reportTableHTML(
            [{label:'Technicien'},{label:'Spécialité'},{label:'Ce mois',align:'right'},{label:'Cette année',align:'right'},{label:'Total gagné',align:'right'},{label:'Versé',align:'right'},{label:'Restant dû',align:'right'}],
            rows,
            ['TOTAL','','','',fmtDA(totEarned),fmtDA(totVersed),fmtDA(totDue)]
          );
          printReport(settings,'Paiements Techniciens — Récapitulatif',techs.length+' technicien(s)',inner,{landscape:true});
        }} style={{padding:'6px 14px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>🖨 Imprimer</button>
      </div>
      <div className="table-wrap" style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:640}}>
          <thead><tr>
            {['Technicien','Spécialité','Ce mois','Cette année','Total gagné','Versé','Restant dû',''].map(h=>
              <th key={h} style={{padding:'9px 12px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>
            )}
          </tr></thead>
          <tbody>{techStats.map(stat=>{
            const {tech,earned,versed,due,monthEarned,yearEarned}=stat;
            const isSelected=selTech===tech.id;
            return <tr key={tech.id}
              style={{background:isSelected?'#eff6ff':'transparent',cursor:'pointer'}}
              onClick={()=>{setSelTech(tech.id);setView('detail');}}>
              <td style={{padding:'11px 12px',borderBottom:'1px solid #f3f4f6'}}>
                <div style={{display:'flex',alignItems:'center',gap:9}}>
                  <div style={{width:36,height:36,borderRadius:99,background:tech.col||'#1a56db',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0}}>
                    {tech.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,color:'#111827'}}>{tech.name}</div>
                    <div style={{fontSize:10.5,color:'#6b7280'}}>{fmt(tech.rate||0)}/élément</div>
                  </div>
                </div>
              </td>
              <td style={{padding:'11px 12px',fontSize:11,borderBottom:'1px solid #f3f4f6',color:'#6b7280'}}>{tech.spec||'—'}</td>
              <td style={{padding:'11px 12px',fontSize:13,fontWeight:600,borderBottom:'1px solid #f3f4f6',color:'#1a56db'}}>{fmtDA(monthEarned)}</td>
              <td style={{padding:'11px 12px',fontSize:13,fontWeight:600,borderBottom:'1px solid #f3f4f6',color:'#7e3af2'}}>{fmtDA(yearEarned)}</td>
              <td style={{padding:'11px 12px',fontSize:13,fontWeight:700,borderBottom:'1px solid #f3f4f6'}}>{fmtDA(earned)}</td>
              <td style={{padding:'11px 12px',fontSize:12,borderBottom:'1px solid #f3f4f6',color:'#16a34a',fontWeight:600}}>{fmtDA(versed)}</td>
              <td style={{padding:'11px 12px',borderBottom:'1px solid #f3f4f6'}}>
                {due>0
                  ?<span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:99,background:'#fef2f2',color:'#dc2626',display:'inline-block'}}>{fmtDA(due)}</span>
                  :<span style={{fontSize:12,fontWeight:600,padding:'3px 10px',borderRadius:99,background:'#f0fdf4',color:'#16a34a',display:'inline-block'}}>À jour</span>}
              </td>
              <td style={{padding:'11px 12px',borderBottom:'1px solid #f3f4f6'}}>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={e=>{e.stopPropagation();setModal({t:'techStatement',tid:tech.id});}}
                    style={{padding:'5px 10px',borderRadius:6,border:'1px solid #d1d5db',background:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>
                    🖨 Relevé
                  </button>
                  <button onClick={e=>{e.stopPropagation();setSelTech(tech.id);setView('detail');}}
                    style={{padding:'5px 10px',borderRadius:6,border:'1px solid #d1d5db',background:'#f9fafb',cursor:'pointer',fontSize:11,fontWeight:500}}>
                    Détail
                  </button>
                  {due>0&&<button onClick={e=>{e.stopPropagation();openPay(stat);}}
                    style={{padding:'5px 10px',borderRadius:6,border:'none',background:'#16a34a',color:'#fff',cursor:'pointer',fontSize:11,fontWeight:600}}>
                    Payer
                  </button>}
                </div>
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </div>

    {/* ── DETAIL VIEW ───────────────────────────────────── */}
    {sel&&view==='detail'&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
      <div style={{padding:'11px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,background:'#fafafa',borderRadius:'11px 11px 0 0'}}><span style={{fontWeight:700,fontSize:14,color:'#111827'}}>Détail — {sel.tech.name}</span>
        <button onClick={()=>setView('summary')} style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid #d1d5db',background:'#f9fafb',cursor:'pointer'}}>← Retour</button></div>

      {/* Tech KPI bar */}
      <div style={{padding:'12px 14px',background:'#f9fafb',borderBottom:'1px solid #f3f4f6',display:'flex',flexWrap:'wrap',gap:16}}>
        <div><div style={{fontSize:10,color:'#6b7280',marginBottom:2}}>Total gagné</div><div style={{fontSize:16,fontWeight:800,color:'#1a56db'}}>{fmtDA(sel.earned)}</div></div>
        <div><div style={{fontSize:10,color:'#6b7280',marginBottom:2}}>Total versé</div><div style={{fontSize:16,fontWeight:800,color:'#16a34a'}}>{fmtDA(sel.versed)}</div></div>
        <div><div style={{fontSize:10,color:'#6b7280',marginBottom:2}}>Restant dû</div><div style={{fontSize:16,fontWeight:800,color:sel.due>0?'#dc2626':'#6b7280'}}>{fmtDA(sel.due)}</div></div>
        <div><div style={{fontSize:10,color:'#6b7280',marginBottom:2}}>Étapes totales</div><div style={{fontSize:16,fontWeight:800,color:'#7e3af2'}}>{sel.steps.length}</div></div>
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center'}}>
          {sel.due>0&&<button onClick={()=>openPay(sel)} style={{padding:'8px 16px',borderRadius:8,border:'none',background:'#16a34a',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Payer {fmtDA(sel.due)}</button>}
          <button onClick={()=>{
            const t=sel.tech;
            const mMap={};
            filtSteps.forEach(w=>{if(!mMap[w.month])mMap[w.month]={steps:[],total:0};mMap[w.month].steps.push(w);mMap[w.month].total+=w.gain;});
            let stepsHtml='';
            Object.keys(mMap).sort().reverse().forEach(m=>{
              const rows=mMap[m].steps.map(w=>{const cfg=SC[w.s]||{l:w.s};return [w.caseObj.num,w.caseObj.pf+' '+w.caseObj.pl,cfg.l,(w.el||1)+'',fmtDA(w.gain)];});
              stepsHtml+='<div style="font-size:12px;font-weight:700;color:#1a56db;margin:14px 0 6px">'+m+' — '+fmtDA(mMap[m].total)+'</div>'+
                reportTableHTML([{label:'Dossier'},{label:'Patient'},{label:'Étape'},{label:'Él.',align:'right'},{label:'Gain',align:'right'}],rows,null,settings?.primaryColor);
            });
            const payRows=sel.payments.map(p=>[p.date,p.note,fmtDA(p.amount)]);
            const paymentsHtml='<div style="font-size:13px;font-weight:700;color:#111827;margin:18px 0 8px">Versements effectués</div>'+
              reportTableHTML([{label:'Date'},{label:'Note'},{label:'Montant',align:'right'}],payRows,['','TOTAL',fmtDA(sel.versed)],settings?.primaryColor);
            const summaryHtml='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">'+
              '<div style="background:#eff6ff;border-radius:8px;padding:12px 14px"><div style="font-size:10px;font-weight:700;color:#1e40af;text-transform:uppercase">Total gagné</div><div style="font-size:17px;font-weight:800;color:#1a56db">'+fmtDA(sel.earned)+'</div></div>'+
              '<div style="background:#f0fdf4;border-radius:8px;padding:12px 14px"><div style="font-size:10px;font-weight:700;color:#166534;text-transform:uppercase">Total versé</div><div style="font-size:17px;font-weight:800;color:#16a34a">'+fmtDA(sel.versed)+'</div></div>'+
              '<div style="background:'+(sel.due>0?'#fef2f2':'#f0fdf4')+';border-radius:8px;padding:12px 14px"><div style="font-size:10px;font-weight:700;color:'+(sel.due>0?'#991b1b':'#166534')+';text-transform:uppercase">Restant dû</div><div style="font-size:17px;font-weight:800;color:'+(sel.due>0?'#dc2626':'#16a34a')+'">'+fmtDA(sel.due)+'</div></div>'+
            '</div>';
            printReport(settings,'Situation de Paiement — '+t.name,(t.spec||'—')+' · Tarif '+fmt(t.rate||0)+'/élément',summaryHtml+stepsHtml+paymentsHtml);
          }} style={{padding:'8px 14px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            🖨 Imprimer relevé
          </button>
          <button onClick={()=>{
            const rows=[['Date','Dossier','Patient','Etape','Elements','Gain DA']];
            filtSteps.forEach(w=>{const cfg=SC[w.s]||{l:w.s};rows.push([w.stepDate||w.month,w.caseObj.num,w.caseObj.pf+' '+w.caseObj.pl,cfg.l,w.el||1,w.gain]);});
            rows.push(['','','','TOTAL','',filtSteps.reduce((s,w)=>s+w.gain,0)]);
            const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
            try{
              const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
              const a=document.createElement('a');a.href=URL.createObjectURL(blob);
              a.download='paiement_'+t.name.replace(/ /g,'_')+'.csv';
              document.body.appendChild(a);a.click();document.body.removeChild(a);
              showToast('CSV exporte');
            }catch(e){navigator.clipboard.writeText(csv).then(()=>showToast('Copie — collez dans Excel'));}
          }} style={{padding:'8px 14px',borderRadius:8,border:'none',background:'#7e3af2',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
            Export CSV
          </button>
        </div>
      </div>

      {/* Period filter */}
      <div style={{padding:'10px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:11,color:'#6b7280',fontWeight:500}}>Période :</span>
        {[['all','Tout'],['month','Mois: '+latestMonth],['year','Année: '+latestYear]].map(([v,l])=>
          <button key={v} onClick={()=>setPeriod(v)} style={{padding:'4px 12px',borderRadius:99,border:'none',cursor:'pointer',fontSize:11.5,fontWeight:period===v?700:400,background:period===v?'#1a56db':'#f3f4f6',color:period===v?'#fff':'#374151'}}>{l}</button>
        )}
        <span style={{fontSize:11,color:'#6b7280',marginLeft:'auto'}}>{filtSteps.length} étapes — {fmtDA(filtSteps.reduce((s,w)=>s+w.gain,0))}</span>
      </div>

      {/* By month breakdown */}
      <div style={{padding:'12px 14px'}}>
        {months.length===0&&<div style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:13}}>Aucune étape pour cette période</div>}
        {months.map(m=><div key={m} style={{marginBottom:16,border:'1px solid #e5e7eb',borderRadius:10,overflow:'hidden'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:'#f9fafb',borderBottom:'1px solid #e5e7eb'}}>
            <div style={{fontWeight:700,fontSize:13,color:'#111827'}}>{(()=>{const [y,mo]=m.split('-');const names=['','Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];return (names[parseInt(mo)]||mo)+' '+y;})()}</div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#6b7280'}}>{byMonth[m].steps.length} étapes</span>
              <span style={{fontSize:14,fontWeight:800,color:'#7e3af2'}}>{fmtDA(byMonth[m].total)}</span>
            </div>
          </div>
          <div className="table-wrap">
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:460}}>
              <thead><tr>
                {['Dossier','Patient','Étape','Él.','Tarif/él.','Gain'].map(h=>
                  <th key={h} style={{padding:'6px 12px',textAlign:'left',fontSize:9,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'1px solid #f3f4f6',background:'#fafafa',whiteSpace:'nowrap'}}>{h}</th>
                )}
              </tr></thead>
              <tbody>{byMonth[m].steps.map((w,i)=>{
                const cfg=SC[w.s]||{l:w.s,bg:'#f3f4f6',c:'#374151'};
                const unitRate=RATE[w.s]||sel.tech.rate||0;
                return <tr key={i} style={{background:i%2===0?'#fff':'#fafafa'}}>
                  <td style={{padding:'8px 12px',borderBottom:'1px solid #f3f4f6'}}>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#1a56db',fontWeight:600}}>{w.caseObj.num}</span>
                  </td>
                  <td style={{padding:'8px 12px',fontSize:11.5,borderBottom:'1px solid #f3f4f6',fontWeight:500}}>{w.caseObj.pf} {w.caseObj.pl}</td>
                  <td style={{padding:'8px 12px',borderBottom:'1px solid #f3f4f6'}}>
                    <span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:99,background:cfg.bg,color:cfg.c}}>{cfg.l}</span>
                  </td>
                  <td style={{padding:'8px 12px',fontSize:13,fontWeight:700,borderBottom:'1px solid #f3f4f6',textAlign:'center'}}>{w.el||1}</td>
                  <td style={{padding:'8px 12px',fontSize:11,borderBottom:'1px solid #f3f4f6',color:'#6b7280'}}>{fmtDA(unitRate)}</td>
                  <td style={{padding:'8px 12px',fontSize:13,fontWeight:700,color:'#7e3af2',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{fmtDA(w.gain)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </div>)}

        {/* Payment history */}
        {sel.payments.length>0&&<>
          <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:10,marginTop:8}}>Historique des versements</div>
          {sel.payments.map(p=>editPay&&editPay.id===p.id?(
            <div key={p.id} style={{padding:'10px 14px',marginBottom:6,background:'#eff6ff',borderRadius:9,border:'1px solid #93c5fd'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                <div><label style={{fontSize:9.5,color:'#6b7280',display:'block',marginBottom:2}}>Montant</label><input type="number" value={editPay.amount} onChange={e=>setEditPay({...editPay,amount:Number(e.target.value)})} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}}/></div>
                <div><label style={{fontSize:9.5,color:'#6b7280',display:'block',marginBottom:2}}>Note</label><input value={editPay.note} onChange={e=>setEditPay({...editPay,note:e.target.value})} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}}/></div>
                <div><label style={{fontSize:9.5,color:'#6b7280',display:'block',marginBottom:2}}>Date</label><input type="date" value={editPay.date} onChange={e=>setEditPay({...editPay,date:e.target.value})} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}}/></div>
              </div>
              <div style={{display:'flex',gap:6,justifyContent:'flex-end'}}>
                <button onClick={()=>setEditPay(null)} style={{padding:'6px 12px',borderRadius:6,border:'1px solid #d1d5db',background:'#fff',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>Annuler</button>
                <button onClick={()=>{
                  if(!editPay.amount||editPay.amount<=0){showToast('Montant invalide');return;}
                  setTechPayments(prev=>prev.map(x=>x.id===p.id?{...x,amount:editPay.amount,note:editPay.note,date:editPay.date}:x));
                  showToast('Versement modifié ✓');setEditPay(null);
                }} style={{padding:'6px 12px',borderRadius:6,border:'none',background:'#1a56db',color:'#fff',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>✓ Enregistrer</button>
              </div>
            </div>
          ):(
            <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',marginBottom:6,background:'#f0fdf4',borderRadius:9,border:'1px solid #bbf7d0'}}>
              <div>
                <div style={{fontSize:12,fontWeight:500,color:'#111827'}}>{p.note}</div>
                <div style={{fontSize:10.5,color:'#6b7280',marginTop:2}}>{p.date}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{fontSize:15,fontWeight:800,color:'#16a34a'}}>{fmtDA(p.amount)}</div>
                <button onClick={()=>setEditPay({id:p.id,amount:p.amount,note:p.note,date:p.date})} title="Modifier" style={{border:'none',background:'none',cursor:'pointer',fontSize:14}}>✏</button>
                <button onClick={()=>{
                  if(!window.confirm('Supprimer ce versement ?'))return;
                  setTechPayments(prev=>prev.filter(x=>x.id!==p.id));
                  showToast('Versement supprimé');
                }} title="Supprimer" style={{border:'none',background:'none',cursor:'pointer',fontSize:14,color:'#dc2626'}}>🗑</button>
              </div>
            </div>
          ))}
        </>}
      </div>
    </div>}

    {/* ── PAY MODAL ─────────────────────────────────────── */}
    {payModal&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400,padding:16}} onClick={e=>e.target===e.currentTarget&&setPayModal(null)}>
      <div style={{background:'#fff',borderRadius:14,width:'min(92vw,440px)',padding:24,boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
        <div style={{fontWeight:800,fontSize:17,marginBottom:3}}>Payer — {payModal.techName}</div>
        <div style={{fontSize:12,color:'#6b7280',marginBottom:20}}>Restant dû : <b style={{color:'#dc2626'}}>{fmtDA(payModal.due)}</b></div>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:11,fontWeight:600,color:'#374151',display:'block',marginBottom:4}}>Montant à verser (DA)</label>
          <input type="number" value={payModal.amount} onChange={e=>setPayModal({...payModal,amount:Number(e.target.value)})}
            style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'2px solid #d1d5db',fontSize:16,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{fontSize:11,fontWeight:600,color:'#374151',display:'block',marginBottom:4}}>Note / Description</label>
          <input value={payModal.note} onChange={e=>setPayModal({...payModal,note:e.target.value})}
            style={{width:'100%',padding:'9px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:13,outline:'none',boxSizing:'border-box'}}/>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>{
            if(!payModal.amount||payModal.amount<=0){showToast('Montant invalide');return;}
            const rec={id:'pay'+Date.now(),techId:payModal.techId,amount:payModal.amount,note:payModal.note||'Paiement salaire',date:tod()};
            setTechPayments(p=>[rec,...(p||[])]);
            showToast('Versement de '+fmtDA(payModal.amount)+' enregistré le '+tod()+' pour '+payModal.techName+' ✓');
            setPayModal(null);
          }} style={{flex:1,padding:'11px',borderRadius:8,border:'none',background:'#16a34a',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>
            Confirmer le versement
          </button>
          <button onClick={()=>setPayModal(null)} style={{padding:'11px 18px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:13,cursor:'pointer',fontWeight:500}}>
            Annuler
          </button>
        </div>
      </div>
    </div>}
  </>;
}


export default function DentLab() {
    const [users,setUsers]=useState([]);
  const [cases,setCases]=useState([]);
  const [invoices,setInvoices]=useState([]);
  const [mats,setMats]=useState([]);
  const [supps,setSupps]=useState([]);
  const [orders,setOrders]=useState([]);
  const [restoTypes,setRestoTypes]=useState([]);
  const [stageDefs,setStageDefs]=useState(INIT_STAGE_DEFS);
  const [expenses,setExpenses]=useState([]);
  const [expenseCats,setExpenseCats]=useState([]);
  const [caisse,setCaisse]=useState([]);
  const [settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [equipment,setEquipment]=useState([]);
  const [notifications,setNotifications]=useState([]);
  const [stockMovements,setStockMovements]=useState([]);
  const [notifOpen,setNotifOpen]=useState(false);
  const [techPayments,setTechPayments]=useState([]); // {id,techId,amount,note,date}
  const [archives,setArchives]=useState([]);
  const [auditLog,setAuditLog]=useState([]);
  const [archivePolicy,setArchivePolicy]=useState({autoArchiveMonths:12,enabled:false});
  const [user,setUser]=useState(null);
  const [page,setPage]=useState('dashboard');
  const [modal,setModal]=useState(null);
  const [toast,setToast]=useState(null);
  const [search,setSearch]=useState('');
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [printHtml,setPrintHtml]=useState(null);
  const [authChecked,setAuthChecked]=useState(false); // true une fois qu'on a vérifié un éventuel token existant
  const [dataLoading,setDataLoading]=useState(false);
  const [loadError,setLoadError]=useState('');

  useEffect(()=>{
    window.__dlPrint=(html)=>setPrintHtml(html);
    return ()=>{ if(window.__dlPrint) delete window.__dlPrint; };
  },[]);

  // Charge toutes les données depuis l'API et les place dans les états locaux
  const loadAllData=async()=>{
    setDataLoading(true);setLoadError('');
    try{
      const d=await api.loadAll();
      setUsers(d.users);setCases(d.cases);setInvoices(d.invoices);setMats(d.mats);
      setSupps(d.supps);setOrders(d.orders);setExpenseCats(d.expenseCats);setExpenses(d.expenses);
      setCaisse(d.caisse);setEquipment(d.equipment);setRestoTypes(d.restoTypes);
      setTechPayments(d.techPayments);setSettings(prev=>({...prev,...d.settings}));
    }catch(e){
      setLoadError(e.message||'Impossible de charger les données du serveur');
    }finally{
      setDataLoading(false);
    }
  };

  // Au premier rendu : si un token existe déjà (session précédente), on tente de la restaurer
  useEffect(()=>{
    (async()=>{
      const token=api.getToken();
      if(!token){setAuthChecked(true);return;}
      try{
        const {account}=await api.me();
        setUser(account);
        await loadAllData();
      }catch(e){
        api.setToken(null);
      }finally{
        setAuthChecked(true);
      }
    })();
  },[]);

  const showToast=msg=>setToast(msg);
  const nav=p=>{setPage(p);setModal(null);setSearch('');};

  if(!authChecked) return <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'#6b7280',fontSize:13}}>Chargement…</div>;

  if(!user) return <Login onLogin={async(acc)=>{
    setUser(acc);
    setPage(acc.role==='TECHNICIAN'?'mywork':acc.role==='DOCTOR'?'myorders':'dashboard');
    await loadAllData();
  }}/>;

  if(dataLoading && users.length===0) return <div style={{position:'fixed',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'#6b7280',fontSize:13}}>Chargement des données…</div>;

  if(loadError) return <div style={{position:'fixed',inset:0,display:'flex',flexDirection:'column',gap:10,alignItems:'center',justifyContent:'center',color:'#dc2626',fontSize:13,padding:20,textAlign:'center'}}>
    <div>⚠ {loadError}</div>
    <button onClick={loadAllData} style={{padding:'8px 16px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',cursor:'pointer'}}>Réessayer</button>
    <button onClick={()=>{api.setToken(null);setUser(null);}} style={{fontSize:11,color:'#6b7280',background:'none',border:'none',cursor:'pointer'}}>Se déconnecter</button>
  </div>;

  const ctx={user,users,setUsers,cases,setCases,invoices,setInvoices,mats,setMats,supps,setSupps,orders,setOrders,restoTypes,setRestoTypes,stageDefs,setStageDefs,expenses,setExpenses,expenseCats,setExpenseCats,caisse,setCaisse,settings,setSettings,equipment,setEquipment,notifications,setNotifications,stockMovements,setStockMovements,techPayments,setTechPayments,archives,setArchives,auditLog,setAuditLog,archivePolicy,setArchivePolicy,showToast,nav,setModal,search,setSearch};

  const NAV=[
    {id:'dashboard',l:'Tableau de bord',  roles:['ADMIN','DOCTOR','CLINIC'],g:''},
    {id:'cases',    l:'Dossiers',          roles:['ADMIN'],g:'Production'},
    {id:'workflow', l:'Workflow Kanban',   roles:['ADMIN'],g:''},
    {id:'customers',l:'Dentistes',         roles:['ADMIN'],g:'Gestion'},
    {id:'clinics',  l:'Cliniques',         roles:['ADMIN'],g:''},
    {id:'employees',l:'Techniciens',       roles:['ADMIN'],g:''},
    {id:'restotypes',l:'Types restauration',roles:['ADMIN'],g:''},
    {id:'wfsteps',   l:'Étapes workflow',     roles:['ADMIN'],g:''},
    {id:'inventory',l:'Inventaire',        roles:['ADMIN'],g:'Stock & Finance'},
    {id:'suppliers',l:'Fournisseurs',      roles:['ADMIN'],g:''},
    {id:'orders',   l:'Commandes fournisseurs', roles:['ADMIN'],g:''},
    {id:'billing',  l:'Facturation',       roles:['ADMIN'],g:''},
    {id:'expenses', l:'Charges & Dépenses', roles:['ADMIN'],g:'Finance'},
    {id:'caisse',   l:'Mouvement Caisse',   roles:['ADMIN'],g:''},
    {id:'settings', l:'Paramètres',         roles:['ADMIN'],g:'Système'},
    {id:'equipment',l:'Équipements',        roles:['ADMIN'],g:''},
    {id:'pdfexport',l:'Générer PDF',        roles:['ADMIN'],g:''},
    {id:'reports',  l:'Comptabilité & Rapports', roles:['ADMIN'],g:''},
    {id:'mywork',   l:'Mon travail',        roles:['TECHNICIAN'],g:'Mon espace'},
    {id:'mypay',    l:'Mes paiements',     roles:['TECHNICIAN'],g:''},
    {id:'myorders', l:'Mes dossiers',      roles:['DOCTOR','CLINIC'],g:'Mon espace'},
    {id:'myinvoices',l:'Mes factures',     roles:['DOCTOR','CLINIC'],g:''},
    {id:'docnewcase',l:'Nouvelle commande', roles:['DOCTOR','CLINIC'],g:''},
    {id:'clinicdoctors',l:'Mes praticiens', roles:['CLINIC'],g:''},
    {id:'docmessages',l:'Messages',          roles:['DOCTOR'],g:''},
    {id:'delivery',   l:'Livraisons',        roles:['ADMIN'],g:'Production'},
    {id:'maintenance',l:'Maintenance',       roles:['ADMIN'],g:'Systeme'},
    {id:'archive',    l:'Archives',          roles:['ADMIN'],g:''},
    {id:'techpay',    l:'Paiements techniciens', roles:['ADMIN'],g:'Finance'},
  ].filter(n=>n.roles.includes(user.role));

  const nb=id=>{
    if(id==='expenses'){const n=expenses.filter(e=>e.date.startsWith(tod())).length;return n?<span style={{marginLeft:'auto',background:'#d97706',color:'#fff',fontSize:8,fontWeight:700,padding:'1px 4px',borderRadius:99}}>{n}</span>:null;}
    if(id==='caisse'){const totalIn=caisse.reduce((s,m)=>m.type==='IN'?s+m.amount:s,0);const totalOut=caisse.reduce((s,m)=>m.type==='OUT'?s+m.amount:s,0);const solde=totalIn-totalOut;return solde<0?<span style={{marginLeft:'auto',background:'#e02424',color:'#fff',fontSize:8,fontWeight:700,padding:'1px 4px',borderRadius:99}}>!</span>:null;}
    if(id==='cases'){const nReady=cases.filter(c=>c.status==='READY').length;const nNew=cases.filter(c=>c.status==='RECEIVED').length;const n=nReady+nNew;return n?<span title={nNew?`${nNew} nouvelle(s) commande(s) à assigner`:''} style={{marginLeft:'auto',background:nNew?'#dc2626':'#0e9f6e',color:'#fff',fontSize:8,fontWeight:700,padding:'1px 4px',borderRadius:99}}>{n}</span>:null;}
    if(id==='orders'){const n=orders.filter(o=>o.paymentStatus==='UNPAID'&&o.status!=='CANCELLED').length;return n?<span style={{marginLeft:'auto',background:'#e02424',color:'#fff',fontSize:8,fontWeight:700,padding:'1px 4px',borderRadius:99}}>{n}</span>:null;}
    return null;
  };

  const PAGES={dashboard:DashPage,cases:CasesPage,workflow:WorkflowPage,customers:CustomersPage,clinics:ClinicsPage,employees:EmployeesPage,restotypes:RestoTypesPage,wfsteps:WfStepsPage,inventory:InventoryPage,suppliers:SuppliersPage,orders:PurchaseOrdersPage,billing:BillingPage,expenses:ExpensesPage,caisse:CaissePage,settings:SettingsPage,equipment:EquipmentPage,pdfexport:PDFPage,reports:AccountingPage,mywork:MyWorkPage,mypay:MyPayPage,myorders:MyOrdersPage,myinvoices:MyInvoicesPage,docnewcase:DocNewCasePage,docmessages:DocMessagesPage,clinicdoctors:ClinicDoctorsPage,delivery:DeliveryPage,maintenance:MaintenancePage,profitability:AccountingPage,techpay:TechPayAdminPage,archive:ArchivePage};
  const PageComp=PAGES[page]||DashPage;
  const rl={ADMIN:'Administrateur',TECHNICIAN:'Technicien',DOCTOR:'Dentiste',CLINIC:'Clinique'}[user.role];
  const TITLES={dashboard:'Tableau de bord',cases:'Dossiers',workflow:'Workflow Kanban',customers:'Dentistes',employees:'Techniciens',restotypes:'Types de restauration',wfsteps:'Gestion étapes workflow',inventory:'Inventaire',suppliers:'Fournisseurs',orders:'Commandes fournisseurs',billing:'Facturation',reports:'Comptabilité & Rapports',mywork:'Mon travail assigné',mypay:'Mes paiements',myorders:'Mes dossiers',myinvoices:'Mes factures',docnewcase:'Nouvelle commande',docmessages:'Messages',delivery:'Livraisons',maintenance:'Maintenance',profitability:'Rentabilite',techpay:'Paiements Techniciens',expenses:'Charges & Dépenses',caisse:'Mouvement de Caisse',settings:'Paramètres système',equipment:'Équipements & Matériel',pdfexport:'Générer des PDF'};
  let prevG='';

  return <><style dangerouslySetInnerHTML={{__html:RESP_CSS}}/>
    <div className="app-layout" style={{display:'flex',height:'100vh',fontFamily:"'DM Sans',sans-serif",fontSize:settings.fontSize,background:settings.theme==='dark'?'#111827':'#f3f4f6',overflow:'hidden'}}>
    <div className={`sidebar-overlay${mobileMenuOpen?' visible':''}`} onClick={()=>setMobileMenuOpen(false)}/>
    <div className={`sidebar ${mobileMenuOpen?'open':''}`} style={{width:210,minWidth:210,background:'#0d1526',display:'flex',flexDirection:'column',padding:'12px 8px',overflowY:'auto',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:9,padding:'4px 8px 14px',borderBottom:'1px solid rgba(255,255,255,.07)',marginBottom:8}}>
        <div style={{width:30,height:30,background:'#1a56db',borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:10.5,color:'#fff',flexShrink:0}}>DL</div>
        <div><div style={{fontSize:12.5,fontWeight:600,color:'#fff',lineHeight:1.1}}>DentLab Pro</div><div style={{fontSize:9,color:'rgba(255,255,255,.3)',marginTop:1}}>{rl}</div></div>
      </div>
      {NAV.map(n=>{
        const showG=n.g&&n.g!==prevG; if(showG)prevG=n.g;
        return <div key={n.id}>{showG&&<div style={{fontSize:8.5,fontWeight:600,letterSpacing:'.08em',color:'rgba(255,255,255,.22)',padding:'8px 8px 2px',textTransform:'uppercase'}}>{n.g}</div>}
          <div onClick={()=>{nav(n.id);setMobileMenuOpen(false);}} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 8px',borderRadius:7,cursor:'pointer',fontSize:12,color:page===n.id?'#fff':'rgba(255,255,255,.45)',background:page===n.id?settings.primaryColor:'transparent',transition:'all .12s',userSelect:'none'}}>
            <span style={{flex:1}}>{n.l}</span>{nb(n.id)}
          </div></div>;
      })}
      <div style={{marginTop:'auto',paddingTop:10,borderTop:'1px solid rgba(255,255,255,.07)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'7px 8px'}}>
          <Av u={user} sz={26}/>
          <div style={{minWidth:0}}><div style={{fontSize:11,fontWeight:500,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.name}</div><div style={{fontSize:9,color:'rgba(255,255,255,.3)'}}>{rl}</div></div>
          <button onClick={()=>{api.setToken(null);setUser(null);setPage('dashboard');}} style={{marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.3)',fontSize:13}} title="Déconnexion">⏏</button>
        </div>
      </div>
    </div>
    <div className="main-area" style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
      <div style={{background:'#ffffff',borderBottom:'1px solid #f3f4f6',padding:'0 18px',height:50,display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={()=>setMobileMenuOpen(v=>!v)} style={{display:'none',background:'none',border:'none',cursor:'pointer',fontSize:20,padding:'4px',color:'#374151'}} className="mobile-menu-btn" aria-label="Menu">☰</button>
          <span style={{fontSize:14,fontWeight:600}}>{TITLES[page]||page}</span>
          {['cases','customers'].includes(page)&&<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..." style={{fontFamily:"'DM Sans',sans-serif",fontSize:11.5,padding:'5px 10px',borderRadius:7,border:'1px solid #e5e7eb',background:'#f9fafb',color:'#111827',outline:'none',width:180}}/>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          {user.role==='ADMIN'&&<button onClick={()=>setModal({t:'newCase'})} style={{display:'inline-flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:500,cursor:'pointer',border:'none',background:settings.primaryColor,color:'#fff',fontFamily:"'DM Sans',sans-serif"}}>+ Nouveau dossier</button>}
          <div style={{position:'relative'}}>
            <button onClick={()=>{const notifs=[];const today=tod();cases.forEach(c=>{if(!['DELIVERED','CANCELLED','READY'].includes(c.status)&&c.due<today)notifs.push({id:'d_'+c.id,type:'danger',icon:'!',title:'Dossier en retard',msg:c.num+' — '+c.pf+' '+c.pl,ts:c.due});});invoices.forEach(i=>{if(i.status==='UNPAID'){const doc=users.find(u=>u.id===i.docId);notifs.push({id:'p_'+i.id,type:'warn',icon:'$',title:'Paiement en attente',msg:i.num+' — '+(doc?.name||'—')+' : '+fmtDA(i.total),ts:i.date});}});mats.filter(m=>m.stock<=m.min).forEach(m=>notifs.push({id:'s_'+m.id,type:'warn',icon:'~',title:'Stock bas',msg:m.name+' — Stock: '+m.stock,ts:today}));setNotifications(notifs);setNotifOpen(v=>!v);}} style={{position:'relative',background:'none',border:'none',cursor:'pointer',fontSize:18,padding:'4px 6px',color:'#374151'}}>
              Bell
              {(()=>{const cnt=cases.filter(c=>!['DELIVERED','CANCELLED','READY'].includes(c.status)&&c.due<tod()).length+invoices.filter(i=>i.status==='UNPAID').length+mats.filter(m=>m.stock<=m.min).length;return cnt>0?<span style={{position:'absolute',top:0,right:0,background:'#e02424',color:'#fff',fontSize:8,fontWeight:700,width:14,height:14,borderRadius:99,display:'flex',alignItems:'center',justifyContent:'center'}}>{cnt>9?'9+':cnt}</span>:null;})()}
            </button>
            {notifOpen&&<div style={{position:'fixed',top:50,right:8,width:'min(340px,95vw)',background:'#fff',borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,.18)',zIndex:400,border:'1px solid #e5e7eb'}}>
              <div style={{padding:'12px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontWeight:700,fontSize:13}}>Notifications ({notifications.length})</span>
                <button onClick={()=>setNotifOpen(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:16,color:'#6b7280'}}>X</button>
              </div>
              <div style={{maxHeight:320,overflowY:'auto'}}>
                {notifications.length===0?<div style={{padding:20,textAlign:'center',color:'#6b7280',fontSize:12}}>Aucune alerte</div>:
                notifications.map(n=><div key={n.id} style={{padding:'10px 14px',borderBottom:'1px solid #f9fafb',display:'flex',gap:10,alignItems:'flex-start'}}>
                  <span style={{fontSize:14,flexShrink:0,fontWeight:700,color:n.type==='danger'?'#dc2626':'#d97706'}}>{n.icon}</span>
                  <div><div style={{fontSize:11.5,fontWeight:600,color:n.type==='danger'?'#dc2626':'#d97706'}}>{n.title}</div><div style={{fontSize:11,color:'#374151',marginTop:2}}>{n.msg}</div></div>
                </div>)}
              </div>
            </div>}
          </div>
          <Av u={user} sz={28}/>
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'16px 18px',display:'flex',flexDirection:'column',gap:13}}>
        <PageComp {...ctx} setModal={setModal}/>
      </div>
    </div>
    {modal&&<ModalRouter modal={modal} setModal={setModal} ctx={ctx}/>}
    {toast&&<Toast msg={toast} onDone={()=>setToast(null)}/>}
    {printHtml&&<PrintPreviewModal html={printHtml} close={()=>setPrintHtml(null)}/>}
  </div></>;
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function DashPage(ctx) {
  const {user}=ctx;
  if(user.role==='TECHNICIAN') return <TechDash {...ctx}/>;
  if(user.role==='CLINIC')     return <ClinicDash {...ctx}/>;
  if(user.role==='DOCTOR')     return <DocDash {...ctx}/>;
  return <AdminDash {...ctx}/>;
}

function AdminDash({cases,invoices,mats,orders,restoTypes,users,expenses,caisse,nav,setModal}) {
  const today = tod();
  const curM = today.slice(0,7);
  
  // Cases metrics
  const active  = cases.filter(c=>!['DELIVERED','CANCELLED'].includes(c.status));
  const delayed = cases.filter(c=>!['DELIVERED','CANCELLED','READY'].includes(c.status)&&c.due<today);
  const dueToday= cases.filter(c=>c.due===today&&!['DELIVERED','CANCELLED'].includes(c.status));
  const ready   = cases.filter(c=>c.status==='READY');
  const remakes = cases.filter(c=>c.remake).length;
  const remakePct= cases.length?((remakes/cases.length)*100).toFixed(1):0;
  
  // Revenue
  const revMonth = invoices.filter(i=>i.date?.startsWith(curM)).reduce((s,i)=>s+i.total,0);
  const revToday = invoices.filter(i=>i.date===today).reduce((s,i)=>s+i.total,0);
  const collected= invoices.reduce((s,i)=>s+i.paid,0);
  const outstanding= invoices.filter(i=>i.status!=='PAID').reduce((s,i)=>s+(i.total-i.paid),0);
  
  // Costs
  const matCostMonth = cases.filter(c=>c.due?.startsWith(curM)).reduce((s,c)=>s+(c.materialCost||0),0);
  const labCostMonth = cases.filter(c=>c.due?.startsWith(curM)).reduce((s,c)=>s+(c.laborCost||0),0);
  const profitMonth  = revMonth - matCostMonth - labCostMonth;
  const expMonth = expenses.filter(e=>e.date?.startsWith(curM)).reduce((s,e)=>s+e.amount,0);
  
  // Tech performance
  const techs = users.filter(u=>u.role==='TECHNICIAN');
  const techPerf = techs.map(t=>{
    const steps = cases.flatMap(c=>c.wf.filter(w=>w.done&&w.s!=='RECEIVED'&&w.tId===t.id));
    return {tech:t, steps:steps.length, el:steps.reduce((s,w)=>s+(w.el||1),0)};
  }).sort((a,b)=>b.steps-a.steps);

  // Low stock
  const lowStock = mats.filter(m=>m.stock<=m.min);
  
  // Monthly chart data from real invoices
  const MONTHS=['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  const chartData = MONTHS.map((m,i)=>{
    const key = `${today.slice(0,4)}-${String(i+1).padStart(2,'0')}`;
    const rev = invoices.filter(inv=>inv.date?.startsWith(key)).reduce((s,i)=>s+i.total,0);
    const exp2 = expenses.filter(e=>e.date?.startsWith(key)).reduce((s,e)=>s+e.amount,0);
    return {m,rev,exp:exp2};
  });
  const maxChart = Math.max(...chartData.map(d=>d.rev+d.exp),1);
  
  // Pipeline
  const pipeline = STAGES.slice(0,-1).map(s=>({s,cnt:cases.filter(c=>c.status===s).length,cfg:SC[s]}));

  return <>
    {delayed.length>0&&<div style={{padding:'10px 14px',background:'#fef2f2',borderRadius:10,border:'1px solid #fecaca',fontSize:12,color:'#dc2626',fontWeight:500}}>
      ⏰ {delayed.length} dossier{delayed.length>1?'s':''} en retard : {delayed.slice(0,4).map(c=>c.num).join(', ')}{delayed.length>4?` +${delayed.length-4}`:''}
      <button onClick={()=>nav('cases')} style={{marginLeft:10,padding:'2px 8px',borderRadius:5,border:'none',background:'#dc2626',color:'#fff',fontSize:11,cursor:'pointer',fontWeight:600}}>Voir →</button>
    </div>}

    {/* ── ROW 1: Revenue KPIs ── */}
    <div className="kpi-grid" style={{gap:9}}>
      <Kpi label="CA Aujourd'hui"    val={fmtDA(revToday)}    col="#1a56db"/>
      <Kpi label="CA Ce mois"        val={fmtDA(revMonth)}    col="#0694a2"/>
      <Kpi label="Bénéfice mois"     val={fmtDA(profitMonth)} col={profitMonth>=0?"#0e9f6e":"#e02424"}/>
      <Kpi label="Créances clients"  val={fmtDA(outstanding)} col="#7e3af2"/>
      <Kpi label="Charges mois"      val={fmtDA(expMonth)}    col="#d97706"/>
      <Kpi label="Trésorerie"        val={fmtDA(caisse.reduce((s,c)=>s+(c.type==='IN'?c.amount:-c.amount),0))} col="#16a34a"/>
    </div>

    {/* ── ROW 2: Production KPIs ── */}
    <div className="kpi-grid" style={{gap:9}}>
      <Kpi label="Dossiers actifs"  val={active.length}    col="#1a56db"/>
      <Kpi label="Prêts à livrer"   val={ready.length}     col="#0e9f6e"/>
      <Kpi label="En retard"        val={delayed.length}   col="#e02424"/>
      <Kpi label="Dus aujourd'hui"  val={dueToday.length}  col="#d97706"/>
      <Kpi label="Stock bas"        val={lowStock.length}  col="#d97706"/>
      <Kpi label="Taux remake"      val={remakePct+"%"}    col={Number(remakePct)>5?"#e02424":"#0e9f6e"}/>
    </div>

    {/* ── ROW 3: Charts + Pipeline ── */}
    <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:13}} className="dash-2col">
      {/* Revenue vs Expenses chart */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:14}}>CA vs Dépenses — {today.slice(0,4)}</div>
        <div style={{display:'flex',alignItems:'flex-end',gap:3,height:90,paddingBottom:18,position:'relative',paddingTop:8}}>
          {chartData.map((d,i)=>(
            <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',height:'100%',gap:2}}>
              <div style={{flex:1,width:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-end',gap:1}}>
                <div style={{width:'100%',background:'#3b82f6',borderRadius:'2px 2px 0 0',height:`${(d.rev/maxChart)*100}%`,minHeight:d.rev>0?3:0,opacity:.85}}/>
                <div style={{width:'100%',background:'#f87171',borderRadius:'2px 2px 0 0',height:`${(d.exp/maxChart)*85}%`,minHeight:d.exp>0?2:0,opacity:.75}}/>
              </div>
              <span style={{position:'absolute',bottom:2,fontSize:8,color:'#9ca3af'}}>{d.m}</span>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:12,fontSize:10.5,color:'#6b7280',justifyContent:'center'}}>
          <span><span style={{display:'inline-block',width:8,height:8,background:'#3b82f6',borderRadius:2,marginRight:4}}/>CA</span>
          <span><span style={{display:'inline-block',width:8,height:8,background:'#f87171',borderRadius:2,marginRight:4}}/>Dépenses</span>
        </div>
      </div>

      {/* Pipeline */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:12}}>Pipeline production</div>
        {pipeline.filter(p=>p.cnt>0||['DESIGN','MILLING','SINTERING'].includes(p.s)).map(({s,cnt,cfg})=>(
          <div key={s} style={{display:'flex',alignItems:'center',gap:6,marginBottom:7}}>
            <span style={{fontSize:9.5,fontWeight:600,width:68,flexShrink:0,padding:'2px 5px',borderRadius:99,background:cfg.bg,color:cfg.c,textAlign:'center'}}>{cfg.l}</span>
            <div style={{flex:1,height:6,background:'#f3f4f6',borderRadius:99,overflow:'hidden'}}>
              <div style={{height:'100%',background:cfg.d,borderRadius:99,width:`${Math.min(cnt/Math.max(active.length,1)*100,100)}%`,transition:'width .4s'}}/>
            </div>
            <span style={{fontSize:12,fontWeight:700,width:16,textAlign:'right',color:cnt>0?'#111827':'#d1d5db'}}>{cnt}</span>
          </div>
        ))}
      </div>
    </div>

    {/* ── ROW 4: Recent cases + Tech performance ── */}
    <div style={{display:'grid',gridTemplateColumns:'3fr 2fr',gap:13}} className="dash-2col">
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div style={{padding:'11px 14px',borderBottom:'1px solid #f3f4f6',background:'#fafafa',borderRadius:'11px 11px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:700,fontSize:13}}>Derniers dossiers</span>
          <button onClick={()=>nav('cases')} style={{fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid #d1d5db',background:'#fff',cursor:'pointer',fontWeight:500}}>Voir tous →</button>
        </div>
        <div className="table-wrap">
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:420}}>
            <tbody>{cases.slice(0,7).map(c=>{
              const doc=users.find(u=>u.id===c.docId);
              const isLate=c.due<today&&!['DELIVERED','CANCELLED'].includes(c.status);
              return <tr key={c.id} onClick={()=>setModal({t:'case',cid:c.id})} style={{cursor:'pointer',borderBottom:'1px solid #f3f4f6'}}>
                <td style={{padding:'8px 12px'}}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#1a56db',fontWeight:700}}>{c.num}</div>
                  <div style={{fontSize:11.5,fontWeight:500,color:'#111827'}}>{c.pf} {c.pl}</div>
                </td>
                <td style={{padding:'8px 12px'}}><SBadge st={c.status}/></td>
                <td style={{padding:'8px 12px',fontSize:10.5,fontFamily:"'JetBrains Mono',monospace",color:isLate?'#dc2626':'#6b7280',fontWeight:isLate?700:400}}>{c.due}</td>
                <td style={{padding:'8px 12px',fontSize:11,color:'#6b7280'}}>{doc?.name||'—'}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </div>

      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:12}}>Performance techniciens</div>
        {techPerf.map(({tech,steps,el})=>(
          <div key={tech.id} style={{display:'flex',alignItems:'center',gap:10,marginBottom:10,padding:'8px 10px',background:'#f9fafb',borderRadius:9}}>
            <div style={{width:34,height:34,borderRadius:99,background:tech.col||'#1a56db',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff',flexShrink:0}}>
              {tech.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:12,fontWeight:600,color:'#111827',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tech.name}</div>
              <div style={{fontSize:10.5,color:'#6b7280'}}>{steps} étapes · {el} éléments</div>
            </div>
            <div style={{fontSize:12,fontWeight:700,color:'#7e3af2',whiteSpace:'nowrap'}}>{fmtDA((el||0)*(tech.rate||0))}</div>
          </div>
        ))}
        {techPerf.length===0&&<div style={{textAlign:'center',color:'#9ca3af',fontSize:12,padding:16}}>Aucune donnée</div>}
      </div>
    </div>

    {/* ── ROW 5: Material alerts + Quick actions ── */}
    {lowStock.length>0&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:'14px 16px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
      <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:10}}>⚠ Alertes stock bas ({lowStock.length})</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        {lowStock.map(m=><div key={m.id} style={{padding:'6px 12px',borderRadius:8,background:'#fffbeb',border:'1px solid #fde68a',display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:12,fontWeight:600,color:'#92400e'}}>{m.name}</span>
          <span style={{fontSize:11,color:'#d97706'}}>Stock: {m.stock} / Min: {m.min}</span>
        </div>)}
      </div>
    </div>}
  </>;
}


function TechDash({user,cases,nav}) {
  const myc=cases.filter(c=>c.wf.some(w=>w.tId===user.id));
  const active=myc.filter(c=>!['DELIVERED','CANCELLED','READY'].includes(c.status));
  const doneSteps=cases.flatMap(c=>c.wf.filter(w=>w.tId===user.id&&w.done));
  const totalEl=doneSteps.reduce((s,w)=>s+(w.el||1),0);
  const earned=doneSteps.reduce((s,w)=>s+(w.el||1)*(RATE[w.s]||0),0);
  return <>
    <Alert type="i"><b>{user.name}</b> — Spécialité : <b>{user.spec}</b> | Étapes autorisées : <b>{user.acc.map(s=>SC[s].l).join(', ')}</b></Alert>
    <div className="grid-4" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:9}}><Kpi label="Dossiers assignés" val={active.length} col="#1a56db"/><Kpi label="Étapes complétées" val={doneSteps.length} col="#0e9f6e"/><Kpi label="Éléments traités" val={totalEl} col="#7e3af2"/><Kpi label="Gains estimés" val={fmt(earned)} col="#d97706"/></div>
    <Card><CH title="Mes dossiers en cours" action={<BtnO sm onClick={()=>nav('mywork')}>Détail →</BtnO>}/>
      <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}><thead><tr>{['Dossier','Patient','Type','Statut','Échéance','Action'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
      <tbody>{active.map(c=><tr key={c.id}>
        <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6'}}><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#1a56db',fontWeight:600}}>{c.num}</span></td>
        <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:500}}>{c.pf} {c.pl}</td>
        <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6',color:'#6b7280'}}>{c.type||c.rtId}</td>
        <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><SBadge st={c.status}/></td>
        <td style={{padding:'8px 11px',fontSize:10.5,borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace",color:'#6b7280'}}>{c.due}</td>
        <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><BtnO sm onClick={()=>nav('mywork')}>Ouvrir →</BtnO></td>
      </tr>)}{active.length===0&&<tr><td colSpan={6} style={{padding:'20px',textAlign:'center',color:'#6b7280',fontSize:12}}>Aucun dossier actif</td></tr>}
      </tbody></table></div>
    </Card>
  </>;
}

function DocDash({user,cases,invoices,nav}) {
  const mc=cases.filter(c=>c.docId===user.id);
  const mi=invoices.filter(i=>i.docId===user.id);
  return <>
    <Alert type="i">Bienvenue <b>{user.name}</b> — Cabinet : <b>{user.clinique}</b></Alert>
    <div className="grid-4" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:9}}><Kpi label="Dossiers actifs" val={mc.filter(c=>!['DELIVERED','CANCELLED'].includes(c.status)).length} col="#1a56db"/><Kpi label="Prêts à livrer" val={mc.filter(c=>c.status==='READY').length} col="#0e9f6e"/><Kpi label="Total facturé" val={fmt(mi.reduce((s,i)=>s+i.total,0))} col="#7e3af2"/><Kpi label="Solde dû" val={fmt(mi.reduce((s,i)=>s+(i.total-i.paid),0))} col="#e02424"/></div>
    <Card><CH title="Mes dossiers en cours" action={<BtnO sm onClick={()=>nav('myorders')}>Voir tous →</BtnO>}/>
      <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:560}}><thead><tr>{['Dossier','Patient','Type','Progression','Statut','Échéance'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
      <tbody>{mc.map(c=>{const idx=STAGES.indexOf(c.status),pct=Math.round((idx/(STAGES.length-1))*100);return <tr key={c.id}>
        <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6'}}><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#1a56db',fontWeight:600}}>{c.num}</span></td>
        <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:500}}>{c.pf} {c.pl}</td>
        <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6',color:'#6b7280'}}>{c.type||c.rtId}</td>
        <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6',minWidth:90}}><Pb pct={pct}/><span style={{fontSize:9.5,color:'#6b7280'}}>{pct}%</span></td>
        <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><SBadge st={c.status}/></td>
        <td style={{padding:'8px 11px',fontSize:10.5,borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace",color:'#6b7280'}}>{c.due}</td>
      </tr>;})}
      </tbody></table></div>
    </Card>
  </>;
}

// ─── CLINIC DASHBOARD (multi-doctor account) ──────────────────────────────────
function ClinicDash({user,users,cases,invoices,nav}) {
  const myDocs=users.filter(u=>u.role==='DOCTOR'&&u.clinicId===user.id);
  const docIds=myDocs.map(d=>d.id);
  const mc=cases.filter(c=>docIds.includes(c.docId));
  const mi=invoices.filter(i=>docIds.includes(i.docId));
  const recent=[...mc].sort((a,b)=>(b.due||'').localeCompare(a.due||'')).slice(0,8);
  return <>
    <Alert type="i">Bienvenue <b>{user.name}</b> — {myDocs.length} praticien{myDocs.length>1?'s':''} rattaché{myDocs.length>1?'s':''} à cette clinique.</Alert>
    <div className="grid-4" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:9}}>
      <Kpi label="Dossiers actifs" val={mc.filter(c=>!['DELIVERED','CANCELLED'].includes(c.status)).length} col="#1a56db"/>
      <Kpi label="Prêts à livrer" val={mc.filter(c=>c.status==='READY').length} col="#0e9f6e"/>
      <Kpi label="Total facturé" val={fmt(mi.reduce((s,i)=>s+i.total,0))} col="#7e3af2"/>
      <Kpi label="Solde dû" val={fmt(mi.reduce((s,i)=>s+(i.total-i.paid),0))} col="#e02424"/>
    </div>

    <Card><CH title="Praticiens de la clinique"/>
      <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}><thead><tr>{['Praticien','Dossiers actifs','Total facturé','Solde dû',''].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
      <tbody>{myDocs.map(d=>{
        const dc=cases.filter(c=>c.docId===d.id);
        const di=invoices.filter(i=>i.docId===d.id);
        const bal=di.reduce((s,i)=>s+(i.total-i.paid),0);
        return <tr key={d.id}>
          <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><div style={{display:'flex',alignItems:'center',gap:8}}><Av u={d} sz={28}/><span style={{fontWeight:600,fontSize:12.5}}>{d.name}</span></div></td>
          <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6'}}>{dc.filter(c=>!['DELIVERED','CANCELLED'].includes(c.status)).length}</td>
          <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:600}}>{fmt(di.reduce((s,i)=>s+i.total,0))}</td>
          <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:600,color:bal>0?'#e02424':'#0e9f6e'}}>{bal>0?fmt(bal):'✓ à jour'}</td>
          <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><BtnO sm onClick={()=>nav('myorders')}>Voir →</BtnO></td>
        </tr>;
      })}
      {myDocs.length===0&&<tr><td colSpan={5} style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun praticien rattaché — contactez le laboratoire</td></tr>}
      </tbody></table></div>
    </Card>

    <Card><CH title="Dossiers récents (tous praticiens)" action={<BtnO sm onClick={()=>nav('myorders')}>Voir tous →</BtnO>}/>
      <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}><thead><tr>{['Dossier','Patient','Praticien','Statut','Échéance'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
      <tbody>{recent.map(c=>{const doc=users.find(u=>u.id===c.docId);return <tr key={c.id}>
        <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6'}}><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#1a56db',fontWeight:600}}>{c.num}</span></td>
        <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:500}}>{c.pf} {c.pl}</td>
        <td style={{padding:'8px 11px',fontSize:11.5,borderBottom:'1px solid #f3f4f6',color:'#374151'}}>{doc?.name||'—'}</td>
        <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><SBadge st={c.status}/></td>
        <td style={{padding:'8px 11px',fontSize:10.5,borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace",color:'#6b7280'}}>{c.due}</td>
      </tr>;})}
      {recent.length===0&&<tr><td colSpan={5} style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun dossier</td></tr>}
      </tbody></table></div>
    </Card>
  </>;
}


// ─── CLINIC'S OWN DOCTORS (self-service: add / edit / deactivate) ────────────
function ClinicDoctorsPage({user,users,setUsers,cases,invoices,showToast,setModal,nav,setSearch}) {
  const [showInactive,setShowInactive]=useState(false);
  const myDocs=users.filter(u=>u.role==='DOCTOR'&&u.clinicId===user.id&&(showInactive||u.active!==false));
  const toggleActive=(d)=>{
    setUsers(p=>p.map(u=>u.id===d.id?{...u,active:u.active===false}:u));
    showToast(d.active===false?`${d.name} réactivé ✓`:`${d.name} désactivé`);
  };
  return <>
    <Alert type="i">Gérez les praticiens de votre clinique. Chaque praticien a ses propres patients et dossiers ; il n'a pas de compte de connexion séparé — vous gérez tout depuis ce compte clinique.</Alert>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11.5,color:'#6b7280',cursor:'pointer'}}>
        <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/> Afficher les praticiens désactivés
      </label>
      <BtnP sm onClick={()=>setModal({t:'addMyDoctor'})}>＋ Ajouter un praticien</BtnP>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
      {myDocs.map(d=>{
        const dc=cases.filter(c=>c.docId===d.id);
        const di=invoices.filter(i=>i.docId===d.id);
        const bal=di.reduce((s,i)=>s+(i.total-i.paid),0);
        const inactive=d.active===false;
        return <Card key={d.id} style={{padding:14,opacity:inactive?0.6:1}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
            <div style={{display:'flex',alignItems:'center',gap:9}}><Av u={d} sz={34}/>
              <div><div style={{fontWeight:700,fontSize:13}}>{d.name} {inactive&&<span style={{fontSize:9.5,background:'#f3f4f6',color:'#6b7280',padding:'1px 6px',borderRadius:99,marginLeft:4}}>Désactivé</span>}</div>
              <div style={{fontSize:10.5,color:'#6b7280'}}>{d.spec||'—'}</div></div>
            </div>
            <div style={{display:'flex',gap:4}}>
              <BtnO sm onClick={()=>setModal({t:'editMyDoctor',uid:d.id})}>✏</BtnO>
              <button onClick={()=>toggleActive(d)} title={inactive?'Réactiver':'Désactiver'} style={{padding:'4px 8px',borderRadius:6,border:'1px solid '+(inactive?'#bbf7d0':'#fecaca'),background:inactive?'#f0fdf4':'#fef2f2',color:inactive?'#16a34a':'#dc2626',fontSize:11,cursor:'pointer'}}>{inactive?'✓':'⏻'}</button>
            </div>
          </div>
          {d.phone&&<div style={{fontSize:11,color:'#9ca3af',marginBottom:8}}>☎ {d.phone}</div>}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
            <div style={{background:'#f9fafb',borderRadius:7,padding:6,textAlign:'center'}}><div style={{fontWeight:600,fontSize:13}}>{dc.filter(c=>!['DELIVERED','CANCELLED'].includes(c.status)).length}</div><div style={{fontSize:9,color:'#6b7280'}}>Actifs</div></div>
            <div style={{background:'#f9fafb',borderRadius:7,padding:6,textAlign:'center'}}><div style={{fontWeight:600,fontSize:13}}>{dc.length}</div><div style={{fontSize:9,color:'#6b7280'}}>Total dossiers</div></div>
            <div style={{background:bal>0?'#fef2f2':'#f0fdf4',borderRadius:7,padding:6,textAlign:'center'}}><div style={{fontWeight:600,fontSize:10.5,color:bal>0?'#e02424':'#0e9f6e'}}>{bal>0?fmt(bal):'✓'}</div><div style={{fontSize:9,color:'#6b7280'}}>Solde</div></div>
          </div>
          <BtnO sm onClick={()=>nav('myorders')} style={{width:'100%',justifyContent:'center',marginTop:8}}>📋 Voir ses dossiers</BtnO>
        </Card>;
      })}
      {myDocs.length===0&&<div style={{gridColumn:'1/-1',textAlign:'center',padding:40,color:'#9ca3af',fontSize:13}}>Aucun praticien{showInactive?'':' actif'}. Cliquez sur "Ajouter un praticien" pour commencer.</div>}
    </div>
  </>;
}


function CasesPage({user,cases,users,restoTypes,search,setModal}) {
  const [fDoc,setFDoc]=useState('');const [fSt,setFSt]=useState('');const [fTech,setFTech]=useState('');const [fDue,setFDue]=useState('');
  const q=search.toLowerCase();
  const docs=users.filter(u=>u.role==='DOCTOR');const techs_f=users.filter(u=>u.role==='TECHNICIAN');
  const pendingCases=user.role==='ADMIN'?cases.filter(c=>c.status==='RECEIVED'):[];
  let vis=user.role==='TECHNICIAN'?cases.filter(c=>c.techId===user.id||c.wf.some(w=>w.tId===user.id)):cases;
  if(q) vis=vis.filter(c=>{const doc=users.find(u=>u.id===c.docId);return c.num.toLowerCase().includes(q)||(c.pf+' '+c.pl).toLowerCase().includes(q)||(doc?.name||'').toLowerCase().includes(q);});
  if(fDoc) vis=vis.filter(c=>c.docId===fDoc);
  if(fSt) vis=vis.filter(c=>c.status===fSt);
  if(fTech) vis=vis.filter(c=>c.techId===fTech||c.wf.some(w=>w.tId===fTech));
  if(fDue==='late') vis=vis.filter(c=>c.due<tod()&&!['DELIVERED','CANCELLED'].includes(c.status));
  if(fDue==='today') vis=vis.filter(c=>c.due===tod());
  if(fDue==='week'){const wk=new Date();wk.setDate(wk.getDate()+7);vis=vis.filter(c=>c.due<=wk.toISOString().slice(0,10));}
  const anyF=fDoc||fSt||fTech||fDue;
  return <>
    {pendingCases.length>0&&<div style={{background:'#fef2f2',border:'2px solid #fecaca',borderRadius:12,padding:'14px 16px',marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <span style={{fontSize:18}}>🆕</span>
        <span style={{fontWeight:800,fontSize:14,color:'#991b1b'}}>{pendingCases.length} nouvelle{pendingCases.length>1?'s':''} commande{pendingCases.length>1?'s':''} en attente d'assignation</span>
      </div>
      {pendingCases.map(c=>{
        const doc=users.find(u=>u.id===c.docId);
        const fileCount=(c.attachments||[]).length+(c.shadePhoto?1:0);
        return <div key={c.id} onClick={()=>setModal({t:'case',cid:c.id})} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 12px',background:'#fff',borderRadius:8,marginBottom:6,cursor:'pointer',border:'1px solid #fecaca'}}>
          <div style={{fontSize:12.5}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",color:'#1a56db',fontWeight:700,marginRight:8}}>{c.num}</span>
            <b>{c.pf} {c.pl}</b> — {doc?.name||'—'} {fileCount>0&&<span style={{marginLeft:6,background:'#1a56db',color:'#fff',fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:99}}>📎 {fileCount}</span>}
          </div>
          <span style={{fontSize:11.5,fontWeight:700,color:'#1a56db'}}>Ouvrir pour assigner →</span>
        </div>;
      })}
    </div>}
    <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
    <div style={{padding:'10px 14px',borderBottom:'1px solid #f3f4f6',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',borderRadius:'11px 11px 0 0',background:'#fafafa'}}>
      <span style={{fontSize:12,fontWeight:600}}>Filtres</span>
      {user.role==='ADMIN'&&<select value={fDoc} onChange={e=>setFDoc(e.target.value)} style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',background:'#f9fafb'}}><option value=''>Tous dentistes</option>{docs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>}
      <select value={fSt} onChange={e=>setFSt(e.target.value)} style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',background:'#f9fafb'}}><option value=''>Tous statuts</option>{['RECEIVED','DESIGN','MILLING','SINTERING','FINISHING','MAQUILLAGE','QC','READY','DELIVERED','CANCELLED'].map(s=><option key={s} value={s}>{s}</option>)}</select>
      {user.role==='ADMIN'&&<select value={fTech} onChange={e=>setFTech(e.target.value)} style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',background:'#f9fafb'}}><option value=''>Tous techniciens</option>{techs_f.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select>}
      <select value={fDue} onChange={e=>setFDue(e.target.value)} style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'1px solid #d1d5db',background:'#f9fafb'}}><option value=''>Toutes dates</option><option value='today'>Aujourd'hui</option><option value='late'>En retard</option><option value='week'>Semaine</option></select>
      {anyF&&<button onClick={()=>{setFDoc('');setFSt('');setFTech('');setFDue('');}} style={{fontSize:11,padding:'4px 8px',borderRadius:6,border:'none',background:'#fef2f2',color:'#dc2626',cursor:'pointer'}}>X</button>}
      <span style={{marginLeft:'auto',fontSize:11,color:'#6b7280'}}>{vis.length} dossiers</span>
      {user.role==='ADMIN'&&<BtnP sm onClick={()=>setModal({t:'newCase'})}>+ Nouveau</BtnP>}
    </div>
    <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:680}}>
      <thead><tr>{['N° Dossier','Patient','Dentiste','Type','Priorité','Statut','Technicien','Échéance',''].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.05em',borderBottom:'2px solid #f3f4f6',background:'#fafafa',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
      <tbody>{vis.map(c=>{
        const doc=users.find(u=>u.id===c.docId);
        const rt=restoTypes.find(r=>r.id===c.rtId);
        const tech=users.find(u=>u.id===c.techId&&u.role==='TECHNICIAN')||(()=>{const fw=c.wf.find(w=>w.tId&&w.s!=='RECEIVED');return fw?users.find(u=>u.id===fw.tId&&u.role==='TECHNICIAN'):null;})();
        return <tr key={c.id} onClick={()=>setModal({t:'case',cid:c.id})} style={{cursor:'pointer'}}>
          <td style={{padding:'8px 12px',borderBottom:'1px solid #f3f4f6'}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#1a56db',fontWeight:700}}>{c.num}</div>
            {c.remake&&<span style={{fontSize:9,background:'#fef3c7',color:'#92400e',padding:'1px 5px',borderRadius:99,fontWeight:600}}>Remake</span>}
          </td>
          <td style={{padding:'8px 12px',borderBottom:'1px solid #f3f4f6'}}>
            <div style={{fontSize:12.5,fontWeight:600,color:'#111827'}}>{c.pf} {c.pl}</div>
            <div style={{fontSize:10.5,color:'#9ca3af'}}>{c.sh?'Teinte: '+c.sh:''}</div>
          </td>
          <td style={{padding:'8px 12px',fontSize:11.5,borderBottom:'1px solid #f3f4f6',color:'#374151'}}>{doc?.name||'—'}</td>
          <td style={{padding:'8px 12px',fontSize:11,borderBottom:'1px solid #f3f4f6',color:'#6b7280',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{rt?.name||'—'}</td>
          <td style={{padding:'8px 12px',borderBottom:'1px solid #f3f4f6'}}><PBadge p={c.pri}/></td>
          <td style={{padding:'8px 12px',borderBottom:'1px solid #f3f4f6'}}><SBadge st={c.status}/></td>
          <td style={{padding:'8px 12px',borderBottom:'1px solid #f3f4f6'}}>{tech?<div style={{display:'flex',alignItems:'center',gap:5}}><Av u={tech} sz={22}/><span style={{fontSize:11.5,fontWeight:500}}>{tech.name.split(' ')[0]}</span></div>:<span style={{color:'#d1d5db',fontSize:11}}>—</span>}</td>
          <td style={{padding:'8px 12px',borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:c.due<tod()?'#dc2626':'#374151',fontWeight:c.due<tod()?700:400}}>{c.due}</td>
          <td style={{padding:'8px 12px',borderBottom:'1px solid #f3f4f6'}}><button onClick={e=>{e.stopPropagation();setModal({t:'case',cid:c.id});}} style={{padding:'4px 10px',borderRadius:6,border:'1px solid #d1d5db',background:'#f9fafb',cursor:'pointer',fontSize:11,fontWeight:500}}>Ouvrir</button></td>
        </tr>;
      })}</tbody>
    </table></div>
  </div>
  </>;
}

// ─── WORKFLOW ─────────────────────────────────────────────────────────────────
function WorkflowPage({user,cases,users,setModal}) {
  const vstages=user.role==='TECHNICIAN'?user.acc:STAGES.slice(0,-1);
  return <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:8,minHeight:'65vh'}}>
    {vstages.map(stage=>{
      const cfg=SC[stage];
      const sc=user.role==='TECHNICIAN'?cases.filter(c=>c.status===stage&&c.wf.some(w=>w.tId===user.id&&w.s===stage)):cases.filter(c=>c.status===stage);
      return <div key={stage} style={{flexShrink:0,width:160}}>
        <div style={{borderRadius:7,padding:'6px 9px',marginBottom:6,display:'flex',justifyContent:'space-between',fontSize:11,fontWeight:500,background:cfg.bg,color:cfg.c}}><span>{cfg.l}</span><span style={{fontWeight:700}}>{sc.length}</span></div>
        {sc.map(c=>{const t=users.find(u=>u.id===c.techId);return <div key={c.id} onClick={()=>setModal({t:'case',cid:c.id})} style={{background:'#ffffff',border:`.5px solid ${c.pri==='URGENT'?'#ef4444':'#f3f4f6'}`,borderRadius:8,padding:9,marginBottom:5,cursor:'pointer',transition:'all .12s',borderLeft:`2.5px solid ${c.pri==='URGENT'?'#ef4444':c.techId===user.id?'#1a56db':'#f3f4f6'}`}}>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:8.5,color:'#1a56db',fontWeight:600,marginBottom:2}}>{c.num}</div>
          <div style={{fontSize:10.5,fontWeight:600,marginBottom:1}}>{c.pf} {c.pl}</div>
          <div style={{fontSize:9.5,color:'#6b7280'}}>{c.type||c.rtId}</div>
          {t&&<div style={{fontSize:9,color:'#6b7280',marginTop:3}}>👤 {t.name.split(' ')[0]}</div>}
          <div style={{display:'flex',justifyContent:'space-between',marginTop:4,paddingTop:3,borderTop:'1px solid #f3f4f6',fontSize:8.5,color:'#6b7280'}}><span>📅 {c.due}</span>{c.pri==='URGENT'&&<span style={{color:'#e02424',fontWeight:700}}>URGENT</span>}</div>
        </div>;})}
        {sc.length===0&&<div style={{border:'2px dashed #e5e7eb',borderRadius:7,padding:14,textAlign:'center',fontSize:10,color:'#6b7280'}}>Vide</div>}
      </div>;
    })}
  </div>;
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
function CustomersPage({users,setUsers,cases,invoices,search,setModal,showToast}) {
  const q=search.toLowerCase();
  const [showInactive,setShowInactive]=useState(false);
  const docs=users.filter(u=>u.role==='DOCTOR'&&(showInactive||u.active!==false)&&(!q||u.name.toLowerCase().includes(q)||u.clinique?.toLowerCase().includes(q)));
  const toggleActive=(d)=>{setUsers(p=>p.map(u=>u.id===d.id?{...u,active:u.active===false}:u));showToast(d.active===false?`${d.name} réactivé ✓`:`${d.name} désactivé`);};
  return <>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
      <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11.5,color:'#6b7280',cursor:'pointer'}}>
        <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/> Afficher les praticiens désactivés
      </label>
      <BtnP sm onClick={()=>setModal({t:'addDoc'})}>＋ Ajouter praticien</BtnP>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
      {docs.map(d=>{
        const dc=cases.filter(c=>c.docId===d.id);
        const di=invoices.filter(i=>i.docId===d.id);
        const bal=di.reduce((s,i)=>s+(i.total-i.paid),0);
        const inactive=d.active===false;
        return <Card key={d.id} style={{padding:15,opacity:inactive?0.6:1}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:9}}><Av u={d} sz={36}/>
              <div><div style={{fontWeight:600,fontSize:13}}>{d.name} {inactive&&<span style={{fontSize:9.5,background:'#f3f4f6',color:'#6b7280',padding:'1px 6px',borderRadius:99,marginLeft:4}}>Désactivé</span>}</div><div style={{fontSize:10.5,color:'#6b7280'}}>🏥 {d.clinique||'—'}</div>{d.spec&&<div style={{fontSize:10.5,color:'#6b7280'}}>{d.spec}</div>}</div>
            </div>
            <div style={{display:'flex',gap:4}}>
              <BtnO sm onClick={()=>setModal({t:'editDoc',uid:d.id})}>✏</BtnO>
              <button onClick={()=>toggleActive(d)} title={inactive?'Réactiver':'Désactiver'} style={{padding:'4px 8px',borderRadius:6,border:'1px solid '+(inactive?'#bbf7d0':'#fecaca'),background:inactive?'#f0fdf4':'#fef2f2',color:inactive?'#16a34a':'#dc2626',fontSize:11,cursor:'pointer'}}>{inactive?'✓':'⏻'}</button>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:7,marginBottom:10}}>
            <div style={{background:'#f9fafb',borderRadius:7,padding:7,textAlign:'center'}}><div style={{fontWeight:600,fontSize:15}}>{dc.length}</div><div style={{fontSize:9.5,color:'#6b7280'}}>Dossiers</div></div>
            <div style={{background:'#eff6ff',borderRadius:7,padding:7,textAlign:'center'}}><div style={{fontWeight:600,fontSize:15,color:'#1d4ed8'}}>{dc.filter(c=>!['DELIVERED','CANCELLED'].includes(c.status)).length}</div><div style={{fontSize:9.5,color:'#6b7280'}}>En cours</div></div>
            <div style={{background:bal>0?'#fef2f2':'#f0fdf4',borderRadius:7,padding:7,textAlign:'center'}}><div style={{fontWeight:600,fontSize:11,color:bal>0?'#e02424':'#0e9f6e'}}>{bal>0?fmt(bal):'✓ OK'}</div><div style={{fontSize:9.5,color:'#6b7280'}}>Solde</div></div>
          </div>
          <div style={{display:'flex',gap:6}}><BtnO sm onClick={()=>setModal({t:'docCases',docId:d.id})} style={{flex:1,justifyContent:'center'}}>📋 Voir dossiers</BtnO><BtnP sm onClick={()=>setModal({t:'newCase',defaultDoc:d.id})} style={{flex:1,justifyContent:'center'}}>+ Nouveau</BtnP></div>
        </Card>;
      })}
      {docs.length===0&&<div style={{gridColumn:'1/-1',textAlign:'center',padding:40,color:'#9ca3af',fontSize:13}}>Aucun praticien{showInactive?'':' actif'}</div>}
    </div>
  </>;
}

// ─── CLINICS (multi-doctor accounts) ──────────────────────────────────────────
function ClinicsPage({user,users,setUsers,cases,invoices,search,setModal,showToast,setArchives,setAuditLog}) {
  const q=search.toLowerCase();
  const clinics=users.filter(u=>u.role==='CLINIC'&&(!q||u.name.toLowerCase().includes(q)));
  const unlinkedDocs=users.filter(u=>u.role==='DOCTOR'&&!u.clinicId);
  return <>
    <div style={{display:'flex',justifyContent:'flex-end',marginBottom:4}}><BtnP sm onClick={()=>setModal({t:'addClinic'})}>＋ Ajouter une clinique</BtnP></div>
    {unlinkedDocs.length>0&&<Alert type="i">{unlinkedDocs.length} dentiste(s) sans clinique rattachée : {unlinkedDocs.map(d=>d.name).join(', ')}. Rattachez-les depuis la fiche du dentiste (page Dentistes).</Alert>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
      {clinics.map(cl=>{
        const docs=users.filter(u=>u.role==='DOCTOR'&&u.clinicId===cl.id);
        const docIds=docs.map(d=>d.id);
        const cc=cases.filter(c=>docIds.includes(c.docId));
        const ci=invoices.filter(i=>docIds.includes(i.docId));
        const bal=ci.reduce((s,i)=>s+(i.total-i.paid),0);
        return <Card key={cl.id} style={{padding:15}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:10}}>
            <div style={{display:'flex',alignItems:'center',gap:9}}><Av u={cl} sz={38}/>
              <div><div style={{fontWeight:700,fontSize:13.5}}>{cl.name}</div><div style={{fontSize:10.5,color:'#6b7280'}}>✉ {cl.email}</div>{cl.phone&&<div style={{fontSize:10.5,color:'#6b7280'}}>☎ {cl.phone}</div>}</div>
            </div>
            <div style={{display:'flex',gap:4}}><BtnO sm onClick={()=>setModal({t:'editClinic',uid:cl.id})}>✏</BtnO><BtnR sm onClick={()=>{if(docs.length>0){showToast('Impossible : détachez d\'abord les dentistes de cette clinique');return;}if(window.confirm(`Archiver la clinique ${cl.name} ?`)){archiveRecord({user,setArchives,setAuditLog},'clinics',cl,'Suppression manuelle');api.remove('/clinics',cl.id).then(()=>{setUsers(p=>p.filter(x=>x.id!==cl.id));showToast('Clinique archivée ✓');}).catch(e=>showToast('Erreur : '+(e.message||'échec')));}}}>🗄</BtnR></div>
          </div>
          {cl.address&&<div style={{fontSize:11,color:'#9ca3af',marginBottom:10}}>📍 {cl.address}</div>}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:7,marginBottom:10}}>
            <div style={{background:'#f9fafb',borderRadius:7,padding:7,textAlign:'center'}}><div style={{fontWeight:600,fontSize:15}}>{docs.length}</div><div style={{fontSize:9.5,color:'#6b7280'}}>Praticiens</div></div>
            <div style={{background:'#eff6ff',borderRadius:7,padding:7,textAlign:'center'}}><div style={{fontWeight:600,fontSize:15,color:'#1d4ed8'}}>{cc.filter(c=>!['DELIVERED','CANCELLED'].includes(c.status)).length}</div><div style={{fontSize:9.5,color:'#6b7280'}}>Dossiers actifs</div></div>
            <div style={{background:bal>0?'#fef2f2':'#f0fdf4',borderRadius:7,padding:7,textAlign:'center'}}><div style={{fontWeight:600,fontSize:11,color:bal>0?'#e02424':'#0e9f6e'}}>{bal>0?fmt(bal):'✓ OK'}</div><div style={{fontSize:9.5,color:'#6b7280'}}>Solde</div></div>
          </div>
          {docs.length>0&&<div style={{borderTop:'1px solid #f3f4f6',paddingTop:8}}>
            <div style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',marginBottom:6}}>Praticiens rattachés</div>
            {docs.map(d=><div key={d.id} style={{display:'flex',alignItems:'center',gap:6,padding:'3px 0'}}><Av u={d} sz={20}/><span style={{fontSize:11.5}}>{d.name}</span></div>)}
          </div>}
          {docs.length===0&&<div style={{fontSize:11,color:'#d97706',textAlign:'center',padding:'6px 0'}}>⚠ Aucun praticien rattaché</div>}
        </Card>;
      })}
      {clinics.length===0&&<div style={{gridColumn:'1/-1',textAlign:'center',padding:40,color:'#9ca3af',fontSize:13}}>Aucune clinique enregistrée</div>}
    </div>
  </>;
}

// ─── EMPLOYEES ────────────────────────────────────────────────────────────────
function EmployeesPage({users,setUsers,cases,showToast,setModal}) {
  const techs=users.filter(u=>u.role==='TECHNICIAN');
  return <>
    <div style={{display:'flex',justifyContent:'flex-end',marginBottom:4}}><BtnP sm onClick={()=>setModal({t:'addEmp'})}>＋ Ajouter technicien</BtnP></div>
    <Card><CH title={`Techniciens (${techs.length})`}/>
      <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:640}}><thead><tr>{['Employé','Email','Spécialité','Étapes autorisées','Tarif/él.','Étapes faites','Actions'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
      <tbody>{techs.map(u=>{
        const done=cases.flatMap(c=>c.wf.filter(w=>w.tId===u.id&&w.done));
        return <tr key={u.id}>
          <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><div style={{display:'flex',alignItems:'center',gap:8}}><Av u={u} sz={30}/><div style={{fontWeight:600,fontSize:12}}>{u.name}</div></div></td>
          <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6',color:'#6b7280'}}>{u.email}</td>
          <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6'}}>{u.spec}</td>
          <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><div style={{display:'flex',flexWrap:'wrap',gap:3}}>{u.acc.map(s=><SBadge key={s} st={s}/>)}</div></td>
          <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:600,color:'#7e3af2'}}>{fmt(u.rate||0)}/él.</td>
          <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:600}}>{done.length}</td>
          <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><div style={{display:'flex',gap:4}}><BtnO sm onClick={()=>setModal({t:'editEmp',uid:u.id})}>✏ Éditer</BtnO><BtnR sm onClick={()=>{if(window.confirm(`Supprimer ${u.name} ?`)){setUsers(p=>p.filter(x=>x.id!==u.id));showToast('Technicien supprimé');}}}>🗑</BtnR></div></td>
        </tr>;
      })}</tbody>
    </table></div></Card>
  </>;
}

// ─── RESTO TYPES ──────────────────────────────────────────────────────────────
function RestoTypesPage({restoTypes,setRestoTypes,showToast,setModal}) {
  return <>
    <div style={{display:'flex',justifyContent:'flex-end',marginBottom:4}}><BtnP sm onClick={()=>setModal({t:'addRT'})}>＋ Ajouter type</BtnP></div>
    <Card><CH title="Types de restauration"/>
      <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:420}}><thead><tr>{['Nom','Catégorie','Prix par défaut','Actions'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
      <tbody>{restoTypes.map(rt=><tr key={rt.id}>
        <td style={{padding:'8px 11px',fontSize:12.5,borderBottom:'1px solid #f3f4f6',fontWeight:600}}>{rt.name}</td>
        <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6',color:'#6b7280'}}>{rt.cat}</td>
        <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:500}}>{fmt(rt.price)}</td>
        <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><div style={{display:'flex',gap:4}}><BtnO sm onClick={()=>setModal({t:'editRT',rtId:rt.id})}>✏ Éditer</BtnO><BtnR sm onClick={()=>{if(window.confirm(`Supprimer "${rt.name}" ?`)){setRestoTypes(p=>p.filter(x=>x.id!==rt.id));showToast('Type supprimé');}}}>🗑</BtnR></div></td>
      </tr>)}</tbody>
    </table></div></Card>
  </>;
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────
function InventoryPage({mats,setMats,supps,showToast,setModal,stockMovements,setStockMovements,user,settings}) {
  // ── View tabs: Stock / Movements / Analytics
  const [view,setView]       = useState('stock');   // 'stock' | 'movements' | 'analytics'
  const [selMat,setSelMat]   = useState(null);      // selected material for detail panel
  const [mvPeriod,setMvPeriod] = useState('all');
  const [mvMat,setMvMat]     = useState('');
  const [mvType,setMvType]   = useState('');        // IN / OUT / ''
  const [search,setSearch]   = useState('');
  const [catFilter,setCatFilter] = useState('');
  const [showAddMv,setShowAddMv] = useState(false);
  const [showAddMat,setShowAddMat] = useState(false);
  // new movement form
  const [mvForm,setMvForm]   = useState({matId:'',type:'IN',qty:1,date:tod(),reason:'',ref:''});
  // new material form
  const [matForm,setMatForm] = useState({code:'',name:'',cat:'ZIRCONIA',unit:'disc',stock:0,min:5,cost:0,supplier:''});

  const today = tod();
  const curM  = today.slice(0,7);
  const curY  = today.slice(0,4);

  const CATS = [...new Set(mats.map(m=>m.cat))].sort();

  // ── Filtered mats
  const q = search.toLowerCase();
  let visMats = mats;
  if(q) visMats = visMats.filter(m=>m.name.toLowerCase().includes(q)||m.code.toLowerCase().includes(q));
  if(catFilter) visMats = visMats.filter(m=>m.cat===catFilter);

  // ── Filtered movements
  let visMv = stockMovements;
  if(mvMat)    visMv = visMv.filter(m=>m.matId===mvMat);
  if(mvType)   visMv = visMv.filter(m=>m.type===mvType);
  if(mvPeriod==='month') visMv = visMv.filter(m=>m.date.startsWith(curM));
  if(mvPeriod==='year')  visMv = visMv.filter(m=>m.date.startsWith(curY));
  visMv = [...visMv].sort((a,b)=>b.date.localeCompare(a.date));

  // ── KPIs
  const totalVal   = mats.reduce((s,m)=>s+(m.stock*m.cost),0);
  const lowCount   = mats.filter(m=>m.stock>0&&m.stock<=m.min).length;
  const outCount   = mats.filter(m=>m.stock===0).length;
  const mvIn       = stockMovements.filter(m=>m.date.startsWith(curM)&&m.type==='IN').reduce((s,m)=>s+m.qty,0);
  const mvOut      = stockMovements.filter(m=>m.date.startsWith(curM)&&m.type==='OUT').reduce((s,m)=>s+m.qty,0);

  // ── Add movement handler
  const addMovement = async () => {
    if(!mvForm.matId){showToast('Sélectionnez un matériau');return;}
    if(!mvForm.qty||mvForm.qty<=0){showToast('Quantité invalide');return;}
    const qty = Number(mvForm.qty);
    try{
      const result=await api.addStockMovement(mvForm.matId,{type:mvForm.type,qty,date:mvForm.date||today,reason:mvForm.reason||'Mouvement manuel',ref:mvForm.ref});
      const mv={id:result.id,matId:mvForm.matId,type:mvForm.type,qty,date:mvForm.date||today,reason:mvForm.reason||'Mouvement manuel',ref:mvForm.ref,by:user?.id};
      setStockMovements(p=>[mv,...p]);
      setMats(p=>p.map(m=>m.id!==mvForm.matId?m:{...m,stock:result.newStock}));
      const mat = mats.find(m=>m.id===mvForm.matId);
      showToast((mvForm.type==='IN'?'+':'-')+qty+' '+(mat?.name||'')+' enregistré ✓');
      setMvForm({matId:'',type:'IN',qty:1,date:today,reason:'',ref:''});
      setShowAddMv(false);
    }catch(e){
      showToast('Erreur : '+(e.message||'stock insuffisant ou échec'));
    }
  };

  // ── Add material handler
  const addMaterial = async () => {
    if(!matForm.name||!matForm.code){showToast('Nom et code requis');return;}
    try{
      const created=await api.createMaterial({code:matForm.code,name:matForm.name,category:matForm.cat,unit:matForm.unit,stock:Number(matForm.stock),minStock:Number(matForm.min),cost:Number(matForm.cost)});
      const nm = {id:created.id,...matForm,stock:Number(matForm.stock),min:Number(matForm.min),cost:Number(matForm.cost)};
      setMats(p=>[...p,nm]);
      showToast('Matériau '+nm.name+' ajouté ✓');
      setMatForm({code:'',name:'',cat:'ZIRCONIA',unit:'disc',stock:0,min:5,cost:0,supplier:''});
      setShowAddMat(false);
    }catch(e){
      showToast('Erreur : '+(e.message||'échec'));
    }
  };

  const MAT_STATUS = (m) => m.stock===0?'OUT':m.stock<=m.min?'LOW':'OK';
  const statusColor = {OUT:'#dc2626',LOW:'#d97706',OK:'#16a34a'};
  const statusBg    = {OUT:'#fef2f2',LOW:'#fffbeb',OK:'#f0fdf4'};
  const statusLabel = {OUT:'Rupture',LOW:'Stock bas',OK:'OK'};

  // ── Analytics: monthly consumption per material
  const topConsumed = mats.map(m=>{
    const used = stockMovements.filter(mv=>mv.matId===m.id&&mv.type==='OUT').reduce((s,mv)=>s+mv.qty,0);
    const val  = used * m.cost;
    return {mat:m,used,val};
  }).sort((a,b)=>b.used-a.used).slice(0,8);

  const monthlyTrend = ['01','02','03','04','05','06','07','08','09','10','11','12'].map((mo,i)=>{
    const key=curY+'-'+mo;
    const inQty  = stockMovements.filter(m=>m.date.startsWith(key)&&m.type==='IN').reduce((s,m)=>s+m.qty,0);
    const outQty = stockMovements.filter(m=>m.date.startsWith(key)&&m.type==='OUT').reduce((s,m)=>s+m.qty,0);
    return {mo:['J','F','M','A','M','J','J','A','S','O','N','D'][i],inQty,outQty};
  });
  const maxMo = Math.max(...monthlyTrend.map(d=>d.inQty+d.outQty),1);

  const TabBtn = ({v,l,icon}) => (
    <button onClick={()=>setView(v)} style={{padding:'8px 16px',border:'none',background:'none',cursor:'pointer',fontSize:13,fontWeight:view===v?700:400,color:view===v?'#1a56db':'#6b7280',borderBottom:view===v?'2px solid #1a56db':'2px solid transparent',marginBottom:-2,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:5}}>
      <span>{icon}</span>{l}
    </button>
  );

  return <>
    {/* ── KPI Bar ── */}
    <div className="kpi-grid" style={{gap:9}}>
      <Kpi label="Articles"        val={mats.length}          col="#1a56db"/>
      <Kpi label="Valeur stock"    val={fmt(totalVal)}        col="#7e3af2"/>
      <Kpi label="Ruptures"        val={outCount}             col="#dc2626"/>
      <Kpi label="Stock bas"       val={lowCount}             col="#d97706"/>
      <Kpi label="Entrées ce mois" val={mvIn}                 col="#16a34a"/>
      <Kpi label="Sorties ce mois" val={mvOut}                col="#e02424"/>
    </div>

    {/* ── Alerts ── */}
    {(outCount>0||lowCount>0)&&<div style={{background:'#fff',borderRadius:10,border:'1px solid #fecaca',padding:'10px 14px',display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}>
      <span style={{fontSize:12,fontWeight:700,color:'#dc2626'}}>Alertes stock :</span>
      {mats.filter(m=>m.stock===0).map(m=><span key={m.id} style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'#fef2f2',color:'#dc2626',fontWeight:600,border:'1px solid #fecaca'}}>Rupture — {m.name}</span>)}
      {mats.filter(m=>m.stock>0&&m.stock<=m.min).map(m=><span key={m.id} style={{fontSize:11,padding:'3px 9px',borderRadius:99,background:'#fffbeb',color:'#d97706',fontWeight:600,border:'1px solid #fde68a'}}>{m.name} : {m.stock}/{m.min}</span>)}
    </div>}

    {/* ── Tab Navigation ── */}
    <div style={{display:'flex',borderBottom:'2px solid #f3f4f6',gap:2,overflowX:'auto'}}>
      <TabBtn v="stock"     l="Stock"        icon="📦"/>
      <TabBtn v="movements" l="Mouvements"   icon="↕"/>
      <TabBtn v="analytics" l="Analytiques"  icon="📊"/>
    </div>

    {/* ════════════════════════════════════════
        VIEW 1: STOCK
    ════════════════════════════════════════ */}
    {view==='stock'&&<>
      {/* ── Toolbar ── */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Rechercher code ou désignation..."
          style={{flex:'1 1 180px',padding:'8px 12px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12,outline:'none',minWidth:140}}/>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
          style={{padding:'8px 10px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
          <option value=''>Toutes catégories</option>
          {CATS.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={()=>setShowAddMat(v=>!v)}
          style={{padding:'8px 16px',borderRadius:8,border:'none',background:'#1a56db',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
          + Matériau
        </button>
        <button onClick={()=>{setShowAddMv(v=>!v);setView('movements');}}
          style={{padding:'8px 16px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
          ↕ Mouvement
        </button>
        <button onClick={()=>{
          const rows=visMats.map(m=>{
            const supp=supps.find(s=>s.id===m.supplier);
            const st=MAT_STATUS(m);
            return [m.code,m.name,m.cat,supp?.name||'—',m.unit,m.stock+'',m.min+'',fmt(m.stock*m.cost),statusLabel[st]];
          });
          const label=catFilter?' — '+catFilter:'';
          const inner=reportTableHTML(
            [{label:'Code'},{label:'Désignation'},{label:'Catégorie'},{label:'Fournisseur'},{label:'Unité'},{label:'Stock',align:'right'},{label:'Min.',align:'right'},{label:'Valeur',align:'right'},{label:'État'}],
            rows,
            ['','','','','','','TOTAL',fmt(visMats.reduce((s,m)=>s+m.stock*m.cost,0)),'']
          );
          printReport(settings,'Inventaire — Stock'+label,visMats.length+' article(s)',inner,{landscape:true});
        }} style={{padding:'8px 16px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
          🖨 Imprimer
        </button>
      </div>

      {/* ── Add Material Form ── */}
      {showAddMat&&<div style={{background:'#fff',borderRadius:12,border:'2px solid #1a56db',padding:'16px'}}>
        <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:12}}>Nouveau matériau</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10,marginBottom:12}}>
          {[['Code','code','text','ZIR-001'],['Désignation','name','text','Zirconia Disc...'],['Stock initial','stock','number','0'],['Stock min.','min','number','5'],['Coût unitaire (DA)','cost','number','0']].map(([l,k,t,ph])=>
            <div key={k}>
              <label style={{fontSize:10.5,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>{l}</label>
              <input type={t} value={matForm[k]} onChange={e=>setMatForm(p=>({...p,[k]:e.target.value}))} placeholder={ph}
                style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
            </div>
          )}
          <div>
            <label style={{fontSize:10.5,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>Catégorie</label>
            <select value={matForm.cat} onChange={e=>setMatForm(p=>({...p,cat:e.target.value}))}
              style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
              {['ZIRCONIA','PMMA','WAX','TITANIUM','IMPLANT','CONSUMABLE','CERAMIC','OTHER'].map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10.5,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>Unité</label>
            <select value={matForm.unit} onChange={e=>setMatForm(p=>({...p,unit:e.target.value}))}
              style={{width:'100%',padding:'7px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
              {['disc','piece','set','box','kg','ml','unit'].map(u=><option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={addMaterial} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'#16a34a',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Enregistrer</button>
          <button onClick={()=>setShowAddMat(false)} style={{padding:'9px 16px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,cursor:'pointer'}}>Annuler</button>
        </div>
      </div>}

      {/* ── Stock Cards by Category ── */}
      {CATS.filter(c=>!catFilter||c===catFilter).map(cat=>{
        const catMats = visMats.filter(m=>m.cat===cat);
        if(!catMats.length) return null;
        return <div key={cat} style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
          <div style={{padding:'10px 14px',background:'#fafafa',borderBottom:'1px solid #f3f4f6',borderRadius:'11px 11px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontWeight:700,fontSize:13,color:'#111827'}}>{cat}</span>
            <span style={{fontSize:11,color:'#6b7280'}}>{catMats.length} article{catMats.length>1?'s':''} · Valeur : <b style={{color:'#7e3af2'}}>{fmt(catMats.reduce((s,m)=>s+(m.stock*m.cost),0))}</b></span>
          </div>
          <div className="table-wrap">
            <table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
              <thead><tr style={{background:'#fafafa'}}>
                {['Code','Désignation','Fournisseur','Unité','Stock','Min.','Valeur','État','Actions'].map(h=>
                  <th key={h} style={{padding:'7px 12px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>
                )}
              </tr></thead>
              <tbody>{catMats.map((m,i)=>{
                const st=MAT_STATUS(m);
                const supp=supps.find(s=>s.id===m.supplier);
                const pct=Math.min((m.stock/Math.max(m.min*2,1))*100,100);
                return <tr key={m.id}
                  style={{background:st==='OUT'?'#fff5f5':st==='LOW'?'#fffdf5':i%2===0?'#fff':'#fafafa',cursor:'pointer',borderBottom:'1px solid #f3f4f6'}}
                  onClick={()=>setSelMat(selMat?.id===m.id?null:m)}>
                  <td style={{padding:'9px 12px',fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#6b7280',whiteSpace:'nowrap'}}>{m.code}</td>
                  <td style={{padding:'9px 12px'}}>
                    <div style={{fontSize:13,fontWeight:600,color:'#111827'}}>{m.name}</div>
                    {m.cost>0&&<div style={{fontSize:10.5,color:'#9ca3af'}}>Coût: {fmt(m.cost)}/{m.unit}</div>}
                  </td>
                  <td style={{padding:'9px 12px',fontSize:11.5,color:'#374151'}}>{supp?.name||'—'}</td>
                  <td style={{padding:'9px 12px',fontSize:11,color:'#6b7280'}}>{m.unit}</td>
                  <td style={{padding:'9px 12px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{width:36,height:4,background:'#f3f4f6',borderRadius:99,flexShrink:0}}>
                        <div style={{height:'100%',background:statusColor[st],borderRadius:99,width:pct+'%'}}/>
                      </div>
                      <span style={{fontSize:14,fontWeight:800,color:statusColor[st]}}>{m.stock}</span>
                    </div>
                  </td>
                  <td style={{padding:'9px 12px',fontSize:12,textAlign:'center',color:'#6b7280'}}>{m.min}</td>
                  <td style={{padding:'9px 12px',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>{fmt(m.stock*m.cost)}</td>
                  <td style={{padding:'9px 12px'}}>
                    <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:99,background:statusBg[st],color:statusColor[st],whiteSpace:'nowrap'}}>{statusLabel[st]}</span>
                  </td>
                  <td style={{padding:'9px 12px'}}>
                    <div style={{display:'flex',gap:4}}>
                      <button onClick={e=>{e.stopPropagation();setMvForm({matId:m.id,type:'IN',qty:1,date:today,reason:'',ref:''});setShowAddMv(true);setView('movements');}}
                        style={{padding:'4px 10px',borderRadius:6,border:'none',background:'#f0fdf4',color:'#16a34a',cursor:'pointer',fontSize:11,fontWeight:700}}>+Entrée</button>
                      <button onClick={e=>{e.stopPropagation();setMvForm({matId:m.id,type:'OUT',qty:1,date:today,reason:'',ref:''});setShowAddMv(true);setView('movements');}}
                        style={{padding:'4px 10px',borderRadius:6,border:'none',background:'#fef2f2',color:'#dc2626',cursor:'pointer',fontSize:11,fontWeight:700}}>-Sortie</button>
                    </div>
                  </td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {/* ── Material Detail Panel ── */}
          {selMat&&catMats.some(m=>m.id===selMat.id)&&<div style={{padding:'14px 16px',borderTop:'2px solid #e5e7eb',background:'#f9fafb'}}>
            <div style={{fontWeight:700,fontSize:12,color:'#374151',marginBottom:10}}>Historique — {selMat.name}</div>
            {stockMovements.filter(mv=>mv.matId===selMat.id).length===0
              ?<div style={{color:'#9ca3af',fontSize:12,padding:'8px 0'}}>Aucun mouvement enregistré</div>
              :<div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:200,overflowY:'auto'}}>
                {stockMovements.filter(mv=>mv.matId===selMat.id).sort((a,b)=>b.date.localeCompare(a.date)).map(mv=>
                  <div key={mv.id} style={{display:'flex',alignItems:'center',gap:10,padding:'7px 10px',background:'#fff',borderRadius:8,border:'1px solid #e5e7eb'}}>
                    <span style={{fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:'#6b7280',whiteSpace:'nowrap'}}>{mv.date}</span>
                    <span style={{fontSize:12,fontWeight:800,color:mv.type==='IN'?'#16a34a':'#dc2626',width:36,textAlign:'center'}}>{mv.type==='IN'?'+':'-'}{mv.qty}</span>
                    <span style={{fontSize:11.5,color:'#374151',flex:1}}>{mv.reason}</span>
                    {mv.ref&&<span style={{fontSize:10.5,color:'#9ca3af',fontFamily:"'JetBrains Mono',monospace"}}>{mv.ref}</span>}
                  </div>
                )}
              </div>
            }
          </div>}
        </div>;
      })}
      {visMats.length===0&&<div style={{padding:32,textAlign:'center',color:'#9ca3af',fontSize:13,background:'#fff',borderRadius:12,border:'1px solid #e5e7eb'}}>
        {search||catFilter?'Aucun résultat — modifiez vos filtres':'Aucun matériau — cliquez "+ Matériau"'}
      </div>}
    </>}

    {/* ════════════════════════════════════════
        VIEW 2: MOVEMENTS
    ════════════════════════════════════════ */}
    {view==='movements'&&<>
      {/* ── Add Movement Form ── */}
      <div style={{background:'#fff',borderRadius:12,border:'2px solid #1a56db',padding:'16px'}}>
        <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:12}}>Enregistrer un mouvement</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:12}}>
          <div>
            <label style={{fontSize:10.5,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>Matériau *</label>
            <select value={mvForm.matId} onChange={e=>setMvForm(p=>({...p,matId:e.target.value}))}
              style={{width:'100%',padding:'8px 10px',borderRadius:7,border:'1px solid '+(mvForm.matId?'#d1d5db':'#dc2626'),fontSize:12,background:'#fff'}}>
              <option value=''>-- Choisir --</option>
              {mats.map(m=><option key={m.id} value={m.id}>{m.name} (stock: {m.stock})</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10.5,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>Type *</label>
            <div style={{display:'flex',gap:6}}>
              <button onClick={()=>setMvForm(p=>({...p,type:'IN'}))} style={{flex:1,padding:'8px',borderRadius:7,border:'2px solid '+(mvForm.type==='IN'?'#16a34a':'#e5e7eb'),background:mvForm.type==='IN'?'#f0fdf4':'#fff',color:mvForm.type==='IN'?'#16a34a':'#374151',fontWeight:700,cursor:'pointer',fontSize:12}}>
                Entrée
              </button>
              <button onClick={()=>setMvForm(p=>({...p,type:'OUT'}))} style={{flex:1,padding:'8px',borderRadius:7,border:'2px solid '+(mvForm.type==='OUT'?'#dc2626':'#e5e7eb'),background:mvForm.type==='OUT'?'#fef2f2':'#fff',color:mvForm.type==='OUT'?'#dc2626':'#374151',fontWeight:700,cursor:'pointer',fontSize:12}}>
                Sortie
              </button>
            </div>
          </div>
          <div>
            <label style={{fontSize:10.5,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>Quantité *</label>
            <input type="number" min="1" value={mvForm.qty} onChange={e=>setMvForm(p=>({...p,qty:e.target.value}))}
              style={{width:'100%',padding:'8px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:13,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div>
            <label style={{fontSize:10.5,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>Date</label>
            <input type="date" value={mvForm.date} onChange={e=>setMvForm(p=>({...p,date:e.target.value}))}
              style={{width:'100%',padding:'8px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div style={{gridColumn:'span 2'}}>
            <label style={{fontSize:10.5,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>Motif / Raison</label>
            <input value={mvForm.reason} onChange={e=>setMvForm(p=>({...p,reason:e.target.value}))}
              placeholder="Ex: Commande fournisseur, Utilisation dossier LAB-..."
              style={{width:'100%',padding:'8px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div>
            <label style={{fontSize:10.5,fontWeight:600,color:'#6b7280',display:'block',marginBottom:3}}>Référence / N° facture</label>
            <input value={mvForm.ref} onChange={e=>setMvForm(p=>({...p,ref:e.target.value}))}
              placeholder="FACT-2024-001"
              style={{width:'100%',padding:'8px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
          </div>
        </div>
        {mvForm.matId&&<div style={{padding:'8px 12px',background:mvForm.type==='IN'?'#f0fdf4':'#fef2f2',borderRadius:8,marginBottom:12,fontSize:12,color:mvForm.type==='IN'?'#166534':'#991b1b',fontWeight:500}}>
          {(()=>{const m=mats.find(x=>x.id===mvForm.matId);if(!m)return null;const qty=Number(mvForm.qty)||0;const newStock=mvForm.type==='IN'?m.stock+qty:Math.max(0,m.stock-qty);return <span>Stock actuel : <b>{m.stock}</b> → Nouveau stock : <b style={{fontSize:14}}>{newStock}</b> {m.unit}</span>;})()}
        </div>}
        <div style={{display:'flex',gap:8}}>
          <button onClick={addMovement}
            style={{padding:'10px 24px',borderRadius:8,border:'none',background:mvForm.type==='IN'?'#16a34a':'#dc2626',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            Enregistrer {mvForm.type==='IN'?'l\'entrée':'la sortie'}
          </button>
          <button onClick={()=>setMvForm({matId:'',type:'IN',qty:1,date:today,reason:'',ref:''})}
            style={{padding:'10px 14px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,cursor:'pointer'}}>
            Réinitialiser
          </button>
        </div>
      </div>

      {/* ── Movement filters ── */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:'12px 14px',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:12,fontWeight:600,color:'#374151'}}>Filtres</span>
        <select value={mvMat} onChange={e=>setMvMat(e.target.value)} style={{padding:'6px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,background:'#fff',flex:'1 1 150px',minWidth:120}}>
          <option value=''>Tous les matériaux</option>
          {mats.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <div style={{display:'flex',gap:4}}>
          {[['','Tous'],['IN','Entrées'],['OUT','Sorties']].map(([v,l])=>
            <button key={v} onClick={()=>setMvType(v)} style={{padding:'6px 12px',borderRadius:99,border:'none',cursor:'pointer',fontSize:11.5,fontWeight:mvType===v?700:400,background:mvType===v?'#1a56db':'#f3f4f6',color:mvType===v?'#fff':'#374151'}}>{l}</button>
          )}
        </div>
        {[['all','Tout'],['month','Ce mois'],['year','Cette année']].map(([v,l])=>
          <button key={v} onClick={()=>setMvPeriod(v)} style={{padding:'6px 12px',borderRadius:99,border:'none',cursor:'pointer',fontSize:11.5,fontWeight:mvPeriod===v?700:400,background:mvPeriod===v?'#1a56db':'#f3f4f6',color:mvPeriod===v?'#fff':'#374151'}}>{l}</button>
        )}
        <span style={{marginLeft:'auto',fontSize:11,color:'#6b7280'}}>
          {visMv.filter(m=>m.type==='IN').reduce((s,m)=>s+m.qty,0)} entrées ·{' '}
          {visMv.filter(m=>m.type==='OUT').reduce((s,m)=>s+m.qty,0)} sorties
        </span>
        <button onClick={()=>{
          const rows=visMv.map(mv=>{
            const mat=mats.find(m=>m.id===mv.matId);
            const laterMv = stockMovements.filter(m=>m.matId===mv.matId&&m.date>=mv.date&&m.id!==mv.id);
            const stockAfter = mat ? mat.stock + laterMv.reduce((s,m)=>s+(m.type==='OUT'?m.qty:-m.qty),0) : '—';
            return [mv.date,mat?.name||mv.matId,mv.type==='IN'?'↑ Entrée':'↓ Sortie',(mv.type==='IN'?'+':'-')+mv.qty,stockAfter+'',mv.reason||'—',mv.ref||'—'];
          });
          const inner=reportTableHTML(
            [{label:'Date'},{label:'Matériau'},{label:'Type'},{label:'Quantité',align:'right'},{label:'Stock après',align:'right'},{label:'Motif'},{label:'Référence'}],
            rows
          );
          printReport(settings,'Inventaire — Mouvements de stock','',inner,{landscape:true});
        }} style={{padding:'6px 14px',borderRadius:99,border:'1px solid #d1d5db',background:'#fff',cursor:'pointer',fontSize:11.5,fontWeight:600}}>🖨 Imprimer</button>
      </div>

      {/* ── Movement Table ── */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div className="table-wrap">
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:560}}>
            <thead><tr style={{background:'#fafafa'}}>
              {['Date','Matériau','Type','Quantité','Stock après','Motif','Référence'].map(h=>
                <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>
              )}
            </tr></thead>
            <tbody>
              {visMv.length===0
                ?<tr><td colSpan={7} style={{padding:28,textAlign:'center',color:'#9ca3af',fontSize:13}}>Aucun mouvement pour ces critères</td></tr>
                :visMv.map((mv,i)=>{
                  const mat=mats.find(m=>m.id===mv.matId);
                  // compute running stock for this movement
                  const laterMv = stockMovements.filter(m=>m.matId===mv.matId&&m.date>=mv.date&&m.id!==mv.id);
                  const stockAfter = mat ? mat.stock + laterMv.reduce((s,m)=>s+(m.type==='OUT'?m.qty:-m.qty),0) : '—';
                  return <tr key={mv.id} style={{background:i%2===0?'#fff':'#fafafa',borderBottom:'1px solid #f3f4f6'}}>
                    <td style={{padding:'9px 12px',fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'#6b7280',whiteSpace:'nowrap'}}>{mv.date}</td>
                    <td style={{padding:'9px 12px',fontSize:12,fontWeight:500,color:'#111827'}}>{mat?.name||mv.matId}</td>
                    <td style={{padding:'9px 12px'}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:99,background:mv.type==='IN'?'#f0fdf4':'#fef2f2',color:mv.type==='IN'?'#16a34a':'#dc2626'}}>
                        {mv.type==='IN'?'↑ Entrée':'↓ Sortie'}
                      </span>
                    </td>
                    <td style={{padding:'9px 12px',fontSize:15,fontWeight:800,textAlign:'center',color:mv.type==='IN'?'#16a34a':'#dc2626'}}>
                      {mv.type==='IN'?'+':'-'}{mv.qty}
                    </td>
                    <td style={{padding:'9px 12px',fontSize:12,fontWeight:600,textAlign:'center',color:'#374151'}}>{stockAfter}</td>
                    <td style={{padding:'9px 12px',fontSize:11.5,color:'#374151'}}>{mv.reason||'—'}</td>
                    <td style={{padding:'9px 12px',fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#6b7280'}}>{mv.ref||'—'}</td>
                  </tr>;
                })
              }
            </tbody>
          </table>
        </div>
      </div>
    </>}

    {/* ════════════════════════════════════════
        VIEW 3: ANALYTICS
    ════════════════════════════════════════ */}
    {view==='analytics'&&<>
      <div style={{display:'grid',gridTemplateColumns:'3fr 2fr',gap:13}} className="dash-2col">
        {/* Monthly trend chart */}
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:'16px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
          <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:14}}>Flux mensuel {curY} — Entrées vs Sorties</div>
          <div style={{display:'flex',alignItems:'flex-end',gap:4,height:100,paddingBottom:20,position:'relative'}}>
            {monthlyTrend.map((d,i)=>(
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',height:'100%',gap:2}}>
                <div style={{flex:1,width:'100%',display:'flex',flexDirection:'column',justifyContent:'flex-end',gap:1}}>
                  <div style={{width:'100%',background:'#3b82f6',borderRadius:'3px 3px 0 0',height:`${(d.inQty/maxMo)*100}%`,minHeight:d.inQty>0?3:0,opacity:.85}}/>
                  <div style={{width:'100%',background:'#f87171',borderRadius:'3px 3px 0 0',height:`${(d.outQty/maxMo)*85}%`,minHeight:d.outQty>0?2:0,opacity:.75}}/>
                </div>
                <span style={{position:'absolute',bottom:2,fontSize:8,color:'#9ca3af'}}>{d.mo}</span>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:12,fontSize:10.5,color:'#6b7280',justifyContent:'center',marginTop:4}}>
            <span><span style={{display:'inline-block',width:8,height:8,background:'#3b82f6',borderRadius:2,marginRight:4}}/>Entrées</span>
            <span><span style={{display:'inline-block',width:8,height:8,background:'#f87171',borderRadius:2,marginRight:4}}/>Sorties</span>
          </div>
        </div>

        {/* Value by category */}
        <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:'16px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
          <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:12}}>Valeur par catégorie</div>
          {CATS.map(cat=>{
            const val=mats.filter(m=>m.cat===cat).reduce((s,m)=>s+(m.stock*m.cost),0);
            const pct=totalVal>0?((val/totalVal)*100):0;
            return <div key={cat} style={{marginBottom:10}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                <span style={{fontSize:11.5,fontWeight:500,color:'#374151'}}>{cat}</span>
                <span style={{fontSize:11.5,fontWeight:600,color:'#7e3af2'}}>{fmt(val)}</span>
              </div>
              <div style={{height:6,background:'#f3f4f6',borderRadius:99}}>
                <div style={{height:'100%',background:'#7e3af2',borderRadius:99,width:pct+'%',opacity:.8}}/>
              </div>
            </div>;
          })}
        </div>
      </div>

      {/* Top consumed materials */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div style={{padding:'11px 14px',background:'#fafafa',borderBottom:'1px solid #f3f4f6',borderRadius:'11px 11px 0 0',fontWeight:700,fontSize:13}}>Consommation totale — Top matériaux</div>
        <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:480}}>
          <thead><tr style={{background:'#fafafa'}}>
            {['Matériau','Catégorie','Qté consommée','Valeur consommée','Stock actuel','État'].map(h=>
              <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>
            )}
          </tr></thead>
          <tbody>{topConsumed.map(({mat,used,val},i)=>{
            const st=MAT_STATUS(mat);
            return <tr key={mat.id} style={{background:i%2===0?'#fff':'#fafafa',borderBottom:'1px solid #f3f4f6'}}>
              <td style={{padding:'9px 12px'}}>
                <div style={{fontSize:12,fontWeight:600,color:'#111827'}}>{mat.name}</div>
                <div style={{fontSize:10,color:'#9ca3af',fontFamily:"'JetBrains Mono',monospace"}}>{mat.code}</div>
              </td>
              <td style={{padding:'9px 12px',fontSize:11,color:'#6b7280'}}>{mat.cat}</td>
              <td style={{padding:'9px 12px',fontSize:14,fontWeight:800,textAlign:'center',color:'#dc2626'}}>{used}</td>
              <td style={{padding:'9px 12px',fontSize:12,fontWeight:600,color:'#7e3af2',whiteSpace:'nowrap'}}>{fmt(val)}</td>
              <td style={{padding:'9px 12px',fontSize:14,fontWeight:800,textAlign:'center',color:statusColor[st]}}>{mat.stock}</td>
              <td style={{padding:'9px 12px'}}>
                <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:99,background:statusBg[st],color:statusColor[st]}}>{statusLabel[st]}</span>
              </td>
            </tr>;
          })}</tbody>
        </table></div>
      </div>
    </>}
  </>;
}


// ─── SUPPLIERS ────────────────────────────────────────────────────────────────
function SuppliersPage({user,supps,setSupps,orders,showToast,setModal,setArchives,setAuditLog}) {
  return <>
    <div style={{display:'flex',justifyContent:'flex-end',marginBottom:4}}><BtnP sm onClick={()=>setModal({t:'addSupp'})}>＋ Ajouter</BtnP></div>
    <Card><CH title="Fournisseurs"/>
      <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:640}}><thead><tr>{['Nom','Contact','Email','Ville','Conditions','Commandes','Montant dû',''].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
      <tbody>{supps.map(s=>{const os=orders.filter(o=>o.supId===s.id);const due=os.filter(o=>o.paymentStatus!=='PAID').reduce((x,o)=>x+(poTotals(o.items,o.shipping).grandTotal-(o.paidAmount||0)),0);return <tr key={s.id}>
        <td style={{padding:'8px 11px',fontSize:12.5,borderBottom:'1px solid #f3f4f6',fontWeight:600}}>{s.name}</td>
        <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6'}}>{s.contact}</td>
        <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6',color:'#1a56db'}}>{s.email}</td>
        <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6'}}>{s.city}</td>
        <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6',color:'#6b7280'}}>{s.paymentTerms||'—'}</td>
        <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',textAlign:'center'}}>{os.length}</td>
        <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:500,color:due>0?'#e02424':'#0e9f6e'}}>{due>0?fmt(due):'—'}</td>
        <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><div style={{display:'flex',gap:3}}><BtnO sm onClick={()=>setModal({t:'suppStatement',sid:s.id})}>🖨 Relevé</BtnO><BtnO sm onClick={()=>setModal({t:'editSupp',sid:s.id})}>✏</BtnO><BtnR sm onClick={()=>{if(window.confirm('Archiver ce fournisseur ?')){archiveRecord({user,setArchives,setAuditLog},'suppliers',s,'Suppression manuelle');api.remove(api.simple.suppliers,s.id).then(()=>{setSupps(p=>p.filter(x=>x.id!==s.id));showToast('Fournisseur archivé ✓');}).catch(e=>showToast('Erreur : '+(e.message||'échec')));}}}>🗄</BtnR></div></td>
      </tr>;})}
      </tbody></table></div>
    </Card>
  </>;
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────
function PurchaseOrdersPage({orders,setOrders,supps,mats,setMats,stockMovements,setStockMovements,setModal,showToast,settings}) {
  const [tab,setTab]=useState(0);
  const tabsL=['📋 Commandes','📊 Tableau de bord','📈 Rapports'];
  const COLORS=['#1a56db','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#c2410c','#65a30d'];
  const today=tod(); const curM=today.slice(0,7);

  // ── Filters (Commandes tab) ──
  const [fSup,setFSup]=useState('');
  const [fStatus,setFStatus]=useState('');
  const [fDate,setFDate]=useState('');
  const [fSearch,setFSearch]=useState('');
  const grand = o => poTotals(o.items,o.shipping).grandTotal;
  const vis = orders.filter(o=>
    (!fSup||o.supId===fSup) &&
    (!fStatus||o.status===fStatus) &&
    (!fDate||o.orderDate===fDate) &&
    (!fSearch||o.poNum.toLowerCase().includes(fSearch.toLowerCase()))
  ).sort((a,b)=>(b.orderDate||'').localeCompare(a.orderDate||''));

  // ── Dashboard metrics ──
  const pending = orders.filter(o=>['DRAFT','PENDING_APPROVAL','APPROVED'].includes(o.status));
  const awaitingDelivery = orders.filter(o=>o.status==='SENT');
  const receivedToday = orders.filter(o=>o.receivedDate===today);
  const purchasesThisMonth = orders.filter(o=>o.orderDate?.startsWith(curM)).reduce((s,o)=>s+grand(o),0);
  const topSuppliers = supps.map(s=>{
    const os=orders.filter(o=>o.supId===s.id);
    return {label:s.name,value:os.reduce((sum,o)=>sum+grand(o),0),count:os.length};
  }).filter(s=>s.value>0).sort((a,b)=>b.value-a.value).slice(0,6);

  // ── Actions ──
  const deleteOrder=(id)=>{
    if(!window.confirm('Supprimer cette commande ?'))return;
    setOrders(p=>p.filter(o=>o.id!==id));
    showToast('Commande supprimée');
  };

  // ── Reports ──
  const byProduct={};
  orders.forEach(o=>o.items.forEach(it=>{byProduct[it.name]=(byProduct[it.name]||0)+poItemTotal(it);}));
  const byProductList=Object.entries(byProduct).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
  const byCategory={};
  orders.forEach(o=>o.items.forEach(it=>{byCategory[it.category||'Autre']=(byCategory[it.category||'Autre']||0)+poItemTotal(it);}));
  const byCategoryList=Object.entries(byCategory).map(([label,value],i)=>({label,value,color:COLORS[i%COLORS.length]})).sort((a,b)=>b.value-a.value);
  const bySupplier=supps.map(s=>({label:s.name,value:orders.filter(o=>o.supId===s.id).reduce((sum,o)=>sum+grand(o),0)})).filter(r=>r.value>0).sort((a,b)=>b.value-a.value);
  const totalPurchasesAll = orders.reduce((s,o)=>s+grand(o),0);

  const exportOrdersCSV=()=>downloadCSV('commandes_fournisseurs.csv',
    ['N° PO','Fournisseur','Date commande','Date attendue','Statut','Paiement','Total'],
    vis.map(o=>{const s=supps.find(x=>x.id===o.supId);return [o.poNum,s?.name||'',o.orderDate,o.expectedDate,PO_STATUS_LABELS[o.status],PO_PAY_LABELS[o.paymentStatus],grand(o)];}));
  const printOrders=()=>{
    const inner=reportTableHTML(
      [{label:'N° PO'},{label:'Fournisseur'},{label:'Date'},{label:'Statut'},{label:'Paiement'},{label:'Total',align:'right'}],
      vis.map(o=>{const s=supps.find(x=>x.id===o.supId);return [o.poNum,s?.name||'—',o.orderDate,PO_STATUS_LABELS[o.status],PO_PAY_LABELS[o.paymentStatus],fmtDA(grand(o))];}),
      ['','','','','TOTAL',fmtDA(vis.reduce((s,o)=>s+grand(o),0))]
    );
    printReport(settings,'Commandes Fournisseurs','',inner,{landscape:true});
  };
  const exportReportCSV=(name,list)=>downloadCSV(name+'.csv',['Libellé','Montant'],list.map(r=>[r.label,r.value]));
  const printReportTable=(title,list)=>{
    const inner=reportTableHTML([{label:'Libellé'},{label:'Montant',align:'right'}],list.map(r=>[r.label,fmtDA(r.value)]),['TOTAL',fmtDA(list.reduce((s,r)=>s+r.value,0))]);
    printReport(settings,title,'',inner);
  };

  const TabBtn=({i,l})=><button onClick={()=>setTab(i)} style={{padding:'6px 14px',border:'none',background:'none',cursor:'pointer',fontSize:12,fontWeight:tab===i?700:400,color:tab===i?'#1a56db':'#6b7280',borderBottom:tab===i?'2px solid #1a56db':'2px solid transparent',whiteSpace:'nowrap',marginBottom:-2}}>{l}</button>;

  return <>
    <div style={{display:'flex',gap:2,borderBottom:'2px solid #f3f4f6',marginBottom:14,overflowX:'auto',flexWrap:'nowrap',flexShrink:0}}>
      {tabsL.map((t,i)=><TabBtn key={i} i={i} l={t}/>)}
    </div>

    {/* ── DASHBOARD ── */}
    {tab===1&&<>
      <div className="kpi-grid" style={{gap:9,display:'grid',gridTemplateColumns:'repeat(4,1fr)'}}>
        <Kpi label="Commandes en attente"     val={pending.length} col="#d97706"/>
        <Kpi label="En attente de livraison"  val={awaitingDelivery.length} col="#7c3aed"/>
        <Kpi label="Reçues aujourd'hui"       val={receivedToday.length} col="#16a34a"/>
        <Kpi label="Achats ce mois"           val={fmtDA(purchasesThisMonth)} col="#1a56db"/>
      </div>
      <Card style={{padding:14,marginTop:12}}>
        <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Top fournisseurs (par montant d'achat)</div>
        {topSuppliers.length?<BarChartSVG data={topSuppliers.map((s,i)=>({...s,color:COLORS[i%COLORS.length]}))} valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>Aucune commande</div>}
      </Card>
    </>}

    {/* ── COMMANDES (list) ── */}
    {tab===0&&<>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
        <input value={fSearch} onChange={e=>setFSearch(e.target.value)} placeholder="Rechercher N° PO..." style={{padding:'7px 11px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12,flex:'1 1 180px'}}/>
        <select value={fSup} onChange={e=>setFSup(e.target.value)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
          <option value=''>Tous les fournisseurs</option>
          {supps.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={fStatus} onChange={e=>setFStatus(e.target.value)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
          <option value=''>Tous les statuts</option>
          {PO_STATUSES.map(s=><option key={s} value={s}>{PO_STATUS_LABELS[s]}</option>)}
        </select>
        <input type="date" value={fDate} onChange={e=>setFDate(e.target.value)} style={{padding:'6px 9px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12}}/>
        {(fSup||fStatus||fDate||fSearch)&&<button onClick={()=>{setFSup('');setFStatus('');setFDate('');setFSearch('');}} style={{padding:'7px 12px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:11.5,cursor:'pointer'}}>✕ Filtres</button>}
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          <button onClick={exportOrdersCSV} style={{padding:'7px 13px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>⬇ CSV</button>
          <button onClick={printOrders} style={{padding:'7px 13px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>🖨 Imprimer</button>
          <BtnP sm onClick={()=>setModal({t:'newPO'})}>＋ Nouvelle commande</BtnP>
        </div>
      </div>
      <Card>
        <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:820}}>
          <thead><tr>{['N° PO','Fournisseur','Date','Livraison prévue','Statut','Paiement','Total',''].map(h=><th key={h} style={{padding:'8px 11px',textAlign:h==='Total'?'right':'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.05em',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>{vis.map((o,idx)=>{
            const s=supps.find(x=>x.id===o.supId);
            return <tr key={o.id} style={{background:idx%2===0?'#fff':'#fafafa'}}>
              <td style={{padding:'8px 11px',fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:'#1a56db',fontWeight:700,borderBottom:'1px solid #f3f4f6'}}>{o.poNum}</td>
              <td style={{padding:'8px 11px',fontSize:12,fontWeight:500,borderBottom:'1px solid #f3f4f6'}}>{s?.name||'—'}</td>
              <td style={{padding:'8px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{o.orderDate}</td>
              <td style={{padding:'8px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{o.expectedDate||'—'}</td>
              <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:99,background:PO_STATUS_COLORS[o.status]+'22',color:PO_STATUS_COLORS[o.status]}}>{PO_STATUS_LABELS[o.status]}</span></td>
              <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:99,background:PO_PAY_COLORS[o.paymentStatus]+'22',color:PO_PAY_COLORS[o.paymentStatus]}}>{PO_PAY_LABELS[o.paymentStatus]}</span></td>
              <td style={{padding:'8px 11px',fontSize:12,fontWeight:700,textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(grand(o))}</td>
              <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}>
                <div style={{display:'flex',gap:4}}>
                  <BtnO sm onClick={()=>setModal({t:'viewPO',oid:o.id})}>Voir</BtnO>
                  <button onClick={()=>deleteOrder(o.id)} title="Supprimer" style={{border:'none',background:'none',color:'#dc2626',cursor:'pointer',fontSize:13}}>🗑</button>
                </div>
              </td>
            </tr>;
          })}
          {vis.length===0&&<tr><td colSpan={8} style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucune commande</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </>}

    {/* ── REPORTS ── */}
    {tab===2&&<>
      <div className="kpi-grid" style={{gap:9,display:'grid',gridTemplateColumns:'repeat(3,1fr)'}}>
        <Kpi label="Total achats (toutes commandes)" val={fmtDA(totalPurchasesAll)} col="#1a56db"/>
        <Kpi label="Nombre de commandes"              val={orders.length} col="#7e3af2"/>
        <Kpi label="Fournisseurs actifs"              val={bySupplier.length} col="#0891b2"/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}>
        <Card style={{padding:14}}>
          <ExportBar title="Par fournisseur" onCSV={()=>exportReportCSV('achats_par_fournisseur',bySupplier)} onPrint={()=>printReportTable('Achats par fournisseur',bySupplier)}/>
          {bySupplier.length?<BarChartSVG data={bySupplier.slice(0,6).map((r,i)=>({...r,color:COLORS[i%COLORS.length]}))} valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:12,padding:16,textAlign:'center'}}>—</div>}
        </Card>
        <Card style={{padding:14}}>
          <ExportBar title="Par catégorie" onCSV={()=>exportReportCSV('achats_par_categorie',byCategoryList)} onPrint={()=>printReportTable('Achats par catégorie',byCategoryList)}/>
          {byCategoryList.length?<DonutChartSVG data={byCategoryList.slice(0,7)}/>:<div style={{color:'#9ca3af',fontSize:12,padding:16,textAlign:'center'}}>—</div>}
        </Card>
      </div>
      <Card style={{padding:14,marginTop:12}}>
        <ExportBar title={'Par produit — '+byProductList.length+' produits'} onCSV={()=>exportReportCSV('achats_par_produit',byProductList)} onPrint={()=>printReportTable('Achats par produit',byProductList)}/>
        {byProductList.length?<BarChartSVG data={byProductList.slice(0,8).map((r,i)=>({...r,color:COLORS[i%COLORS.length]}))} valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:12,padding:16,textAlign:'center'}}>Aucune donnée</div>}
        <div className="table-wrap" style={{marginTop:12}}><table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{['Produit','Montant total'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:h==='Montant total'?'right':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
          <tbody>{byProductList.map((r,i)=><tr key={i} style={{background:i%2===0?'#fff':'#fafafa'}}>
            <td style={{padding:'7px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6'}}>{r.label}</td>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:700,color:'#1a56db',textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(r.value)}</td>
          </tr>)}
          </tbody>
        </table></div>
      </Card>
    </>}
  </>;
}

// ─── BILLING ─────────────────────────────────────────────────────────────────
// ─── ORDER / DOSSIER SLIP (with QR code) ──────────────────────────────────────
// ─── VENDORED QR CODE ENCODER (self-contained, no external deps/imports) ─────
var __QRBundle=(()=>{var rt=Object.defineProperty;var we=Object.getOwnPropertyDescriptor;var Ee=Object.getOwnPropertyNames;var Ce=Object.prototype.hasOwnProperty;var g=(n,t)=>()=>{try{return t||n((t={exports:{}}).exports,t),t.exports}catch(e){throw t=0,e}},me=(n,t)=>{for(var e in t)rt(n,e,{get:t[e],enumerable:!0})},ye=(n,t,e,r)=>{if(t&&typeof t=="object"||typeof t=="function")for(let o of Ee(t))!Ce.call(n,o)&&o!==e&&rt(n,o,{get:()=>t[o],enumerable:!(r=we(t,o))||r.enumerable});return n};var Be=n=>ye(rt({},"__esModule",{value:!0}),n);var B=g(I=>{var ot,Ae=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706];I.getSymbolSize=function(t){if(!t)throw new Error('"version" cannot be null or undefined');if(t<1||t>40)throw new Error('"version" should be in range from 1 to 40');return t*4+17};I.getSymbolTotalCodewords=function(t){return Ae[t]};I.getBCHDigit=function(n){let t=0;for(;n!==0;)t++,n>>>=1;return t};I.setToSJISFunction=function(t){if(typeof t!="function")throw new Error('"toSJISFunc" is not a valid function.');ot=t};I.isKanjiModeEnabled=function(){return typeof ot<"u"};I.toSJIS=function(t){return ot(t)}});var Y=g(w=>{w.L={bit:1};w.M={bit:0};w.Q={bit:3};w.H={bit:2};function Ne(n){if(typeof n!="string")throw new Error("Param is not a string");switch(n.toLowerCase()){case"l":case"low":return w.L;case"m":case"medium":return w.M;case"q":case"quartile":return w.Q;case"h":case"high":return w.H;default:throw new Error("Unknown EC Level: "+n)}}w.isValid=function(t){return t&&typeof t.bit<"u"&&t.bit>=0&&t.bit<4};w.from=function(t,e){if(w.isValid(t))return t;try{return Ne(t)}catch{return e}}});var Mt=g((wn,It)=>{function Tt(){this.buffer=[],this.length=0}Tt.prototype={get:function(n){let t=Math.floor(n/8);return(this.buffer[t]>>>7-n%8&1)===1},put:function(n,t){for(let e=0;e<t;e++)this.putBit((n>>>t-e-1&1)===1)},getLengthInBits:function(){return this.length},putBit:function(n){let t=Math.floor(this.length/8);this.buffer.length<=t&&this.buffer.push(0),n&&(this.buffer[t]|=128>>>this.length%8),this.length++}};It.exports=Tt});var Pt=g((En,St)=>{function D(n){if(!n||n<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=n,this.data=new Uint8Array(n*n),this.reservedBit=new Uint8Array(n*n)}D.prototype.set=function(n,t,e,r){let o=n*this.size+t;this.data[o]=e,r&&(this.reservedBit[o]=!0)};D.prototype.get=function(n,t){return this.data[n*this.size+t]};D.prototype.xor=function(n,t,e){this.data[n*this.size+t]^=e};D.prototype.isReserved=function(n,t){return this.reservedBit[n*this.size+t]};St.exports=D});var bt=g(G=>{var Te=B().getSymbolSize;G.getRowColCoords=function(t){if(t===1)return[];let e=Math.floor(t/7)+2,r=Te(t),o=r===145?26:Math.ceil((r-13)/(2*e-2))*2,i=[r-7];for(let s=1;s<e-1;s++)i[s]=i[s-1]-o;return i.push(6),i.reverse()};G.getPositions=function(t){let e=[],r=G.getRowColCoords(t),o=r.length;for(let i=0;i<o;i++)for(let s=0;s<o;s++)i===0&&s===0||i===0&&s===o-1||i===o-1&&s===0||e.push([r[i],r[s]]);return e}});var _t=g(Lt=>{var Ie=B().getSymbolSize,Rt=7;Lt.getPositions=function(t){let e=Ie(t);return[[0,0],[e-Rt,0],[0,e-Rt]]}});var xt=g(f=>{f.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};var M={N1:3,N2:3,N3:40,N4:10};f.isValid=function(t){return t!=null&&t!==""&&!isNaN(t)&&t>=0&&t<=7};f.from=function(t){return f.isValid(t)?parseInt(t,10):void 0};f.getPenaltyN1=function(t){let e=t.size,r=0,o=0,i=0,s=null,u=null;for(let c=0;c<e;c++){o=i=0,s=u=null;for(let l=0;l<e;l++){let d=t.get(c,l);d===s?o++:(o>=5&&(r+=M.N1+(o-5)),s=d,o=1),d=t.get(l,c),d===u?i++:(i>=5&&(r+=M.N1+(i-5)),u=d,i=1)}o>=5&&(r+=M.N1+(o-5)),i>=5&&(r+=M.N1+(i-5))}return r};f.getPenaltyN2=function(t){let e=t.size,r=0;for(let o=0;o<e-1;o++)for(let i=0;i<e-1;i++){let s=t.get(o,i)+t.get(o,i+1)+t.get(o+1,i)+t.get(o+1,i+1);(s===4||s===0)&&r++}return r*M.N2};f.getPenaltyN3=function(t){let e=t.size,r=0,o=0,i=0;for(let s=0;s<e;s++){o=i=0;for(let u=0;u<e;u++)o=o<<1&2047|t.get(s,u),u>=10&&(o===1488||o===93)&&r++,i=i<<1&2047|t.get(u,s),u>=10&&(i===1488||i===93)&&r++}return r*M.N3};f.getPenaltyN4=function(t){let e=0,r=t.data.length;for(let i=0;i<r;i++)e+=t.data[i];return Math.abs(Math.ceil(e*100/r/5)-10)*M.N4};function Me(n,t,e){switch(n){case f.Patterns.PATTERN000:return(t+e)%2===0;case f.Patterns.PATTERN001:return t%2===0;case f.Patterns.PATTERN010:return e%3===0;case f.Patterns.PATTERN011:return(t+e)%3===0;case f.Patterns.PATTERN100:return(Math.floor(t/2)+Math.floor(e/3))%2===0;case f.Patterns.PATTERN101:return t*e%2+t*e%3===0;case f.Patterns.PATTERN110:return(t*e%2+t*e%3)%2===0;case f.Patterns.PATTERN111:return(t*e%3+(t+e)%2)%2===0;default:throw new Error("bad maskPattern:"+n)}}f.applyMask=function(t,e){let r=e.size;for(let o=0;o<r;o++)for(let i=0;i<r;i++)e.isReserved(i,o)||e.xor(i,o,Me(t,i,o))};f.getBestMask=function(t,e){let r=Object.keys(f.Patterns).length,o=0,i=1/0;for(let s=0;s<r;s++){e(s),f.applyMask(s,t);let u=f.getPenaltyN1(t)+f.getPenaltyN2(t)+f.getPenaltyN3(t)+f.getPenaltyN4(t);f.applyMask(s,t),u<i&&(i=u,o=s)}return o}});var st=g(it=>{var A=Y(),O=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],Q=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430];it.getBlocksCount=function(t,e){switch(e){case A.L:return O[(t-1)*4+0];case A.M:return O[(t-1)*4+1];case A.Q:return O[(t-1)*4+2];case A.H:return O[(t-1)*4+3];default:return}};it.getTotalCodewordsCount=function(t,e){switch(e){case A.L:return Q[(t-1)*4+0];case A.M:return Q[(t-1)*4+1];case A.Q:return Q[(t-1)*4+2];case A.H:return Q[(t-1)*4+3];default:return}}});var Ut=g($=>{var F=new Uint8Array(512),j=new Uint8Array(256);(function(){let t=1;for(let e=0;e<255;e++)F[e]=t,j[t]=e,t<<=1,t&256&&(t^=285);for(let e=255;e<512;e++)F[e]=F[e-255]})();$.log=function(t){if(t<1)throw new Error("log("+t+")");return j[t]};$.exp=function(t){return F[t]};$.mul=function(t,e){return t===0||e===0?0:F[j[t]+j[e]]}});var qt=g(k=>{var ut=Ut();k.mul=function(t,e){let r=new Uint8Array(t.length+e.length-1);for(let o=0;o<t.length;o++)for(let i=0;i<e.length;i++)r[o+i]^=ut.mul(t[o],e[i]);return r};k.mod=function(t,e){let r=new Uint8Array(t);for(;r.length-e.length>=0;){let o=r[0];for(let s=0;s<e.length;s++)r[s]^=ut.mul(e[s],o);let i=0;for(;i<r.length&&r[i]===0;)i++;r=r.slice(i)}return r};k.generateECPolynomial=function(t){let e=new Uint8Array([1]);for(let r=0;r<t;r++)e=k.mul(e,new Uint8Array([1,ut.exp(r)]));return e}});var kt=g((Tn,Ft)=>{var Dt=qt();function ct(n){this.genPoly=void 0,this.degree=n,this.degree&&this.initialize(this.degree)}ct.prototype.initialize=function(t){this.degree=t,this.genPoly=Dt.generateECPolynomial(this.degree)};ct.prototype.encode=function(t){if(!this.genPoly)throw new Error("Encoder not initialized");let e=new Uint8Array(t.length+this.degree);e.set(t);let r=Dt.mod(e,this.genPoly),o=this.degree-r.length;if(o>0){let i=new Uint8Array(this.degree);return i.set(r,o),i}return r};Ft.exports=ct});var at=g(zt=>{zt.isValid=function(t){return!isNaN(t)&&t>=1&&t<=40}});var lt=g(m=>{var Vt="[0-9]+",Se="[A-Z $%*+\\-./:]+",z="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";z=z.replace(/u/g,"\\u");var Pe="(?:(?![A-Z0-9 $%*+\\-./:]|"+z+`)(?:.|[\r
]))+`;m.KANJI=new RegExp(z,"g");m.BYTE_KANJI=new RegExp("[^A-Z0-9 $%*+\\-./:]+","g");m.BYTE=new RegExp(Pe,"g");m.NUMERIC=new RegExp(Vt,"g");m.ALPHANUMERIC=new RegExp(Se,"g");var be=new RegExp("^"+z+"$"),Re=new RegExp("^"+Vt+"$"),Le=new RegExp("^[A-Z0-9 $%*+\\-./:]+$");m.testKanji=function(t){return be.test(t)};m.testNumeric=function(t){return Re.test(t)};m.testAlphanumeric=function(t){return Le.test(t)}});var N=g(h=>{var _e=at(),ft=lt();h.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]};h.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]};h.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]};h.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]};h.MIXED={bit:-1};h.getCharCountIndicator=function(t,e){if(!t.ccBits)throw new Error("Invalid mode: "+t);if(!_e.isValid(e))throw new Error("Invalid version: "+e);return e>=1&&e<10?t.ccBits[0]:e<27?t.ccBits[1]:t.ccBits[2]};h.getBestModeForData=function(t){return ft.testNumeric(t)?h.NUMERIC:ft.testAlphanumeric(t)?h.ALPHANUMERIC:ft.testKanji(t)?h.KANJI:h.BYTE};h.toString=function(t){if(t&&t.id)return t.id;throw new Error("Invalid mode")};h.isValid=function(t){return t&&t.bit&&t.ccBits};function xe(n){if(typeof n!="string")throw new Error("Param is not a string");switch(n.toLowerCase()){case"numeric":return h.NUMERIC;case"alphanumeric":return h.ALPHANUMERIC;case"kanji":return h.KANJI;case"byte":return h.BYTE;default:throw new Error("Unknown mode: "+n)}}h.from=function(t,e){if(h.isValid(t))return t;try{return xe(t)}catch{return e}}});var Gt=g(S=>{var Z=B(),Ue=st(),Ht=Y(),T=N(),gt=at(),Jt=7973,Kt=Z.getBCHDigit(Jt);function qe(n,t,e){for(let r=1;r<=40;r++)if(t<=S.getCapacity(r,e,n))return r}function Yt(n,t){return T.getCharCountIndicator(n,t)+4}function De(n,t){let e=0;return n.forEach(function(r){let o=Yt(r.mode,t);e+=o+r.getBitsLength()}),e}function Fe(n,t){for(let e=1;e<=40;e++)if(De(n,e)<=S.getCapacity(e,t,T.MIXED))return e}S.from=function(t,e){return gt.isValid(t)?parseInt(t,10):e};S.getCapacity=function(t,e,r){if(!gt.isValid(t))throw new Error("Invalid QR Code version");typeof r>"u"&&(r=T.BYTE);let o=Z.getSymbolTotalCodewords(t),i=Ue.getTotalCodewordsCount(t,e),s=(o-i)*8;if(r===T.MIXED)return s;let u=s-Yt(r,t);switch(r){case T.NUMERIC:return Math.floor(u/10*3);case T.ALPHANUMERIC:return Math.floor(u/11*2);case T.KANJI:return Math.floor(u/13);case T.BYTE:default:return Math.floor(u/8)}};S.getBestVersionForData=function(t,e){let r,o=Ht.from(e,Ht.M);if(Array.isArray(t)){if(t.length>1)return Fe(t,o);if(t.length===0)return 1;r=t[0]}else r=t;return qe(r.mode,r.getLength(),o)};S.getEncodedBits=function(t){if(!gt.isValid(t)||t<7)throw new Error("Invalid QR Code version");let e=t<<12;for(;Z.getBCHDigit(e)-Kt>=0;)e^=Jt<<Z.getBCHDigit(e)-Kt;return t<<12|e}});var $t=g(jt=>{var dt=B(),Qt=1335,ke=21522,Ot=dt.getBCHDigit(Qt);jt.getEncodedBits=function(t,e){let r=t.bit<<3|e,o=r<<10;for(;dt.getBCHDigit(o)-Ot>=0;)o^=Qt<<dt.getBCHDigit(o)-Ot;return(r<<10|o)^ke}});var Xt=g((Rn,Zt)=>{var ze=N();function L(n){this.mode=ze.NUMERIC,this.data=n.toString()}L.getBitsLength=function(t){return 10*Math.floor(t/3)+(t%3?t%3*3+1:0)};L.prototype.getLength=function(){return this.data.length};L.prototype.getBitsLength=function(){return L.getBitsLength(this.data.length)};L.prototype.write=function(t){let e,r,o;for(e=0;e+3<=this.data.length;e+=3)r=this.data.substr(e,3),o=parseInt(r,10),t.put(o,10);let i=this.data.length-e;i>0&&(r=this.data.substr(e),o=parseInt(r,10),t.put(o,i*3+1))};Zt.exports=L});var Wt=g((Ln,vt)=>{var Ve=N(),ht=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function _(n){this.mode=Ve.ALPHANUMERIC,this.data=n}_.getBitsLength=function(t){return 11*Math.floor(t/2)+6*(t%2)};_.prototype.getLength=function(){return this.data.length};_.prototype.getBitsLength=function(){return _.getBitsLength(this.data.length)};_.prototype.write=function(t){let e;for(e=0;e+2<=this.data.length;e+=2){let r=ht.indexOf(this.data[e])*45;r+=ht.indexOf(this.data[e+1]),t.put(r,11)}this.data.length%2&&t.put(ht.indexOf(this.data[e]),6)};vt.exports=_});var ee=g((_n,te)=>{var He=N();function x(n){this.mode=He.BYTE,typeof n=="string"?this.data=new TextEncoder().encode(n):this.data=new Uint8Array(n)}x.getBitsLength=function(t){return t*8};x.prototype.getLength=function(){return this.data.length};x.prototype.getBitsLength=function(){return x.getBitsLength(this.data.length)};x.prototype.write=function(n){for(let t=0,e=this.data.length;t<e;t++)n.put(this.data[t],8)};te.exports=x});var re=g((xn,ne)=>{var Ke=N(),Je=B();function U(n){this.mode=Ke.KANJI,this.data=n}U.getBitsLength=function(t){return t*13};U.prototype.getLength=function(){return this.data.length};U.prototype.getBitsLength=function(){return U.getBitsLength(this.data.length)};U.prototype.write=function(n){let t;for(t=0;t<this.data.length;t++){let e=Je.toSJIS(this.data[t]);if(e>=33088&&e<=40956)e-=33088;else if(e>=57408&&e<=60351)e-=49472;else throw new Error("Invalid SJIS character: "+this.data[t]+`
Make sure your charset is UTF-8`);e=(e>>>8&255)*192+(e&255),n.put(e,13)}};ne.exports=U});var oe=g((Un,pt)=>{"use strict";var V={single_source_shortest_paths:function(n,t,e){var r={},o={};o[t]=0;var i=V.PriorityQueue.make();i.push(t,0);for(var s,u,c,l,d,y,p,J,P;!i.empty();){s=i.pop(),u=s.value,l=s.cost,d=n[u]||{};for(c in d)d.hasOwnProperty(c)&&(y=d[c],p=l+y,J=o[c],P=typeof o[c]>"u",(P||J>p)&&(o[c]=p,i.push(c,p),r[c]=u))}if(typeof e<"u"&&typeof o[e]>"u"){var b=["Could not find a path from ",t," to ",e,"."].join("");throw new Error(b)}return r},extract_shortest_path_from_predecessor_list:function(n,t){for(var e=[],r=t,o;r;)e.push(r),o=n[r],r=n[r];return e.reverse(),e},find_path:function(n,t,e){var r=V.single_source_shortest_paths(n,t,e);return V.extract_shortest_path_from_predecessor_list(r,e)},PriorityQueue:{make:function(n){var t=V.PriorityQueue,e={},r;n=n||{};for(r in t)t.hasOwnProperty(r)&&(e[r]=t[r]);return e.queue=[],e.sorter=n.sorter||t.default_sorter,e},default_sorter:function(n,t){return n.cost-t.cost},push:function(n,t){var e={value:n,cost:t};this.queue.push(e),this.queue.sort(this.sorter)},pop:function(){return this.queue.shift()},empty:function(){return this.queue.length===0}}};typeof pt<"u"&&(pt.exports=V)});var ge=g(q=>{var a=N(),ue=Xt(),ce=Wt(),ae=ee(),le=re(),H=lt(),X=B(),Ye=oe();function ie(n){return unescape(encodeURIComponent(n)).length}function K(n,t,e){let r=[],o;for(;(o=n.exec(e))!==null;)r.push({data:o[0],index:o.index,mode:t,length:o[0].length});return r}function fe(n){let t=K(H.NUMERIC,a.NUMERIC,n),e=K(H.ALPHANUMERIC,a.ALPHANUMERIC,n),r,o;return X.isKanjiModeEnabled()?(r=K(H.BYTE,a.BYTE,n),o=K(H.KANJI,a.KANJI,n)):(r=K(H.BYTE_KANJI,a.BYTE,n),o=[]),t.concat(e,r,o).sort(function(s,u){return s.index-u.index}).map(function(s){return{data:s.data,mode:s.mode,length:s.length}})}function wt(n,t){switch(t){case a.NUMERIC:return ue.getBitsLength(n);case a.ALPHANUMERIC:return ce.getBitsLength(n);case a.KANJI:return le.getBitsLength(n);case a.BYTE:return ae.getBitsLength(n)}}function Ge(n){return n.reduce(function(t,e){let r=t.length-1>=0?t[t.length-1]:null;return r&&r.mode===e.mode?(t[t.length-1].data+=e.data,t):(t.push(e),t)},[])}function Oe(n){let t=[];for(let e=0;e<n.length;e++){let r=n[e];switch(r.mode){case a.NUMERIC:t.push([r,{data:r.data,mode:a.ALPHANUMERIC,length:r.length},{data:r.data,mode:a.BYTE,length:r.length}]);break;case a.ALPHANUMERIC:t.push([r,{data:r.data,mode:a.BYTE,length:r.length}]);break;case a.KANJI:t.push([r,{data:r.data,mode:a.BYTE,length:ie(r.data)}]);break;case a.BYTE:t.push([{data:r.data,mode:a.BYTE,length:ie(r.data)}])}}return t}function Qe(n,t){let e={},r={start:{}},o=["start"];for(let i=0;i<n.length;i++){let s=n[i],u=[];for(let c=0;c<s.length;c++){let l=s[c],d=""+i+c;u.push(d),e[d]={node:l,lastCount:0},r[d]={};for(let y=0;y<o.length;y++){let p=o[y];e[p]&&e[p].node.mode===l.mode?(r[p][d]=wt(e[p].lastCount+l.length,l.mode)-wt(e[p].lastCount,l.mode),e[p].lastCount+=l.length):(e[p]&&(e[p].lastCount=l.length),r[p][d]=wt(l.length,l.mode)+4+a.getCharCountIndicator(l.mode,t))}}o=u}for(let i=0;i<o.length;i++)r[o[i]].end=0;return{map:r,table:e}}function se(n,t){let e,r=a.getBestModeForData(n);if(e=a.from(t,r),e!==a.BYTE&&e.bit<r.bit)throw new Error('"'+n+'" cannot be encoded with mode '+a.toString(e)+`.
 Suggested mode is: `+a.toString(r));switch(e===a.KANJI&&!X.isKanjiModeEnabled()&&(e=a.BYTE),e){case a.NUMERIC:return new ue(n);case a.ALPHANUMERIC:return new ce(n);case a.KANJI:return new le(n);case a.BYTE:return new ae(n)}}q.fromArray=function(t){return t.reduce(function(e,r){return typeof r=="string"?e.push(se(r,null)):r.data&&e.push(se(r.data,r.mode)),e},[])};q.fromString=function(t,e){let r=fe(t,X.isKanjiModeEnabled()),o=Oe(r),i=Qe(o,e),s=Ye.find_path(i.map,"start","end"),u=[];for(let c=1;c<s.length-1;c++)u.push(i.table[s[c]].node);return q.fromArray(Ge(u))};q.rawSplit=function(t){return q.fromArray(fe(t,X.isKanjiModeEnabled()))}});var he=g(de=>{var W=B(),Et=Y(),je=Mt(),$e=Pt(),Ze=bt(),Xe=_t(),yt=xt(),Bt=st(),ve=kt(),v=Gt(),We=$t(),tn=N(),Ct=ge();function en(n,t){let e=n.size,r=Xe.getPositions(t);for(let o=0;o<r.length;o++){let i=r[o][0],s=r[o][1];for(let u=-1;u<=7;u++)if(!(i+u<=-1||e<=i+u))for(let c=-1;c<=7;c++)s+c<=-1||e<=s+c||(u>=0&&u<=6&&(c===0||c===6)||c>=0&&c<=6&&(u===0||u===6)||u>=2&&u<=4&&c>=2&&c<=4?n.set(i+u,s+c,!0,!0):n.set(i+u,s+c,!1,!0))}}function nn(n){let t=n.size;for(let e=8;e<t-8;e++){let r=e%2===0;n.set(e,6,r,!0),n.set(6,e,r,!0)}}function rn(n,t){let e=Ze.getPositions(t);for(let r=0;r<e.length;r++){let o=e[r][0],i=e[r][1];for(let s=-2;s<=2;s++)for(let u=-2;u<=2;u++)s===-2||s===2||u===-2||u===2||s===0&&u===0?n.set(o+s,i+u,!0,!0):n.set(o+s,i+u,!1,!0)}}function on(n,t){let e=n.size,r=v.getEncodedBits(t),o,i,s;for(let u=0;u<18;u++)o=Math.floor(u/3),i=u%3+e-8-3,s=(r>>u&1)===1,n.set(o,i,s,!0),n.set(i,o,s,!0)}function mt(n,t,e){let r=n.size,o=We.getEncodedBits(t,e),i,s;for(i=0;i<15;i++)s=(o>>i&1)===1,i<6?n.set(i,8,s,!0):i<8?n.set(i+1,8,s,!0):n.set(r-15+i,8,s,!0),i<8?n.set(8,r-i-1,s,!0):i<9?n.set(8,15-i-1+1,s,!0):n.set(8,15-i-1,s,!0);n.set(r-8,8,1,!0)}function sn(n,t){let e=n.size,r=-1,o=e-1,i=7,s=0;for(let u=e-1;u>0;u-=2)for(u===6&&u--;;){for(let c=0;c<2;c++)if(!n.isReserved(o,u-c)){let l=!1;s<t.length&&(l=(t[s]>>>i&1)===1),n.set(o,u-c,l),i--,i===-1&&(s++,i=7)}if(o+=r,o<0||e<=o){o-=r,r=-r;break}}}function un(n,t,e){let r=new je;e.forEach(function(c){r.put(c.mode.bit,4),r.put(c.getLength(),tn.getCharCountIndicator(c.mode,n)),c.write(r)});let o=W.getSymbolTotalCodewords(n),i=Bt.getTotalCodewordsCount(n,t),s=(o-i)*8;for(r.getLengthInBits()+4<=s&&r.put(0,4);r.getLengthInBits()%8!==0;)r.putBit(0);let u=(s-r.getLengthInBits())/8;for(let c=0;c<u;c++)r.put(c%2?17:236,8);return cn(r,n,t)}function cn(n,t,e){let r=W.getSymbolTotalCodewords(t),o=Bt.getTotalCodewordsCount(t,e),i=r-o,s=Bt.getBlocksCount(t,e),u=r%s,c=s-u,l=Math.floor(r/s),d=Math.floor(i/s),y=d+1,p=l-d,J=new ve(p),P=0,b=new Array(s),At=new Array(s),tt=0,pe=new Uint8Array(n.buffer);for(let R=0;R<s;R++){let nt=R<c?d:y;b[R]=pe.slice(P,P+nt),At[R]=J.encode(b[R]),P+=nt,tt=Math.max(tt,nt)}let et=new Uint8Array(r),Nt=0,E,C;for(E=0;E<tt;E++)for(C=0;C<s;C++)E<b[C].length&&(et[Nt++]=b[C][E]);for(E=0;E<p;E++)for(C=0;C<s;C++)et[Nt++]=At[C][E];return et}function an(n,t,e,r){let o;if(Array.isArray(n))o=Ct.fromArray(n);else if(typeof n=="string"){let l=t;if(!l){let d=Ct.rawSplit(n);l=v.getBestVersionForData(d,e)}o=Ct.fromString(n,l||40)}else throw new Error("Invalid data");let i=v.getBestVersionForData(o,e);if(!i)throw new Error("The amount of data is too big to be stored in a QR Code");if(!t)t=i;else if(t<i)throw new Error(`
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: `+i+`.
`);let s=un(t,e,o),u=W.getSymbolSize(t),c=new $e(u);return en(c,t),nn(c),rn(c,t),mt(c,e,0),t>=7&&on(c,t),sn(c,s),isNaN(r)&&(r=yt.getBestMask(c,mt.bind(null,c,e))),yt.applyMask(r,c),mt(c,e,r),{modules:c,version:t,errorCorrectionLevel:e,maskPattern:r,segments:o}}de.create=function(t,e){if(typeof t>"u"||t==="")throw new Error("No input text");let r=Et.M,o,i;return typeof e<"u"&&(r=Et.from(e.errorCorrectionLevel,Et.M),o=v.from(e.version),i=yt.from(e.maskPattern),e.toSJISFunc&&W.setToSJISFunction(e.toSJISFunc)),an(t,o,r,i)}});var gn={};me(gn,{qrCreate:()=>fn});var ln=he();function fn(n,t){return ln.create(n,t)}return Be(gn);})();

function buildQRSvg(text,size) {
  size=size||170;
  try {
    const qr=__QRBundle.qrCreate(text,{errorCorrectionLevel:'M'});
    const n=qr.modules.size;
    const cell=size/n;
    let rects='';
    for(let r=0;r<n;r++){
      for(let c=0;c<n;c++){
        if(qr.modules.get(r,c)){
          rects+='<rect x="'+(c*cell).toFixed(2)+'" y="'+(r*cell).toFixed(2)+'" width="'+(cell+0.6).toFixed(2)+'" height="'+(cell+0.6).toFixed(2)+'" fill="#000"/>';
        }
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'" style="background:#fff;display:block">'+
      '<rect x="0" y="0" width="'+size+'" height="'+size+'" fill="#fff"/>'+rects+'</svg>';
  } catch(e){
    return '<div style="width:'+size+'px;height:'+size+'px;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;font-size:10px;color:#9ca3af;text-align:center">QR indisponible</div>';
  }
}

function buildCaseOrderHTML(c,doc,tech,restoTypes,settings) {
  const s=settings||{};
  const rt=(restoTypes||[]).find(r=>r.id===c.rtId)||{};
  const priLabel={URGENT:'🔴 URGENT',HIGH:'🟠 Haute',NORMAL:'Normale',LOW:'Basse'}[c.pri]||c.pri;
  const priColor={URGENT:'#dc2626',HIGH:'#d97706',NORMAL:'#1a56db',LOW:'#6b7280'}[c.pri]||'#1a56db';
  const qrText=`DentLab|Dossier:${c.num}|Patient:${c.pf} ${c.pl}|Type:${rt.name||'—'}|Dentiste:${doc?.name||'—'}|Echeance:${c.due||'—'}`;
  const qrSvg=buildQRSvg(qrText,150);
  const attachList=(c.attachments||[]).map(a=>`<li style="font-size:11.5px;color:#374151;margin-bottom:3px">📎 ${a.name}</li>`).join('');
  const legalLine=[s.rc?'RC: '+s.rc:'',s.nif?'NIF: '+s.nif:''].filter(Boolean).join(' · ');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bon de commande '+c.num+'</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#111;background:#fff}'+
    '@media print{button{display:none!important}@page{margin:14mm}}</style></head><body>'+
    '<div style="max-width:780px;margin:0 auto;padding:30px 28px">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:16px;border-bottom:3px solid '+(s.primaryColor||'#1a56db')+'">'+
      '<div style="display:flex;gap:12px;align-items:center">'+
        (s.logo?'<img src="'+s.logo+'" style="width:54px;height:54px;object-fit:contain;border-radius:8px"/>':'')+
        '<div><div style="font-size:21px;font-weight:800;color:'+(s.primaryColor||'#1a56db')+'">'+(s.companyName||'DentLab Pro')+'</div>'+
        (legalLine?'<div style="font-size:10px;color:#9ca3af;margin-top:2px">'+legalLine+'</div>':'')+'</div>'+
      '</div>'+
      '<div style="text-align:right">'+
        '<div style="font-size:22px;font-weight:800;color:#111">BON DE COMMANDE</div>'+
        '<div style="font-size:16px;font-weight:700;color:'+(s.primaryColor||'#1a56db')+'">'+c.num+'</div>'+
      '</div>'+
    '</div>'+
    '<div style="display:flex;gap:20px;margin-bottom:20px">'+
      '<div style="flex:1">'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:'+'10px 16px;margin-bottom:14px">'+
          '<div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Patient</div><div style="font-size:15px;font-weight:800">'+c.pf+' '+c.pl+'</div></div>'+
          '<div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Priorité</div><div style="font-size:14px;font-weight:800;color:'+priColor+'">'+priLabel+'</div></div>'+
          '<div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Dentiste</div><div style="font-size:13px;font-weight:600">'+(doc?.name||'—')+'</div></div>'+
          '<div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Clinique</div><div style="font-size:13px;font-weight:600">'+(doc?.clinique||'—')+'</div></div>'+
          '<div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Type de restauration</div><div style="font-size:13px;font-weight:600">'+(rt.name||'—')+'</div></div>'+
          '<div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Teinte</div><div style="font-size:13px;font-weight:600">'+(c.sh||'—')+'</div></div>'+
          '<div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Dents concernées</div><div style="font-size:13px;font-weight:600">'+((c.teeth||[]).join(', ')||'—')+' ('+(c.teeth?.length||0)+')</div></div>'+
          '<div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Échéance</div><div style="font-size:13px;font-weight:600">'+(c.due||'—')+'</div></div>'+
          '<div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Technicien assigné</div><div style="font-size:13px;font-weight:600">'+(tech?.name||'Non assigné')+'</div></div>'+
          '<div><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Date de création</div><div style="font-size:13px;font-weight:600">'+new Date().toLocaleDateString('fr-DZ')+'</div></div>'+
        '</div>'+
        (c.notes?'<div style="padding:10px 12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;margin-bottom:12"><div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:3px">Instructions</div><div style="font-size:12.5px;color:#78350f">'+c.notes+'</div></div>':'')+
        (attachList?'<div style="margin-top:10px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:5px">Fichiers joints</div><ul style="padding-left:18px">'+attachList+'</ul></div>':'')+
      '</div>'+
      '<div style="width:190px;text-align:center;flex-shrink:0">'+
        '<div style="width:170px;height:170px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;display:flex;align-items:center;justify-content:center;box-sizing:border-box">'+qrSvg+'</div>'+
        '<div style="font-size:9.5px;color:#9ca3af;margin-top:6px">Scannez pour identifier<br/>le dossier</div>'+
      '</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:30px;padding-top:20px;border-top:1px dashed #d1d5db">'+
      '<div><div style="font-size:11px;color:#6b7280;margin-bottom:30px">Signature dentiste</div><div style="border-top:1px solid #111"></div></div>'+
      '<div><div style="font-size:11px;color:#6b7280;margin-bottom:30px">Réceptionné par (laboratoire)</div><div style="border-top:1px solid #111"></div></div>'+
    '</div>'+
    '<div style="text-align:center;margin-top:24px"><button onclick="window.print()" style="padding:10px 24px;background:'+(s.primaryColor||'#1a56db')+';color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Imprimer</button></div>'+
    '</div></body></html>';
}


function buildInvoiceHTML(inv,cases,users,settings) {
  const doc=users.find(u=>u.id===inv.docId)||{};
  const clinic=users.find(u=>u.id===doc.clinicId);
  const c=cases.find(x=>x.id===inv.caseIds[0]);
  const statusLabel={PAID:'PAYÉE',UNPAID:'IMPAYÉE'};
  const statusColor={PAID:'#16a34a',UNPAID:'#dc2626'};
  const st=inv.status||'UNPAID';
  const fmtAmt=v=>(v||0).toLocaleString('fr-DZ')+' DA';
  const s=settings||{};
  const restoTypes=(s&&s.restoTypes)||[];
  const description=c?caseDescription(c,restoTypes):'—';
  const legalLine=[s.rc?'RC: '+s.rc:'',s.nif?'NIF: '+s.nif:'',s.nis?'NIS: '+s.nis:'',s.ai?'AI: '+s.ai:''].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Facture '+inv.num+'</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#111;background:#fff;padding:0}'+
    '@media print{body{padding:0}button{display:none!important}@page{margin:15mm}}</style></head><body>'+
    '<div style="max-width:700px;margin:0 auto;padding:32px 28px">'+
    // Header
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:20px;border-bottom:3px solid '+(s.primaryColor||'#1a56db')+'">'+
      '<div style="display:flex;gap:14px;align-items:flex-start">'+
        (s.logo?'<img src="'+s.logo+'" style="width:64px;height:64px;object-fit:contain;border-radius:8px"/>':'')+
        '<div>'+
          '<div style="font-size:24px;font-weight:800;color:'+(s.primaryColor||'#1a56db')+';letter-spacing:-0.5px">'+(s.companyName||'DentLab Pro')+'</div>'+
          '<div style="font-size:12.5px;color:#6b7280;margin-top:4px">'+(s.companyAddress||'')+'</div>'+
          '<div style="font-size:12.5px;color:#6b7280">'+(s.companyPhone?'Tél: '+s.companyPhone:'')+'</div>'+
        '</div>'+
      '</div>'+
      '<div style="text-align:right">'+
        '<div style="font-size:26px;font-weight:800;color:#111">FACTURE</div>'+
        '<div style="font-size:17px;font-weight:700;color:'+(s.primaryColor||'#1a56db')+';margin-top:2px">'+inv.num+'</div>'+
        '<div style="display:inline-block;margin-top:8px;padding:4px 14px;border-radius:99px;background:'+(statusColor[st]||'#6b7280')+'22;color:'+(statusColor[st]||'#6b7280')+';font-weight:700;font-size:12px;border:2px solid '+(statusColor[st]||'#6b7280')+'">'+(statusLabel[st]||st)+'</div>'+
      '</div>'+
    '</div>'+
    (legalLine?'<div style="font-size:10.5px;color:#9ca3af;margin-bottom:20px">'+legalLine+'</div>':'<div style="margin-bottom:20px"></div>')+
    // Info row: Clinic / Doctor / Patient
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:20px">'+
      '<div style="background:#f9fafb;border-radius:8px;padding:14px">'+
        '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px">Clinique</div>'+
        '<div style="font-size:13.5px;font-weight:700;color:#111">'+(clinic?clinic.name:(doc.clinique||'—'))+'</div>'+
      '</div>'+
      '<div style="background:#f9fafb;border-radius:8px;padding:14px">'+
        '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px">Dentiste</div>'+
        '<div style="font-size:13.5px;font-weight:700;color:#111">'+(doc.name||'—')+'</div>'+
      '</div>'+
      '<div style="background:#f9fafb;border-radius:8px;padding:14px">'+
        '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px">Patient</div>'+
        '<div style="font-size:13.5px;font-weight:700;color:#111">'+(c?c.pf+' '+c.pl:'—')+'</div>'+
      '</div>'+
    '</div>'+
    // Case description + dates + amount
    '<div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px">'+
      '<div style="padding:14px 16px;border-bottom:1px solid #f3f4f6">'+
        '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:5px">Description du cas</div>'+
        '<div style="font-size:14px;color:#111;font-weight:600">'+description+'</div>'+
        (c?'<div style="font-size:11.5px;color:#9ca3af;margin-top:4px">N° dossier : '+c.num+'</div>':'')+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr">'+
        '<div style="padding:12px 16px;border-right:1px solid #f3f4f6">'+
          '<div style="font-size:10px;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Date de livraison</div>'+
          '<div style="font-size:13px;font-weight:600">'+((c&&c.deliveredDate)||'Non livré')+'</div>'+
        '</div>'+
        '<div style="padding:12px 16px;border-right:1px solid #f3f4f6">'+
          '<div style="font-size:10px;color:#6b7280;text-transform:uppercase;margin-bottom:4px">Date de paiement</div>'+
          '<div style="font-size:13px;font-weight:600;color:'+(inv.paidDate?'#16a34a':'#9ca3af')+'">'+(inv.paidDate||'—')+'</div>'+
        '</div>'+
        '<div style="padding:12px 16px;background:'+(st==='PAID'?'#f0fdf4':'#fef2f2')+'">'+
          '<div style="font-size:10px;color:'+(st==='PAID'?'#166534':'#991b1b')+';text-transform:uppercase;margin-bottom:4px">Montant</div>'+
          '<div style="font-size:17px;font-weight:800;color:'+(st==='PAID'?'#16a34a':'#dc2626')+'">'+fmtAmt(inv.total)+'</div>'+
        '</div>'+
      '</div>'+
    '</div>'+
    // Footer
    '<div style="border-top:2px solid #e5e7eb;padding-top:16px;display:flex;justify-content:space-between;align-items:center">'+
      '<div style="font-size:11px;color:#9ca3af">Document généré par '+(s.companyName||'DentLab Pro')+' · '+new Date().toLocaleDateString('fr-DZ')+'</div>'+
      '<button onclick="window.print()" style="padding:9px 20px;background:'+(s.primaryColor||'#1a56db')+';color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Imprimer</button>'+
    '</div>'+
    '</div></body></html>';
}

function buildClinicStatementHTML(clinic,invoiceRows,users,cases,restoTypes,settings,scope) {
  const s=settings||{};
  const fmtAmt=v=>(v||0).toLocaleString('fr-DZ')+' DA';
  const total=invoiceRows.reduce((sum,i)=>sum+i.total,0);
  const unpaidCount=invoiceRows.filter(i=>i.status==='UNPAID').length;
  const scopeTitle={UNPAID:'RELEVÉ DE CRÉANCES (impayées)',PAID:'RELEVÉ DES PAIEMENTS',ALL:'RELEVÉ COMPLET'}[scope]||'RELEVÉ DE CRÉANCES';
  const rows=invoiceRows.map((i,idx)=>{
    const c=cases.find(x=>x.id===i.caseIds[0]);
    const doc=users.find(u=>u.id===i.docId);
    const isPaid=i.status==='PAID';
    return '<tr style="background:'+(idx%2===0?'#fff':'#f9fafb')+'">'+
      '<td style="padding:9px 12px;font-size:11px;font-family:monospace;color:#1a56db;font-weight:700;border-bottom:1px solid #e5e7eb">'+i.num+'</td>'+
      '<td style="padding:9px 12px;font-size:11px;color:#374151;border-bottom:1px solid #e5e7eb">'+(i.date||'—')+'</td>'+
      '<td style="padding:9px 12px;font-size:12px;color:#374151;border-bottom:1px solid #e5e7eb">'+(doc?doc.name:'—')+'</td>'+
      '<td style="padding:9px 12px;font-size:12px;font-weight:600;border-bottom:1px solid #e5e7eb">'+(c?c.pf+' '+c.pl:'—')+'</td>'+
      '<td style="padding:9px 12px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">'+(c?caseDescription(c,restoTypes):'—')+'</td>'+
      '<td style="padding:9px 12px;font-size:13px;font-weight:700;text-align:right;color:'+(isPaid?'#16a34a':'#dc2626')+';border-bottom:1px solid #e5e7eb">'+fmtAmt(i.total)+'</td>'+
      '<td style="padding:9px 12px;text-align:center;border-bottom:1px solid #e5e7eb"><span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:99px;background:'+(isPaid?'#f0fdf4':'#fef2f2')+';color:'+(isPaid?'#16a34a':'#dc2626')+'">'+(isPaid?'PAYÉE':'IMPAYÉE')+'</span></td>'+
      '<td style="padding:9px 12px;font-size:11px;color:'+(i.paidDate?'#16a34a':'#9ca3af')+';border-bottom:1px solid #e5e7eb">'+(i.paidDate||'—')+'</td>'+
    '</tr>';
  }).join('');
  const legalLine=[s.rc?'RC: '+s.rc:'',s.nif?'NIF: '+s.nif:''].filter(Boolean).join(' · ');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relevé — '+clinic.name+'</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#111;background:#fff}'+
    '@media print{button{display:none!important}@page{margin:14mm;size:A4 landscape}}</style></head><body>'+
    '<div style="padding:28px 30px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:16px;border-bottom:3px solid '+(s.primaryColor||'#1a56db')+'">'+
      '<div style="display:flex;gap:12px;align-items:center">'+
        (s.logo?'<img src="'+s.logo+'" style="width:50px;height:50px;object-fit:contain;border-radius:7px"/>':'')+
        '<div><div style="font-size:20px;font-weight:800;color:'+(s.primaryColor||'#1a56db')+'">'+(s.companyName||'DentLab Pro')+'</div>'+
        (legalLine?'<div style="font-size:10px;color:#9ca3af;margin-top:1px">'+legalLine+'</div>':'')+'</div>'+
      '</div>'+
      '<div style="text-align:right"><div style="font-size:11px;color:#6b7280">Édité le<br/><b>'+new Date().toLocaleDateString('fr-DZ')+'</b></div></div>'+
    '</div>'+
    '<div style="margin-bottom:16px">'+
      '<div style="font-size:20px;font-weight:800;color:#111">'+scopeTitle+'</div>'+
      '<div style="font-size:15px;font-weight:700;color:'+(s.primaryColor||'#1a56db')+';margin-top:2px">'+clinic.name+'</div>'+
      (clinic.address?'<div style="font-size:11.5px;color:#9ca3af;margin-top:2px">'+clinic.address+'</div>':'')+
      '<div style="font-size:10.5px;color:#9ca3af;font-style:italic;margin-top:6px">Ce document est un relevé récapitulant plusieurs factures — ce n\'est pas une facture.</div>'+
    '</div>'+
    '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'+
      '<thead><tr style="background:'+(s.primaryColor||'#1a56db')+'">'+
        ['N° Facture','Date','Dentiste','Patient','Description','Montant','Statut','Date paiement'].map((h,i)=>
          '<th style="padding:9px 12px;text-align:'+(i===5?'right':i===6?'center':'left')+';font-size:9.5px;color:#fff;text-transform:uppercase;font-weight:700;white-space:nowrap">'+h+'</th>'
        ).join('')+
      '</tr></thead>'+
      '<tbody>'+rows+(invoiceRows.length===0?'<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af;font-size:12px">Aucune facture</td></tr>':'')+'</tbody>'+
      '<tfoot><tr style="background:#111827">'+
        '<td colspan="5" style="padding:11px 12px;font-size:13px;font-weight:800;color:#fff">TOTAL — '+invoiceRows.length+' facture'+(invoiceRows.length>1?'s':'')+(scope==='ALL'?' ('+unpaidCount+' impayée'+(unpaidCount>1?'s':'')+')':'')+'</td>'+
        '<td style="padding:11px 12px;font-size:15px;font-weight:800;color:#fff;text-align:right">'+fmtAmt(total)+'</td>'+
        '<td colspan="2"></td>'+
      '</tr></tfoot>'+
    '</table>'+
    '<div style="display:flex;justify-content:flex-end;margin-top:20px"><button onclick="window.print()" style="padding:10px 24px;background:'+(s.primaryColor||'#1a56db')+';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Imprimer / PDF</button></div>'+
    '</div></body></html>';
}

function buildSupplierStatementHTML(supplier,orderRows,settings,scope) {
  const s=settings||{};
  const fmtAmt=v=>(v||0).toLocaleString('fr-DZ')+' DA';
  const total=orderRows.reduce((sum,o)=>sum+poTotals(o.items,o.shipping).grandTotal,0);
  const paidTotal=orderRows.reduce((sum,o)=>sum+(o.paidAmount||0),0);
  const dueTotal=total-paidTotal;
  const scopeTitle={UNPAID:'RELEVÉ FOURNISSEUR (impayées)',PAID:'RELEVÉ FOURNISSEUR (payées)',ALL:'RELEVÉ FOURNISSEUR COMPLET'}[scope]||'RELEVÉ FOURNISSEUR';
  const rows=orderRows.map((o,idx)=>{
    const t=poTotals(o.items,o.shipping);
    const due=t.grandTotal-(o.paidAmount||0);
    const itemsDesc=o.items.map(it=>it.name+' ('+it.qty+' '+it.unit+')').join(', ');
    return '<tr style="background:'+(idx%2===0?'#fff':'#f9fafb')+'">'+
      '<td style="padding:9px 12px;font-size:11px;font-family:monospace;color:#1a56db;font-weight:700;border-bottom:1px solid #e5e7eb">'+o.poNum+'</td>'+
      '<td style="padding:9px 12px;font-size:11px;color:#374151;border-bottom:1px solid #e5e7eb">'+(o.orderDate||'—')+'</td>'+
      '<td style="padding:9px 12px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;max-width:220px">'+itemsDesc+'</td>'+
      '<td style="padding:9px 12px;font-size:12px;font-weight:700;text-align:right;border-bottom:1px solid #e5e7eb">'+fmtAmt(t.grandTotal)+'</td>'+
      '<td style="padding:9px 12px;font-size:11px;text-align:right;color:#16a34a;border-bottom:1px solid #e5e7eb">'+fmtAmt(o.paidAmount||0)+'</td>'+
      '<td style="padding:9px 12px;font-size:12px;font-weight:700;text-align:right;color:'+(due>0?'#dc2626':'#16a34a')+';border-bottom:1px solid #e5e7eb">'+fmtAmt(due)+'</td>'+
      '<td style="padding:9px 12px;text-align:center;border-bottom:1px solid #e5e7eb"><span style="font-size:10.5px;font-weight:700;padding:3px 9px;border-radius:99px;background:'+(PO_PAY_COLORS[o.paymentStatus]||'#6b7280')+'22;color:'+(PO_PAY_COLORS[o.paymentStatus]||'#6b7280')+'">'+(PO_PAY_LABELS[o.paymentStatus]||o.paymentStatus)+'</span></td>'+
    '</tr>';
  }).join('');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relevé — '+supplier.name+'</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#111;background:#fff}'+
    '@media print{button{display:none!important}@page{margin:14mm;size:A4 landscape}}</style></head><body>'+
    '<div style="padding:28px 30px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:16px;border-bottom:3px solid '+(s.primaryColor||'#1a56db')+'">'+
      '<div style="display:flex;gap:12px;align-items:center">'+
        (s.logo?'<img src="'+s.logo+'" style="width:50px;height:50px;object-fit:contain;border-radius:7px"/>':'')+
        '<div><div style="font-size:20px;font-weight:800;color:'+(s.primaryColor||'#1a56db')+'">'+(s.companyName||'DentLab Pro')+'</div></div>'+
      '</div>'+
      '<div style="text-align:right"><div style="font-size:11px;color:#6b7280">Édité le<br/><b>'+new Date().toLocaleDateString('fr-DZ')+'</b></div></div>'+
    '</div>'+
    '<div style="margin-bottom:16px">'+
      '<div style="font-size:20px;font-weight:800;color:#111">'+scopeTitle+'</div>'+
      '<div style="font-size:15px;font-weight:700;color:'+(s.primaryColor||'#1a56db')+';margin-top:2px">'+supplier.name+'</div>'+
      (supplier.address?'<div style="font-size:11.5px;color:#9ca3af;margin-top:2px">'+supplier.address+'</div>':'')+
      (supplier.contact||supplier.phone?'<div style="font-size:11.5px;color:#9ca3af;margin-top:1px">'+[supplier.contact,supplier.phone,supplier.email].filter(Boolean).join(' · ')+'</div>':'')+
    '</div>'+
    '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'+
      '<thead><tr style="background:'+(s.primaryColor||'#1a56db')+'">'+
        ['N° PO','Date','Articles','Total','Payé','Solde dû','Statut'].map((h,i)=>
          '<th style="padding:9px 12px;text-align:'+([3,4,5].includes(i)?'right':i===6?'center':'left')+';font-size:9.5px;color:#fff;text-transform:uppercase;font-weight:700;white-space:nowrap">'+h+'</th>'
        ).join('')+
      '</tr></thead>'+
      '<tbody>'+rows+(orderRows.length===0?'<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af;font-size:12px">Aucune commande</td></tr>':'')+'</tbody>'+
      '<tfoot><tr style="background:#111827">'+
        '<td colspan="3" style="padding:11px 12px;font-size:13px;font-weight:800;color:#fff">TOTAL — '+orderRows.length+' commande'+(orderRows.length>1?'s':'')+'</td>'+
        '<td style="padding:11px 12px;font-size:13px;font-weight:800;color:#fff;text-align:right">'+fmtAmt(total)+'</td>'+
        '<td style="padding:11px 12px;font-size:13px;font-weight:800;color:#fff;text-align:right">'+fmtAmt(paidTotal)+'</td>'+
        '<td style="padding:11px 12px;font-size:15px;font-weight:800;color:#fff;text-align:right">'+fmtAmt(dueTotal)+'</td>'+
        '<td></td>'+
      '</tr></tfoot>'+
    '</table>'+
    '<div style="display:flex;justify-content:flex-end;margin-top:20px"><button onclick="window.print()" style="padding:10px 24px;background:'+(s.primaryColor||'#1a56db')+';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Imprimer / PDF</button></div>'+
    '</div></body></html>';
}


function buildTechStatementHTML(tech,steps,payments,settings,scope) {
  const s=settings||{};
  const fmtAmt=v=>(v||0).toLocaleString('fr-DZ')+' DA';
  const earned=steps.reduce((sum,w)=>sum+w.gain,0);
  const versed=payments.reduce((sum,p)=>sum+p.amount,0);
  const due=Math.max(0,earned-versed);
  const scopeTitle={EARN:'RELEVÉ DE GAINS',PAY:'RELEVÉ DES VERSEMENTS',ALL:'RELEVÉ COMPLET'}[scope]||'RELEVÉ TECHNICIEN';
  const earnRows=steps.map((w,idx)=>{
    const cfg=SC[w.s]||{l:w.s};
    return '<tr style="background:'+(idx%2===0?'#fff':'#f9fafb')+'">'+
      '<td style="padding:8px 12px;font-size:11px;font-family:monospace;color:#1a56db;font-weight:700;border-bottom:1px solid #e5e7eb">'+w.caseObj.num+'</td>'+
      '<td style="padding:8px 12px;font-size:11px;color:#374151;border-bottom:1px solid #e5e7eb">'+w.caseObj.pf+' '+w.caseObj.pl+'</td>'+
      '<td style="padding:8px 12px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">'+cfg.l+'</td>'+
      '<td style="padding:8px 12px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">'+(w.month||'—')+'</td>'+
      '<td style="padding:8px 12px;font-size:12px;font-weight:700;text-align:right;color:#1a56db;border-bottom:1px solid #e5e7eb">'+fmtAmt(w.gain)+'</td>'+
    '</tr>';
  }).join('');
  const payRows=payments.map((p,idx)=>
    '<tr style="background:'+(idx%2===0?'#fff':'#f9fafb')+'">'+
      '<td style="padding:8px 12px;font-size:11px;color:#374151;border-bottom:1px solid #e5e7eb">'+(p.date||'—')+'</td>'+
      '<td style="padding:8px 12px;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb">'+(p.note||'—')+'</td>'+
      '<td style="padding:8px 12px;font-size:12px;font-weight:700;text-align:right;color:#16a34a;border-bottom:1px solid #e5e7eb">'+fmtAmt(p.amount)+'</td>'+
    '</tr>'
  ).join('');
  const earnSection=(scope==='EARN'||scope==='ALL')?(
    '<div style="font-size:13px;font-weight:700;color:#111827;margin:16px 0 8px">Détail des gains ('+steps.length+')</div>'+
    '<table style="width:100%;border-collapse:collapse;margin-bottom:10px">'+
      '<thead><tr style="background:#1a56db">'+['Dossier','Patient','Étape','Mois','Gain'].map((h,i)=>'<th style="padding:8px 12px;text-align:'+(i===4?'right':'left')+';font-size:9.5px;color:#fff;text-transform:uppercase;font-weight:700">'+h+'</th>').join('')+'</tr></thead>'+
      '<tbody>'+earnRows+(steps.length===0?'<tr><td colspan="5" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">Aucun gain</td></tr>':'')+'</tbody>'+
      '<tfoot><tr style="background:#111827"><td colspan="4" style="padding:9px 12px;font-size:12px;font-weight:800;color:#fff">TOTAL GAGNÉ</td><td style="padding:9px 12px;font-size:13px;font-weight:800;color:#fff;text-align:right">'+fmtAmt(earned)+'</td></tr></tfoot>'+
    '</table>'
  ):'';
  const paySection=(scope==='PAY'||scope==='ALL')?(
    '<div style="font-size:13px;font-weight:700;color:#111827;margin:16px 0 8px">Versements ('+payments.length+')</div>'+
    '<table style="width:100%;border-collapse:collapse;margin-bottom:10px">'+
      '<thead><tr style="background:#16a34a">'+['Date','Note','Montant'].map((h,i)=>'<th style="padding:8px 12px;text-align:'+(i===2?'right':'left')+';font-size:9.5px;color:#fff;text-transform:uppercase;font-weight:700">'+h+'</th>').join('')+'</tr></thead>'+
      '<tbody>'+payRows+(payments.length===0?'<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px">Aucun versement</td></tr>':'')+'</tbody>'+
      '<tfoot><tr style="background:#111827"><td colspan="2" style="padding:9px 12px;font-size:12px;font-weight:800;color:#fff">TOTAL VERSÉ</td><td style="padding:9px 12px;font-size:13px;font-weight:800;color:#fff;text-align:right">'+fmtAmt(versed)+'</td></tr></tfoot>'+
    '</table>'
  ):'';
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Relevé — '+tech.name+'</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#111;background:#fff}'+
    '@media print{button{display:none!important}@page{margin:14mm}}</style></head><body>'+
    '<div style="padding:28px 30px;max-width:760px;margin:0 auto">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:16px;border-bottom:3px solid '+(s.primaryColor||'#1a56db')+'">'+
      '<div style="display:flex;gap:12px;align-items:center">'+
        (s.logo?'<img src="'+s.logo+'" style="width:50px;height:50px;object-fit:contain;border-radius:7px"/>':'')+
        '<div><div style="font-size:20px;font-weight:800;color:'+(s.primaryColor||'#1a56db')+'">'+(s.companyName||'DentLab Pro')+'</div></div>'+
      '</div>'+
      '<div style="text-align:right"><div style="font-size:11px;color:#6b7280">Édité le<br/><b>'+new Date().toLocaleDateString('fr-DZ')+'</b></div></div>'+
    '</div>'+
    '<div style="margin-bottom:16px">'+
      '<div style="font-size:20px;font-weight:800;color:#111">'+scopeTitle+'</div>'+
      '<div style="font-size:15px;font-weight:700;color:'+(s.primaryColor||'#1a56db')+';margin-top:2px">'+tech.name+'</div>'+
      (tech.spec?'<div style="font-size:11.5px;color:#9ca3af;margin-top:2px">'+tech.spec+'</div>':'')+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:10px">'+
      '<div style="background:#eff6ff;border-radius:8px;padding:12px"><div style="font-size:10px;font-weight:700;color:#1e40af;text-transform:uppercase">Total gagné</div><div style="font-size:16px;font-weight:800;color:#1a56db">'+fmtAmt(earned)+'</div></div>'+
      '<div style="background:#f0fdf4;border-radius:8px;padding:12px"><div style="font-size:10px;font-weight:700;color:#166534;text-transform:uppercase">Total versé</div><div style="font-size:16px;font-weight:800;color:#16a34a">'+fmtAmt(versed)+'</div></div>'+
      '<div style="background:'+(due>0?'#fef2f2':'#f0fdf4')+';border-radius:8px;padding:12px"><div style="font-size:10px;font-weight:700;color:'+(due>0?'#991b1b':'#166534')+';text-transform:uppercase">Restant dû</div><div style="font-size:16px;font-weight:800;color:'+(due>0?'#dc2626':'#16a34a')+'">'+fmtAmt(due)+'</div></div>'+
    '</div>'+
    earnSection+paySection+
    '<div style="display:flex;justify-content:flex-end;margin-top:20px"><button onclick="window.print()" style="padding:10px 24px;background:'+(s.primaryColor||'#1a56db')+';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Imprimer / PDF</button></div>'+
    '</div></body></html>';
}

function extractPrintable(fullHtml) {
  const bodyMatch=fullHtml.match(/<body>([\s\S]*?)<\/body>/);
  return {body:bodyMatch?bodyMatch[1]:fullHtml};
}

function PrintPreviewModal({html,close}) {
  const iframeRef=useRef(null);
  const [ready,setReady]=useState(false);
  const doPrint=()=>{
    try{
      const win=iframeRef.current.contentWindow;
      win.focus();
      win.print();
    }catch(e){ alert("Impossible de lancer l'impression automatiquement. Utilisez le bouton Télécharger puis ouvrez le fichier et imprimez-le (Ctrl+P)."); }
  };
  const doDownload=()=>{
    try{
      const blob=new Blob([html],{type:'text/html'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;a.download='document.html';
      document.body.appendChild(a);a.click();
      setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},500);
    }catch(e){}
  };
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',zIndex:2000,display:'flex',flexDirection:'column',alignItems:'center',padding:'18px 12px'}}>
    <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',justifyContent:'center'}}>
      <button onClick={doPrint} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'#1a56db',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>🖨 Imprimer</button>
      <button onClick={doDownload} style={{padding:'9px 20px',borderRadius:8,border:'1px solid #fff',background:'transparent',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>⬇ Télécharger le document</button>
      <button onClick={close} style={{padding:'9px 20px',borderRadius:8,border:'1px solid #fff',background:'transparent',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer'}}>✕ Fermer</button>
    </div>
    <div style={{width:'100%',maxWidth:920,flex:1,background:'#fff',borderRadius:10,overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,.4)',position:'relative'}}>
      {!ready&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,color:'#6b7280'}}>Chargement de l'aperçu…</div>}
      <iframe ref={iframeRef} title="Aperçu impression" srcDoc={html} onLoad={()=>setReady(true)} style={{width:'100%',height:'100%',border:'none',display:'block'}}/>
    </div>
    <div style={{color:'#e5e7eb',fontSize:11,marginTop:10,textAlign:'center',maxWidth:600}}>
      Si le bouton "Imprimer" n'ouvre pas la boîte de dialogue de votre navigateur, utilisez "Télécharger" puis ouvrez le fichier et appuyez sur Ctrl+P (Cmd+P sur Mac).
    </div>
  </div>;
}

function openPrintWindow(html) {
  // Preferred method: render the report inline in the current page and call
  // window.print() on it. This never gets blocked (no popup, no new window,
  // no cross-frame access needed) and works even inside embedded/sandboxed
  // previews where window.open()/iframes are restricted.
  try {
    if (typeof window!=='undefined' && typeof window.__dlPrint==='function') {
      window.__dlPrint(html);
      return true;
    }
  } catch(e){}
  // Fallback 1: hidden iframe (works in most normal browser tabs)
  try {
    const iframe=document.createElement('iframe');
    iframe.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc=iframe.contentWindow.document;
    doc.open();doc.write(html);doc.close();
    const cleanup=()=>{setTimeout(()=>{try{if(iframe.parentNode)document.body.removeChild(iframe);}catch(e){}},1000);};
    try{iframe.contentWindow.onafterprint=cleanup;}catch(e){}
    setTimeout(()=>{
      try{iframe.contentWindow.focus();iframe.contentWindow.print();}catch(e){}
      cleanup();
    },400);
    return true;
  } catch(e){}
  // Fallback 2: try a real popup window (works if popups are allowed)
  try {
    const w=window.open('','_blank','width=900,height=700,scrollbars=yes');
    if(w){w.document.write(html);w.document.close();w.focus();return true;}
  } catch(e){}
  return false;
}

// ─── GENERIC PRINT REPORT HELPERS (used across Charges, Caisse, Inventaire, Paiements Tech) ──
// ─── LIGHTWEIGHT CHARTS (no external deps — SVG-based) ────────────────────────
function BarChartSVG({data,height=180,color='#1a56db',valueFmt}) {
  const max=Math.max(1,...data.map(d=>d.value));
  const fmtV=valueFmt||(v=>v.toLocaleString('fr-DZ'));
  return <div style={{display:'flex',alignItems:'flex-end',gap:8,height,padding:'6px 2px',overflowX:'auto'}}>
    {data.map((d,i)=>{
      const h=Math.max(2,(d.value/max)*(height-36));
      return <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:38,flex:'1 0 auto'}}>
        <div style={{fontSize:9.5,fontWeight:700,color:'#374151',marginBottom:3,whiteSpace:'nowrap'}}>{d.value>0?fmtV(d.value):''}</div>
        <div title={d.label+': '+fmtV(d.value)} style={{width:'100%',maxWidth:28,height:h,background:d.color||color,borderRadius:'4px 4px 0 0',transition:'height .2s'}}/>
        <div style={{fontSize:9,color:'#6b7280',marginTop:4,whiteSpace:'nowrap',maxWidth:44,overflow:'hidden',textOverflow:'ellipsis'}}>{d.label}</div>
      </div>;
    })}
  </div>;
}
function DualBarChartSVG({data,height=180,color1='#1a56db',color2='#dc2626',l1='',l2=''}) {
  const max=Math.max(1,...data.map(d=>Math.max(d.v1,d.v2)));
  return <div>
    {(l1||l2)&&<div style={{display:'flex',gap:14,marginBottom:8,fontSize:10.5}}>
      {l1&&<span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:9,height:9,borderRadius:2,background:color1,display:'inline-block'}}/>{l1}</span>}
      {l2&&<span style={{display:'flex',alignItems:'center',gap:5}}><span style={{width:9,height:9,borderRadius:2,background:color2,display:'inline-block'}}/>{l2}</span>}
    </div>}
    <div style={{display:'flex',alignItems:'flex-end',gap:10,height,padding:'4px 2px',overflowX:'auto'}}>
      {data.map((d,i)=>{
        const h1=Math.max(1,(d.v1/max)*(height-30));
        const h2=Math.max(1,(d.v2/max)*(height-30));
        return <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',minWidth:46,flex:'1 0 auto'}}>
          <div style={{display:'flex',gap:3,alignItems:'flex-end',height:height-22}}>
            <div style={{width:14,height:h1,background:color1,borderRadius:'3px 3px 0 0'}} title={d.label+': '+d.v1.toLocaleString('fr-DZ')}/>
            <div style={{width:14,height:h2,background:color2,borderRadius:'3px 3px 0 0'}} title={d.label+': '+d.v2.toLocaleString('fr-DZ')}/>
          </div>
          <div style={{fontSize:9,color:'#6b7280',marginTop:4,whiteSpace:'nowrap'}}>{d.label}</div>
        </div>;
      })}
    </div>
  </div>;
}
function LineChartSVG({data,height=180,color='#1a56db'}) {
  const w=Math.max(300,data.length*46);
  const max=Math.max(1,...data.map(d=>d.value));
  const min=Math.min(0,...data.map(d=>d.value));
  const range=max-min||1;
  const pad=20;
  const pts=data.map((d,i)=>{
    const x=pad+(i/(Math.max(1,data.length-1)))*(w-pad*2);
    const y=height-pad-((d.value-min)/range)*(height-pad*2);
    return {x,y,...d};
  });
  const path=pts.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
  const zeroY=height-pad-((0-min)/range)*(height-pad*2);
  return <div style={{overflowX:'auto'}}>
    <svg width={w} height={height} style={{display:'block'}}>
      <line x1={pad} y1={zeroY} x2={w-pad} y2={zeroY} stroke="#e5e7eb" strokeWidth="1"/>
      <path d={path} fill="none" stroke={color} strokeWidth="2.5"/>
      {pts.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r="3.5" fill={color}><title>{p.label}: {p.value.toLocaleString('fr-DZ')}</title></circle>)}
      {pts.map((p,i)=><text key={i} x={p.x} y={height-2} fontSize="9" fill="#6b7280" textAnchor="middle">{p.label}</text>)}
    </svg>
  </div>;
}
function DonutChartSVG({data,size=150}) {
  const total=data.reduce((s,d)=>s+d.value,0)||1;
  let acc=0;
  const r=size/2-10,cx=size/2,cy=size/2,circ=2*Math.PI*r;
  return <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
    <svg width={size} height={size}>
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        {data.map((d,i)=>{
          const frac=d.value/total;
          const dash=frac*circ;
          const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth="20"
            strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-acc}/>;
          acc+=dash;
          return el;
        })}
      </g>
      <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="13" fontWeight="800" fill="#111827">{total.toLocaleString('fr-DZ')}</text>
    </svg>
    <div style={{display:'flex',flexDirection:'column',gap:5}}>
      {data.map((d,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:6,fontSize:11}}>
        <span style={{width:10,height:10,borderRadius:3,background:d.color,display:'inline-block'}}/>
        <span style={{color:'#374151'}}>{d.label}</span>
        <b style={{marginLeft:2}}>{d.value.toLocaleString('fr-DZ')}</b>
        <span style={{color:'#9ca3af'}}>({total>0?Math.round(d.value/total*100):0}%)</span>
      </div>)}
    </div>
  </div>;
}

// ─── EXPORT HELPERS (CSV / Excel-compatible / Print) ──────────────────────────
function downloadCSV(filename,headers,rows) {
  const esc=v=>{const s=String(v??'');return /[";\n,]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
  const csv='\uFEFF'+[headers.map(esc).join(','),...rows.map(r=>r.map(esc).join(','))].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},400);
}
function ExportBar({onCSV,onPrint,title}) {
  return <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
    <div style={{fontWeight:700,fontSize:13.5,color:'#111827'}}>{title}</div>
    <div style={{display:'flex',gap:6}}>
      {onCSV&&<button onClick={onCSV} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>⬇ CSV / Excel</button>}
      {onPrint&&<button onClick={onPrint} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>🖨 Imprimer / PDF</button>}
    </div>
  </div>;
}
function dateRangeFor(period,customStart,customEnd) {
  const now=new Date();
  const fmt=d=>d.toISOString().slice(0,10);
  if(period==='today'){const s=fmt(now);return {start:s,end:s};}
  if(period==='week'){const d=new Date(now);const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return {start:fmt(d),end:fmt(now)};}
  if(period==='month'){return {start:fmt(now).slice(0,8)+'01',end:fmt(now)};}
  if(period==='year'){return {start:fmt(now).slice(0,5)+'01-01',end:fmt(now)};}
  if(period==='custom')return {start:customStart||fmt(now),end:customEnd||fmt(now)};
  return {start:'0000-01-01',end:'9999-12-31'};
}

function reportTableHTML(columns,rows,footerCells,primaryColor) {

  const pc=primaryColor||'#1a56db';
  const thead='<thead><tr style="background:'+pc+'">'+columns.map(c=>
    '<th style="padding:9px 11px;text-align:'+(c.align||'left')+';font-size:9.5px;color:#fff;text-transform:uppercase;font-weight:700;white-space:nowrap">'+c.label+'</th>'
  ).join('')+'</tr></thead>';
  const tbody='<tbody>'+rows.map((r,i)=>'<tr style="background:'+(i%2===0?'#fff':'#f9fafb')+'">'+
    r.map((cell,ci)=>'<td style="padding:7px 11px;font-size:11.5px;border-bottom:1px solid #f3f4f6;text-align:'+(columns[ci]?.align||'left')+'">'+cell+'</td>').join('')+
  '</tr>').join('')+(rows.length===0?'<tr><td colspan="'+columns.length+'" style="padding:24px;text-align:center;color:#9ca3af;font-size:12px">Aucune donnée</td></tr>':'')+'</tbody>';
  const tfoot=footerCells?'<tfoot><tr style="background:#111827">'+footerCells.map((cell,ci)=>
    '<td style="padding:9px 11px;font-size:12.5px;font-weight:800;color:#fff;text-align:'+(columns[ci]?.align||'left')+'">'+cell+'</td>'
  ).join('')+'</tr></tfoot>':'';
  return '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">'+thead+tbody+tfoot+'</table>';
}

function reportShellHTML(settings,title,subtitle,innerHtml,opts) {
  const s=settings||{};
  const landscape=opts&&opts.landscape;
  const pc=s.primaryColor||'#1a56db';
  const legalLine=[s.rc?'RC: '+s.rc:'',s.nif?'NIF: '+s.nif:'',s.nis?'NIS: '+s.nis:''].filter(Boolean).join(' · ');
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+title+'</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#111;padding:0}'+
    '@media print{button{display:none!important}@page{margin:12mm;size:A4 '+(landscape?'landscape':'portrait')+'}}</style></head><body>'+
    '<div style="padding:24px 28px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:14px;border-bottom:3px solid '+pc+'">'+
      '<div style="display:flex;gap:12px;align-items:center">'+
        (s.logo?'<img src="'+s.logo+'" style="width:46px;height:46px;object-fit:contain;border-radius:6px"/>':'')+
        '<div><div style="font-size:20px;font-weight:800;color:'+pc+'">'+(s.companyName||'DentLab Pro')+'</div>'+
        '<div style="font-size:13px;font-weight:700;color:#374151;margin-top:2px">'+title+'</div>'+
        (subtitle?'<div style="font-size:11.5px;color:#6b7280;margin-top:1px">'+subtitle+'</div>':'')+
        (legalLine?'<div style="font-size:10px;color:#9ca3af;margin-top:1px">'+legalLine+'</div>':'')+
        '</div>'+
      '</div>'+
      '<div style="text-align:right;font-size:11.5px;color:#6b7280">Édité le<br/><b>'+new Date().toLocaleDateString('fr-DZ')+' '+new Date().toLocaleTimeString('fr-DZ')+'</b></div>'+
    '</div>'+
    innerHtml+
    '<div style="display:flex;justify-content:flex-end;margin-top:10px">'+
      '<button onclick="window.print()" style="padding:10px 24px;background:'+pc+';color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">Imprimer / PDF</button>'+
    '</div>'+
    '</div></body></html>';
}

function printReport(settings,title,subtitle,innerHtml,opts) {
  const html=reportShellHTML(settings,title,subtitle,innerHtml,opts);
  if(!openPrintWindow(html)){
    try{const w=window.open();if(w){w.document.write(html);w.document.close();}}catch(e){}
  }
}

function genBillingCSV(invoices,cases,users,fDoc,fStatus,fYear) {
  let vis=invoices;
  if(fDoc) vis=vis.filter(i=>i.docId===fDoc);
  if(fStatus) vis=vis.filter(i=>i.status===fStatus);
  if(fYear) vis=vis.filter(i=>i.date?.startsWith(fYear));
  const rows=[['N° Facture','Dentiste','Clinique','Patients','Total DA','Payé DA','Reste DA','Date création','Date paiement','Statut']];
  vis.forEach(i=>{
    const d=users.find(u=>u.id===i.docId);
    const pts=i.caseIds.map(cid=>{const c=cases.find(x=>x.id===cid);return c?c.pf+' '+c.pl:'';}).filter(Boolean).join(' / ');
    const r=i.total-i.paid;
    rows.push([i.num,d?.name||'',d?.clinique||'',pts,i.total,i.paid,r,i.date||'',i.paidDate||'',{PAID:'Payée',UNPAID:'Impayée'}[i.status]||i.status]);
  });
  return rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n');
}

function BillingPage({invoices,setInvoices,users,cases,restoTypes,setModal,showToast,settings}) {
  const [tab,setTab]         = useState(0);
  const [selClinic,setSelClinic] = useState('');
  const [selInvIds,setSelInvIds] = useState([]);
  const [payDate,setPayDate] = useState(tod());
  const [payMethod,setPayMethod] = useState('Espèces');
  const [detailInv,setDetailInv] = useState(null); // invoice detail modal
  const [printPreview,setPrintPreview] = useState(null);
  const [htmlPreview,setHtmlPreview]     = useState(null); // HTML invoice preview
  // ── Filters ──
  const [fDoc,setFDoc]       = useState('');
  const [fStatus,setFStatus] = useState('');
  const [fYear,setFYear]     = useState('');
  const [fMonth,setFMonth]   = useState('');
  const [fSearch,setFSearch] = useState('');

  const sl={PAID:'Payée',UNPAID:'Impayée'};
  const sc={PAID:'#16a34a',UNPAID:'#dc2626'};
  const docs=users.filter(u=>u.role==='DOCTOR');
  const clinics=users.filter(u=>u.role==='CLINIC');

  // ── Available years from invoices ──
  const years=[...new Set(invoices.map(i=>i.date?.slice(0,4)).filter(Boolean))].sort().reverse();
  const MNAMES=['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  // ── Filtered invoices ──
  let vis=invoices;
  if(fDoc)    vis=vis.filter(i=>i.docId===fDoc);
  if(fStatus) vis=vis.filter(i=>i.status===fStatus);
  if(fYear)   vis=vis.filter(i=>i.date?.startsWith(fYear));
  if(fMonth)  vis=vis.filter(i=>i.date?.startsWith(fMonth));
  if(fSearch) {
    const q=fSearch.toLowerCase();
    vis=vis.filter(i=>{
      const d=users.find(u=>u.id===i.docId);
      return i.num.toLowerCase().includes(q)||(d?.name||'').toLowerCase().includes(q);
    });
  }
  const anyFilter=fDoc||fStatus||fYear||fMonth||fSearch;

  // ── Totals for filtered set ──
  const filtTotal   = vis.reduce((s,i)=>s+i.total,0);
  const filtPaid    = vis.reduce((s,i)=>s+i.paid,0);
  const filtUnpaid  = vis.reduce((s,i)=>s+(i.total-i.paid),0);
  const filtCount   = vis.length;

  // ── Global KPIs (all invoices) ──
  const totPaid  = invoices.filter(i=>i.status==='PAID').reduce((s,i)=>s+i.total,0);
  const totOw    = invoices.filter(i=>i.status!=='PAID').reduce((s,i)=>s+(i.total-i.paid),0);
  const totCA    = invoices.reduce((s,i)=>s+i.total,0);

  // ── Clinic Outstanding Statement ──
  const [stmtScope,setStmtScope] = useState('UNPAID'); // 'UNPAID' | 'PAID' | 'ALL'
  const clinicDocIds = selClinic ? users.filter(u=>u.role==='DOCTOR'&&u.clinicId===selClinic).map(u=>u.id) : [];
  const clinicAllInv = invoices.filter(i=>clinicDocIds.includes(i.docId)).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const clinicUnpaid = clinicAllInv.filter(i=>i.status==='UNPAID');
  const clinicStatementRows = stmtScope==='ALL'?clinicAllInv:stmtScope==='PAID'?clinicAllInv.filter(i=>i.status==='PAID'):clinicUnpaid;
  const togInv = id=>setSelInvIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const selUnpaidTotal = clinicUnpaid.filter(i=>selInvIds.includes(i.id)).reduce((s,i)=>s+i.total,0);
  const allUnpaidTotal = clinicUnpaid.reduce((s,i)=>s+i.total,0);
  const allPaidTotal = clinicAllInv.filter(i=>i.status==='PAID').reduce((s,i)=>s+i.total,0);
  const recordGroupPayment = ()=>{
    if(!selInvIds.length){showToast('Sélectionnez au moins une facture');return;}
    setInvoices(p=>p.map(i=>selInvIds.includes(i.id)?{...i,paid:i.total,status:'PAID',paidDate:payDate,payments:[...(i.payments||[]),{amount:i.total,date:payDate,method:payMethod,batch:true}]}:i));
    showToast(`${selInvIds.length} facture(s) marquée(s) payée(s) — ${fmt(selUnpaidTotal)} ✓`);
    setSelInvIds([]);
  };
  const printClinicStatement = ()=>{
    const clinic=users.find(u=>u.id===selClinic);
    if(!clinic||clinicStatementRows.length===0){showToast('Aucune facture pour ce filtre');return;}
    const html=buildClinicStatementHTML(clinic,clinicStatementRows,users,cases,restoTypes,settings,stmtScope);
    if(!openPrintWindow(html)) setHtmlPreview(html);
  };

  const resetFilters=()=>{setFDoc('');setFStatus('');setFYear('');setFMonth('');setFSearch('');};

  return <>
    {/* ── Global KPIs ── */}
    <div className="kpi-grid" style={{gap:9}}>
      <Kpi label="CA Total"             val={fmtDA(totCA)}             col="#1a56db"/>
      <Kpi label="Encaissé"             val={fmtDA(totPaid)}           col="#16a34a"/>
      <Kpi label="Créances"             val={fmtDA(totOw)}             col="#dc2626"/>
      <Kpi label="Factures total"       val={invoices.length}          col="#7e3af2"/>
      <Kpi label="Payées"               val={invoices.filter(i=>i.status==='PAID').length}    col="#16a34a"/>
      <Kpi label="Impayées"             val={invoices.filter(i=>i.status==='UNPAID').length} col="#dc2626"/>
    </div>

    {/* ── Tabs ── */}
    <div style={{display:'flex',borderBottom:'2px solid #f3f4f6'}}>
      {['📋 Factures','🏥 Relevé Clinique'].map((t,i)=>(
        <button key={i} onClick={()=>setTab(i)} style={{padding:'9px 18px',border:'none',background:'none',cursor:'pointer',fontSize:13,fontWeight:tab===i?700:400,color:tab===i?'#1a56db':'#6b7280',borderBottom:tab===i?'2px solid #1a56db':'2px solid transparent',marginBottom:-2}}>
          {t}
        </button>
      ))}
    </div>

    {/* ══════════════ TAB 0: FACTURES ══════════════ */}
    {tab===0&&<>
      {/* ── Filter bar ── */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:'12px 14px',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
          <span style={{fontSize:12,fontWeight:700,color:'#374151'}}>Filtres</span>

          {/* Search */}
          <input value={fSearch} onChange={e=>setFSearch(e.target.value)}
            placeholder="Rechercher n° facture ou dentiste..."
            style={{flex:'1 1 160px',padding:'6px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,outline:'none',minWidth:140}}/>

          {/* Dentiste */}
          <select value={fDoc} onChange={e=>setFDoc(e.target.value)}
            style={{padding:'6px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,background:'#fff',flex:'1 1 120px',minWidth:120}}>
            <option value=''>Tous les dentistes</option>
            {docs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {/* Statut */}
          <select value={fStatus} onChange={e=>setFStatus(e.target.value)}
            style={{padding:'6px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
            <option value=''>Tous les statuts</option>
            <option value='PAID'>✅ Payées</option>
            <option value='UNPAID'>❌ Impayées</option>
          </select>

          {/* Année */}
          <select value={fYear} onChange={e=>{setFYear(e.target.value);setFMonth('');}}
            style={{padding:'6px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
            <option value=''>Toutes les années</option>
            {years.map(y=><option key={y} value={y}>{y}</option>)}
          </select>

          {/* Mois (only if year selected) */}
          {fYear&&<select value={fMonth} onChange={e=>setFMonth(e.target.value)}
            style={{padding:'6px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
            <option value=''>Tous les mois</option>
            {[...Array(12)].map((_,i)=>{const m=String(i+1).padStart(2,'0');return <option key={m} value={fYear+'-'+m}>{MNAMES[i+1]}</option>;})}
          </select>}

          {anyFilter&&<button onClick={resetFilters}
            style={{padding:'6px 12px',borderRadius:7,border:'none',background:'#fef2f2',color:'#dc2626',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
            × Réinitialiser
          </button>}
        </div>

        {/* ── Filter summary cards ── */}
        {anyFilter&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8,paddingTop:10,borderTop:'1px solid #f3f4f6'}}>
          <div style={{padding:'10px 12px',background:'#eff6ff',borderRadius:9,border:'1px solid #bfdbfe'}}>
            <div style={{fontSize:10,color:'#1e40af',fontWeight:600,marginBottom:3}}>RÉSULTATS</div>
            <div style={{fontSize:18,fontWeight:800,color:'#1a56db'}}>{filtCount}</div>
            <div style={{fontSize:10.5,color:'#1e40af'}}>facture{filtCount>1?'s':''}</div>
          </div>
          <div style={{padding:'10px 12px',background:'#f0fdf4',borderRadius:9,border:'1px solid #bbf7d0'}}>
            <div style={{fontSize:10,color:'#166534',fontWeight:600,marginBottom:3}}>CA FILTRÉ</div>
            <div style={{fontSize:15,fontWeight:800,color:'#16a34a'}}>{fmtDA(filtTotal)}</div>
          </div>
          <div style={{padding:'10px 12px',background:'#f0fdf4',borderRadius:9,border:'1px solid #bbf7d0'}}>
            <div style={{fontSize:10,color:'#166534',fontWeight:600,marginBottom:3}}>ENCAISSÉ</div>
            <div style={{fontSize:15,fontWeight:800,color:'#16a34a'}}>{fmtDA(filtPaid)}</div>
          </div>
          <div style={{padding:'10px 12px',background:'#fef2f2',borderRadius:9,border:'1px solid #fecaca'}}>
            <div style={{fontSize:10,color:'#991b1b',fontWeight:600,marginBottom:3}}>CRÉANCES</div>
            <div style={{fontSize:15,fontWeight:800,color:'#dc2626'}}>{fmtDA(filtUnpaid)}</div>
          </div>
        </div>}
      </div>

      {/* ── Export buttons ── */}
      <div style={{display:'flex',gap:8,justifyContent:'flex-end',flexWrap:'wrap'}}>
        <button onClick={()=>{
          const csv=genBillingCSV(vis,cases,users,fDoc,fStatus,fYear);
          try{const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='facturation_dentlab.csv';document.body.appendChild(a);a.click();document.body.removeChild(a);showToast('Export CSV téléchargé ✓');}
          catch(e){navigator.clipboard.writeText(csv).then(()=>showToast('CSV copié — collez dans Excel'));}}
        } style={{padding:'7px 14px',borderRadius:8,border:'none',background:'#16a34a',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
          📊 Exporter Excel/CSV
        </button>
      </div>

      {/* ── Invoices table ── */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div style={{padding:'10px 14px',borderBottom:'1px solid #f3f4f6',background:'#fafafa',borderRadius:'11px 11px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontWeight:700,fontSize:13}}>{anyFilter?'Résultats filtrés':'Toutes les factures'} ({filtCount})</span>
          {anyFilter&&<span style={{fontSize:11,color:'#6b7280'}}>CA: <b>{fmtDA(filtTotal)}</b> · Encaissé: <b style={{color:'#16a34a'}}>{fmtDA(filtPaid)}</b> · Dû: <b style={{color:'#dc2626'}}>{fmtDA(filtUnpaid)}</b></span>}
        </div>
        <div className="table-wrap">
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:820}}>
            <thead>
              <tr style={{background:'#fafafa'}}>
                {['N° Facture','Dentiste','Patient(s)','Dossiers','Montant','Payé','Restant','Créée le','Payée le','Statut',''].map(h=>
                  <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtCount===0
                ?<tr><td colSpan={11} style={{padding:32,textAlign:'center',color:'#9ca3af',fontSize:13}}>
                    {anyFilter?'Aucune facture pour ces filtres — essayez de modifier les critères':'Aucune facture enregistrée'}
                  </td></tr>
                :vis.map((i,idx)=>{
                  const d=users.find(u=>u.id===i.docId);
                  const r=i.total-i.paid;
                  const cnames=i.caseIds.map(cid=>{const c=cases.find(x=>x.id===cid);return c?c.num:cid;});
                  return <tr key={i.id} onClick={()=>setDetailInv(i)} style={{background:idx%2===0?'#fff':'#fafafa',borderBottom:'1px solid #f3f4f6',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='#eff6ff'} onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?'#fff':'#fafafa'}>
                    <td style={{padding:'9px 12px',whiteSpace:'nowrap'}}>
                      <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,color:'#1a56db'}}>{i.num}</div>
                    </td>
                    <td style={{padding:'9px 12px'}}>
                      <div style={{fontWeight:600,fontSize:12.5,color:'#111827'}}>{d?.name||'—'}</div>
                      {d?.clinique&&<div style={{fontSize:10.5,color:'#9ca3af'}}>{d.clinique}</div>}
                    </td>
                    <td style={{padding:'9px 12px',maxWidth:160}}>
                      {i.caseIds.map(cid=>{const c=cases.find(x=>x.id===cid);return c?<div key={cid} style={{fontSize:11.5,fontWeight:500,color:'#111827'}}>{c.pf} {c.pl}</div>:null;})}
                    </td>
                    <td style={{padding:'9px 12px',maxWidth:180}}>
                      <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                        {cnames.map(n=><span key={n} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9.5,background:'#f3f4f6',borderRadius:4,padding:'1px 5px'}}>{n}</span>)}
                      </div>
                    </td>
                    <td style={{padding:'9px 12px',fontSize:13,fontWeight:700,whiteSpace:'nowrap'}}>{fmtDA(i.total)}</td>
                    <td style={{padding:'9px 12px',fontSize:12,color:'#16a34a',fontWeight:600,whiteSpace:'nowrap'}}>{fmtDA(i.paid)}</td>
                    <td style={{padding:'9px 12px',fontSize:12,fontWeight:700,color:r>0?'#dc2626':'#9ca3af',whiteSpace:'nowrap'}}>{r>0?fmtDA(r):'✓'}</td>
                    <td style={{padding:'9px 12px',fontSize:11,color:'#6b7280',whiteSpace:'nowrap',fontFamily:"'JetBrains Mono',monospace"}}>{i.date||'—'}</td>
                    <td style={{padding:'9px 12px',whiteSpace:'nowrap'}}>
                      {i.paidDate
                        ?<span style={{fontSize:11,color:'#16a34a',fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>{i.paidDate}</span>
                        :i.lastPayDate
                          ?<div>
                              <span style={{fontSize:10.5,color:'#d97706',fontFamily:"'JetBrains Mono',monospace"}}>{i.lastPayDate}</span>
                              <div style={{fontSize:9.5,color:'#9ca3af'}}>partiel {fmtDA(i.lastPayAmt||0)}</div>
                            </div>
                          :<span style={{color:'#d1d5db'}}>—</span>}
                    </td>
                    <td style={{padding:'9px 12px'}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:99,background:sc[i.status]+'18',color:sc[i.status],whiteSpace:'nowrap'}}>
                        {sl[i.status]}
                      </span>
                    </td>
                    <td style={{padding:'9px 12px',whiteSpace:'nowrap'}}>
                      {r>0&&<button onClick={()=>setModal({t:'payment',iid:i.id})}
                        style={{padding:'5px 12px',borderRadius:7,border:'none',background:'#1a56db',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                        Payer
                      </button>}
                    </td>
                  </tr>;
                })
              }
            </tbody>
            {filtCount>0&&<tfoot>
              <tr style={{background:'#f0fdf4',fontWeight:700}}>
                <td colSpan={4} style={{padding:'10px 12px',fontSize:12,fontWeight:700,color:'#374151'}}>TOTAL ({filtCount} facture{filtCount>1?'s':''})</td>
                <td style={{padding:'10px 12px',fontSize:13,fontWeight:800,color:'#111827',whiteSpace:'nowrap'}}>{fmtDA(filtTotal)}</td>
                <td style={{padding:'10px 12px',fontSize:13,fontWeight:800,color:'#16a34a',whiteSpace:'nowrap'}}>{fmtDA(filtPaid)}</td>
                <td style={{padding:'10px 12px',fontSize:13,fontWeight:800,color:filtUnpaid>0?'#dc2626':'#9ca3af',whiteSpace:'nowrap'}}>{filtUnpaid>0?fmtDA(filtUnpaid):'✓ tout encaissé'}</td>
                <td colSpan={4}/>
              </tr>
            </tfoot>}
          </table>
        </div>
      </div>
    </>}

    {/* ══════════════ TAB 1: CRÉER FACTURE ══════════════ */}
    {tab===1&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
      <div style={{padding:'11px 14px',borderBottom:'1px solid #f3f4f6',background:'#fafafa',borderRadius:'11px 11px 0 0'}}>
        <span style={{fontWeight:700,fontSize:13}}>Relevé de créances — Clinique</span>
      </div>
      <div style={{padding:'14px 16px'}}>
        <Alert type="i">Sélectionnez une clinique, puis choisissez Impayées / Payées / Toutes. Imprimez un relevé consolidé (avec date de paiement) ou enregistrez un paiement groupé.</Alert>
        <Sel label="Clinique" value={selClinic} onChange={e=>{setSelClinic(e.target.value);setSelInvIds([]);}}
          options={[{v:'',l:'— Choisir une clinique —'},...clinics.map(c=>({v:c.id,l:c.name}))]}/>

        {selClinic&&<>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'14px 0 10px',flexWrap:'wrap',gap:10}}>
            <div style={{display:'flex',gap:6}}>
              {[{v:'UNPAID',l:'Impayées'},{v:'PAID',l:'Payées'},{v:'ALL',l:'Toutes'}].map(o=>
                <button key={o.v} onClick={()=>{setStmtScope(o.v);setSelInvIds([]);}} style={{padding:'6px 14px',borderRadius:99,border:'1px solid '+(stmtScope===o.v?'#1a56db':'#d1d5db'),background:stmtScope===o.v?'#1a56db':'#fff',color:stmtScope===o.v?'#fff':'#374151',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>{o.l}</button>
              )}
            </div>
            <div style={{fontSize:12,color:'#6b7280'}}>
              {stmtScope!=='PAID'&&<><b style={{color:'#dc2626',fontSize:15}}>{fmt(allUnpaidTotal)}</b> impayé{stmtScope==='ALL'&&' · '}</>}
              {stmtScope!=='UNPAID'&&<><b style={{color:'#16a34a',fontSize:15}}>{fmt(allPaidTotal)}</b> payé</>}
              {' '}· {clinicStatementRows.length} facture{clinicStatementRows.length>1?'s':''}
            </div>
            <button onClick={printClinicStatement} style={{padding:'7px 14px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>🖨 Imprimer le relevé</button>
          </div>

          {clinicStatementRows.length===0
            ?<div style={{textAlign:'center',padding:32,color:'#16a34a',fontSize:13,border:'2px dashed #bbf7d0',borderRadius:10,background:'#f0fdf4'}}>✅ Aucune facture pour ce filtre</div>
            :<>
              <div className="table-wrap">
                <table style={{width:'100%',borderCollapse:'collapse',minWidth:700}}>
                  <thead><tr style={{background:'#fafafa'}}>
                    {['✓','N° Facture','Date','Dentiste','Patient','Description','Montant','Statut','Date paiement'].map(h=>
                      <th key={h} style={{padding:'7px 12px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>
                    )}
                  </tr></thead>
                  <tbody>{clinicStatementRows.map((i,idx)=>{
                    const c=cases.find(x=>x.id===i.caseIds[0]);
                    const d=users.find(u=>u.id===i.docId);
                    const isSel=selInvIds.includes(i.id);
                    const isPaid=i.status==='PAID';
                    return <tr key={i.id} onClick={()=>!isPaid&&togInv(i.id)}
                      style={{cursor:isPaid?'default':'pointer',background:isSel?'#eff6ff':idx%2===0?'#fff':'#fafafa',borderBottom:'1px solid #f3f4f6'}}>
                      <td style={{padding:'9px 12px'}}>
                        {!isPaid&&<div style={{width:18,height:18,borderRadius:5,border:'2px solid '+(isSel?'#1a56db':'#d1d5db'),background:isSel?'#1a56db':'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                          {isSel&&<span style={{color:'#fff',fontSize:11,fontWeight:700,lineHeight:1}}>✓</span>}
                        </div>}
                      </td>
                      <td style={{padding:'9px 12px',fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'#1a56db',fontWeight:700}}>{i.num}</td>
                      <td style={{padding:'9px 12px',fontSize:11,color:'#6b7280',fontFamily:"'JetBrains Mono',monospace"}}>{i.date}</td>
                      <td style={{padding:'9px 12px',fontSize:11.5}}>{d?.name||'—'}</td>
                      <td style={{padding:'9px 12px',fontSize:12,fontWeight:600}}>{c?c.pf+' '+c.pl:'—'}</td>
                      <td style={{padding:'9px 12px',fontSize:11,color:'#6b7280'}}>{c?caseDescription(c,restoTypes):'—'}</td>
                      <td style={{padding:'9px 12px',fontSize:12,fontWeight:700,color:isPaid?'#16a34a':'#dc2626',whiteSpace:'nowrap'}}>{fmtDA(i.total)}</td>
                      <td style={{padding:'9px 12px'}}><span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:99,background:isPaid?'#f0fdf4':'#fef2f2',color:isPaid?'#16a34a':'#dc2626'}}>{isPaid?'PAYÉE':'IMPAYÉE'}</span></td>
                      <td style={{padding:'9px 12px',fontSize:11,color:i.paidDate?'#16a34a':'#9ca3af',fontFamily:"'JetBrains Mono',monospace"}}>{i.paidDate||'—'}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              {stmtScope!=='PAID'&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,paddingTop:12,marginTop:12,borderTop:'2px solid #e5e7eb',flexWrap:'wrap'}}>
                <div style={{fontSize:12,color:'#6b7280'}}>{selInvIds.length} sélectionnée{selInvIds.length>1?'s':''} · <b style={{color:'#1a56db',fontSize:14}}>{fmtDA(selUnpaidTotal)}</b></div>
                <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                  <button onClick={()=>setSelInvIds(clinicUnpaid.map(i=>i.id))} style={{padding:'7px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11.5,cursor:'pointer'}}>Tout sélectionner</button>
                  <button onClick={()=>setSelInvIds([])} style={{padding:'7px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11.5,cursor:'pointer'}}>Aucune</button>
                  <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} style={{padding:'6px 8px',borderRadius:7,border:'1px solid #d1d5db',fontSize:11.5}}/>
                  <select value={payMethod} onChange={e=>setPayMethod(e.target.value)} style={{padding:'6px 8px',borderRadius:7,border:'1px solid #d1d5db',fontSize:11.5,background:'#fff'}}>
                    {['Espèces','Virement bancaire','Chèque','Carte bancaire'].map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                  <button onClick={recordGroupPayment} disabled={!selInvIds.length} style={{padding:'8px 16px',borderRadius:8,border:'none',background:selInvIds.length?'#16a34a':'#d1d5db',color:'#fff',fontSize:13,fontWeight:700,cursor:selInvIds.length?'pointer':'not-allowed'}}>
                    💰 Enregistrer le paiement — {fmtDA(selUnpaidTotal)}
                  </button>
                </div>
              </div>}
            </>
          }
        </>}
      </div>
    </div>}

    {/* ── HTML Invoice Preview (fallback) ── */}
    {htmlPreview&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:8}}>
      <div style={{background:'#fff',borderRadius:14,width:'min(98vw,900px)',height:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.4)'}}>
        <div style={{padding:'10px 16px',borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,background:'#fafafa',borderRadius:'14px 14px 0 0'}}>
          <span style={{fontWeight:700,fontSize:13}}>Aperçu facture / situation</span>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{const b=new Blob([htmlPreview],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='facture_dentlab.html';a.click();showToast('Fichier HTML téléchargé — ouvrez dans un navigateur pour imprimer');}} style={{padding:'5px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#f9fafb',cursor:'pointer',fontSize:12,fontWeight:500}}>Télécharger</button>
            <button onClick={()=>setHtmlPreview(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#6b7280',padding:'2px 8px'}}>×</button>
          </div>
        </div>
        <iframe srcDoc={htmlPreview} style={{flex:1,border:'none',borderRadius:'0 0 14px 14px'}} title="Aperçu facture"/>
      </div>
    </div>}

    {/* ── Print Preview Modal ── */}
    {printPreview&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400,padding:12}} onClick={e=>e.target===e.currentTarget&&setPrintPreview(null)}>
      <div style={{background:'#fff',borderRadius:14,width:'min(94vw,820px)',maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
        <div style={{padding:'12px 16px',borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,background:'#fafafa',borderRadius:'14px 14px 0 0'}}>
          <span style={{fontWeight:700,fontSize:13}}>Apercu — Situation de facturation</span>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>{try{navigator.clipboard.writeText(printPreview).then(()=>showToast('Copie ✓'));}catch(e){}}} style={{padding:'5px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#f9fafb',cursor:'pointer',fontSize:12,fontWeight:500}}>Copier</button>
            <button onClick={()=>setPrintPreview(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#6b7280',padding:'2px 6px'}}>x</button>
          </div>
        </div>
        <pre style={{flex:1,overflowY:'auto',padding:'16px 20px',margin:0,fontFamily:"'Courier New',Courier,monospace",fontSize:11,lineHeight:1.65,color:'#111827',background:'#fafafa',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{printPreview}</pre>
      </div>
    </div>}

    {/* ── Invoice Detail Modal ── */}
    {detailInv&&(()=>{
      const d=users.find(u=>u.id===detailInv.docId);
      const r2=detailInv.total-detailInv.paid;
      const invCases=detailInv.caseIds.map(cid=>cases.find(x=>x.id===cid)).filter(Boolean);
      return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,padding:16}} onClick={e=>e.target===e.currentTarget&&setDetailInv(null)}>
        <div style={{background:'#fff',borderRadius:14,width:'min(94vw,560px)',maxHeight:'90vh',overflow:'auto',boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid #f3f4f6',display:'flex',justifyContent:'space-between',alignItems:'center',background:'#fafafa',borderRadius:'14px 14px 0 0'}}>
            <div>
              <div style={{fontWeight:800,fontSize:15,color:'#111827'}}>{detailInv.num}</div>
              <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>{d?.name||'—'} · {d?.clinique||''}</div>
            </div>
            <button onClick={()=>setDetailInv(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'#6b7280',padding:'2px 8px'}}>x</button>
          </div>
          <div style={{padding:'16px 18px'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:16}}>
              <div style={{padding:'10px 12px',background:'#eff6ff',borderRadius:9,textAlign:'center'}}>
                <div style={{fontSize:10,color:'#1e40af',fontWeight:600,marginBottom:3}}>MONTANT</div>
                <div style={{fontSize:16,fontWeight:800,color:'#1a56db'}}>{fmtDA(detailInv.total)}</div>
              </div>
              <div style={{padding:'10px 12px',background:'#f0fdf4',borderRadius:9,textAlign:'center'}}>
                <div style={{fontSize:10,color:'#166534',fontWeight:600,marginBottom:3}}>PAYE</div>
                <div style={{fontSize:16,fontWeight:800,color:'#16a34a'}}>{fmtDA(detailInv.paid)}</div>
              </div>
              <div style={{padding:'10px 12px',background:r2>0?'#fef2f2':'#f0fdf4',borderRadius:9,textAlign:'center'}}>
                <div style={{fontSize:10,color:r2>0?'#991b1b':'#166534',fontWeight:600,marginBottom:3}}>RESTE</div>
                <div style={{fontSize:16,fontWeight:800,color:r2>0?'#dc2626':'#16a34a'}}>{r2>0?fmtDA(r2):'Solde'}</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
              <div style={{padding:'9px 12px',background:'#f9fafb',borderRadius:8}}>
                <div style={{fontSize:10,color:'#6b7280',marginBottom:2}}>Date creation</div>
                <div style={{fontSize:13,fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>{detailInv.date||'—'}</div>
              </div>
              <div style={{padding:'9px 12px',background:'#f9fafb',borderRadius:8}}>
                <div style={{fontSize:10,color:'#6b7280',marginBottom:2}}>Date de paiement</div>
                <div style={{fontSize:13,fontWeight:600,fontFamily:"'JetBrains Mono',monospace",color:detailInv.paidDate?'#16a34a':'#9ca3af'}}>{detailInv.paidDate||'—'}</div>
              </div>
            </div>
            <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:8}}>Dossiers ({invCases.length})</div>
            {invCases.map(c=>{
              const rt=restoTypes.find(r=>r.id===c.rtId);
              return <div key={c.id} style={{padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:9,marginBottom:8,background:'#fafafa'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                  <div>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'#1a56db',fontWeight:700}}>{c.num}</span>
                    <span style={{fontSize:13,fontWeight:700,color:'#111827',marginLeft:10}}>{c.pf} {c.pl}</span>
                  </div>
                  <span style={{fontSize:13,fontWeight:700,color:'#1a56db'}}>{fmtDA(rt?.price||0)}</span>
                </div>
                <div style={{fontSize:11.5,color:'#6b7280'}}>
                  {rt?.name||'—'}{c.sh&&' · Teinte: '+c.sh}{c.teeth?.length&&' · '+c.teeth.length+' elements'}
                </div>
              </div>;
            })}
            <div style={{display:'flex',gap:8,marginTop:12,paddingTop:12,borderTop:'1px solid #f3f4f6',flexWrap:'wrap'}}>
              {r2>0&&<button onClick={()=>{setModal({t:'payment',iid:detailInv.id});setDetailInv(null);}} style={{flex:1,padding:'10px',borderRadius:8,border:'none',background:'#1a56db',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',minWidth:120}}>
                Payer
              </button>}
              <button onClick={()=>{setModal({t:'editInvoice',iid:detailInv.id});setDetailInv(null);}} style={{flex:1,padding:'10px',borderRadius:8,border:'1px solid #d1d5db',background:'#f9fafb',fontSize:13,fontWeight:600,cursor:'pointer',minWidth:100}}>
                ✎ Modifier
              </button>
              <button onClick={()=>{
                const pts=detailInv.caseIds.map(cid=>{const c=cases.find(x=>x.id===cid);return c?c.pf+' '+c.pl:'';}).filter(Boolean);
                const invHtml=buildInvoiceHTML(detailInv,cases,users,{...(settings||{}),restoTypes});
                if(!openPrintWindow(invHtml)) setHtmlPreview(invHtml);
                setDetailInv(null);
              }} style={{flex:1,padding:'10px',borderRadius:8,border:'1px solid #d1d5db',background:'#f9fafb',fontSize:13,fontWeight:600,cursor:'pointer',minWidth:100}}>
                Imprimer
              </button>
              <button onClick={()=>setDetailInv(null)} style={{padding:'10px 14px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,cursor:'pointer'}}>Fermer</button>
            </div>
          </div>
        </div>
      </div>;
    })()}
  </>;
}

// ─── REPORTS ─────────────────────────────────────────────────────────────────
function AccountingPage({cases,users,invoices,expenses,expenseCats,caisse,mats,stockMovements,restoTypes,techPayments,settings,showToast}) {
  const [tab,setTab] = useState(0);
  const tabs = ['📊 Tableau de bord','💰 Revenus','💸 Dépenses','📈 Rentabilité','⏳ Créances','💳 Paiements','📦 Inventaire','👷 Productivité','🧾 TVA','🏦 Trésorerie'];
  const today = tod();
  const curY  = today.slice(0,4);
  const curM  = today.slice(0,7);
  const COLORS=['#1a56db','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#c2410c','#65a30d'];

  // ── Shared date-range filter ──
  const [period,setPeriod]   = useState('month'); // today|week|month|year|custom|all
  const [custStart,setCustStart] = useState(curY+'-01-01');
  const [custEnd,setCustEnd]     = useState(today);
  const {start,end} = dateRangeFor(period,custStart,custEnd);
  const inRange = d => !!d && d>=start && d<=end;

  // ── Base joined data ──
  const clinics = users.filter(u=>u.role==='CLINIC');
  const docs    = users.filter(u=>u.role==='DOCTOR');
  const techs   = users.filter(u=>u.role==='TECHNICIAN');
  const clinicOf = docId => { const d=users.find(u=>u.id===docId); return d?users.find(u=>u.id===d.clinicId):null; };
  const caseOfInv = i => cases.find(c=>c.id===i.caseIds?.[0]);

  const dInvoices = invoices.filter(i=>inRange(i.date));
  const dExpenses = expenses.filter(e=>inRange(e.date));
  const dTechPay  = techPayments.filter(p=>inRange(p.date));

  // ── Dashboard KPIs ──
  const totalRevenue  = dInvoices.reduce((s,i)=>s+i.total,0);
  const opExpenses     = dExpenses.reduce((s,e)=>s+e.amount,0);
  const salaryExpenses = dTechPay.reduce((s,p)=>s+p.amount,0);
  const totalExpenses  = opExpenses + salaryExpenses;
  const netProfit      = totalRevenue - totalExpenses;
  const totalInvoicesN = dInvoices.length;
  const paidAmount     = dInvoices.filter(i=>i.status==='PAID').reduce((s,i)=>s+i.total,0);
  const unpaidAmount   = dInvoices.filter(i=>i.status==='UNPAID').reduce((s,i)=>s+i.total,0);
  const outstandingBal = unpaidAmount;
  const dCaseIds        = new Set(dInvoices.map(i=>i.caseIds?.[0]).filter(Boolean));
  const numberOfCases  = dCaseIds.size;
  const avgCaseValue   = numberOfCases>0 ? totalRevenue/numberOfCases : 0;
  const profitMargin   = totalRevenue>0 ? (netProfit/totalRevenue*100) : 0;

  // ── Last 6 months trend (independent of the period filter — always last 6 months) ──
  const last6 = Array.from({length:6},(_,i)=>{
    const d=new Date(); d.setMonth(d.getMonth()-(5-i));
    return {key:d.toISOString().slice(0,7),label:d.toLocaleDateString('fr-DZ',{month:'short'})};
  });
  const trend = last6.map(m=>{
    const rev=invoices.filter(i=>i.date?.startsWith(m.key)).reduce((s,i)=>s+i.total,0);
    const exp=expenses.filter(e=>e.date?.startsWith(m.key)).reduce((s,e)=>s+e.amount,0)
             +techPayments.filter(p=>p.date?.startsWith(m.key)).reduce((s,p)=>s+p.amount,0);
    return {label:m.label,rev,exp,profit:rev-exp};
  });

  const topClinics = clinics.map(cl=>{
    const docIds=docs.filter(d=>d.clinicId===cl.id).map(d=>d.id);
    const rev=dInvoices.filter(i=>docIds.includes(i.docId)).reduce((s,i)=>s+i.total,0);
    return {label:cl.name,value:rev};
  }).sort((a,b)=>b.value-a.value).slice(0,6);

  const exportDashboardCSV=()=>{
    downloadCSV('tableau_de_bord_'+start+'_'+end+'.csv',
      ['Indicateur','Valeur'],
      [['Chiffre affaires total',totalRevenue],['Dépenses totales',totalExpenses],['Bénéfice net',netProfit],
       ['Factures totales',totalInvoicesN],['Montant payé',paidAmount],['Montant impayé',unpaidAmount],
       ['Solde impayé',outstandingBal],['Nombre de dossiers',numberOfCases],['Valeur moyenne / dossier',avgCaseValue.toFixed(0)],
       ['Marge bénéficiaire (%)',profitMargin.toFixed(1)]]);
  };
  const printDashboard=()=>{
    const inner=reportTableHTML(
      [{label:'Indicateur'},{label:'Valeur',align:'right'}],
      [['Chiffre d\'affaires total',fmtDA(totalRevenue)],['Dépenses totales',fmtDA(totalExpenses)],['Bénéfice net',fmtDA(netProfit)],
       ['Factures totales',totalInvoicesN+''],['Montant payé',fmtDA(paidAmount)],['Montant impayé',fmtDA(unpaidAmount)],
       ['Solde impayé',fmtDA(outstandingBal)],['Nombre de dossiers',numberOfCases+''],['Valeur moyenne / dossier',fmtDA(avgCaseValue)],
       ['Marge bénéficiaire',profitMargin.toFixed(1)+'%']].map(r=>[r[0],r[1]])
    );
    printReport(settings,'Tableau de bord — Comptabilité',start+' au '+end,inner);
  };

  // ── Revenue reports ──
  const [revGroup,setRevGroup]=useState('clinic'); // clinic|doctor|worktype|technician|method|date
  const revenueGrouped = (()=>{
    const map={};
    if(revGroup==='clinic'){
      dInvoices.forEach(i=>{const cl=clinicOf(i.docId);const key=cl?cl.name:'Sans clinique';map[key]=(map[key]||0)+i.total;});
    } else if(revGroup==='doctor'){
      dInvoices.forEach(i=>{const d=users.find(u=>u.id===i.docId);const key=d?d.name:'—';map[key]=(map[key]||0)+i.total;});
    } else if(revGroup==='worktype'){
      dInvoices.forEach(i=>{const c=caseOfInv(i);const rt=c?restoTypes.find(r=>r.id===c.rtId):null;const key=rt?rt.name:'—';map[key]=(map[key]||0)+i.total;});
    } else if(revGroup==='technician'){
      dInvoices.forEach(i=>{const c=caseOfInv(i);const t=c?users.find(u=>u.id===c.techId):null;const key=t?t.name:'Non assigné';map[key]=(map[key]||0)+i.total;});
    } else if(revGroup==='method'){
      dInvoices.forEach(i=>(i.payments||[]).forEach(p=>{map[p.method||'Non précisé']=(map[p.method||'Non précisé']||0)+p.amount;}));
    } else if(revGroup==='date'){
      dInvoices.forEach(i=>{const key=(i.date||'').slice(0,7);map[key]=(map[key]||0)+i.total;});
    }
    return Object.entries(map).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
  })();
  const revGroupLabels={clinic:'Clinique',doctor:'Dentiste',worktype:'Type de travail',technician:'Technicien',method:'Mode de paiement',date:'Mois'};
  const exportRevenueCSV=()=>downloadCSV('revenus_par_'+revGroup+'.csv',[revGroupLabels[revGroup],'Montant'],revenueGrouped.map(r=>[r.label,r.value]));
  const printRevenue=()=>{
    const inner=reportTableHTML([{label:revGroupLabels[revGroup]},{label:'Montant',align:'right'}],revenueGrouped.map(r=>[r.label,fmtDA(r.value)]),['TOTAL',fmtDA(revenueGrouped.reduce((s,r)=>s+r.value,0))]);
    printReport(settings,'Rapport de revenus — par '+revGroupLabels[revGroup],start+' au '+end,inner);
  };

  // ── Expense reports ──
  const expByCat={};
  dExpenses.forEach(e=>{const cat=expenseCats.find(c=>c.id===e.catId);const key=cat?cat.name:'Autre';expByCat[key]=(expByCat[key]||0)+e.amount;});
  if(salaryExpenses>0) expByCat['Salaires techniciens']=salaryExpenses;
  const expCatList=Object.entries(expByCat).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
  const exportExpensesCSV=()=>downloadCSV('depenses_par_categorie.csv',['Catégorie','Montant'],expCatList.map(r=>[r.label,r.value]));
  const printExpenses=()=>{
    const inner=reportTableHTML([{label:'Catégorie'},{label:'Montant',align:'right'}],expCatList.map(r=>[r.label,fmtDA(r.value)]),['TOTAL',fmtDA(totalExpenses)]);
    printReport(settings,'Rapport de dépenses',start+' au '+end,inner);
  };

  // ── Profit analysis ──
  const caseFinAll = [...dCaseIds].map(cid=>{
    const c=cases.find(x=>x.id===cid); if(!c) return null;
    const inv=invoices.find(i=>i.caseIds?.includes(cid));
    const rev=inv?inv.total:0, mat=c.materialCost||0, lab=c.laborCost||0;
    return {c,inv,rev,mat,lab,gross:rev-mat,net:rev-mat-lab};
  }).filter(Boolean);
  const totalMatCost = caseFinAll.reduce((s,f)=>s+f.mat,0);
  const totalLabCost = caseFinAll.reduce((s,f)=>s+f.lab,0);
  const grossProfit   = totalRevenue - totalMatCost;
  const netProfitCases = grossProfit - totalLabCost;
  const profitBy = (keyFn)=>{
    const map={};
    caseFinAll.forEach(f=>{const key=keyFn(f)||'—';if(!map[key])map[key]={rev:0,cost:0,profit:0,n:0};map[key].rev+=f.rev;map[key].cost+=f.mat+f.lab;map[key].profit+=f.net;map[key].n++;});
    return Object.entries(map).map(([label,v])=>({label,...v})).sort((a,b)=>b.profit-a.profit);
  };
  const profitByClinic   = profitBy(f=>{const cl=clinicOf(f.c.docId);return cl?cl.name:'Sans clinique';});
  const profitByDoctor   = profitBy(f=>users.find(u=>u.id===f.c.docId)?.name);
  const profitByWorkType = profitBy(f=>restoTypes.find(r=>r.id===f.c.rtId)?.name);
  const exportProfitCSV=()=>downloadCSV('rentabilite_dossiers.csv',
    ['Dossier','Patient','Type','Revenu','Coût matériaux','Coût main d\'oeuvre','Profit brut','Profit net'],
    caseFinAll.map(f=>[f.c.num,f.c.pf+' '+f.c.pl,restoTypes.find(r=>r.id===f.c.rtId)?.name||'',f.rev,f.mat,f.lab,f.gross,f.net]));
  const printProfit=()=>{
    const inner=reportTableHTML(
      [{label:'Dossier'},{label:'Patient'},{label:'Type'},{label:'Revenu',align:'right'},{label:'Matériaux',align:'right'},{label:'M.O.',align:'right'},{label:'Profit net',align:'right'}],
      caseFinAll.map(f=>[f.c.num,f.c.pf+' '+f.c.pl,restoTypes.find(r=>r.id===f.c.rtId)?.name||'—',fmtDA(f.rev),fmtDA(f.mat),fmtDA(f.lab),fmtDA(f.net)]),
      ['','','TOTAL',fmtDA(totalRevenue),fmtDA(totalMatCost),fmtDA(totalLabCost),fmtDA(netProfitCases)]
    );
    printReport(settings,'Analyse de rentabilité',start+' au '+end,inner,{landscape:true});
  };

  // ── Accounts Receivable ──
  const allUnpaid = invoices.filter(i=>i.status==='UNPAID');
  const allPaid   = invoices.filter(i=>i.status==='PAID');
  const daysSince = dateStr => { if(!dateStr) return 0; const d=new Date(dateStr); const now=new Date(); return Math.floor((now-d)/86400000); };
  const aging = {b30:{n:0,amt:0},b60:{n:0,amt:0},b90:{n:0,amt:0},b90p:{n:0,amt:0}};
  allUnpaid.forEach(i=>{
    const d=daysSince(i.date);
    const bucket = d<=30?aging.b30 : d<=60?aging.b60 : d<=90?aging.b90 : aging.b90p;
    bucket.n++; bucket.amt+=i.total;
  });
  const arByClinic = clinics.map(cl=>{
    const docIds=docs.filter(d=>d.clinicId===cl.id).map(d=>d.id);
    const unpaid=invoices.filter(i=>docIds.includes(i.docId)&&i.status==='UNPAID').reduce((s,i)=>s+i.total,0);
    return {label:cl.name,value:unpaid};
  }).filter(r=>r.value>0).sort((a,b)=>b.value-a.value);
  const exportARCsv=()=>downloadCSV('creances_impayees.csv',
    ['N° Facture','Date','Jours','Dentiste','Patient','Montant'],
    allUnpaid.map(i=>{const c=caseOfInv(i);const d=users.find(u=>u.id===i.docId);return [i.num,i.date,daysSince(i.date),d?.name||'',c?c.pf+' '+c.pl:'',i.total];}));
  const printAR=()=>{
    const inner=reportTableHTML(
      [{label:'N° Facture'},{label:'Date'},{label:'Jours',align:'right'},{label:'Dentiste'},{label:'Patient'},{label:'Montant',align:'right'}],
      allUnpaid.map(i=>{const c=caseOfInv(i);const d=users.find(u=>u.id===i.docId);return [i.num,i.date,daysSince(i.date)+'',d?.name||'—',c?c.pf+' '+c.pl:'—',fmtDA(i.total)];}),
      ['','','','','TOTAL',fmtDA(unpaidAmount0Total())]
    );
    printReport(settings,'Rapport de créances (Accounts Receivable)','',inner,{landscape:true});
  };
  function unpaidAmount0Total(){return allUnpaid.reduce((s,i)=>s+i.total,0);}

  // ── Payment reports ──
  const allPayments = invoices.flatMap(i=>(i.payments||[]).map(p=>({...p,invNum:i.num,docId:i.docId})));
  const dPayments = allPayments.filter(p=>inRange(p.date));
  const payByMethod={};
  dPayments.forEach(p=>{payByMethod[p.method||'Non précisé']=(payByMethod[p.method||'Non précisé']||0)+p.amount;});
  const payMethodList=Object.entries(payByMethod).map(([label,value],i)=>({label,value,color:COLORS[i%COLORS.length]})).sort((a,b)=>b.value-a.value);
  const exportPaymentsCSV=()=>downloadCSV('historique_paiements.csv',
    ['Date','Facture','Dentiste','Montant','Mode'],
    dPayments.map(p=>{const d=users.find(u=>u.id===p.docId);return [p.date,p.invNum,d?.name||'',p.amount,p.method||''];}));
  const printPayments=()=>{
    const inner=reportTableHTML(
      [{label:'Date'},{label:'Facture'},{label:'Dentiste'},{label:'Mode'},{label:'Montant',align:'right'}],
      dPayments.map(p=>{const d=users.find(u=>u.id===p.docId);return [p.date,p.invNum,d?.name||'—',p.method||'—',fmtDA(p.amount)];}),
      ['','','','TOTAL',fmtDA(dPayments.reduce((s,p)=>s+p.amount,0))]
    );
    printReport(settings,'Historique des paiements',start+' au '+end,inner);
  };

  // ── Inventory cost reports ──
  const inventoryValue = mats.reduce((s,m)=>s+(m.stock*m.cost),0);
  const lowStock = mats.filter(m=>m.stock<=m.min);
  const matByCat={};
  mats.forEach(m=>{matByCat[m.cat]=(matByCat[m.cat]||0)+(m.stock*m.cost);});
  const matCatList=Object.entries(matByCat).map(([label,value],i)=>({label,value,color:COLORS[i%COLORS.length]})).sort((a,b)=>b.value-a.value);
  const dConsumption = stockMovements.filter(m=>m.type==='OUT'&&inRange(m.date));
  const consumptionByMat = {};
  dConsumption.forEach(mv=>{const m=mats.find(x=>x.id===mv.matId);const key=m?m.name:mv.matId;if(!consumptionByMat[key])consumptionByMat[key]={qty:0,cost:0};consumptionByMat[key].qty+=mv.qty;consumptionByMat[key].cost+=mv.qty*(m?m.cost:0);});
  const consumptionList=Object.entries(consumptionByMat).map(([label,v])=>({label,...v})).sort((a,b)=>b.cost-a.cost);
  const exportInventoryCSV=()=>downloadCSV('inventaire_couts.csv',
    ['Matériau','Catégorie','Stock','Coût unitaire','Valeur totale'],
    mats.map(m=>[m.name,m.cat,m.stock,m.cost,m.stock*m.cost]));
  const printInventory=()=>{
    const inner=reportTableHTML(
      [{label:'Matériau'},{label:'Catégorie'},{label:'Stock',align:'right'},{label:'Coût unitaire',align:'right'},{label:'Valeur',align:'right'}],
      mats.map(m=>[m.name,m.cat,m.stock+'',fmtDA(m.cost),fmtDA(m.stock*m.cost)]),
      ['','','','TOTAL',fmtDA(inventoryValue)]
    );
    printReport(settings,'Rapport de coûts d\'inventaire','',inner);
  };

  // ── Productivity reports ──
  const prodByTech = techs.map(t=>{
    const tCases = cases.filter(c=>c.techId===t.id);
    const completed = tCases.filter(c=>c.status==='DELIVERED');
    const revenue = completed.reduce((s,c)=>{const inv=invoices.find(i=>i.caseIds?.includes(c.id));return s+(inv?inv.total:0);},0);
    return {tech:t,completed:completed.length,active:tCases.filter(c=>!['DELIVERED','CANCELLED'].includes(c.status)).length,revenue};
  }).sort((a,b)=>b.revenue-a.revenue);
  const exportProductivityCSV=()=>downloadCSV('productivite_techniciens.csv',
    ['Technicien','Dossiers livrés','Dossiers en cours','Revenu généré'],
    prodByTech.map(p=>[p.tech.name,p.completed,p.active,p.revenue]));
  const printProductivity=()=>{
    const inner=reportTableHTML(
      [{label:'Technicien'},{label:'Dossiers livrés',align:'right'},{label:'En cours',align:'right'},{label:'Revenu généré',align:'right'}],
      prodByTech.map(p=>[p.tech.name,p.completed+'',p.active+'',fmtDA(p.revenue)]),
      ['TOTAL','',(prodByTech.reduce((s,p)=>s+p.active,0))+'',fmtDA(prodByTech.reduce((s,p)=>s+p.revenue,0))]
    );
    printReport(settings,'Rapport de productivité','',inner);
  };

  // ── VAT (kept from previous implementation) ──
  const vatRate = 0.19;
  const vatMonth = invoices.filter(i=>i.date?.startsWith(curM)).reduce((s,i)=>s+(i.total*vatRate),0);
  const vatYear  = invoices.filter(i=>i.date?.startsWith(curY)).reduce((s,i)=>s+(i.total*vatRate),0);
  const vatExpenses = expenses.filter(e=>e.date?.startsWith(curY)).reduce((s,e)=>s+(e.amount*vatRate),0);
  const vatNet = vatYear - vatExpenses;

  // ── Treasury / cash flow ──
  let balance = 0;
  const cashFlow = caisse.map(c=>{ balance += c.type==='IN'?c.amount:-c.amount; return {...c, balance}; }).reverse().slice(0,20);
  const totalCash = caisse.reduce((s,c)=>s+(c.type==='IN'?c.amount:-c.amount),0);

  const TabBtn = ({i,l})=><button onClick={()=>setTab(i)} style={{padding:'6px 12px',border:'none',background:'none',cursor:'pointer',fontSize:11.5,fontWeight:tab===i?700:400,color:tab===i?'#1a56db':'#6b7280',borderBottom:tab===i?'2px solid #1a56db':'2px solid transparent',whiteSpace:'nowrap',marginBottom:-2}}>{l}</button>;

  const PeriodBar = ()=><div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',marginBottom:12}}>
    {[['today','Aujourd\'hui'],['week','Cette semaine'],['month','Ce mois'],['year','Cette année'],['all','Tout'],['custom','Personnalisé']].map(([v,l])=>
      <button key={v} onClick={()=>setPeriod(v)} style={{padding:'5px 12px',borderRadius:99,border:'none',cursor:'pointer',fontSize:11,fontWeight:period===v?700:400,background:period===v?'#1a56db':'#f3f4f6',color:period===v?'#fff':'#374151'}}>{l}</button>
    )}
    {period==='custom'&&<>
      <input type="date" value={custStart} onChange={e=>setCustStart(e.target.value)} style={{padding:'5px 8px',borderRadius:7,border:'1px solid #d1d5db',fontSize:11}}/>
      <span style={{fontSize:11,color:'#9ca3af'}}>→</span>
      <input type="date" value={custEnd} onChange={e=>setCustEnd(e.target.value)} style={{padding:'5px 8px',borderRadius:7,border:'1px solid #d1d5db',fontSize:11}}/>
    </>}
    <span style={{fontSize:10.5,color:'#9ca3af',marginLeft:4}}>{start} → {end}</span>
  </div>;

  return <>
    <div style={{display:'flex',gap:2,borderBottom:'2px solid #f3f4f6',marginBottom:14,overflowX:'auto',flexWrap:'nowrap',flexShrink:0}}>
      {tabs.map((t,i)=><TabBtn key={i} i={i} l={t}/>)}
    </div>

    {/* ── DASHBOARD ── */}
    {tab===0&&<>
      <PeriodBar/>
      <div className="kpi-grid" style={{gap:9,display:'grid',gridTemplateColumns:'repeat(5,1fr)'}}>
        <Kpi label="Chiffre d'affaires"    val={fmtDA(totalRevenue)}    col="#1a56db"/>
        <Kpi label="Dépenses totales"      val={fmtDA(totalExpenses)}   col="#dc2626"/>
        <Kpi label="Bénéfice net"          val={fmtDA(netProfit)}       col={netProfit>=0?"#16a34a":"#dc2626"}/>
        <Kpi label="Factures totales"      val={totalInvoicesN}         col="#7e3af2"/>
        <Kpi label="Montant payé"          val={fmtDA(paidAmount)}      col="#16a34a"/>
        <Kpi label="Montant impayé"        val={fmtDA(unpaidAmount)}    col="#dc2626"/>
        <Kpi label="Solde impayé"          val={fmtDA(outstandingBal)}  col="#d97706"/>
        <Kpi label="Nombre de dossiers"    val={numberOfCases}          col="#0891b2"/>
        <Kpi label="Valeur moy. / dossier" val={fmtDA(avgCaseValue)}    col="#0e9f6e"/>
        <Kpi label="Marge bénéficiaire"    val={profitMargin.toFixed(1)+'%'} col="#c2410c"/>
      </div>
      <ExportBar title="" onCSV={exportDashboardCSV} onPrint={printDashboard}/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Revenus vs Dépenses (6 derniers mois)</div>
          <DualBarChartSVG data={trend.map(t=>({label:t.label,v1:t.rev,v2:t.exp}))} l1="Revenus" l2="Dépenses"/>
        </Card>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Tendance du bénéfice mensuel</div>
          <LineChartSVG data={trend.map(t=>({label:t.label,value:t.profit}))} color="#16a34a"/>
        </Card>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Répartition des factures</div>
          <DonutChartSVG data={[{label:'Payées',value:allPaid.length,color:'#16a34a'},{label:'Impayées',value:allUnpaid.length,color:'#dc2626'}]}/>
        </Card>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Top cliniques (par revenu)</div>
          {topClinics.length?<BarChartSVG data={topClinics.map((c,i)=>({...c,color:COLORS[i%COLORS.length]}))} valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>Aucune donnée</div>}
        </Card>
      </div>
    </>}

    {/* ── REVENUE REPORTS ── */}
    {tab===1&&<>
      <PeriodBar/>
      <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
        {Object.entries(revGroupLabels).map(([v,l])=>
          <button key={v} onClick={()=>setRevGroup(v)} style={{padding:'6px 13px',borderRadius:99,border:'1px solid '+(revGroup===v?'#1a56db':'#d1d5db'),background:revGroup===v?'#1a56db':'#fff',color:revGroup===v?'#fff':'#374151',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>Par {l}</button>
        )}
      </div>
      <Card style={{padding:14,marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Revenus par {revGroupLabels[revGroup]}</div>
        {revenueGrouped.length?<BarChartSVG data={revenueGrouped.slice(0,8).map((r,i)=>({...r,color:COLORS[i%COLORS.length]}))} valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>Aucune donnée</div>}
      </Card>
      <Card style={{padding:14}}>
        <ExportBar title={'Détail — '+revenueGrouped.length+' lignes'} onCSV={exportRevenueCSV} onPrint={printRevenue}/>
        <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{[revGroupLabels[revGroup],'Montant'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:h==='Montant'?'right':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
          <tbody>{revenueGrouped.map((r,i)=><tr key={i} style={{background:i%2===0?'#fff':'#fafafa'}}>
            <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6'}}>{r.label}</td>
            <td style={{padding:'8px 11px',fontSize:12,fontWeight:700,color:'#1a56db',textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(r.value)}</td>
          </tr>)}
          {revenueGrouped.length===0&&<tr><td colSpan={2} style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucune donnée</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </>}

    {/* ── EXPENSE REPORTS ── */}
    {tab===2&&<>
      <PeriodBar/>
      <div className="kpi-grid" style={{gap:9,display:'grid',gridTemplateColumns:'repeat(3,1fr)'}}>
        <Kpi label="Dépenses opérationnelles" val={fmtDA(opExpenses)} col="#dc2626"/>
        <Kpi label="Salaires techniciens"     val={fmtDA(salaryExpenses)} col="#d97706"/>
        <Kpi label="Total dépenses"           val={fmtDA(totalExpenses)} col="#991b1b"/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Dépenses par catégorie</div>
          {expCatList.length?<DonutChartSVG data={expCatList.slice(0,7).map((c,i)=>({...c,color:COLORS[i%COLORS.length]}))}/>:<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>Aucune dépense</div>}
        </Card>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Top catégories</div>
          {expCatList.length?<BarChartSVG data={expCatList.slice(0,6).map((c,i)=>({...c,color:COLORS[i%COLORS.length]}))} color="#dc2626" valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>—</div>}
        </Card>
      </div>
      <Card style={{padding:14}}>
        <ExportBar title="Détail par catégorie" onCSV={exportExpensesCSV} onPrint={printExpenses}/>
        <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{['Catégorie','Montant'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:h==='Montant'?'right':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
          <tbody>{expCatList.map((r,i)=><tr key={i} style={{background:i%2===0?'#fff':'#fafafa'}}>
            <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6'}}>{r.label}</td>
            <td style={{padding:'8px 11px',fontSize:12,fontWeight:700,color:'#dc2626',textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(r.value)}</td>
          </tr>)}
          {expCatList.length===0&&<tr><td colSpan={2} style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucune dépense</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </>}

    {/* ── PROFIT ANALYSIS ── */}
    {tab===3&&<>
      <PeriodBar/>
      <div className="kpi-grid" style={{gap:9,display:'grid',gridTemplateColumns:'repeat(5,1fr)'}}>
        <Kpi label="Chiffre d'affaires" val={fmtDA(totalRevenue)}     col="#1a56db"/>
        <Kpi label="Coût matériaux"     val={fmtDA(totalMatCost)}     col="#dc2626"/>
        <Kpi label="Profit brut"        val={fmtDA(grossProfit)}      col="#0891b2"/>
        <Kpi label="Main d'œuvre"       val={fmtDA(totalLabCost)}     col="#d97706"/>
        <Kpi label="Profit net"         val={fmtDA(netProfitCases)}   col={netProfitCases>=0?"#16a34a":"#dc2626"}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:12}}>
        <Card style={{padding:14}}><div style={{fontWeight:700,fontSize:12,marginBottom:8}}>Profit par clinique</div>
          {profitByClinic.length?<BarChartSVG data={profitByClinic.slice(0,6).map((r,i)=>({label:r.label,value:r.profit,color:COLORS[i%COLORS.length]}))} valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:11,padding:16,textAlign:'center'}}>—</div>}
        </Card>
        <Card style={{padding:14}}><div style={{fontWeight:700,fontSize:12,marginBottom:8}}>Profit par dentiste</div>
          {profitByDoctor.length?<BarChartSVG data={profitByDoctor.slice(0,6).map((r,i)=>({label:r.label,value:r.profit,color:COLORS[i%COLORS.length]}))} valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:11,padding:16,textAlign:'center'}}>—</div>}
        </Card>
        <Card style={{padding:14}}><div style={{fontWeight:700,fontSize:12,marginBottom:8}}>Profit par type de travail</div>
          {profitByWorkType.length?<BarChartSVG data={profitByWorkType.slice(0,6).map((r,i)=>({label:r.label,value:r.profit,color:COLORS[i%COLORS.length]}))} valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:11,padding:16,textAlign:'center'}}>—</div>}
        </Card>
      </div>
      <Card style={{padding:14}}>
        <ExportBar title={'Rentabilité par dossier — '+caseFinAll.length+' dossiers'} onCSV={exportProfitCSV} onPrint={printProfit}/>
        <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
          <thead><tr>{['Dossier','Patient','Type','Revenu','Matériaux','M.O.','Profit net'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:['Revenu','Matériaux','M.O.','Profit net'].includes(h)?'right':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>{caseFinAll.slice(0,60).map((f,i)=><tr key={i} style={{background:i%2===0?'#fff':'#fafafa'}}>
            <td style={{padding:'7px 11px',fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:'#1a56db',borderBottom:'1px solid #f3f4f6'}}>{f.c.num}</td>
            <td style={{padding:'7px 11px',fontSize:11.5,fontWeight:600,borderBottom:'1px solid #f3f4f6'}}>{f.c.pf} {f.c.pl}</td>
            <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{restoTypes.find(r=>r.id===f.c.rtId)?.name||'—'}</td>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:600,textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(f.rev)}</td>
            <td style={{padding:'7px 11px',fontSize:11.5,color:'#dc2626',textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(f.mat)}</td>
            <td style={{padding:'7px 11px',fontSize:11.5,color:'#d97706',textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(f.lab)}</td>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:700,textAlign:'right',color:f.net>=0?'#16a34a':'#dc2626',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(f.net)}</td>
          </tr>)}
          {caseFinAll.length===0&&<tr><td colSpan={7} style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun dossier sur cette période</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </>}

    {/* ── ACCOUNTS RECEIVABLE ── */}
    {tab===4&&<>
      <div className="kpi-grid" style={{gap:9,display:'grid',gridTemplateColumns:'repeat(4,1fr)'}}>
        <Kpi label="Factures payées"    val={allPaid.length+' — '+fmtDA(allPaid.reduce((s,i)=>s+i.total,0))} col="#16a34a"/>
        <Kpi label="Factures impayées"  val={allUnpaid.length+' — '+fmtDA(allUnpaid.reduce((s,i)=>s+i.total,0))} col="#dc2626"/>
        <Kpi label="Partiellement payées" val="0 (non applicable)" col="#9ca3af"/>
        <Kpi label="En retard (+30j)"   val={(aging.b60.n+aging.b90.n+aging.b90p.n)+' — '+fmtDA(aging.b60.amt+aging.b90.amt+aging.b90p.amt)} col="#991b1b"/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Balance âgée (Aging Report)</div>
          <BarChartSVG data={[
            {label:'0-30j',value:aging.b30.amt,color:'#16a34a'},
            {label:'31-60j',value:aging.b60.amt,color:'#d97706'},
            {label:'61-90j',value:aging.b90.amt,color:'#ea580c'},
            {label:'90j+',value:aging.b90p.amt,color:'#dc2626'},
          ]} valueFmt={v=>fmtDA(v)}/>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginTop:10,fontSize:10.5,color:'#6b7280'}}>
            <div>0-30j: <b>{aging.b30.n}</b> fact.</div><div>31-60j: <b>{aging.b60.n}</b> fact.</div><div>61-90j: <b>{aging.b90.n}</b> fact.</div><div>90j+: <b>{aging.b90p.n}</b> fact.</div>
          </div>
        </Card>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Solde impayé par clinique</div>
          {arByClinic.length?<BarChartSVG data={arByClinic.slice(0,6).map((r,i)=>({...r,color:COLORS[i%COLORS.length]}))} color="#dc2626" valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#16a34a',fontSize:12,padding:20,textAlign:'center'}}>✅ Aucun impayé</div>}
        </Card>
      </div>
      <Card style={{padding:14}}>
        <ExportBar title={'Factures impayées — '+allUnpaid.length} onCSV={exportARCsv} onPrint={printAR}/>
        <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:560}}>
          <thead><tr>{['N° Facture','Date','Jours','Dentiste','Patient','Montant'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:h==='Montant'||h==='Jours'?'right':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>{allUnpaid.map((i,idx)=>{const c=caseOfInv(i);const d=users.find(u=>u.id===i.docId);const days=daysSince(i.date);return <tr key={i.id} style={{background:idx%2===0?'#fff':'#fafafa'}}>
            <td style={{padding:'7px 11px',fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:'#1a56db',fontWeight:700,borderBottom:'1px solid #f3f4f6'}}>{i.num}</td>
            <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{i.date}</td>
            <td style={{padding:'7px 11px',fontSize:11,textAlign:'right',fontWeight:600,color:days>90?'#dc2626':days>60?'#ea580c':days>30?'#d97706':'#16a34a',borderBottom:'1px solid #f3f4f6'}}>{days}j</td>
            <td style={{padding:'7px 11px',fontSize:11.5,borderBottom:'1px solid #f3f4f6'}}>{d?.name||'—'}</td>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:600,borderBottom:'1px solid #f3f4f6'}}>{c?c.pf+' '+c.pl:'—'}</td>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:700,color:'#dc2626',textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(i.total)}</td>
          </tr>;})}
          {allUnpaid.length===0&&<tr><td colSpan={6} style={{padding:20,textAlign:'center',color:'#16a34a',fontSize:12}}>✅ Aucune facture impayée</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </>}

    {/* ── PAYMENT REPORTS ── */}
    {tab===5&&<>
      <PeriodBar/>
      <div className="kpi-grid" style={{gap:9,display:'grid',gridTemplateColumns:'repeat(4,1fr)'}}>
        <Kpi label="Paiements reçus"       val={fmtDA(dPayments.reduce((s,p)=>s+p.amount,0))} col="#16a34a"/>
        <Kpi label="Nombre de paiements"   val={dPayments.length} col="#1a56db"/>
        <Kpi label="Paiements partiels"    val="Non applicable" col="#9ca3af"/>
        <Kpi label="Solde restant global"  val={fmtDA(outstandingBal)} col="#dc2626"/>
      </div>
      <Card style={{padding:14,marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Répartition par mode de paiement</div>
        {payMethodList.length?<DonutChartSVG data={payMethodList}/>:<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>Aucun paiement sur cette période</div>}
      </Card>
      <Card style={{padding:14}}>
        <ExportBar title={'Historique des paiements — '+dPayments.length} onCSV={exportPaymentsCSV} onPrint={printPayments}/>
        <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}>
          <thead><tr>{['Date','Facture','Dentiste','Mode','Montant'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:h==='Montant'?'right':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
          <tbody>{dPayments.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,80).map((p,i)=>{const d=users.find(u=>u.id===p.docId);return <tr key={i} style={{background:i%2===0?'#fff':'#fafafa'}}>
            <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',fontFamily:"'JetBrains Mono',monospace",borderBottom:'1px solid #f3f4f6'}}>{p.date}</td>
            <td style={{padding:'7px 11px',fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:'#1a56db',fontWeight:600,borderBottom:'1px solid #f3f4f6'}}>{p.invNum}</td>
            <td style={{padding:'7px 11px',fontSize:11.5,borderBottom:'1px solid #f3f4f6'}}>{d?.name||'—'}</td>
            <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{p.method||'—'}</td>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:700,color:'#16a34a',textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(p.amount)}</td>
          </tr>;})}
          {dPayments.length===0&&<tr><td colSpan={5} style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun paiement sur cette période</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </>}

    {/* ── INVENTORY COST REPORTS ── */}
    {tab===6&&<>
      <PeriodBar/>
      <div className="kpi-grid" style={{gap:9,display:'grid',gridTemplateColumns:'repeat(3,1fr)'}}>
        <Kpi label="Valeur totale du stock" val={fmtDA(inventoryValue)} col="#1a56db"/>
        <Kpi label="Alertes stock bas"      val={lowStock.length} col={lowStock.length>0?"#dc2626":"#16a34a"}/>
        <Kpi label="Coût consommé (période)" val={fmtDA(consumptionList.reduce((s,c)=>s+c.cost,0))} col="#d97706"/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Valeur du stock par catégorie</div>
          {matCatList.length?<DonutChartSVG data={matCatList}/>:<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>Aucune donnée</div>}
        </Card>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Consommation matériaux (période)</div>
          {consumptionList.length?<BarChartSVG data={consumptionList.slice(0,6).map((c,i)=>({label:c.label,value:c.cost,color:COLORS[i%COLORS.length]}))} valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>Aucune sortie de stock</div>}
        </Card>
      </div>
      {lowStock.length>0&&<Card style={{padding:14,marginBottom:12,border:'2px solid #fecaca',background:'#fef2f2'}}>
        <div style={{fontWeight:700,fontSize:12.5,marginBottom:8,color:'#991b1b'}}>⚠ Alertes stock bas ({lowStock.length})</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
          {lowStock.map(m=><span key={m.id} style={{fontSize:11.5,padding:'5px 10px',background:'#fff',border:'1px solid #fecaca',borderRadius:8,color:'#991b1b',fontWeight:600}}>{m.name} — {m.stock} {m.unit} (min {m.min})</span>)}
        </div>
      </Card>}
      <Card style={{padding:14}}>
        <ExportBar title={'Valeur du stock par matériau — '+mats.length} onCSV={exportInventoryCSV} onPrint={printInventory}/>
        <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}>
          <thead><tr>{['Matériau','Catégorie','Stock','Coût unitaire','Valeur'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:['Stock','Coût unitaire','Valeur'].includes(h)?'right':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
          <tbody>{mats.sort((a,b)=>(b.stock*b.cost)-(a.stock*a.cost)).map((m,i)=><tr key={m.id} style={{background:i%2===0?'#fff':'#fafafa'}}>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:600,borderBottom:'1px solid #f3f4f6'}}>{m.name}{m.stock<=m.min&&<span style={{marginLeft:6,fontSize:9.5,color:'#dc2626',fontWeight:700}}>⚠ BAS</span>}</td>
            <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{m.cat}</td>
            <td style={{padding:'7px 11px',fontSize:11.5,textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{m.stock} {m.unit}</td>
            <td style={{padding:'7px 11px',fontSize:11.5,textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(m.cost)}</td>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:700,color:'#1a56db',textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(m.stock*m.cost)}</td>
          </tr>)}
          </tbody>
        </table></div>
      </Card>
    </>}

    {/* ── PRODUCTIVITY REPORTS ── */}
    {tab===7&&<>
      <div className="kpi-grid" style={{gap:9,display:'grid',gridTemplateColumns:'repeat(3,1fr)'}}>
        <Kpi label="Dossiers livrés (total)" val={cases.filter(c=>c.status==='DELIVERED').length} col="#16a34a"/>
        <Kpi label="Techniciens actifs"      val={techs.length} col="#1a56db"/>
        <Kpi label="Revenu total généré"     val={fmtDA(prodByTech.reduce((s,p)=>s+p.revenue,0))} col="#7e3af2"/>
      </div>
      <Card style={{padding:14,marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Revenu généré par technicien</div>
        {prodByTech.length?<BarChartSVG data={prodByTech.map((p,i)=>({label:p.tech.name,value:p.revenue,color:COLORS[i%COLORS.length]}))} valueFmt={v=>fmtDA(v)}/>:<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>Aucune donnée</div>}
      </Card>
      <Card style={{padding:14}}>
        <ExportBar title="Statistiques de productivité" onCSV={exportProductivityCSV} onPrint={printProductivity}/>
        <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{['Technicien','Dossiers livrés','En cours','Revenu généré'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:h==='Technicien'?'left':'right',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
          <tbody>{prodByTech.map((p,i)=><tr key={p.tech.id} style={{background:i%2===0?'#fff':'#fafafa'}}>
            <td style={{padding:'8px 11px',fontSize:12,fontWeight:600,borderBottom:'1px solid #f3f4f6'}}>{p.tech.name}</td>
            <td style={{padding:'8px 11px',fontSize:12,textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{p.completed}</td>
            <td style={{padding:'8px 11px',fontSize:12,textAlign:'right',color:'#d97706',borderBottom:'1px solid #f3f4f6'}}>{p.active}</td>
            <td style={{padding:'8px 11px',fontSize:12,fontWeight:700,color:'#1a56db',textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(p.revenue)}</td>
          </tr>)}
          </tbody>
        </table></div>
      </Card>
    </>}

    {/* ── VAT ── */}
    {tab===8&&<>
      <div className="kpi-grid" style={{gap:9}}>
        <Kpi label="TVA collectée (mois)"  val={fmtDA(vatMonth)} col="#1a56db"/>
        <Kpi label="TVA collectée (année)" val={fmtDA(vatYear)}  col="#7e3af2"/>
        <Kpi label="TVA déductible (année)" val={fmtDA(vatExpenses)} col="#dc2626"/>
        <Kpi label="TVA nette à payer"     val={fmtDA(vatNet)} col={vatNet>=0?"#d97706":"#16a34a"}/>
      </div>
      <Alert type="i">Calcul indicatif basé sur un taux de TVA de {(vatRate*100).toFixed(0)}%. Vérifiez toujours avec votre comptable pour la déclaration officielle.</Alert>
    </>}

    {/* ── TREASURY ── */}
    {tab===9&&<>
      <div className="kpi-grid" style={{gap:9}}>
        <Kpi label="Solde de caisse actuel" val={fmtDA(totalCash)} col={totalCash>=0?"#16a34a":"#dc2626"}/>
        <Kpi label="Mouvements enregistrés" val={caisse.length} col="#1a56db"/>
      </div>
      <Card style={{padding:14}}>
        <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Derniers mouvements</div>
        <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{['Date','Type','Description','Montant','Solde'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:h==='Montant'||h==='Solde'?'right':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
          <tbody>{cashFlow.map((c,i)=><tr key={c.id} style={{background:i%2===0?'#fff':'#fafafa'}}>
            <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{c.date}</td>
            <td style={{padding:'7px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6'}}><span style={{fontWeight:600,color:c.type==='IN'?'#16a34a':'#dc2626'}}>{c.type==='IN'?'▲ Entrée':'▼ Sortie'}</span></td>
            <td style={{padding:'7px 11px',fontSize:11.5,borderBottom:'1px solid #f3f4f6'}}>{c.desc}</td>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:600,textAlign:'right',color:c.type==='IN'?'#16a34a':'#dc2626',borderBottom:'1px solid #f3f4f6'}}>{c.type==='IN'?'+':'-'}{fmtDA(c.amount)}</td>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:700,textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(c.balance)}</td>
          </tr>)}
          {cashFlow.length===0&&<tr><td colSpan={5} style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun mouvement</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </>}
  </>;
}


function MyWorkPage({user,cases,setCases,restoTypes,users,showToast}) {
  const myActive=cases
    .filter(c=>{
      if(['DELIVERED','CANCELLED','RECEIVED'].includes(c.status)) return false;
      return c.techId===user.id||c.wf.some(w=>w.s!=='RECEIVED'&&w.tId===user.id&&!w.done);
    })
    .map(c=>{
      const myCurrentStep=c.wf.find(w=>!w.done&&w.s===c.status&&w.tId===user.id);
      const myNextStep=c.wf.find(w=>!w.done&&w.s!=='RECEIVED'&&w.tId===user.id);
      const step=myCurrentStep||myNextStep||{s:c.status,tId:user.id,el:c.teeth?.length||1,done:false};
      return {...c,_myStep:step,_isActive:!!myCurrentStep};
    });

  const history=cases.flatMap(c=>
    c.wf.filter(w=>w.done&&w.s!=='RECEIVED'&&(w.tId===user.id||(c.techId===user.id&&w.tId===null))).map(w=>({...w,caseObj:c}))
  );

  const completeStep=(caseId,stageKey)=>{
    setCases(p=>p.map(c=>{
      if(c.id!==caseId) return c;
      let updated=false;
      const wf=c.wf.map(w=>{
        if(w.s===stageKey&&!w.done&&(w.tId===user.id||w.tId===null||c.techId===user.id)){
          updated=true;
          return{...w,tId:user.id,done:true,end:nt(),dur:30+Math.floor(Math.random()*60)};
        }
        return w;
      });
      if(!updated) wf.push({s:stageKey,tId:user.id,start:nt(),end:nt(),dur:30,done:true,notes:'',el:c.teeth?.length||1});
      const ni=STAGES.indexOf(stageKey)+1;
      const nextStage=ni<STAGES.length?STAGES[ni]:c.status;
      if(nextStage!==c.status&&!wf.find(w=>w.s===nextStage&&!w.done))
        wf.push({s:nextStage,tId:c.techId||user.id,start:nt(),end:null,dur:null,done:false,notes:'',el:c.teeth?.length||1});
      return{...c,status:nextStage,wf};
    }));
    showToast('Etape terminee !');
  };

  const totEl=history.reduce((s,w)=>s+(w.el||1),0);
  const totGain=history.reduce((s,w)=>s+(w.el||1)*(RATE[w.s]||0),0);

  return <>
    <div style={{padding:'10px 14px',background:'#eff6ff',borderRadius:9,border:'1px solid #bfdbfe',marginBottom:4}}>
      <div style={{fontWeight:700,fontSize:13,color:'#1e40af',marginBottom:2}}>{user.spec}</div>
      <div style={{fontSize:12,color:'#1e40af'}}>Etapes : <b>{(user.acc||[]).map(s=>SC[s]?.l||s).join(', ')}</b> | Tarif : <b>{fmt(user.rate||0)}/element</b></div>
    </div>
    <div className="kpi-grid" style={{gap:9}}>
      <Kpi label="En cours"          val={myActive.length}  col="#1a56db"/>
      <Kpi label="Etapes completees" val={history.length}   col="#0e9f6e"/>
      <Kpi label="Elements traites"  val={totEl}            col="#7e3af2"/>
      <Kpi label="Gains estimes"     val={fmt(totGain)}     col="#d97706"/>
    </div>
    {myActive.length===0
      ?<div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:24,textAlign:'center',color:'#6b7280',fontSize:13}}>
        Aucun dossier en attente<br/>
        <span style={{fontSize:11.5,color:'#9ca3af'}}>Un dossier apparaît ici une fois qu'un administrateur vous l'a assigné.</span>
      </div>
      :<div>
        <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:8}}>Dossiers a traiter ({myActive.length})</div>
        {myActive.map(c=><WorkCard key={c.id} c={c} users={users} restoTypes={restoTypes} onComplete={completeStep}/>)}
      </div>
    }
    <Card><CH title="Historique — etapes completees"/>
      {history.length===0
        ?<div style={{padding:'20px',textAlign:'center',color:'#6b7280',fontSize:12}}>Aucune etape completee</div>
        :<div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:480}}>
          <thead><tr>{['Dossier / Patient','Type','Etape','El.','Gain','Duree'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>{history.map((w,i)=>{
            const rt=restoTypes.find(r=>r.id===w.caseObj.rtId);
            const gain=(w.el||1)*(RATE[w.s]||0);
            const cfg=SC[w.s]||{l:w.s,bg:'#f3f4f6',c:'#374151'};
            return <tr key={i} style={{background:i%2===0?'#fff':'#f9fafb'}}>
              <td style={{padding:'9px 11px',borderBottom:'1px solid #f3f4f6'}}><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'#1a56db',fontWeight:600}}>{w.caseObj.num}</div><div style={{fontSize:12,fontWeight:500}}>{w.caseObj.pf} {w.caseObj.pl}</div></td>
              <td style={{padding:'9px 11px',fontSize:11.5,borderBottom:'1px solid #f3f4f6',color:'#374151'}}>{rt?.name||'—'}</td>
              <td style={{padding:'9px 11px',borderBottom:'1px solid #f3f4f6'}}><span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:99,background:cfg.bg,color:cfg.c}}>{cfg.l}</span></td>
              <td style={{padding:'9px 11px',fontSize:13,fontWeight:700,borderBottom:'1px solid #f3f4f6',textAlign:'center'}}>{w.el||1}</td>
              <td style={{padding:'9px 11px',fontSize:13,fontWeight:700,color:'#7e3af2',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{fmt(gain)}</td>
              <td style={{padding:'9px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{w.dur?w.dur+' min':'—'}</td>
            </tr>;
          })}</tbody>
        </table></div>
      }
    </Card>
  </>;
}

function MyPayPage({user,cases,invoices,techPayments}) {
  const byStep=cases.flatMap(c=>
    c.wf.filter(w=>w.done&&w.s!=='RECEIVED'&&w.s!=='READY'&&(w.tId===user.id||(c.techId===user.id&&!w.tId))).map(w=>{
      const caseInv=invoices.find(i=>i.caseIds?.includes(c.id));
      const gain=(w.el||c.teeth?.length||1)*(RATE[w.s]||user.rate||0);
      const stepDate=(w.end&&w.end.length>=7?w.end:null)||(w.start&&w.start.length>=7?w.start:null)||c.due||'';
      return {...w,gain,isPaid:caseInv?.status==='PAID',stepDate,caseObj:c};
    })
  );
  const totalGain=byStep.reduce((s,w)=>s+w.gain,0);
  const paidGain=byStep.filter(w=>w.isPaid).reduce((s,w)=>s+w.gain,0);
  const unpaidGain=byStep.filter(w=>!w.isPaid).reduce((s,w)=>s+w.gain,0);
  // payments received by admin
  const myPayments=(techPayments||[]).filter(p=>p.techId===user.id).sort((a,b)=>b.date.localeCompare(a.date));
  const versed=myPayments.reduce((s,p)=>s+p.amount,0);
  // group by case
  const byCaseMap={};
  byStep.forEach(w=>{if(!byCaseMap[w.caseObj.id])byCaseMap[w.caseObj.id]={c:w.caseObj,steps:[],total:0,isPaid:w.isPaid};byCaseMap[w.caseObj.id].steps.push(w);byCaseMap[w.caseObj.id].total+=w.gain;});
  const byCases=Object.values(byCaseMap).sort((a,b)=>b.total-a.total);
  return <>
    <div className="kpi-grid" style={{gap:9}}>
      <Kpi label="Total gagné"   val={fmt(totalGain)}   col="#1a56db"/>
      <Kpi label="Versé"         val={fmt(versed)}      col="#0e9f6e"/>
      <Kpi label="Dû"            val={fmt(Math.max(0,totalGain-versed))} col="#e02424"/>
      <Kpi label="Etapes"        val={byStep.length}    col="#7e3af2"/>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      <div style={{background:'#f0fdf4',borderRadius:10,padding:'14px 16px',border:'2px solid #bbf7d0'}}>
        <div style={{fontSize:11,color:'#166534',fontWeight:600,marginBottom:4}}>Montant versé</div>
        <div style={{fontSize:22,fontWeight:800,color:'#16a34a'}}>{fmt(versed)}</div>
        <div style={{fontSize:10.5,color:'#166534',marginTop:3}}>{myPayments.length} versement{myPayments.length!==1?'s':''}</div>
      </div>
      <div style={{background:'#fef2f2',borderRadius:10,padding:'14px 16px',border:'2px solid #fecaca'}}>
        <div style={{fontSize:11,color:'#991b1b',fontWeight:600,marginBottom:4}}>Reste à payer</div>
        <div style={{fontSize:22,fontWeight:800,color:'#dc2626'}}>{fmt(Math.max(0,totalGain-versed))}</div>
        <div style={{fontSize:10.5,color:'#991b1b',marginTop:3}}>sur {fmt(totalGain)} total</div>
      </div>
    </div>

    {myPayments.length>0&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',padding:'12px 14px'}}>
      <div style={{fontWeight:700,fontSize:13,color:'#111827',marginBottom:10}}>Historique des versements reçus</div>
      {myPayments.map(p=><div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 12px',marginBottom:6,background:'#f0fdf4',borderRadius:9,border:'1px solid #bbf7d0'}}>
        <div>
          <div style={{fontSize:12,fontWeight:500,color:'#111827'}}>{p.note||'Paiement salaire'}</div>
          <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>Versé le {p.date}</div>
        </div>
        <div style={{fontSize:16,fontWeight:800,color:'#16a34a'}}>{fmt(p.amount)}</div>
      </div>)}
    </div>}

    <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb'}}>
      <div style={{padding:'11px 14px',borderBottom:'1px solid #f3f4f6',background:'#fafafa',borderRadius:'11px 11px 0 0'}}>
        <span style={{fontWeight:700,fontSize:13,color:'#111827'}}>Détail par dossier</span>
      </div>
      {byCases.length===0
        ?<div style={{padding:20,textAlign:'center',color:'#6b7280',fontSize:12}}>Aucun travail enregistré</div>
        :byCases.map(({c,steps,total,isPaid})=><div key={c.id} style={{borderBottom:'1px solid #f3f4f6',padding:'10px 14px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6,flexWrap:'wrap',gap:6}}>
            <div>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'#1a56db',fontWeight:700}}>{c.num}</span>
              <span style={{fontSize:12,fontWeight:600,marginLeft:8,color:'#111827'}}>{c.pf} {c.pl}</span>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:15,fontWeight:800,color:'#7e3af2'}}>{fmt(total)}</div>
              <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:99,background:isPaid?'#f0fdf4':'#fef2f2',color:isPaid?'#16a34a':'#dc2626'}}>{isPaid?'Facture payée':'Facture en attente'}</span>
            </div>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
            {steps.map((w,i)=>{const cfg=SC[w.s]||{l:w.s,bg:'#f3f4f6',c:'#374151'};return <span key={i} style={{fontSize:10.5,padding:'3px 9px',borderRadius:99,background:cfg.bg,color:cfg.c,border:'1px solid '+cfg.c+'33'}}>{cfg.l} ×{w.el||1} = {fmt(w.gain)}</span>;})}
          </div>
        </div>)
      }
    </div>

    <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb'}}>
      <div style={{padding:'11px 14px',borderBottom:'1px solid #f3f4f6',background:'#fafafa',borderRadius:'11px 11px 0 0'}}>
        <span style={{fontWeight:700,fontSize:13,color:'#111827'}}>Historique de toutes les étapes</span>
      </div>
      {byStep.length===0
        ?<div style={{padding:20,textAlign:'center',color:'#6b7280',fontSize:12}}>Aucune étape</div>
        :<div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:420}}>
          <thead><tr>{['Dossier','Étape','Él.','Gain','Date','Statut'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap',background:'#fafafa'}}>{h}</th>)}</tr></thead>
          <tbody>{byStep.map((w,i)=>{const cfg=SC[w.s]||{l:w.s,bg:'#f3f4f6',c:'#374151'};return <tr key={i} style={{background:i%2===0?'#fff':'#f9fafb'}}>
            <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#1a56db',fontWeight:600}}>{w.caseObj.num}</div>
              <div style={{fontSize:11,color:'#374151'}}>{w.caseObj.pf} {w.caseObj.pl}</div>
            </td>
            <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><span style={{fontSize:11,fontWeight:600,padding:'2px 7px',borderRadius:99,background:cfg.bg,color:cfg.c}}>{cfg.l}</span></td>
            <td style={{padding:'8px 11px',fontSize:13,fontWeight:700,borderBottom:'1px solid #f3f4f6',textAlign:'center'}}>{w.el||1}</td>
            <td style={{padding:'8px 11px',fontSize:13,fontWeight:700,color:'#7e3af2',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{fmt(w.gain)}</td>
            <td style={{padding:'8px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{w.stepDate||'—'}</td>
            <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><span style={{fontSize:10.5,fontWeight:600,padding:'2px 7px',borderRadius:99,background:w.isPaid?'#f0fdf4':'#fef2f2',color:w.isPaid?'#16a34a':'#dc2626'}}>{w.isPaid?'Payée':'En attente'}</span></td>
          </tr>;})}
          </tbody>
        </table></div>
      }
    </div>
  </>;
}

function MyOrdersPage({user,cases,users,restoTypes}) {
  const isClinic=user.role==='CLINIC';
  const docIds=scopeDocIds(user,users);
  const myDocs=isClinic?users.filter(u=>u.role==='DOCTOR'&&u.clinicId===user.id):[];
  const [fDoc,setFDoc]=useState('');
  const [fSt,setFSt]=useState('');
  const mc=cases.filter(c=>docIds.includes(c.docId)&&(!fDoc||c.docId===fDoc)&&(!fSt||c.status===fSt));
  return <Card><CH title={isClinic?`Dossiers de la clinique (${mc.length})`:'Mes dossiers — progression en lecture seule'} action={isClinic?<div style={{display:'flex',gap:6}}>
      <select value={fDoc} onChange={e=>setFDoc(e.target.value)} style={{fontSize:11,padding:'5px 9px',borderRadius:6,border:'1px solid #d1d5db',background:'#f9fafb'}}>
        <option value=''>Tous les praticiens</option>
        {myDocs.map(d=><option key={d.id} value={d.id}>{d.name}{d.active===false?' (désactivé)':''}</option>)}
      </select>
      <select value={fSt} onChange={e=>setFSt(e.target.value)} style={{fontSize:11,padding:'5px 9px',borderRadius:6,border:'1px solid #d1d5db',background:'#f9fafb'}}>
        <option value=''>Tous les statuts</option>
        {STAGES.map(s=><option key={s} value={s}>{SC[s]?.l||s}</option>)}
      </select>
    </div>:null}/>
    <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>{mc.map(c=>{
      const idx=STAGES.indexOf(c.status),pct=Math.round((idx/(STAGES.length-1))*100);
      const rt=restoTypes.find(r=>r.id===c.rtId);
      const doc=isClinic?users.find(u=>u.id===c.docId):null;
      return <div key={c.id} style={{border:'1px solid #e5e7eb',borderRadius:8,padding:13}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
          <div><div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'#1a56db',fontWeight:600}}>{c.num}</span><SBadge st={c.status}/><PBadge p={c.pri}/>{c.remake&&<span style={{fontSize:9.5,background:'#fef3c7',color:'#92400e',padding:'2px 6px',borderRadius:99}}>Remake</span>}{doc&&<span style={{fontSize:9.5,background:'#eff6ff',color:'#1e40af',padding:'2px 6px',borderRadius:99,fontWeight:600}}>👤 {doc.name}</span>}</div>
            <div style={{fontSize:13,fontWeight:600}}>Patient : {c.pf} {c.pl}</div>
            <div style={{fontSize:11.5,color:'#6b7280',marginTop:2}}>Type : <b>{rt?.name||'—'}</b> | Teinte : <b>{c.sh||'—'}</b> | Dents : <b>{c.teeth?.join(', ')||'—'}</b> | Échéance : <b>{c.due}</b></div>
          </div>
        </div>
        <div style={{marginBottom:4}}><div style={{display:'flex',justifyContent:'space-between',fontSize:10.5,color:'#6b7280',marginBottom:3}}><span>Progression</span><span>{pct}% — {SC[c.status]?.l}</span></div><Pb pct={pct}/></div>
        <div style={{display:'flex',gap:3,flexWrap:'wrap',marginTop:5}}>{STAGES.slice(0,-1).map((s,i)=>{const done=i<=idx,cfg=SC[s];return <span key={s} style={{fontSize:9,fontWeight:500,padding:'2px 5px',borderRadius:99,background:done?cfg.bg:'#f9fafb',color:done?cfg.c:'#6b7280',border:`1px solid ${done?cfg.d+'44':'#f3f4f6'}`}}>{cfg.l}</span>;})}</div>
        {c.notes&&<div style={{marginTop:7,fontSize:11,color:'#92400e',background:'#fef3c7',borderRadius:6,padding:'4px 8px'}}>📝 {c.notes}</div>}
        <div style={{marginTop:8}}><AttachmentsViewer c={c}/></div>
        {(c.images||[]).length>0&&<div style={{marginTop:6,display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(70px,1fr))',gap:5}}>
          {(c.images||[]).map(img=><div key={img.id} style={{borderRadius:7,overflow:'hidden',border:'1px solid #e5e7eb'}}><img src={img.url} alt={img.name} style={{width:'100%',height:56,objectFit:'cover',display:'block'}}/></div>)}
        </div>}
      </div>;
    })}
    {mc.length===0&&<div style={{textAlign:'center',padding:28,color:'#6b7280',fontSize:12}}>Aucun dossier{fDoc||fSt?' pour ce filtre':''}</div>}
    </div>
  </Card>;
}

function MyInvoicesPage({user,invoices,cases,users,restoTypes,settings,showToast}) {
  const [sel,setSel]=useState(null);
  const isClinic=user.role==='CLINIC';
  const docIds=scopeDocIds(user,users);
  const [fDoc,setFDoc]=useState('');
  const [stmtScope,setStmtScope]=useState('ALL'); // 'UNPAID' | 'PAID' | 'ALL'
  const myDocs=isClinic?users.filter(u=>u.role==='DOCTOR'&&u.clinicId===user.id):[];
  const scoped=invoices.filter(i=>docIds.includes(i.docId)&&(!fDoc||i.docId===fDoc));
  const inv=isClinic?(stmtScope==='ALL'?scoped:scoped.filter(i=>i.status===stmtScope)):scoped;
  const tot=inv.reduce((s,i)=>s+i.total,0),pd=inv.reduce((s,i)=>s+i.paid,0);
  const allUnpaid=scoped.filter(i=>i.status==='UNPAID').reduce((s,i)=>s+i.total,0);
  const allPaid=scoped.filter(i=>i.status==='PAID').reduce((s,i)=>s+i.total,0);
  const sl={PAID:'Payée',UNPAID:'Impayée'};
  const sc={PAID:'#0e9f6e',UNPAID:'#e02424'};
  const printStatement=()=>{
    if(!isClinic){showToast&&showToast('Réservé aux comptes clinique');return;}
    if(inv.length===0){showToast&&showToast('Aucune facture pour ce filtre');return;}
    const html=buildClinicStatementHTML(user,inv,users,cases,restoTypes,settings,stmtScope);
    if(!openPrintWindow(html)) showToast&&showToast('Activez les popups pour imprimer');
  };
  return <>
    <div className="grid-4" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:9}}><Kpi label="Total facturé" val={fmt(tot)} col="#1a56db"/><Kpi label="Payé" val={fmt(pd)} col="#0e9f6e"/><Kpi label="Solde dû" val={fmt(tot-pd)} col="#e02424"/><Kpi label="Factures" val={inv.length} col="#7e3af2"/></div>
    {isClinic&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10}}>
      <div style={{display:'flex',gap:6}}>
        {[{v:'UNPAID',l:'Impayées'},{v:'PAID',l:'Payées'},{v:'ALL',l:'Toutes'}].map(o=>
          <button key={o.v} onClick={()=>setStmtScope(o.v)} style={{padding:'6px 14px',borderRadius:99,border:'1px solid '+(stmtScope===o.v?'#1a56db':'#d1d5db'),background:stmtScope===o.v?'#1a56db':'#fff',color:stmtScope===o.v?'#fff':'#374151',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>{o.l}</button>
        )}
      </div>
      <div style={{fontSize:12,color:'#6b7280'}}>
        <b style={{color:'#dc2626'}}>{fmt(allUnpaid)}</b> impayé · <b style={{color:'#16a34a'}}>{fmt(allPaid)}</b> payé
      </div>
      <button onClick={printStatement} style={{padding:'7px 14px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>🖨 Imprimer le relevé</button>
    </div>}
    <Card><CH title={isClinic?'Factures de la clinique':'Mes factures'} action={isClinic?<select value={fDoc} onChange={e=>setFDoc(e.target.value)} style={{fontSize:11,padding:'5px 9px',borderRadius:6,border:'1px solid #d1d5db',background:'#f9fafb'}}><option value=''>Tous les praticiens</option>{myDocs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>:null}/>
      <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:520}}><thead><tr>{[...(isClinic?['Praticien']:[]),'Facture','Total','Statut','Date','Date paiement',''].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
      <tbody>{inv.map(i=>{const doc=isClinic?users.find(u=>u.id===i.docId):null;return <tr key={i.id}>
        {isClinic&&<td style={{padding:'8px 11px',fontSize:11.5,borderBottom:'1px solid #f3f4f6',color:'#374151'}}>{doc?.name||'—'}</td>}
        <td style={{padding:'8px 11px',fontSize:11,borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{i.num}</td>
        <td style={{padding:'8px 11px',fontSize:12,borderBottom:'1px solid #f3f4f6',fontWeight:600}}>{fmt(i.total)}</td>
        <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}><span style={{fontSize:10.5,fontWeight:500,padding:'2px 7px',borderRadius:99,background:sc[i.status]+'22',color:sc[i.status]}}>{sl[i.status]}</span></td>
        <td style={{padding:'8px 11px',fontSize:10.5,borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace",color:'#6b7280'}}>{i.date}</td>
        <td style={{padding:'8px 11px',fontSize:10.5,borderBottom:'1px solid #f3f4f6',fontFamily:"'JetBrains Mono',monospace",color:i.paidDate?'#0e9f6e':'#9ca3af'}}>{i.paidDate||'—'}</td>
        <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}>
          <div style={{display:'flex',gap:5}}>
            <BtnO sm onClick={()=>setSel(sel===i.id?null:i.id)}>Détail {sel===i.id?'▲':'▼'}</BtnO>
            <BtnP sm onClick={()=>{
              const billedDoc=users.find(u=>u.id===i.docId)||user;
              const html=buildInvoiceHTML(i,cases,[billedDoc],{...(settings||{}),restoTypes});
              if(!openPrintWindow(html)) showToast&&showToast('Activez les popups pour imprimer');
            }}>🖨</BtnP>
          </div>
        </td>
      </tr>;})}
      {inv.length===0&&<tr><td colSpan={isClinic?7:6} style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucune facture pour ce filtre</td></tr>}
      </tbody></table></div>
    </Card>
    {sel&&(()=>{const i=inv.find(x=>x.id===sel);if(!i)return null;const c=cases.find(x=>x.id===i.caseIds[0]);const d=users.find(u=>u.id===i.docId);const clinic=users.find(u=>u.id===d?.clinicId);
      return <Card><CH title={`Facture — ${i.num}`} action={<div style={{display:'flex',gap:6}}>
          <BtnP sm onClick={()=>{const billedDoc=users.find(u=>u.id===i.docId)||user;const html=buildInvoiceHTML(i,cases,[billedDoc],{...(settings||{}),restoTypes});openPrintWindow(html);}}>🖨 Imprimer</BtnP>
          <BtnO sm onClick={()=>setSel(null)}>Fermer ✕</BtnO>
        </div>}/>
        <div style={{padding:'14px 16px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 16px',marginBottom:14}}>
            <div><span style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',fontWeight:700}}>Clinique</span><div style={{fontSize:13,fontWeight:700}}>{clinic?.name||d?.clinique||'—'}</div></div>
            <div><span style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',fontWeight:700}}>Dentiste</span><div style={{fontSize:13,fontWeight:700}}>{d?.name||'—'}</div></div>
            <div><span style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',fontWeight:700}}>Patient</span><div style={{fontSize:13,fontWeight:700}}>{c?c.pf+' '+c.pl:'—'}</div></div>
            <div><span style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',fontWeight:700}}>Description du cas</span><div style={{fontSize:12.5}}>{c?caseDescription(c,restoTypes):'—'}</div></div>
            <div><span style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',fontWeight:700}}>Date de livraison</span><div style={{fontSize:12.5}}>{(c&&c.deliveredDate)||'Non livré'}</div></div>
            <div><span style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',fontWeight:700}}>Date de paiement</span><div style={{fontSize:12.5,color:i.paidDate?'#0e9f6e':'#9ca3af'}}>{i.paidDate||'—'}</div></div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',background:i.status==='PAID'?'#f0fdf4':'#fef2f2',borderRadius:9}}>
            <span style={{fontSize:12.5,fontWeight:600,color:i.status==='PAID'?'#166534':'#991b1b'}}>{i.status==='PAID'?'✅ Payée':'❌ Impayée'}</span>
            <span style={{fontSize:18,fontWeight:800,color:i.status==='PAID'?'#16a34a':'#dc2626'}}>{fmt(i.total)}</span>
          </div>
        </div>
      </Card>;
    })()}
  </>;
}


// ─── WORKFLOW STEPS MANAGEMENT (ADMIN) ───────────────────────────────────────
function WfStepsPage({stageDefs,setStageDefs,users,setUsers,showToast,setModal}) {
  const [editId,setEditId]=useState(null);
  const [editLabel,setEditLabel]=useState('');
  const [editRate,setEditRate]=useState(0);
  const techs=users.filter(u=>u.role==='TECHNICIAN');

  const startEdit=(sd)=>{setEditId(sd.id);setEditLabel(sd.label);setEditRate(sd.rate);};
  const saveEdit=()=>{
    setStageDefs(p=>p.map(s=>s.id===editId?{...s,label:editLabel,rate:editRate}:s));
    setEditId(null);showToast('Étape mise à jour');
  };
  const cancelEdit=()=>setEditId(null);

  const editables=stageDefs.filter(s=>s.editable);
  const fixed=stageDefs.filter(s=>!s.editable);

  return <>
    {/* Pipeline visuel */}
    <Card style={{marginBottom:14}}>
      <CH title="Pipeline de production actuel"/>
      <div style={{padding:'14px 16px',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
        {stageDefs.map((s,i)=><span key={s.id} style={{display:'inline-flex',alignItems:'center',gap:6}}>
          <span style={{background:s.bg,color:s.c,padding:'5px 12px',borderRadius:99,fontSize:11.5,fontWeight:600,border:`1px solid ${s.d}44`}}>{s.label}</span>
          {i<stageDefs.length-1&&<span style={{color:'#d1d5db',fontSize:16}}>→</span>}
        </span>)}
      </div>
    </Card>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
      {/* Étapes éditables */}
      <Card>
        <CH title="Étapes de production — modifier nom & tarif"/>
        <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:400}}>
          <thead><tr>{['Étape','Nom affiché','Tarif / élément','Actions'].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
          <tbody>
            {editables.map(s=><tr key={s.id} style={{background:editId===s.id?'#fafafa':'transparent'}}>
              <td style={{padding:'10px 12px',borderBottom:'1px solid #f9fafb'}}>
                <span style={{background:s.bg,color:s.c,padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:600}}>{s.id}</span>
              </td>
              <td style={{padding:'10px 12px',borderBottom:'1px solid #f9fafb'}}>
                {editId===s.id
                  ?<input value={editLabel} onChange={e=>setEditLabel(e.target.value)} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,padding:'5px 9px',borderRadius:7,border:'1px solid #1a56db',outline:'none',width:130}}/>
                  :<span style={{fontWeight:600,fontSize:13}}>{s.label}</span>}
              </td>
              <td style={{padding:'10px 12px',borderBottom:'1px solid #f9fafb'}}>
                {editId===s.id
                  ?<div style={{display:'flex',alignItems:'center',gap:4}}>
                    <input type="number" value={editRate} onChange={e=>setEditRate(Number(e.target.value))} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,padding:'5px 9px',borderRadius:7,border:'1px solid #1a56db',outline:'none',width:90}} min={0}/>
                    <span style={{fontSize:11,color:'#6b7280'}}>DA/él.</span>
                  </div>
                  :<span style={{fontWeight:600,color:'#7e3af2'}}>{fmt(s.rate)}/él.</span>}
              </td>
              <td style={{padding:'10px 12px',borderBottom:'1px solid #f9fafb'}}>
                {editId===s.id
                  ?<div style={{display:'flex',gap:5}}>
                    <BtnG sm onClick={saveEdit}>✓ Sauver</BtnG>
                    <BtnO sm onClick={cancelEdit}>✕</BtnO>
                  </div>
                  :<BtnO sm onClick={()=>startEdit(s)}>✏ Modifier</BtnO>}
              </td>
            </tr>)}
            <tr><td colSpan={4} style={{padding:'8px 12px',background:'#f9fafb'}}>
              <div style={{fontSize:11,color:'#9ca3af',display:'flex',alignItems:'center',gap:6}}>
                <span>🔒 Étapes fixes (non modifiables) :</span>
                {fixed.map(s=><span key={s.id} style={{background:s.bg,color:s.c,padding:'1px 8px',borderRadius:99,fontSize:10.5,fontWeight:500}}>{s.label}</span>)}
              </div>
            </td></tr>
          </tbody>
        </table></div>
      </Card>

      {/* Assignation tech → étapes */}
      <Card>
        <CH title="Assigner des étapes aux techniciens" action={<BtnP sm onClick={()=>setModal({t:'addEmp'})}>+ Technicien</BtnP>}/>
        <div style={{padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
          {techs.map(u=><div key={u.id} style={{border:'1px solid #f3f4f6',borderRadius:9,padding:12,background:'#fafafa'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:9}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}><Av u={u} sz={30}/>
                <div><div style={{fontWeight:600,fontSize:12.5}}>{u.name}</div><div style={{fontSize:10.5,color:'#6b7280'}}>{u.spec} · {fmt(u.rate||0)}/él.</div></div>
              </div>
              <BtnO sm onClick={()=>setModal({t:'editEmp',uid:u.id})}>✏ Modifier</BtnO>
            </div>
            <div style={{fontSize:10.5,color:'#6b7280',marginBottom:5}}>Étapes assignées :</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {(u.acc||[]).length===0
                ?<span style={{fontSize:11,color:'#e02424',fontStyle:'italic'}}>⚠ Aucune étape assignée</span>
                :(u.acc||[]).map(sid=>{const sd=stageDefs.find(x=>x.id===sid)||{id:sid,label:sid,bg:'#f3f4f6',c:'#6b7280'};return <span key={sid} style={{background:sd.bg,color:sd.c,padding:'3px 10px',borderRadius:99,fontSize:11,fontWeight:500,border:`1px solid ${sd.d||'#e5e7eb'}44`}}>{sd.label}</span>;})}
            </div>
          </div>)}
          {techs.length===0&&<div style={{textAlign:'center',padding:20,color:'#9ca3af',fontSize:12}}>Aucun technicien — ajoutez-en un</div>}
        </div>
      </Card>
    </div>
  </>;
}
// ─── DOCTOR NEW CASE PAGE ─────────────────────────────────────────────────────
function DocNewCasePage({user,users,cases,setCases,invoices,setInvoices,restoTypes,showToast,nav}) {
  const isClinic=user.role==='CLINIC';
  const myDocs=isClinic?users.filter(u=>u.role==='DOCTOR'&&u.clinicId===user.id&&u.active!==false):[];
  const [docId,setDocId]=useState(isClinic?(myDocs[0]?.id||''):user.id);
  useEffect(()=>{
    if(isClinic&&myDocs.length>0&&!myDocs.some(d=>d.id===docId)){setDocId(myDocs[0].id);}
  },[myDocs.map(d=>d.id).join(','),isClinic]);
  const [pf,setPf]=useState(''); const [pl,setPl]=useState('');
  const [rtId,setRtId]=useState(restoTypes[0]?.id||'');
  const [sh,setSh]=useState('A2'); const [pri,setPri]=useState('NORMAL');
  const [due,setDue]=useState(''); const [notes,setNotes]=useState('');
  const [teeth,setTeeth]=useState([]);
  const [attachments,setAttachments]=useState([]);
  const [shadePhoto,setShadePhoto]=useState(null);
  const tog=t=>setTeeth(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t]);
  const rt=restoTypes.find(r=>r.id===rtId);

  const submit=()=>{
    if(isClinic&&!docId){showToast('Sélectionnez le praticien concerné');return;}
    if(!pf||!pl||!due){showToast('Remplissez : prénom, nom et échéance');return;}
    const num=`LAB-${new Date().getFullYear()}-${String(cases.length+48).padStart(4,'0')}`;
    const allSt2=['RECEIVED','DESIGN','MILLING','SINTERING','FINISHING','MAQUILLAGE','QC','READY','DELIVERED'];
    const fullWf2=allSt2.map(s=>({s,tId:null,start:s==='RECEIVED'?nt():null,end:null,dur:null,done:false,notes:s==='RECEIVED'?'Commande dentiste':'',el:teeth.length||1}));
    const newCaseId='c'+uid();
    const finalDocId=isClinic?docId:user.id;
    setCases(p=>[{id:newCaseId,num,pf,pl,docId:finalDocId,rtId,teeth,sh,pri,status:'RECEIVED',due,techId:null,remake:false,notes,
      attachments,shadePhoto,
      materialCost:0,laborCost:0,deliveredDate:null,deliveredBy:null,comments:[],images:[],
      wf:fullWf2
    },...p]);
    setInvoices(p=>[...p,makeInvoiceForCase({id:newCaseId,docId:finalDocId,rtId,teeth,sh},restoTypes,invoices.length+10)]);
    showToast(`Commande ${num} envoyée au laboratoire — facture générée automatiquement`);
    nav('myorders');
  };

  return <>
    <Alert type="i">Créez une nouvelle commande — le laboratoire assignera un technicien et lancera la production.</Alert>
    {isClinic&&<Card style={{marginBottom:14,border:'2px solid #1a56db22'}}>
      <div style={{padding:'14px 16px'}}>
        <label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:8}}>Praticien concerné *</label>
        {myDocs.length>0
          ?<div style={{display:'flex',flexDirection:'column',gap:7}}>
            {myDocs.map(d=>{
              const sel=docId===d.id;
              return <div key={d.id} onClick={()=>setDocId(d.id)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')setDocId(d.id);}}
                style={{display:'flex',alignItems:'center',gap:10,padding:'11px 13px',borderRadius:9,cursor:'pointer',userSelect:'none',
                  border:sel?'2px solid #1a56db':'1px solid #e5e7eb',background:sel?'#eff6ff':'#fff',transition:'all .12s'}}>
                <div style={{width:18,height:18,borderRadius:99,flexShrink:0,border:'2px solid '+(sel?'#1a56db':'#d1d5db'),display:'flex',alignItems:'center',justifyContent:'center',background:'#fff'}}>
                  {sel&&<div style={{width:9,height:9,borderRadius:99,background:'#1a56db'}}/>}
                </div>
                <Av u={d} sz={26}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13,color:'#111827'}}>{d.name}</div>
                  {d.spec&&<div style={{fontSize:10.5,color:'#6b7280'}}>{d.spec}</div>}
                </div>
                {sel&&<span style={{fontSize:16,color:'#1a56db'}}>✓</span>}
              </div>;
            })}
          </div>
          :<p style={{fontSize:11.5,color:'#d97706'}}>⚠ Aucun praticien actif rattaché à votre clinique. Allez dans "Mes praticiens" pour en ajouter un.</p>}
      </div>
    </Card>}
    <div style={{display:'grid',gridTemplateColumns:'3fr 2fr',gap:14}}>
      <Card>
        <CH title="Informations du patient & travaux"/>
        <div style={{padding:'14px 16px'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:9}}>
            <Inp label="Prénom patient *" value={pf} onChange={e=>setPf(e.target.value)} placeholder="Mohammed"/>
            <Inp label="Nom *" value={pl} onChange={e=>setPl(e.target.value)} placeholder="Benali"/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:9}}>
            <Sel label="Type de restauration *" value={rtId} onChange={e=>setRtId(e.target.value)} options={restoTypes.map(r=>({v:r.id,l:r.name+' — '+fmt(r.price)}))}/>
            <Sel label="Teinte" value={sh} onChange={e=>setSh(e.target.value)} options={['A1','A2','A3','A3.5','A4','B1','B2','BL1','BL2','BL3','—']}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:9}}>
            <Sel label="Priorité" value={pri} onChange={e=>setPri(e.target.value)} options={[{v:'NORMAL',l:'Normal'},{v:'HIGH',l:'Haut'},{v:'URGENT',l:'🔴 Urgent'},{v:'LOW',l:'Bas'}]}/>
            <Inp label="Échéance souhaitée *" type="date" value={due} onChange={e=>setDue(e.target.value)}/>
          </div>
          <Inp label="Instructions spéciales / notes" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Précisions, implant, matériaux particuliers..."/>
          <div style={{marginBottom:9}}>
            <label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:5}}>
              Dents concernées {teeth.length>0&&<span style={{color:'#1a56db',fontWeight:600}}>— {teeth.join(', ')} ({teeth.length} dents)</span>}
            </label>
            <ToothChart selected={teeth} onToggle={tog}/>
          </div>
        </div>
      </Card>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        <Card>
          <CH title="Fichiers numériques"/>
          <div style={{padding:'14px 16px'}}>
            <FileAttachSection attachments={attachments} setAttachments={setAttachments} shadePhoto={shadePhoto} setShadePhoto={setShadePhoto} showToast={showToast}/>
          </div>
        </Card>
        <Card>
          <CH title="Résumé de la commande"/>
          <div style={{padding:'12px 14px'}}>
            {[['Patient',pf&&pl?`${pf} ${pl}`:'—'],['Type restauration',rt?.name||'—'],['Teinte',sh],['Dents',teeth.length>0?`${teeth.join(', ')} (${teeth.length})`:'—'],['Échéance',due||'—'],['Prix estimé',rt?fmt(rt.price):'—'],['Fichiers joints',attachments.length>0?attachments.length+' fichier(s)':'Aucun'],['Photo teinte',shadePhoto?.name||'Non fournie']].map(([l,v])=><div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #f9fafb',fontSize:12}}><span style={{color:'#6b7280'}}>{l}</span><span style={{fontWeight:500,maxWidth:'55%',textAlign:'right',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v}</span></div>)}
          </div>
        </Card>
        <BtnP onClick={submit} style={{width:'100%',justifyContent:'center',padding:11,fontSize:13}}>✓ Envoyer la commande au laboratoire</BtnP>
      </div>
    </div>
  </>;
}

// ─── MODAL ROUTER ─────────────────────────────────────────────────────────────
function archiveMeta(entry,users) {
  const d=entry.data||{};
  let clinicName='—',doctorName='—',patientName='—';
  if(entry.category==='cases'||entry.category==='invoices'){
    const doc=users.find(u=>u.id===d.docId);
    doctorName=doc?doc.name:'—';
    const clinic=doc?users.find(u=>u.id===doc.clinicId):null;
    clinicName=clinic?clinic.name:(doc?.clinique||'—');
    patientName=entry.category==='cases'?(d.pf+' '+d.pl):'—';
  } else if(entry.category==='clinics'){
    clinicName=d.name;
  } else if(entry.category==='dentists'){
    doctorName=d.name;
    const clinic=users.find(u=>u.id===d.clinicId);
    clinicName=clinic?clinic.name:(d.clinique||'—');
  }
  return {clinicName,doctorName,patientName};
}

function ArchivePage({user,users,setUsers,cases,setCases,invoices,setInvoices,supps,setSupps,expenses,setExpenses,stockMovements,setStockMovements,archives,setArchives,auditLog,setAuditLog,archivePolicy,setArchivePolicy,settings,showToast}) {
  const ctx={user,setArchives,setAuditLog,setCases,setInvoices,setUsers,setSupps,setExpenses,setStockMovements};
  const [tab,setTab]=useState(0);
  const tabsL=['📊 Tableau de bord','🔍 Parcourir','📜 Journal d\'audit','⚙️ Paramètres'];
  const today=tod(); const curM=today.slice(0,7);
  const COLORS=['#1a56db','#16a34a','#d97706','#dc2626','#7c3aed','#0891b2','#c2410c','#65a30d'];

  const activeArchives=archives.filter(a=>a.status==='ARCHIVED');

  // ── Dashboard ──
  const totalArchived=activeArchives.length;
  const storageUsage=activeArchives.reduce((s,a)=>s+(a.fileSize||0),0);
  const archivedToday=activeArchives.filter(a=>a.archiveDate===today).length;
  const archivedThisMonth=activeArchives.filter(a=>a.archiveDate?.startsWith(curM)).length;
  const byCategory=ARCHIVE_CATS.map((c,i)=>({label:c.l,value:activeArchives.filter(a=>a.category===c.v).length,color:COLORS[i%COLORS.length]})).filter(c=>c.value>0);
  const recentItems=[...activeArchives].sort((a,b)=>(b.archiveDate||'').localeCompare(a.archiveDate||'')).slice(0,8);
  const restoredCount=archives.filter(a=>a.status==='RESTORED').length;
  const deletedCount=auditLog.filter(l=>l.action==='PERMANENT_DELETE').length;

  // ── Browse ──
  const [fCat,setFCat]=useState('');
  const [fClinic,setFClinic]=useState('');
  const [fDoctor,setFDoctor]=useState('');
  const [fDateStart,setFDateStart]=useState('');
  const [fDateEnd,setFDateEnd]=useState('');
  const [fSearch,setFSearch]=useState('');
  const [sortBy,setSortBy]=useState('date_desc');
  const [page,setPage]=useState(1);
  const [selIds,setSelIds]=useState([]);
  const [previewEntry,setPreviewEntry]=useState(null);
  const PAGE_SIZE=15;

  const clinics=users.filter(u=>u.role==='CLINIC');
  const doctors=users.filter(u=>u.role==='DOCTOR');

  let filtered=activeArchives.filter(a=>{
    const meta=archiveMeta(a,users);
    if(fCat&&a.category!==fCat)return false;
    if(fClinic&&meta.clinicName!==clinics.find(c=>c.id===fClinic)?.name)return false;
    if(fDoctor&&meta.doctorName!==doctors.find(d=>d.id===fDoctor)?.name)return false;
    if(fDateStart&&a.archiveDate<fDateStart)return false;
    if(fDateEnd&&a.archiveDate>fDateEnd)return false;
    if(fSearch){
      const label=archiveRecordLabel(a.category,a.data).toLowerCase();
      const q=fSearch.toLowerCase();
      if(!label.includes(q)&&!(a.archiveReason||'').toLowerCase().includes(q)&&!(a.notes||'').toLowerCase().includes(q))return false;
    }
    return true;
  });
  filtered.sort((a,b)=>{
    if(sortBy==='date_desc')return (b.archiveDate||'').localeCompare(a.archiveDate||'');
    if(sortBy==='date_asc')return (a.archiveDate||'').localeCompare(b.archiveDate||'');
    if(sortBy==='size_desc')return (b.fileSize||0)-(a.fileSize||0);
    if(sortBy==='category')return a.category.localeCompare(b.category);
    return 0;
  });
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
  const pageItems=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);

  const resetFilters=()=>{setFCat('');setFClinic('');setFDoctor('');setFDateStart('');setFDateEnd('');setFSearch('');setPage(1);};
  const toggleSel=(id)=>setSelIds(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const selectAllVisible=()=>setSelIds(pageItems.map(a=>a.id));
  const clearSel=()=>setSelIds([]);

  const doRestore=(entry)=>{
    if(!window.confirm(`Restaurer "${archiveRecordLabel(entry.category,entry.data)}" ? Il redeviendra actif dans le système.`))return;
    restoreArchiveEntry(ctx,entry);
    showToast('Élément restauré ✓');
  };
  const doBulkRestore=()=>{
    if(!selIds.length){showToast('Sélectionnez au moins un élément');return;}
    if(!window.confirm(`Restaurer ${selIds.length} élément(s) ?`))return;
    selIds.forEach(id=>{const entry=archives.find(a=>a.id===id);if(entry)restoreArchiveEntry(ctx,entry);});
    showToast(selIds.length+' élément(s) restauré(s) ✓');
    setSelIds([]);
  };
  const [confirmDelete,setConfirmDelete]=useState(null); // {ids:[...]} for multi-step confirm
  const doPermanentDelete=()=>{
    confirmDelete.ids.forEach(id=>{const entry=archives.find(a=>a.id===id);if(entry)permanentlyDeleteArchiveEntry(ctx,entry);});
    showToast(confirmDelete.ids.length+' élément(s) supprimé(s) définitivement');
    setConfirmDelete(null);
    setSelIds([]);
  };

  const downloadEntryFile=(entry)=>{
    const d=entry.data||{};
    const files=[];
    if(d.shadePhoto)files.push(d.shadePhoto);
    if(d.attachments&&Array.isArray(d.attachments))files.push(...d.attachments);
    if(!files.length){showToast('Aucun fichier joint à télécharger');return;}
    files.forEach(f=>{const a=document.createElement('a');a.href=f.dataUrl;a.download=f.name;document.body.appendChild(a);a.click();document.body.removeChild(a);});
  };
  const printEntry=(entry)=>{
    const meta=archiveMeta(entry,users);
    const inner=reportTableHTML(
      [{label:'Champ'},{label:'Valeur'}],
      [['Archive ID',entry.id],['ID original',entry.recordId],['Type',entry.recordType],
       ['Date archivage',entry.archiveDate],['Archivé par',entry.archivedBy],['Raison',entry.archiveReason],
       ['Clinique',meta.clinicName],['Dentiste',meta.doctorName],['Patient',meta.patientName],
       ['Taille',fmtBytes(entry.fileSize)],['Statut',entry.status]]
    );
    printReport(settings,'Fiche archive — '+archiveRecordLabel(entry.category,entry.data),'',inner);
  };

  const exportCSV=()=>downloadCSV('archives_export.csv',
    ['Archive ID','ID original','Type','Libellé','Date archivage','Archivé par','Raison','Taille','Statut'],
    filtered.map(a=>[a.id,a.recordId,a.recordType,archiveRecordLabel(a.category,a.data),a.archiveDate,a.archivedBy,a.archiveReason,a.fileSize,a.status]));
  const printList=()=>{
    const inner=reportTableHTML(
      [{label:'Type'},{label:'Libellé'},{label:'Date'},{label:'Archivé par'},{label:'Raison'},{label:'Taille',align:'right'}],
      filtered.map(a=>[ARCHIVE_CAT_ICON[a.category]+' '+a.recordType,archiveRecordLabel(a.category,a.data),a.archiveDate,a.archivedBy,a.archiveReason,fmtBytes(a.fileSize)])
    );
    printReport(settings,'Registre des archives',filtered.length+' élément(s)',inner,{landscape:true});
  };

  // ── Auto-archive ──
  const eligibleForAutoArchive=cases.filter(c=>{
    if(c.status!=='DELIVERED'||!c.deliveredDate)return false;
    const months=(new Date(today)-new Date(c.deliveredDate))/(1000*60*60*24*30);
    return months>=archivePolicy.autoArchiveMonths;
  });
  const runAutoArchive=()=>{
    if(eligibleForAutoArchive.length===0){showToast('Aucun dossier éligible pour l\'archivage automatique');return;}
    if(!window.confirm(`Archiver automatiquement ${eligibleForAutoArchive.length} dossier(s) livré(s) il y a plus de ${archivePolicy.autoArchiveMonths} mois ?`))return;
    eligibleForAutoArchive.forEach(c=>archiveRecord(ctx,'cases',c,'Archivage automatique — politique de rétention ('+archivePolicy.autoArchiveMonths+' mois)'));
    setCases(p=>p.filter(c=>!eligibleForAutoArchive.some(e=>e.id===c.id)));
    showToast(eligibleForAutoArchive.length+' dossier(s) archivé(s) automatiquement ✓');
  };

  const TabBtn=({i,l})=><button onClick={()=>setTab(i)} style={{padding:'6px 14px',border:'none',background:'none',cursor:'pointer',fontSize:12,fontWeight:tab===i?700:400,color:tab===i?'#1a56db':'#6b7280',borderBottom:tab===i?'2px solid #1a56db':'2px solid transparent',whiteSpace:'nowrap',marginBottom:-2}}>{l}</button>;

  return <>
    <div style={{display:'flex',gap:2,borderBottom:'2px solid #f3f4f6',marginBottom:14,overflowX:'auto',flexWrap:'nowrap',flexShrink:0}}>
      {tabsL.map((t,i)=><TabBtn key={i} i={i} l={t}/>)}
    </div>

    {/* ── DASHBOARD ── */}
    {tab===0&&<>
      <div className="kpi-grid" style={{gap:9,display:'grid',gridTemplateColumns:'repeat(4,1fr)'}}>
        <Kpi label="Total archivé"        val={totalArchived} col="#1a56db"/>
        <Kpi label="Espace utilisé"       val={fmtBytes(storageUsage)} col="#7c3aed"/>
        <Kpi label="Archivé aujourd'hui"  val={archivedToday} col="#0891b2"/>
        <Kpi label="Archivé ce mois"      val={archivedThisMonth} col="#d97706"/>
        <Kpi label="Éléments restaurés"   val={restoredCount} col="#16a34a"/>
        <Kpi label="Supprimés définitivement" val={deletedCount} col="#dc2626"/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:12}}>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Archives par catégorie</div>
          {byCategory.length?<DonutChartSVG data={byCategory}/>:<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>Aucune archive</div>}
        </Card>
        <Card style={{padding:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Éléments récemment archivés</div>
          <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:220,overflowY:'auto'}}>
            {recentItems.map(a=><div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 9px',background:'#f9fafb',borderRadius:7,fontSize:11.5}}>
              <span>{ARCHIVE_CAT_ICON[a.category]} {archiveRecordLabel(a.category,a.data)}</span>
              <span style={{color:'#9ca3af',fontSize:10.5}}>{a.archiveDate}</span>
            </div>)}
            {recentItems.length===0&&<div style={{color:'#9ca3af',fontSize:12,padding:20,textAlign:'center'}}>Aucune archive</div>}
          </div>
        </Card>
      </div>
    </>}

    {/* ── BROWSE ── */}
    {tab===1&&<>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:10}}>
        <input value={fSearch} onChange={e=>{setFSearch(e.target.value);setPage(1);}} placeholder="Recherche globale..." style={{padding:'7px 11px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12,flex:'1 1 180px'}}/>
        <select value={fCat} onChange={e=>{setFCat(e.target.value);setPage(1);}} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
          <option value=''>Toutes catégories</option>
          {ARCHIVE_CATS.map(c=><option key={c.v} value={c.v}>{c.icon} {c.l}</option>)}
        </select>
        <select value={fClinic} onChange={e=>{setFClinic(e.target.value);setPage(1);}} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
          <option value=''>Toutes cliniques</option>
          {clinics.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={fDoctor} onChange={e=>{setFDoctor(e.target.value);setPage(1);}} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
          <option value=''>Tous dentistes</option>
          {doctors.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input type="date" value={fDateStart} onChange={e=>{setFDateStart(e.target.value);setPage(1);}} style={{padding:'6px 9px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12}}/>
        <span style={{fontSize:11,color:'#9ca3af'}}>→</span>
        <input type="date" value={fDateEnd} onChange={e=>{setFDateEnd(e.target.value);setPage(1);}} style={{padding:'6px 9px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12}}/>
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{padding:'7px 10px',borderRadius:8,border:'1px solid #d1d5db',fontSize:12,background:'#fff'}}>
          <option value='date_desc'>Plus récent</option>
          <option value='date_asc'>Plus ancien</option>
          <option value='size_desc'>Taille</option>
          <option value='category'>Catégorie</option>
        </select>
        {(fCat||fClinic||fDoctor||fDateStart||fDateEnd||fSearch)&&<button onClick={resetFilters} style={{padding:'7px 12px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:11.5,cursor:'pointer'}}>✕ Filtres</button>}
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
        <div style={{fontSize:12,color:'#6b7280'}}>{filtered.length} résultat{filtered.length>1?'s':''} · {selIds.length} sélectionné{selIds.length>1?'s':''}</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button onClick={selectAllVisible} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11,cursor:'pointer'}}>Tout sélect. (page)</button>
          <button onClick={clearSel} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11,cursor:'pointer'}}>Aucune</button>
          <button onClick={doBulkRestore} disabled={!selIds.length} style={{padding:'6px 12px',borderRadius:7,border:'none',background:selIds.length?'#16a34a':'#d1d5db',color:'#fff',fontSize:11,fontWeight:600,cursor:selIds.length?'pointer':'not-allowed'}}>♻ Restaurer</button>
          <button onClick={()=>selIds.length&&setConfirmDelete({ids:selIds})} disabled={!selIds.length} style={{padding:'6px 12px',borderRadius:7,border:'none',background:selIds.length?'#dc2626':'#d1d5db',color:'#fff',fontSize:11,fontWeight:600,cursor:selIds.length?'pointer':'not-allowed'}}>🗑 Suppr. définitive</button>
          <button onClick={exportCSV} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>⬇ CSV/Excel</button>
          <button onClick={printList} style={{padding:'6px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>🖨 PDF/Imprimer</button>
        </div>
      </div>
      <Card>
        <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:820}}>
          <thead><tr>{['✓','Type','Libellé','Date archivage','Archivé par','Raison','Taille',''].map(h=><th key={h} style={{padding:'8px 11px',textAlign:'left',fontSize:9.5,fontWeight:500,color:'#6b7280',textTransform:'uppercase',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
          <tbody>{pageItems.map((a,idx)=>{
            const isSel=selIds.includes(a.id);
            return <tr key={a.id} style={{background:isSel?'#eff6ff':idx%2===0?'#fff':'#fafafa'}}>
              <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}>
                <div onClick={()=>toggleSel(a.id)} style={{width:16,height:16,borderRadius:4,border:'2px solid '+(isSel?'#1a56db':'#d1d5db'),background:isSel?'#1a56db':'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>{isSel&&<span style={{color:'#fff',fontSize:10}}>✓</span>}</div>
              </td>
              <td style={{padding:'8px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{ARCHIVE_CAT_ICON[a.category]} {a.recordType}</td>
              <td style={{padding:'8px 11px',fontSize:12,fontWeight:600,borderBottom:'1px solid #f3f4f6'}}>{archiveRecordLabel(a.category,a.data)}</td>
              <td style={{padding:'8px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{a.archiveDate}</td>
              <td style={{padding:'8px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{a.archivedBy}</td>
              <td style={{padding:'8px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{a.archiveReason}</td>
              <td style={{padding:'8px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{fmtBytes(a.fileSize)}</td>
              <td style={{padding:'8px 11px',borderBottom:'1px solid #f3f4f6'}}>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={()=>setPreviewEntry(a)} title="Aperçu" style={{border:'none',background:'none',cursor:'pointer',fontSize:13}}>👁</button>
                  <button onClick={()=>downloadEntryFile(a)} title="Télécharger fichiers joints" style={{border:'none',background:'none',cursor:'pointer',fontSize:13}}>⬇</button>
                  <button onClick={()=>printEntry(a)} title="Imprimer" style={{border:'none',background:'none',cursor:'pointer',fontSize:13}}>🖨</button>
                  <button onClick={()=>doRestore(a)} title="Restaurer" style={{border:'none',background:'none',cursor:'pointer',fontSize:13,color:'#16a34a'}}>♻</button>
                  <button onClick={()=>setConfirmDelete({ids:[a.id]})} title="Supprimer définitivement" style={{border:'none',background:'none',cursor:'pointer',fontSize:13,color:'#dc2626'}}>🗑</button>
                </div>
              </td>
            </tr>;
          })}
          {pageItems.length===0&&<tr><td colSpan={8} style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun élément archivé pour ce filtre</td></tr>}
          </tbody>
        </table></div>
        {totalPages>1&&<div style={{display:'flex',justifyContent:'center',gap:6,padding:'12px',borderTop:'1px solid #f3f4f6'}}>
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{padding:'5px 11px',borderRadius:6,border:'1px solid #d1d5db',background:'#fff',fontSize:11.5,cursor:page===1?'not-allowed':'pointer',opacity:page===1?0.5:1}}>← Précédent</button>
          <span style={{fontSize:11.5,color:'#6b7280',padding:'5px 8px'}}>Page {page} / {totalPages}</span>
          <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages} style={{padding:'5px 11px',borderRadius:6,border:'1px solid #d1d5db',background:'#fff',fontSize:11.5,cursor:page===totalPages?'not-allowed':'pointer',opacity:page===totalPages?0.5:1}}>Suivant →</button>
        </div>}
      </Card>
    </>}

    {/* ── AUDIT LOG ── */}
    {tab===2&&<Card>
      <CH title={'Journal d\'audit — '+auditLog.length+' entrée(s)'}/>
      <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr>{['Date','Action','Catégorie','Élément','Utilisateur'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
        <tbody>{auditLog.slice(0,150).map((l,i)=>{
          const actionLabel={ARCHIVE:'📥 Archivé',RESTORE:'♻ Restauré',PERMANENT_DELETE:'🗑 Supprimé définitivement'}[l.action]||l.action;
          const actionColor={ARCHIVE:'#6b7280',RESTORE:'#16a34a',PERMANENT_DELETE:'#dc2626'}[l.action]||'#6b7280';
          return <tr key={l.id} style={{background:i%2===0?'#fff':'#fafafa'}}>
            <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{new Date(l.date).toLocaleString('fr-DZ')}</td>
            <td style={{padding:'7px 11px',fontSize:11.5,fontWeight:600,color:actionColor,borderBottom:'1px solid #f3f4f6'}}>{actionLabel}</td>
            <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{ARCHIVE_CAT_ICON[l.category]} {ARCHIVE_CAT_LABEL[l.category]}</td>
            <td style={{padding:'7px 11px',fontSize:12,fontWeight:500,borderBottom:'1px solid #f3f4f6'}}>{l.recordLabel}</td>
            <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{l.user}</td>
          </tr>;
        })}
        {auditLog.length===0&&<tr><td colSpan={5} style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucune activité enregistrée</td></tr>}
        </tbody>
      </table></div>
    </Card>}

    {/* ── SETTINGS ── */}
    {tab===3&&<>
      <Card style={{padding:16,marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Politique d'archivage automatique</div>
        <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:12,cursor:'pointer'}}>
          <input type="checkbox" checked={archivePolicy.enabled} onChange={e=>setArchivePolicy(p=>({...p,enabled:e.target.checked}))}/>
          <span style={{fontSize:12.5}}>Activer l'archivage automatique des dossiers livrés</span>
        </label>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
          <span style={{fontSize:12.5,color:'#374151'}}>Archiver automatiquement les dossiers livrés depuis plus de</span>
          <input type="number" value={archivePolicy.autoArchiveMonths} onChange={e=>setArchivePolicy(p=>({...p,autoArchiveMonths:Number(e.target.value)}))} style={{width:70,padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12}}/>
          <span style={{fontSize:12.5,color:'#374151'}}>mois</span>
        </div>
        <Alert type="i">{eligibleForAutoArchive.length} dossier(s) sont actuellement éligibles à l'archivage automatique (livrés il y a plus de {archivePolicy.autoArchiveMonths} mois).</Alert>
        <BtnP onClick={runAutoArchive} style={{marginTop:10}}>🗄 Archiver maintenant ({eligibleForAutoArchive.length})</BtnP>
      </Card>
      <Card style={{padding:16}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Suggestions de nettoyage</div>
        {archives.filter(a=>a.status==='ARCHIVED'&&(new Date(today)-new Date(a.archiveDate))/(1000*60*60*24*365)>2).length>0
          ?<Alert type="w">{archives.filter(a=>a.status==='ARCHIVED'&&(new Date(today)-new Date(a.archiveDate))/(1000*60*60*24*365)>2).length} élément(s) archivé(s) depuis plus de 2 ans — envisagez une suppression définitive pour libérer de l'espace ({fmtBytes(archives.filter(a=>a.status==='ARCHIVED'&&(new Date(today)-new Date(a.archiveDate))/(1000*60*60*24*365)>2).reduce((s,a)=>s+(a.fileSize||0),0))}).</Alert>
          :<Alert type="i">Aucune suggestion de nettoyage pour le moment — les archives sont toutes relativement récentes.</Alert>}
      </Card>
    </>}

    {/* ── PREVIEW MODAL ── */}
    {previewEntry&&<div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300,padding:16}} onClick={e=>e.target===e.currentTarget&&setPreviewEntry(null)}>
      <div style={{background:'#fff',borderRadius:14,maxWidth:560,width:'100%',maxHeight:'85vh',overflowY:'auto',padding:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:15}}>{ARCHIVE_CAT_ICON[previewEntry.category]} {archiveRecordLabel(previewEntry.category,previewEntry.data)}</div>
          <button onClick={()=>setPreviewEntry(null)} style={{border:'none',background:'none',fontSize:20,cursor:'pointer',color:'#6b7280'}}>×</button>
        </div>
        {(()=>{const meta=archiveMeta(previewEntry,users);return <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 16px',marginBottom:14,fontSize:12.5}}>
          <div><span style={{color:'#6b7280'}}>Archive ID : </span><span style={{fontFamily:"'JetBrains Mono',monospace"}}>{previewEntry.id}</span></div>
          <div><span style={{color:'#6b7280'}}>ID original : </span><span style={{fontFamily:"'JetBrains Mono',monospace"}}>{previewEntry.recordId}</span></div>
          <div><span style={{color:'#6b7280'}}>Type : </span><b>{previewEntry.recordType}</b></div>
          <div><span style={{color:'#6b7280'}}>Statut : </span><b>{previewEntry.status}</b></div>
          <div><span style={{color:'#6b7280'}}>Archivé le : </span><b>{previewEntry.archiveDate}</b></div>
          <div><span style={{color:'#6b7280'}}>Archivé par : </span><b>{previewEntry.archivedBy}</b></div>
          <div><span style={{color:'#6b7280'}}>Clinique : </span><b>{meta.clinicName}</b></div>
          <div><span style={{color:'#6b7280'}}>Dentiste : </span><b>{meta.doctorName}</b></div>
          <div style={{gridColumn:'1/-1'}}><span style={{color:'#6b7280'}}>Raison : </span>{previewEntry.archiveReason}</div>
          <div style={{gridColumn:'1/-1'}}><span style={{color:'#6b7280'}}>Taille : </span>{fmtBytes(previewEntry.fileSize)}</div>
        </div>;})()}
        {previewEntry.data?.shadePhoto&&<img src={previewEntry.data.shadePhoto.dataUrl} alt="" style={{width:'100%',maxHeight:200,objectFit:'contain',borderRadius:8,marginBottom:10,border:'1px solid #e5e7eb'}}/>}
        <div style={{display:'flex',gap:8}}>
          <BtnG onClick={()=>{doRestore(previewEntry);setPreviewEntry(null);}} style={{flex:1,justifyContent:'center'}}>♻ Restaurer</BtnG>
          <BtnO onClick={()=>{printEntry(previewEntry);}}>🖨 Imprimer</BtnO>
        </div>
      </div>
    </div>}

    {/* ── PERMANENT DELETE CONFIRM (multi-step) ── */}
    {confirmDelete&&<PermanentDeleteConfirm count={confirmDelete.ids.length} onCancel={()=>setConfirmDelete(null)} onConfirm={doPermanentDelete}/>}
  </>;
}

function PermanentDeleteConfirm({count,onCancel,onConfirm}) {
  const [step,setStep]=useState(1);
  const [typed,setTyped]=useState('');
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:400,padding:16}}>
    <div style={{background:'#fff',borderRadius:14,maxWidth:440,width:'100%',padding:24}}>
      <div style={{fontSize:34,textAlign:'center',marginBottom:8}}>⚠️</div>
      <div style={{fontWeight:800,fontSize:16,textAlign:'center',marginBottom:8,color:'#991b1b'}}>Suppression définitive</div>
      {step===1&&<>
        <p style={{fontSize:13,color:'#374151',textAlign:'center',marginBottom:16}}>Vous êtes sur le point de supprimer <b>définitivement {count} élément{count>1?'s':''}</b>. Cette action est <b>irréversible</b> — aucune restauration ne sera possible ensuite.</p>
        <div style={{display:'flex',gap:8}}>
          <BtnO onClick={onCancel} style={{flex:1,justifyContent:'center'}}>Annuler</BtnO>
          <button onClick={()=>setStep(2)} style={{flex:1,padding:'10px',borderRadius:8,border:'none',background:'#dc2626',color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer'}}>Continuer</button>
        </div>
      </>}
      {step===2&&<>
        <p style={{fontSize:13,color:'#374151',textAlign:'center',marginBottom:12}}>Pour confirmer, tapez <b>SUPPRIMER</b> ci-dessous :</p>
        <input value={typed} onChange={e=>setTyped(e.target.value)} style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'2px solid #fecaca',fontSize:14,textAlign:'center',fontWeight:700,marginBottom:14,boxSizing:'border-box'}} placeholder="SUPPRIMER"/>
        <div style={{display:'flex',gap:8}}>
          <BtnO onClick={onCancel} style={{flex:1,justifyContent:'center'}}>Annuler</BtnO>
          <button onClick={onConfirm} disabled={typed!=='SUPPRIMER'} style={{flex:1,padding:'10px',borderRadius:8,border:'none',background:typed==='SUPPRIMER'?'#dc2626':'#fca5a5',color:'#fff',fontWeight:700,fontSize:13,cursor:typed==='SUPPRIMER'?'pointer':'not-allowed'}}>🗑 Supprimer définitivement</button>
        </div>
      </>}
    </div>
  </div>;
}

// ─── MODAL ROUTER ──────────────────────────────────────────────────────────
function ModalRouter({modal,setModal,ctx}) {
  const close=()=>setModal(null);
  if(modal.t==='case')    return <CaseModal    cid={modal.cid}   close={close} ctx={ctx}/>;
  if(modal.t==='newCase') return <NewCaseModal defaultDoc={modal.defaultDoc} close={close} ctx={ctx}/>;
  if(modal.t==='editCase') return <EditCaseModal cid={modal.cid} close={close} ctx={ctx}/>;
  if(modal.t==='payment') return <PayModal     iid={modal.iid}   close={close} ctx={ctx}/>;
  if(modal.t==='editInvoice') return <EditInvoiceModal iid={modal.iid} close={close} ctx={ctx}/>;
  if(modal.t==='newPO') return <POModal oid={null} close={close} ctx={ctx}/>;
  if(modal.t==='editPO') return <POModal oid={modal.oid} close={close} ctx={ctx}/>;
  if(modal.t==='viewPO') return <POViewModal oid={modal.oid} close={close} ctx={ctx}/>;
  if(modal.t==='suppStatement') return <SupplierStatementModal sid={modal.sid} close={close} ctx={ctx}/>;
  if(modal.t==='techStatement') return <TechStatementModal tid={modal.tid} close={close} ctx={ctx}/>;
  if(modal.t==='addDoc')  return <DocModal     uid={null}         close={close} ctx={ctx}/>;
  if(modal.t==='docCases') return <DocCasesModal docId={modal.docId} close={close} ctx={ctx}/>;
  if(modal.t==='editDoc') return <DocModal     uid={modal.uid}    close={close} ctx={ctx}/>;
  if(modal.t==='addClinic') return <ClinicModal uid={null}        close={close} ctx={ctx}/>;
  if(modal.t==='editClinic') return <ClinicModal uid={modal.uid}  close={close} ctx={ctx}/>;
  if(modal.t==='addMyDoctor') return <MyDoctorModal uid={null}       close={close} ctx={ctx}/>;
  if(modal.t==='editMyDoctor') return <MyDoctorModal uid={modal.uid} close={close} ctx={ctx}/>;
  if(modal.t==='addEmp')  return <EmpModal     uid={null}         close={close} ctx={ctx}/>;
  if(modal.t==='editEmp') return <EmpModal     uid={modal.uid}    close={close} ctx={ctx}/>;
  if(modal.t==='addRT')   return <RTModal      rtId={null}        close={close} ctx={ctx}/>;
  if(modal.t==='editRT')  return <RTModal      rtId={modal.rtId}  close={close} ctx={ctx}/>;
  if(modal.t==='addMat')  return <MatModal     close={close}      ctx={ctx}/>;
  if(modal.t==='addSupp') return <SuppModal    sid={null}         close={close} ctx={ctx}/>;
  if(modal.t==='editSupp')return <SuppModal    sid={modal.sid}    close={close} ctx={ctx}/>;
  if(modal.t==='addExpense') return <AddExpenseModal eid={null}       close={close} ctx={ctx}/>;
  if(modal.t==='editExpense')return <AddExpenseModal eid={modal.eid}  close={close} ctx={ctx}/>;
  if(modal.t==='addCaisse')  return <AddCaisseModal  mvType={modal.mvType} mvId={modal.mvId} close={close} ctx={ctx}/>;
  if(modal.t==='addEquipment') return <EquipmentModal eqId={null}        close={close} ctx={ctx}/>;
  if(modal.t==='editEquipment')return <EquipmentModal eqId={modal.eqId}  close={close} ctx={ctx}/>;
  return null;
}

// ─── CASE MODAL ───────────────────────────────────────────────────────────────
function CaseModal({cid,close,ctx}) {
  const {user,users,cases,setCases,restoTypes,invoices,setInvoices,showToast,settings,setModal}=ctx;
  const c=cases.find(x=>x.id===cid); if(!c)return null;
  const [ns,setNs]=useState(c.status);const [sn,setSn]=useState('');const [ta,setTa]=useState(c.techId||'');
  const [tab,setTab]=useState(0);
  const isAdmin=user.role==='ADMIN';
  const canUpd=isAdmin||(user.role==='TECHNICIAN'&&(c.techId===user.id||c.wf.some(w=>!w.done&&w.tId===user.id)));
  const idx=STAGES.indexOf(c.status),pct=Math.round((idx/(STAGES.length-1))*100);
  const tech=users.find(u=>u.id===c.techId),doc=users.find(u=>u.id===c.docId),rt=restoTypes.find(r=>r.id===c.rtId);
  const techs=users.filter(u=>u.role==='TECHNICIAN');
  const linkedInv=(invoices||[]).find(i=>i.caseIds?.includes(cid));
  const doUpd=async()=>{
    try{
      const updated=await api.setCaseStatus(cid,{status:ns,techId:c.techId||user.id,notes:sn});
      setCases(p=>p.map(cc=>cc.id!==cid?cc:updated));
      showToast('Statut mis a jour');close();
    }catch(e){showToast('Erreur : '+(e.message||'mise à jour impossible'));}
  };
  const doAssign=async()=>{
    if(!ta){showToast('Selectionnez un technicien');return;}
    try{
      const updated=await api.assignAllCase(cid,ta);
      setCases(p=>p.map(cc=>cc.id!==cid?cc:updated));
      showToast('Technicien assigne');close();
    }catch(e){showToast('Erreur : '+(e.message||'assignation impossible'));}
  };
  const doPrintOrder=()=>{
    const html=buildCaseOrderHTML(c,doc,tech,restoTypes,settings);
    if(!openPrintWindow(html)) showToast('Impossible d\'ouvrir l\'aperçu d\'impression');
  };
  const [delBusy,setDelBusy]=useState(false);
  const doDelete=async()=>{
    if(delBusy)return;
    const warnPaid=linkedInv&&linkedInv.status==='PAID';
    const msg=linkedInv
      ?`Archiver le dossier ${c.num} ? Sa facture ${linkedInv.num}${warnPaid?' (déjà payée)':''} sera archivée avec lui. Tout pourra être restauré depuis les Archives.`
      :`Archiver le dossier ${c.num} ? Il sera déplacé vers les archives et pourra être restauré plus tard.`;
    if(!window.confirm(msg))return;
    setDelBusy(true);
    try{
      archiveRecord(ctx,'cases',c,'Suppression manuelle depuis la fiche dossier');
      await api.deleteCase(cid);
      setCases(p=>p.filter(x=>x.id!==cid));
      if(linkedInv){
        archiveRecord(ctx,'invoices',linkedInv,'Archivage en cascade avec le dossier '+c.num);
        await api.deleteInvoice(linkedInv.id);
        setInvoices(p=>p.filter(x=>x.id!==linkedInv.id));
      }
      showToast('Dossier archivé ✓');close();
    }catch(e){showToast('Erreur : '+(e.message||'suppression impossible'));}finally{setDelBusy(false);}
  };
  const TABS=['Details','Workflow','Comments','Images','Livraison'];
  return <Modal title={'Dossier — '+c.num} onClose={close} wide>
    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10,alignItems:'center'}}>
      <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,color:'#1a56db',fontSize:13.5}}>{c.num}</span>
      <SBadge st={c.status}/><PBadge p={c.pri}/>{c.remake&&<span style={{fontSize:10,background:'#fef3c7',color:'#92400e',padding:'2px 7px',borderRadius:99}}>Remake</span>}
      <div style={{marginLeft:'auto',display:'flex',gap:6,flexWrap:'wrap'}}>
        <button onClick={doPrintOrder} style={{padding:'5px 11px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>🖨 Bon de commande</button>
        {isAdmin&&<button onClick={()=>setModal({t:'editCase',cid})} style={{padding:'5px 11px',borderRadius:7,border:'1px solid #d1d5db',background:'#fff',fontSize:11,fontWeight:600,cursor:'pointer'}}>✎ Modifier</button>}
        {isAdmin&&<button onClick={doDelete} style={{padding:'5px 11px',borderRadius:7,border:'1px solid #fecaca',background:'#fef2f2',color:'#dc2626',fontSize:11,fontWeight:600,cursor:'pointer'}}>🗄 Archiver</button>}
      </div>
    </div>
    <div style={{display:'flex',gap:2,borderBottom:'2px solid #f3f4f6',marginBottom:12,overflowX:'auto'}}>
      {TABS.map((t,i)=><button key={i} onClick={()=>setTab(i)} style={{padding:'6px 12px',border:'none',background:'none',cursor:'pointer',fontSize:11.5,fontWeight:tab===i?700:400,color:tab===i?'#1a56db':'#6b7280',borderBottom:tab===i?'2px solid #1a56db':'2px solid transparent',whiteSpace:'nowrap',marginBottom:-2}}>{t}</button>)}
    </div>

    {tab===0&&<>
      <div style={{marginBottom:10}}><div style={{display:'flex',justifyContent:'space-between',fontSize:10.5,color:'#6b7280',marginBottom:3}}><span>Progression</span><span>{pct}%</span></div><Pb pct={pct}/></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px 16px',marginBottom:12,padding:'12px 14px',background:'#f9fafb',borderRadius:8}}>
        {[['Patient',c.pf+' '+c.pl],['Dentiste',doc?.name||'—'],['Clinique',doc?.clinique||'—'],['Type',rt?.name||'—'],['Teinte',c.sh||'—'],['Dents',(c.teeth||[]).join(', ')||'—'],['Elements',(c.teeth?.length||0)+''],['Technicien',tech?.name||'—'],['Echeance',c.due],['Prix',fmt(rt?.price||0)]].map(([l,v])=><div key={l}><div style={{fontSize:10,color:'#6b7280'}}>{l}</div><div style={{fontSize:12.5,fontWeight:500}}>{v}</div></div>)}
      </div>
      {c.notes&&<Alert type="w"><b>Notes :</b> {c.notes}</Alert>}
      <AttachmentsViewer c={c}/>
      {isAdmin&&<div style={{background:'#f9fafb',borderRadius:8,padding:12,marginBottom:10}}>
        <div style={{fontSize:12,fontWeight:700,marginBottom:8}}>Assignation techniciens</div>
        <div style={{display:'flex',gap:8,alignItems:'flex-end',marginBottom:8}}>
          <div style={{flex:1}}><Sel label="Assigner TOUTES les etapes a" value={ta} onChange={e=>setTa(e.target.value)} options={[{v:'',l:'-- Choisir --'},...techs.map(t=>({v:t.id,l:t.name}))]}/></div>
          <BtnP sm onClick={doAssign} style={{marginBottom:9}}>Tout assigner</BtnP>
        </div>
        <div style={{borderTop:'1px solid #e5e7eb',paddingTop:8}}>
          <div style={{fontSize:10.5,fontWeight:600,color:'#6b7280',marginBottom:6}}>Par etape :</div>
          {c.wf.filter(w=>w.s!=='RECEIVED'&&w.s!=='DELIVERED').map(w=>{const cfg=SC[w.s]||{l:w.s};return <div key={w.s} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5,padding:'5px 8px',background:w.done?'#f0fdf4':'#fff',borderRadius:7,border:'1px solid '+(w.done?'#bbf7d0':'#e5e7eb')}}>
            <span style={{fontSize:11,fontWeight:600,width:80,flexShrink:0}}>{cfg.l}</span>
            {w.done?<span style={{fontSize:10.5,color:'#0e9f6e'}}>Termine</span>
            :<select value={w.tId||''} onChange={e=>{const tid=e.target.value;setCases(p=>p.map(cc=>cc.id!==cid?cc:{...cc,wf:cc.wf.map(x=>x.s===w.s?{...x,tId:tid||null}:x)}));}} style={{flex:1,fontSize:11,padding:'4px 7px',borderRadius:6,border:'1px solid #d1d5db',background:'#fff'}}>
              <option value=''>-- Non assigne --</option>
              {techs.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select>}
          </div>;})}
          <button onClick={()=>{const mt=c.wf.find(w=>w.tId&&w.s!=='RECEIVED')?.tId||null;setCases(p=>p.map(cc=>cc.id!==cid?cc:{...cc,techId:mt}));showToast('Assignations sauvegardees');close();}} style={{width:'100%',marginTop:6,padding:'8px',borderRadius:7,background:'#1a56db',color:'#fff',border:'none',cursor:'pointer',fontSize:12,fontWeight:600}}>Sauvegarder</button>
        </div>
      </div>}
      {canUpd&&<div style={{background:'#f9fafb',borderRadius:8,padding:12}}>
        <div style={{fontSize:12,fontWeight:600,marginBottom:8}}>Mettre a jour le statut</div>
        <Fr><Sel label="Nouveau statut" value={ns} onChange={e=>setNs(e.target.value)} options={STAGES.map(s=>({v:s,l:SC[s].l}))}/><Inp label="Notes" value={sn} onChange={e=>setSn(e.target.value)} placeholder="Notes..."/></Fr>
        <BtnG sm onClick={doUpd}>Mettre a jour</BtnG>
      </div>}
      {!isAdmin&&!canUpd&&user.role==='TECHNICIAN'&&<Alert type="i">Ce dossier n'est pas dans une etape qui vous est assignee.</Alert>}
      {(user.role==='DOCTOR'||user.role==='CLINIC')&&<Alert type="i">Lecture seule — seul le laboratoire peut modifier le statut.</Alert>}
    </>}

    {tab===1&&<>
      <div style={{fontSize:11,fontWeight:600,color:'#6b7280',marginBottom:8}}>Historique workflow</div>
      {c.wf.map((w,i)=>{const t=users.find(u=>u.id===w.tId),cfg=SC[w.s]||{l:w.s,bg:'#f3f4f6',c:'#374151',d:'#9ca3af'};return <div key={i} style={{display:'flex',gap:9,marginBottom:7}}>
        <div style={{display:'flex',flexDirection:'column',alignItems:'center'}}><div style={{width:7,height:7,borderRadius:'50%',background:w.done?cfg.d:'#d1d5db',marginTop:3,flexShrink:0}}/>{i<c.wf.length-1&&<div style={{width:1,flex:1,background:'#f3f4f6',margin:'3px 0'}}/>}</div>
        <div style={{flex:1,paddingBottom:5}}>
          <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}><SBadge st={w.s}/><span style={{fontSize:10.5,fontWeight:500,padding:'2px 7px',borderRadius:99,background:w.done?'#f0fdf4':'#eff6ff',color:w.done?'#0e9f6e':'#1a56db'}}>{w.done?'Termine':'En cours'}</span>{w.el&&<span style={{fontSize:10,color:'#7e3af2'}}>{w.el} el.</span>}</div>
          <div style={{fontSize:10.5,color:'#6b7280',marginTop:2}}>{t?.name||'Non assigne'} · {w.start||''}{w.end?' -> '+w.end:''}{w.dur?' ('+w.dur+' min)':''}</div>
          {w.notes&&<div style={{fontSize:10.5,color:'#6b7280',fontStyle:'italic'}}>{w.notes}</div>}
        </div>
      </div>;})}
    </>}

    {tab===2&&<div>
      <div style={{maxHeight:260,overflowY:'auto',marginBottom:12}}>
        {(c.comments||[]).length===0?<div style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun commentaire</div>:
        (c.comments||[]).map(cm=>{const cu=users.find(u=>u.id===cm.uid);const isMe=cm.uid===user.id;return <div key={cm.id} style={{marginBottom:10,padding:'8px 12px',borderRadius:9,background:isMe?'#eff6ff':'#f9fafb',borderLeft:'3px solid '+(isMe?'#3b82f6':'#d1d5db')}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}><span style={{fontSize:11,fontWeight:600}}>{cu?.name||cm.uid}</span><span style={{fontSize:9.5,color:'#9ca3af'}}>{cm.ts}</span></div>
          <div style={{fontSize:12}}>{cm.text}</div>
        </div>;})}
      </div>
      <div style={{display:'flex',gap:8}}>
        <input id="cmtxt2" placeholder="Ecrire un message..." style={{flex:1,padding:'7px 10px',borderRadius:7,border:'1px solid #d1d5db',fontSize:12,outline:'none'}} onKeyDown={e=>{if(e.key==='Enter'){const v=e.target.value.trim();if(!v)return;setCases(p=>p.map(x=>x.id===cid?{...x,comments:[...(x.comments||[]),{id:'cm'+Date.now(),uid:user.id,text:v,ts:new Date().toLocaleString('fr-DZ')}]}:x));e.target.value='';showToast('OK');}}}/>
        <BtnP sm onClick={()=>{const el=document.getElementById('cmtxt2');if(!el?.value.trim())return;setCases(p=>p.map(x=>x.id===cid?{...x,comments:[...(x.comments||[]),{id:'cm'+Date.now(),uid:user.id,text:el.value.trim(),ts:new Date().toLocaleString('fr-DZ')}]}:x));el.value='';showToast('OK');}}>Envoyer</BtnP>
      </div>
    </div>}

    {tab===3&&<div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
        <label style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:7,background:'#1a56db',color:'#fff',fontSize:12,fontWeight:500,cursor:'pointer'}}>
          Ajouter image<input type="file" accept="image/*" onChange={e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{setCases(p=>p.map(x=>x.id===cid?{...x,images:[...(x.images||[]),{id:'img'+Date.now(),url:ev.target.result,name:file.name,ts:new Date().toLocaleString('fr-DZ')}]}:x));showToast('Image ajoutee');};r.readAsDataURL(file);}} style={{display:'none'}}/>
        </label>
      </div>
      {(c.images||[]).length===0?<div style={{padding:30,textAlign:'center',color:'#9ca3af',fontSize:12,border:'2px dashed #e5e7eb',borderRadius:9}}>Aucune image</div>:
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:8}}>
        {(c.images||[]).map(img=><div key={img.id} style={{borderRadius:9,overflow:'hidden',border:'1px solid #e5e7eb'}}><img src={img.url} alt={img.name} style={{width:'100%',height:90,objectFit:'cover',display:'block'}}/><div style={{padding:'3px 6px',fontSize:9.5,color:'#6b7280',background:'#f9fafb'}}>{img.ts}</div></div>)}
      </div>}
    </div>}

    {tab===4&&<div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
        <div style={{padding:'12px 14px',background:'#f0fdf4',borderRadius:9,border:'1px solid #bbf7d0'}}><div style={{fontSize:10,fontWeight:600,color:'#166534',marginBottom:4}}>Date livraison</div><div style={{fontSize:13,fontWeight:700}}>{c.deliveredDate||'Non livre'}</div></div>
        <div style={{padding:'12px 14px',background:'#eff6ff',borderRadius:9,border:'1px solid #bfdbfe'}}><div style={{fontSize:10,fontWeight:600,color:'#1e40af',marginBottom:4}}>Livre par</div><div style={{fontSize:13,fontWeight:700}}>{c.deliveredBy?users.find(u=>u.id===c.deliveredBy)?.name||'—':'—'}</div></div>
      </div>
      {isAdmin&&c.status==='DELIVERED'&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:9,padding:'10px 14px',marginBottom:10}}>
        <Btn variant="ghost" style={{width:'100%',justifyContent:'center',color:'#dc2626'}} onClick={()=>{setCases(p=>p.map(x=>x.id===cid?{...x,status:'READY',deliveredDate:null,deliveredBy:null}:x));showToast('Livraison annulee');close();}}>Annuler la livraison</Btn>
      </div>}
      {isAdmin&&c.status==='READY'&&!c.deliveredDate&&<div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:9,padding:'12px 14px',marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:600,color:'#92400e',marginBottom:8}}>Marquer comme livre</div>
        <Btn variant="primary" style={{width:'100%',justifyContent:'center'}} onClick={()=>{
          setCases(p=>p.map(x=>x.id===cid?{...x,status:'DELIVERED',deliveredDate:tod(),deliveredBy:user.id}:x));
          showToast('Livré !');
          const inv=(invoices||[]).find(i=>i.caseIds?.includes(cid));
          if(inv){const billedDoc=users.find(u=>u.id===inv.docId)||{};const html=buildInvoiceHTML(inv,cases,[billedDoc],{...(settings||{}),restoTypes});setTimeout(()=>openPrintWindow(html),300);}
          close();
        }}>Confirmer la livraison + Imprimer facture</Btn>
      </div>}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
        <div style={{padding:'10px 12px',background:'#fef2f2',borderRadius:9,textAlign:'center'}}><div style={{fontSize:10,color:'#6b7280',marginBottom:4}}>Materiaux</div><div style={{fontSize:14,fontWeight:700,color:'#dc2626'}}>{fmtDA(c.materialCost||0)}</div></div>
        <div style={{padding:'10px 12px',background:'#fffbeb',borderRadius:9,textAlign:'center'}}><div style={{fontSize:10,color:'#6b7280',marginBottom:4}}>Main d oeuvre</div><div style={{fontSize:14,fontWeight:700,color:'#d97706'}}>{fmtDA(c.laborCost||0)}</div></div>
        {(()=>{const inv=(invoices||[]).find(i=>i.caseIds?.includes(cid));const rev=inv?inv.total:0;const profit=rev-(c.materialCost||0)-(c.laborCost||0);return <div style={{padding:'10px 12px',background:'#f0fdf4',borderRadius:9,textAlign:'center'}}><div style={{fontSize:10,color:'#6b7280',marginBottom:4}}>Profit</div><div style={{fontSize:14,fontWeight:700,color:profit>=0?'#16a34a':'#dc2626'}}>{fmtDA(profit)}</div></div>;})()}
      </div>
    </div>}
  </Modal>;
}

function NewCaseModal({defaultDoc,close,ctx}) {
  const {users,cases,setCases,invoices,setInvoices,restoTypes,showToast}=ctx;
  const docs=users.filter(u=>u.role==='DOCTOR'&&u.active!==false),techs=users.filter(u=>u.role==='TECHNICIAN');
  const [pf,setPf]=useState('');const [pl,setPl]=useState('');const [docId,setDocId]=useState(defaultDoc||docs[0]?.id||'');
  const [rtId,setRtId]=useState(restoTypes[0]?.id||'');const [sh,setSh]=useState('A2');const [pri,setPri]=useState('NORMAL');
  const [due,setDue]=useState('');const [notes,setNotes]=useState('');const [techId,setTechId]=useState(techs[0]?.id||'');
  const [teeth,setTeeth]=useState([]);
  const [attachments,setAttachments]=useState([]);
  const [shadePhoto,setShadePhoto]=useState(null);
  const [busy,setBusy]=useState(false);
  const tog=t=>setTeeth(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t]);
  const submit=async()=>{
    if(busy)return;
    if(!pf||!pl||!due||teeth.length===0){showToast('Remplissez tous les champs et sélectionnez au moins une dent');return;}
    setBusy(true);
    try{
      const num=`LAB-2024-${String(cases.length+48).padStart(4,'0')}`;
      const tid=techId||techs[0]?.id||null;
      const newCase=await api.createCase({num,patientFirst:pf,patientLast:pl,doctorId:docId,restoTypeId:rtId,shade:sh,priority:pri,dueDate:due,techId:tid,notes,teeth});
      setCases(p=>[newCase,...p]);
      const rt=restoTypes.find(r=>r.id===rtId);
      const invNum='INV-'+new Date().getFullYear()+'-'+String(invoices.length+10).padStart(4,'0');
      const newInv=await api.createInvoice({num:invNum,doctorId:docId,caseIds:[newCase.id],total:rt?rt.price:0,date:tod()});
      setInvoices(p=>[...p,newInv]);
      close();showToast(`Dossier ${num} créé — facture générée automatiquement`);
    }catch(e){
      showToast('Erreur : '+(e.message||'création impossible'));
    }finally{
      setBusy(false);
    }
  };
  return <Modal title="Nouveau dossier" onClose={close} wide>
    {busy&&<div style={{fontSize:11,color:'#6b7280',marginBottom:8}}>Enregistrement…</div>}
    <Fr><Inp label="Prénom patient *" value={pf} onChange={e=>setPf(e.target.value)} placeholder="Mohammed"/><Inp label="Nom *" value={pl} onChange={e=>setPl(e.target.value)} placeholder="Benali"/></Fr>
    <Fr><Sel label="Dentiste *" value={docId} onChange={e=>setDocId(e.target.value)} options={docs.map(d=>({v:d.id,l:d.name+' — '+d.clinique}))}/><Sel label="Technicien assigné" value={techId} onChange={e=>setTechId(e.target.value)} options={techs.map(t=>({v:t.id,l:t.name+' — '+t.spec}))}/></Fr>
    <Fr><Sel label="Type de restauration *" value={rtId} onChange={e=>setRtId(e.target.value)} options={restoTypes.map(r=>({v:r.id,l:r.name+' ('+fmt(r.price)+')'}) )}/><Sel label="Teinte" value={sh} onChange={e=>setSh(e.target.value)} options={['A1','A2','A3','A3.5','A4','B1','B2','BL1','BL2','BL3','—']}/></Fr>
    <Fr><Sel label="Priorité" value={pri} onChange={e=>setPri(e.target.value)} options={[{v:'NORMAL',l:'Normal'},{v:'HIGH',l:'Haut'},{v:'URGENT',l:'🔴 Urgent'},{v:'LOW',l:'Bas'}]}/><Inp label="Échéance *" type="date" value={due} onChange={e=>setDue(e.target.value)}/></Fr>
    <Inp label="Notes" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Instructions spéciales..."/>
    <div style={{marginBottom:9}}><label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:5}}>Dents * {teeth.length>0&&<span style={{color:'#1a56db',fontWeight:600}}>— {teeth.join(', ')} ({teeth.length} éléments)</span>}</label><ToothChart selected={teeth} onToggle={tog}/></div>
    {teeth.length===0&&<p style={{fontSize:11.5,color:'#d97706',textAlign:'center',marginBottom:10}}>⚠ Sélectionnez au moins une dent</p>}
    <div style={{marginBottom:12,padding:'12px 14px',background:'#f9fafb',borderRadius:9,border:'1px solid #f3f4f6'}}>
      <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:8}}>Fichiers numériques</div>
      <FileAttachSection attachments={attachments} setAttachments={setAttachments} shadePhoto={shadePhoto} setShadePhoto={setShadePhoto} showToast={showToast}/>
    </div>
    <BtnP onClick={submit} style={{width:'100%',justifyContent:'center'}}>✓ Créer le dossier</BtnP>
  </Modal>;
}

// ─── EDIT CASE (admin) ──────────────────────────────────────────────────────
function EditCaseModal({cid,close,ctx}) {
  const {users,cases,setCases,restoTypes,invoices,showToast}=ctx;
  const c=cases.find(x=>x.id===cid); if(!c) return null;
  const docs=users.filter(u=>u.role==='DOCTOR'),techs=users.filter(u=>u.role==='TECHNICIAN');
  const [pf,setPf]=useState(c.pf);const [pl,setPl]=useState(c.pl);const [docId,setDocId]=useState(c.docId);
  const [rtId,setRtId]=useState(c.rtId);const [sh,setSh]=useState(c.sh||'A2');const [pri,setPri]=useState(c.pri||'NORMAL');
  const [due,setDue]=useState(c.due||'');const [notes,setNotes]=useState(c.notes||'');
  const [teeth,setTeeth]=useState(c.teeth||[]);
  const [attachments,setAttachments]=useState(c.attachments||[]);
  const [shadePhoto,setShadePhoto]=useState(c.shadePhoto||null);
  const tog=t=>setTeeth(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t]);
  const linkedInv=(invoices||[]).find(i=>i.caseIds?.includes(cid));
  const rtChanged=rtId!==c.rtId;
  const save=()=>{
    if(!pf||!pl||!due||teeth.length===0){showToast('Remplissez tous les champs et sélectionnez au moins une dent');return;}
    setCases(p=>p.map(cc=>cc.id!==cid?cc:{...cc,pf,pl,docId,rtId,sh,pri,due,notes,teeth,attachments,shadePhoto}));
    showToast('Dossier mis à jour ✓');
    if(rtChanged&&linkedInv) showToast('⚠ Le type a changé — pensez à vérifier la facture '+linkedInv.num);
    close();
  };
  return <Modal title={`Modifier — ${c.num}`} onClose={close} wide>
    {linkedInv&&<Alert type="w">Ce dossier est lié à la facture <b>{linkedInv.num}</b>. Changer le type de restauration ne mettra pas à jour automatiquement le montant facturé.</Alert>}
    <Fr><Inp label="Prénom patient *" value={pf} onChange={e=>setPf(e.target.value)}/><Inp label="Nom *" value={pl} onChange={e=>setPl(e.target.value)}/></Fr>
    <Sel label="Dentiste *" value={docId} onChange={e=>setDocId(e.target.value)} options={docs.map(d=>({v:d.id,l:d.name+' — '+d.clinique}))}/>
    <Fr><Sel label="Type de restauration *" value={rtId} onChange={e=>setRtId(e.target.value)} options={restoTypes.map(r=>({v:r.id,l:r.name+' ('+fmt(r.price)+')'}))}/><Sel label="Teinte" value={sh} onChange={e=>setSh(e.target.value)} options={['A1','A2','A3','A3.5','A4','B1','B2','BL1','BL2','BL3','—']}/></Fr>
    <Fr><Sel label="Priorité" value={pri} onChange={e=>setPri(e.target.value)} options={[{v:'NORMAL',l:'Normal'},{v:'HIGH',l:'Haut'},{v:'URGENT',l:'🔴 Urgent'},{v:'LOW',l:'Bas'}]}/><Inp label="Échéance *" type="date" value={due} onChange={e=>setDue(e.target.value)}/></Fr>
    <Inp label="Notes" value={notes} onChange={e=>setNotes(e.target.value)}/>
    <div style={{marginBottom:9}}><label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:5}}>Dents * {teeth.length>0&&<span style={{color:'#1a56db',fontWeight:600}}>— {teeth.join(', ')} ({teeth.length} éléments)</span>}</label><ToothChart selected={teeth} onToggle={tog}/></div>
    <div style={{marginBottom:12,padding:'12px 14px',background:'#f9fafb',borderRadius:9,border:'1px solid #f3f4f6'}}>
      <div style={{fontSize:11,fontWeight:700,color:'#374151',marginBottom:8}}>Fichiers numériques</div>
      <FileAttachSection attachments={attachments} setAttachments={setAttachments} shadePhoto={shadePhoto} setShadePhoto={setShadePhoto} showToast={showToast}/>
    </div>
    <BtnP onClick={save} style={{width:'100%',justifyContent:'center'}}>✓ Enregistrer les modifications</BtnP>
  </Modal>;
}

// ─── PAY MODAL ────────────────────────────────────────────────────────────────
function PayModal({iid,close,ctx}) {
  const {users,invoices,setInvoices,showToast}=ctx;
  const inv=invoices.find(i=>i.id===iid);if(!inv)return null;
  const [method,setMethod]=useState('Espèces');
  const [payDate,setPayDate]=useState(tod());
  const d=users.find(u=>u.id===inv.docId);
  const clinic=users.find(u=>u.id===d?.clinicId);
  const submit=async()=>{
    try{
      const remaining=inv.total-inv.paid;
      const updated=await api.payInvoice(iid,{amount:remaining,date:payDate,method});
      setInvoices(p=>p.map(i=>i.id!==iid?i:updated));
      close();showToast(`Facture ${inv.num} marquée payée ✓`);
    }catch(e){showToast('Erreur : '+(e.message||'paiement impossible'));}
  };
  return <Modal title="Enregistrer un paiement" onClose={close}>
    <div style={{background:'#f9fafb',borderRadius:8,padding:12,marginBottom:13}}>
      {[['Facture',<span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}>{inv.num}</span>],['Dentiste',<b>{d?.name}</b>],['Clinique',clinic?.name||d?.clinique||'—'],['Montant à payer',<span style={{color:'#e02424',fontWeight:700}}>{fmt(inv.total)}</span>]].map(([l,v])=><div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #f3f4f6',fontSize:12}}><span style={{color:'#6b7280'}}>{l}</span><span>{v}</span></div>)}
    </div>
    <Fr2>
      <Inp label="Date du paiement" type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/>
      <Sel label="Mode de paiement" value={method} options={['Espèces','Virement bancaire','Chèque','Carte bancaire']} onChange={e=>setMethod(e.target.value)}/>
    </Fr2>
    <BtnG onClick={submit} style={{width:'100%',justifyContent:'center'}}>💳 Marquer comme payée</BtnG>
  </Modal>;
}

// ─── EDIT INVOICE (admin) ──────────────────────────────────────────────────────
function EditInvoiceModal({iid,close,ctx}) {
  const {users,invoices,setInvoices,cases,restoTypes,showToast}=ctx;
  const inv=invoices.find(i=>i.id===iid);if(!inv)return null;
  const doc=users.find(u=>u.id===inv.docId);
  const clinic=users.find(u=>u.id===doc?.clinicId);
  const c=cases.find(x=>x.id===inv.caseIds[0]);
  const [date,setDate]=useState(inv.date||tod());
  const [status,setStatus]=useState(inv.status||'UNPAID');
  const [paidDate,setPaidDate]=useState(inv.paidDate||tod());
  const [method,setMethod]=useState((inv.payments&&inv.payments[inv.payments.length-1]?.method)||'Espèces');
  const [busy,setBusy]=useState(false);
  const save=async()=>{
    if(busy)return;
    setBusy(true);
    try{
      const updated=await api.updateInvoice(iid,{date,status,paid:status==='PAID'?inv.total:0,paidDate:status==='PAID'?paidDate:null});
      // NB : ceci ne crée pas de ligne dans l'historique des paiements (ce n'est pas le flux
      // normal de paiement) — seuls date/statut/montant payé sont corrigés directement.
      setInvoices(prev=>prev.map(i=>i.id!==iid?i:updated));
      showToast('Facture mise à jour ✓');close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };
  const del=async()=>{
    if(!window.confirm(`Archiver la facture ${inv.num} ? Le dossier lié n'aura plus de facture active. Elle pourra être restaurée depuis les Archives.`))return;
    try{
      archiveRecord(ctx,'invoices',inv,'Suppression manuelle depuis la fiche facture');
      await api.deleteInvoice(iid);
      setInvoices(prev=>prev.filter(i=>i.id!==iid));
      showToast('Facture archivée ✓');close();
    }catch(e){showToast('Erreur : '+(e.message||'suppression impossible'));}
  };
  return <Modal title={`Modifier — ${inv.num}`} onClose={close} wide>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
      <div style={{background:'#f9fafb',borderRadius:8,padding:11}}><div style={{fontSize:10,color:'#6b7280'}}>Clinique</div><div style={{fontSize:12.5,fontWeight:700}}>{clinic?.name||doc?.clinique||'—'}</div></div>
      <div style={{background:'#f9fafb',borderRadius:8,padding:11}}><div style={{fontSize:10,color:'#6b7280'}}>Dentiste</div><div style={{fontSize:12.5,fontWeight:700}}>{doc?.name||'—'}</div></div>
      <div style={{background:'#f9fafb',borderRadius:8,padding:11}}><div style={{fontSize:10,color:'#6b7280'}}>Montant</div><div style={{fontSize:14,fontWeight:800,color:'#1a56db'}}>{fmt(inv.total)}</div></div>
    </div>
    <div style={{padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:8,marginBottom:14}}>
      <div style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Dossier lié (fixe — une facture = un dossier)</div>
      <div style={{fontSize:12.5}}><span style={{fontFamily:"'JetBrains Mono',monospace",color:'#1a56db',fontWeight:700,marginRight:8}}>{c?.num||'—'}</span><b>{c?c.pf+' '+c.pl:'—'}</b> — {c?caseDescription(c,restoTypes):'—'}</div>
    </div>
    <Inp label="Date de la facture" type="date" value={date} onChange={e=>setDate(e.target.value)}/>

    <div style={{fontWeight:700,fontSize:12.5,color:'#111827',margin:'14px 0 8px'}}>Statut de paiement</div>
    <div style={{display:'flex',gap:8,marginBottom:12}}>
      {[{v:'UNPAID',l:'❌ Impayée',c:'#dc2626'},{v:'PAID',l:'✅ Payée',c:'#16a34a'}].map(o=>
        <div key={o.v} onClick={()=>setStatus(o.v)} style={{flex:1,padding:'11px',borderRadius:9,cursor:'pointer',textAlign:'center',fontWeight:700,fontSize:13,
          border:'2px solid '+(status===o.v?o.c:'#e5e7eb'),background:status===o.v?o.c+'11':'#fff',color:status===o.v?o.c:'#6b7280'}}>{o.l}</div>
      )}
    </div>
    {status==='PAID'&&<Fr2>
      <Inp label="Date de paiement" type="date" value={paidDate} onChange={e=>setPaidDate(e.target.value)}/>
      <Sel label="Mode de paiement" value={method} options={['Espèces','Virement bancaire','Chèque','Carte bancaire']} onChange={e=>setMethod(e.target.value)}/>
    </Fr2>}

    <div style={{display:'flex',gap:8,marginTop:10}}>
      <BtnG onClick={save} style={{flex:1,justifyContent:'center'}}>✓ Enregistrer les modifications</BtnG>
      <button onClick={del} style={{padding:'10px 16px',borderRadius:8,border:'1px solid #fecaca',background:'#fef2f2',color:'#dc2626',fontSize:13,fontWeight:600,cursor:'pointer'}}>🗄 Archiver</button>
    </div>
  </Modal>;
}


// ─── PURCHASE ORDER MODAL (create/edit multi-line PO) ─────────────────────────
function POModal({oid,close,ctx}) {
  const {supps,mats,orders,setOrders,showToast}=ctx;
  const o=oid?orders.find(x=>x.id===oid):null;
  const [supId,setSupId]=useState(o?.supId||supps[0]?.id||'');
  const [orderDate,setOrderDate]=useState(o?.orderDate||tod());
  const [expectedDate,setExpectedDate]=useState(o?.expectedDate||'');
  const [status,setStatus]=useState(o?.status||'DRAFT');
  const [paymentStatus,setPaymentStatus]=useState(o?.paymentStatus||'UNPAID');
  const [notes,setNotes]=useState(o?.notes||'');
  const [shipping,setShipping]=useState(o?.shipping||0);
  const [items,setItems]=useState(o?.items||[{id:'it'+uid(),matId:'',name:'',category:'',qty:1,unit:'unité',unitPrice:0,discount:0,tax:0}]);
  const [attachments,setAttachments]=useState(o?.attachments||{quotation:null,invoice:null,deliveryNote:null});
  const matCats=[...new Set(mats.map(m=>m.cat))];

  const addItem=()=>setItems(p=>[...p,{id:'it'+uid(),matId:'',name:'',category:'',qty:1,unit:'unité',unitPrice:0,discount:0,tax:0}]);
  const removeItem=(id)=>{if(items.length<=1){showToast('Une commande doit contenir au moins un article');return;}setItems(p=>p.filter(it=>it.id!==id));};
  const updateItem=(id,field,val)=>setItems(p=>p.map(it=>{
    if(it.id!==id)return it;
    if(field==='matId'){const m=mats.find(x=>x.id===val);return {...it,matId:val,name:m?m.name:it.name,category:m?m.cat:it.category,unit:m?m.unit:it.unit,unitPrice:m?m.cost:it.unitPrice};}
    return {...it,[field]:val};
  }));
  const totals=poTotals(items,Number(shipping)||0);

  const SLOT_KIND={quotation:'QUOTATION',invoice:'INVOICE',deliveryNote:'DELIVERY_NOTE'};
  const [attUploading,setAttUploading]=useState({});
  const pickAttachment=async(slot,file)=>{
    if(!file)return;
    if(oid){
      // Commande déjà créée : upload immédiat vers le serveur
      setAttUploading(p=>({...p,[slot]:true}));
      try{
        const res=await api.uploadPoAttachment(oid,SLOT_KIND[slot],file);
        setAttachments(p=>({...p,[slot]:{attId:res.id,name:res.fileName,url:ASSET_BASE+res.url}}));
        setOrders(p=>p.map(x=>x.id!==oid?x:{...x,attachments:{...(x.attachments||{}),[slot]:{attId:res.id,name:res.fileName,url:ASSET_BASE+res.url}}}));
        showToast('Fichier envoyé ✓');
      }catch(e){showToast('Erreur : '+(e.message||'échec envoi fichier'));}
      finally{setAttUploading(p=>({...p,[slot]:false}));}
    }else{
      // Commande pas encore créée : on garde le fichier en mémoire, upload juste après la création
      setAttachments(p=>({...p,[slot]:{name:file.name,pendingFile:file}}));
    }
  };

  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(!supId){showToast('Sélectionnez un fournisseur');return;}
    if(items.some(it=>!it.name||it.qty<=0)){showToast('Chaque article doit avoir un nom et une quantité valide');return;}
    setBusy(true);
    try{
      if(oid){
        const updated=await api.updateOrder(oid,{
          supplierId:supId, orderDate, expectedDate, status, paymentStatus, shipping:Number(shipping)||0, notes,
          items: items.map(it=>({id:it.id,materialId:it.matId||null,name:it.name,category:it.category,qty:it.qty,received:it.received||0,unit:it.unit,unitPrice:it.unitPrice,discountPct:it.discount,taxPct:it.tax})),
        });
        setOrders(p=>p.map(x=>x.id!==oid?x:{...updated,attachments}));
        showToast('Commande mise à jour ✓');
      } else {
        const poNum='PO-'+new Date().getFullYear()+'-'+String(orders.length+1).padStart(4,'0');
        const created=await api.createOrder({
          poNum, supplierId:supId, orderDate, expectedDate,
          items: items.map(it=>({materialId:it.matId||null,name:it.name,category:it.category,qty:it.qty,unit:it.unit,unitPrice:it.unitPrice,discountPct:it.discount,taxPct:it.tax})),
          shipping:Number(shipping)||0, notes,
        });
        // Envoie maintenant les fichiers choisis avant que la commande n'existe côté serveur
        const finalAttachments={};
        for(const slot of Object.keys(attachments)){
          const a=attachments[slot];
          if(a&&a.pendingFile){
            try{
              const res=await api.uploadPoAttachment(created.id,SLOT_KIND[slot],a.pendingFile);
              finalAttachments[slot]={attId:res.id,name:res.fileName,url:ASSET_BASE+res.url};
            }catch(e){showToast('Fichier "'+a.name+'" non envoyé : '+(e.message||'échec'));}
          }
        }
        setOrders(p=>[...p,{...created,attachments:finalAttachments}]);
        showToast('Commande '+poNum+' créée ✓');
      }
      close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };

  return <Modal title={oid?'Modifier — '+o.poNum:'Nouvelle commande fournisseur'} onClose={close} wide>
    <Fr>
      <Sel label="Fournisseur *" value={supId} onChange={e=>setSupId(e.target.value)} options={supps.map(s=>({v:s.id,l:s.name}))}/>
      <Sel label="Statut" value={status} onChange={e=>setStatus(e.target.value)} options={PO_STATUSES.map(s=>({v:s,l:PO_STATUS_LABELS[s]}))}/>
    </Fr>
    <Fr>
      <Inp label="Date de commande" type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)}/>
      <Inp label="Date de livraison prévue" type="date" value={expectedDate} onChange={e=>setExpectedDate(e.target.value)}/>
    </Fr>
    <Sel label="Statut de paiement" value={paymentStatus} onChange={e=>setPaymentStatus(e.target.value)} options={[{v:'UNPAID',l:'Impayée'},{v:'PARTIAL',l:'Partiellement payée'},{v:'PAID',l:'Payée'}]}/>

    <div style={{fontWeight:700,fontSize:12.5,color:'#111827',margin:'14px 0 8px'}}>Articles commandés</div>
    <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:8}}>
      {items.map(it=><div key={it.id} style={{border:'1px solid #e5e7eb',borderRadius:9,padding:'10px 12px',background:'#fafafa'}}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:8,marginBottom:6}}>
          <div>
            <label style={{fontSize:9.5,color:'#6b7280',display:'block',marginBottom:2}}>Produit</label>
            <select value={it.matId} onChange={e=>updateItem(it.id,'matId',e.target.value)} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,background:'#fff',boxSizing:'border-box'}}>
              <option value=''>— Produit libre (saisir ci-dessous) —</option>
              {mats.map(m=><option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
            </select>
            {!it.matId&&<input value={it.name} onChange={e=>updateItem(it.id,'name',e.target.value)} placeholder="Nom du produit" style={{width:'100%',marginTop:4,padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}}/>}
          </div>
          <div>
            <label style={{fontSize:9.5,color:'#6b7280',display:'block',marginBottom:2}}>Catégorie</label>
            <input value={it.category} onChange={e=>updateItem(it.id,'category',e.target.value)} list="matcats" style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}}/>
            <datalist id="matcats">{matCats.map(c=><option key={c} value={c}/>)}</datalist>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr auto',gap:6,alignItems:'end'}}>
          <div><label style={{fontSize:9.5,color:'#6b7280',display:'block',marginBottom:2}}>Qté</label><input type="number" value={it.qty} onChange={e=>updateItem(it.id,'qty',Number(e.target.value))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}}/></div>
          <div><label style={{fontSize:9.5,color:'#6b7280',display:'block',marginBottom:2}}>Unité</label><input value={it.unit} onChange={e=>updateItem(it.id,'unit',e.target.value)} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}}/></div>
          <div><label style={{fontSize:9.5,color:'#6b7280',display:'block',marginBottom:2}}>Prix unit. (DA)</label><input type="number" value={it.unitPrice} onChange={e=>updateItem(it.id,'unitPrice',Number(e.target.value))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}}/></div>
          <div><label style={{fontSize:9.5,color:'#6b7280',display:'block',marginBottom:2}}>Remise %</label><input type="number" value={it.discount} onChange={e=>updateItem(it.id,'discount',Number(e.target.value))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}}/></div>
          <div><label style={{fontSize:9.5,color:'#6b7280',display:'block',marginBottom:2}}>TVA % (optionnel)</label><input type="number" value={it.tax} onChange={e=>updateItem(it.id,'tax',Number(e.target.value))} style={{width:'100%',padding:'6px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12,boxSizing:'border-box'}}/></div>
          <button onClick={()=>removeItem(it.id)} style={{padding:'6px 10px',borderRadius:6,border:'1px solid #fecaca',background:'#fef2f2',color:'#dc2626',cursor:'pointer',fontSize:12}}>🗑</button>
        </div>
        <div style={{textAlign:'right',fontSize:12,fontWeight:700,color:'#1a56db',marginTop:6}}>Total ligne : {fmt(poItemTotal(it))}</div>
      </div>)}
    </div>
    <button onClick={addItem} style={{padding:'7px 14px',borderRadius:8,border:'1px dashed #1a56db',background:'#eff6ff',color:'#1a56db',fontSize:12,fontWeight:600,cursor:'pointer',marginBottom:14}}>＋ Ajouter un article</button>

    <Inp label="Frais de livraison / expédition (DA)" type="number" value={shipping} onChange={e=>setShipping(e.target.value)}/>

    <div style={{background:'#f9fafb',borderRadius:9,padding:'12px 14px',marginBottom:14}}>
      {[['Sous-total',totals.subtotal],['Remise totale',-totals.discountTotal],['TVA totale',totals.taxTotal],['Livraison',Number(shipping)||0]].map(([l,v])=>
        <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:12.5,padding:'3px 0',color:'#374151'}}><span>{l}</span><span>{v<0?'-':''}{fmt(Math.abs(v))}</span></div>
      )}
      <div style={{display:'flex',justifyContent:'space-between',fontSize:15,fontWeight:800,color:'#1a56db',paddingTop:8,marginTop:6,borderTop:'1px solid #e5e7eb'}}><span>TOTAL GÉNÉRAL</span><span>{fmt(totals.grandTotal)}</span></div>
    </div>

    <Inp label="Notes" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Instructions, remarques..."/>

    <div style={{fontWeight:700,fontSize:12.5,color:'#111827',margin:'14px 0 8px'}}>Pièces jointes</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
      {[['quotation','Devis fournisseur'],['invoice','Facture'],['deliveryNote','Bon de livraison']].map(([slot,label])=>
        <div key={slot}>
          <label style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4,padding:'12px 8px',border:'1.5px dashed #d1d5db',borderRadius:9,cursor:'pointer',background:attachments[slot]?'#f0fdf4':'#f9fafb',textAlign:'center'}}>
            <span style={{fontSize:18}}>{attachments[slot]?'✅':'📄'}</span>
            <span style={{fontSize:10.5,fontWeight:600,color:attachments[slot]?'#16a34a':'#6b7280',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'100%'}}>{attachments[slot]?attachments[slot].name:label}</span>
            <input type="file" accept=".pdf,image/*" style={{display:'none'}} onChange={e=>pickAttachment(slot,e.target.files[0])}/>
          </label>
        </div>
      )}
    </div>

    <BtnP onClick={submit} style={{width:'100%',justifyContent:'center'}}>✓ {oid?'Enregistrer les modifications':'Créer la commande'}</BtnP>
  </Modal>;
}

// ─── PURCHASE ORDER VIEW / RECEIVE MODAL ───────────────────────────────────────
function POViewModal({oid,close,ctx}) {
  const {orders,setOrders,supps,mats,setMats,stockMovements,setStockMovements,settings,showToast,setModal}=ctx;
  const o=orders.find(x=>x.id===oid); if(!o) return null;
  const s=supps.find(x=>x.id===o.supId);
  const totals=poTotals(o.items,o.shipping);
  const remaining=totals.grandTotal-(o.paidAmount||0);
  const [receiving,setReceiving]=useState(false);
  const [recvQty,setRecvQty]=useState(()=>Object.fromEntries(o.items.map(it=>[it.id,it.qty-(it.received||0)])));
  const [payAmt,setPayAmt]=useState(remaining);
  const [payDate,setPayDate]=useState(tod());
  const [payMethod,setPayMethod]=useState('Virement bancaire');
  const [showPay,setShowPay]=useState(false);

  const [busy,setBusy]=useState(false);
  const doReceive=async()=>{
    if(busy)return;
    setBusy(true);
    try{
      const receipts=o.items.filter(it=>(Number(recvQty[it.id])||0)>0).map(it=>({itemId:it.id,qtyReceived:Number(recvQty[it.id])}));
      if(!receipts.length){showToast('Aucune quantité à réceptionner');setBusy(false);return;}
      const updated=await api.receiveOrder(oid,receipts);
      setOrders(p=>p.map(x=>x.id!==oid?x:updated));
      // Recharge les matériaux impactés pour refléter le nouveau stock (le serveur l'a déjà ajusté)
      const matIds=[...new Set(o.items.filter(it=>it.matId).map(it=>it.matId))];
      const freshMats=await Promise.all(matIds.map(id=>apiFetch('/materials/'+id).catch(()=>null)));
      setMats(prevMats=>prevMats.map(m=>{
        const fresh=freshMats.find(f=>f&&f.id===m.id);
        return fresh?{...m,stock:Number(fresh.stock),cost:Number(fresh.cost)}:m;
      }));
      const moves=await Promise.all(matIds.map(id=>api.getMaterialMovements(id)));
      setStockMovements(prev=>{
        const others=prev.filter(mv=>!matIds.includes(mv.matId));
        return [...others,...moves.flat()];
      });
      showToast(updated.status==='RECEIVED'?'Commande entièrement reçue — stock mis à jour ✓':'Réception partielle enregistrée — stock mis à jour ✓');
      setReceiving(false);
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };

  const doPay=async()=>{
    if(busy)return;
    if(!payAmt||payAmt<=0){showToast('Montant invalide');return;}
    setBusy(true);
    try{
      const updated=await api.payOrder(oid,{amount:Number(payAmt),date:payDate,method:payMethod});
      setOrders(p=>p.map(x=>x.id!==oid?x:updated));
      showToast('Paiement enregistré ✓');
      setShowPay(false);
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };

  const printPO=()=>{
    const inner=
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px">'+
        '<div style="background:#f9fafb;border-radius:8px;padding:12px"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Fournisseur</div><div style="font-size:14px;font-weight:700">'+(s?.name||'—')+'</div><div style="font-size:11px;color:#6b7280">'+(s?.contact||'')+' · '+(s?.phone||'')+'</div></div>'+
        '<div style="background:#f9fafb;border-radius:8px;padding:12px"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Dates</div><div style="font-size:12px">Commande : <b>'+o.orderDate+'</b></div><div style="font-size:12px">Livraison prévue : <b>'+(o.expectedDate||'—')+'</b></div></div>'+
      '</div>'+
      reportTableHTML(
        [{label:'Produit'},{label:'Catégorie'},{label:'Qté',align:'right'},{label:'P.U.',align:'right'},{label:'Remise',align:'right'},{label:'Total',align:'right'}],
        o.items.map(it=>[it.name,it.category||'—',it.qty+' '+it.unit,fmtDA(it.unitPrice),(it.discount||0)+'%',fmtDA(poItemTotal(it))]),
        ['','','','','TOTAL GÉNÉRAL',fmtDA(totals.grandTotal)]
      )+
      (o.notes?'<div style="margin-top:14px;padding:10px 12px;background:#fffbeb;border-radius:8px;font-size:12px"><b>Notes :</b> '+o.notes+'</div>':'');
    printReport(settings,'Bon de commande — '+o.poNum,s?.name||'',inner,{landscape:true});
  };

  return <Modal title={'Commande — '+o.poNum} onClose={close} wide>
    <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
      <span style={{fontSize:11,fontWeight:700,padding:'4px 11px',borderRadius:99,background:PO_STATUS_COLORS[o.status]+'22',color:PO_STATUS_COLORS[o.status]}}>{PO_STATUS_LABELS[o.status]}</span>
      <span style={{fontSize:11,fontWeight:700,padding:'4px 11px',borderRadius:99,background:PO_PAY_COLORS[o.paymentStatus]+'22',color:PO_PAY_COLORS[o.paymentStatus]}}>{PO_PAY_LABELS[o.paymentStatus]}</span>
      <div style={{marginLeft:'auto',display:'flex',gap:6}}>
        <BtnO sm onClick={printPO}>🖨 Imprimer</BtnO>
        <BtnO sm onClick={()=>{close();setModal({t:'editPO',oid});}}>✏ Modifier</BtnO>
      </div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
      <div style={{background:'#f9fafb',borderRadius:8,padding:12}}><div style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',fontWeight:700}}>Fournisseur</div><div style={{fontSize:13.5,fontWeight:700}}>{s?.name||'—'}</div>{s?.contact&&<div style={{fontSize:11.5,color:'#6b7280'}}>{s.contact} · {s.phone}</div>}</div>
      <div style={{background:'#f9fafb',borderRadius:8,padding:12}}><div style={{fontSize:10,color:'#6b7280',textTransform:'uppercase',fontWeight:700}}>Dates</div><div style={{fontSize:12}}>Commande : <b>{o.orderDate}</b></div><div style={{fontSize:12}}>Prévue : <b>{o.expectedDate||'—'}</b></div></div>
    </div>

    <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Articles</div>
    <div className="table-wrap" style={{marginBottom:14}}><table style={{width:'100%',borderCollapse:'collapse'}}>
      <thead><tr>{['Produit','Qté','Reçu','P.U.','Remise','Total'].map(h=><th key={h} style={{padding:'6px 10px',textAlign:h==='Produit'?'left':'right',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
      <tbody>{o.items.map(it=><tr key={it.id}>
        <td style={{padding:'7px 10px',fontSize:12,fontWeight:600,borderBottom:'1px solid #f3f4f6'}}>{it.name}</td>
        <td style={{padding:'7px 10px',fontSize:12,textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{it.qty} {it.unit}</td>
        <td style={{padding:'7px 10px',fontSize:12,textAlign:'right',color:(it.received||0)>=it.qty?'#16a34a':(it.received||0)>0?'#d97706':'#9ca3af',fontWeight:600,borderBottom:'1px solid #f3f4f6'}}>{it.received||0}</td>
        <td style={{padding:'7px 10px',fontSize:12,textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(it.unitPrice)}</td>
        <td style={{padding:'7px 10px',fontSize:12,textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{it.discount||0}%</td>
        <td style={{padding:'7px 10px',fontSize:12,fontWeight:700,textAlign:'right',color:'#1a56db',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(poItemTotal(it))}</td>
      </tr>)}</tbody>
    </table></div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
      <div style={{background:'#f9fafb',borderRadius:9,padding:'12px 14px'}}>
        {[['Sous-total',totals.subtotal],['Remise',-totals.discountTotal],['TVA',totals.taxTotal],['Livraison',o.shipping||0]].map(([l,v])=>
          <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'2px 0',color:'#374151'}}><span>{l}</span><span>{v<0?'-':''}{fmt(Math.abs(v))}</span></div>
        )}
        <div style={{display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:800,color:'#1a56db',paddingTop:6,marginTop:4,borderTop:'1px solid #e5e7eb'}}><span>Total général</span><span>{fmt(totals.grandTotal)}</span></div>
      </div>
      <div style={{background:remaining>0?'#fef2f2':'#f0fdf4',borderRadius:9,padding:'12px 14px'}}>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'2px 0'}}><span>Payé</span><b style={{color:'#16a34a'}}>{fmt(o.paidAmount||0)}</b></div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:800,padding:'4px 0',color:remaining>0?'#dc2626':'#16a34a'}}><span>Solde restant</span><span>{fmt(remaining)}</span></div>
        {remaining>0&&<BtnG sm onClick={()=>setShowPay(true)} style={{width:'100%',justifyContent:'center',marginTop:8}}>💳 Enregistrer un paiement</BtnG>}
      </div>
    </div>

    {showPay&&<div style={{border:'1px solid #bfdbfe',background:'#eff6ff',borderRadius:9,padding:12,marginBottom:14}}>
      <Fr2><Inp label="Montant" type="number" value={payAmt} onChange={e=>setPayAmt(Number(e.target.value))}/><Inp label="Date" type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/></Fr2>
      <Sel label="Mode de paiement" value={payMethod} onChange={e=>setPayMethod(e.target.value)} options={['Espèces','Virement bancaire','Chèque','Carte bancaire']}/>
      <div style={{display:'flex',gap:8}}><BtnG onClick={doPay} style={{flex:1,justifyContent:'center'}}>✓ Confirmer le paiement</BtnG><BtnO onClick={()=>setShowPay(false)}>Annuler</BtnO></div>
    </div>}

    {!['RECEIVED','CANCELLED'].includes(o.status)&&<>
      {!receiving
        ?<BtnG onClick={()=>setReceiving(true)} style={{width:'100%',justifyContent:'center',marginBottom:10}}>📦 Réceptionner la marchandise</BtnG>
        :<div style={{border:'1px solid #bbf7d0',background:'#f0fdf4',borderRadius:9,padding:12,marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Quantités reçues</div>
          {o.items.map(it=><div key={it.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #f3f4f6'}}>
            <span style={{fontSize:12}}>{it.name} <span style={{color:'#9ca3af'}}>(commandé: {it.qty}, déjà reçu: {it.received||0})</span></span>
            <input type="number" value={recvQty[it.id]} onChange={e=>setRecvQty(p=>({...p,[it.id]:Number(e.target.value)}))} style={{width:80,padding:'5px 8px',borderRadius:6,border:'1px solid #d1d5db',fontSize:12}}/>
          </div>)}
          <div style={{display:'flex',gap:8,marginTop:10}}><BtnG onClick={doReceive} style={{flex:1,justifyContent:'center'}}>✓ Confirmer la réception</BtnG><BtnO onClick={()=>setReceiving(false)}>Annuler</BtnO></div>
        </div>
      }
    </>}

    {(o.attachments?.quotation||o.attachments?.invoice||o.attachments?.deliveryNote)&&<div style={{marginBottom:10}}>
      <div style={{fontWeight:700,fontSize:12,marginBottom:6}}>Pièces jointes</div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {['quotation','invoice','deliveryNote'].map(slot=>o.attachments?.[slot]&&
          <a key={slot} href={o.attachments[slot].url} download={o.attachments[slot].name} target="_blank" rel="noreferrer" style={{fontSize:11.5,padding:'6px 11px',background:'#eff6ff',color:'#1a56db',borderRadius:7,textDecoration:'none',fontWeight:600}}>⬇ {o.attachments[slot].name}</a>
        )}
      </div>
    </div>}
    {o.notes&&<Alert type="i"><b>Notes :</b> {o.notes}</Alert>}
  </Modal>;
}

// ─── SUPPLIER STATEMENT MODAL ──────────────────────────────────────────────────
function SupplierStatementModal({sid,close,ctx}) {
  const {supps,orders,settings}=ctx;
  const s=supps.find(x=>x.id===sid); if(!s) return null;
  const [scope,setScope]=useState('ALL'); // 'UNPAID' | 'PAID' | 'ALL'
  const allOrders=orders.filter(o=>o.supId===sid).sort((a,b)=>(b.orderDate||'').localeCompare(a.orderDate||''));
  const rows=scope==='ALL'?allOrders:allOrders.filter(o=>o.paymentStatus===scope);
  const total=rows.reduce((sum,o)=>sum+poTotals(o.items,o.shipping).grandTotal,0);
  const paid=rows.reduce((sum,o)=>sum+(o.paidAmount||0),0);
  const due=total-paid;
  const allDue=allOrders.reduce((sum,o)=>sum+(poTotals(o.items,o.shipping).grandTotal-(o.paidAmount||0)),0);
  const printStatement=()=>{
    const html=buildSupplierStatementHTML(s,rows,settings,scope);
    if(!openPrintWindow(html)) return;
  };
  return <Modal title={'Relevé — '+s.name} onClose={close} wide>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:10}}>
      <div style={{display:'flex',gap:6}}>
        {[{v:'UNPAID',l:'Impayées'},{v:'PAID',l:'Payées'},{v:'ALL',l:'Toutes'}].map(o=>
          <button key={o.v} onClick={()=>setScope(o.v)} style={{padding:'6px 14px',borderRadius:99,border:'1px solid '+(scope===o.v?'#1a56db':'#d1d5db'),background:scope===o.v?'#1a56db':'#fff',color:scope===o.v?'#fff':'#374151',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>{o.l}</button>
        )}
      </div>
      <button onClick={printStatement} style={{padding:'7px 14px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>🖨 Imprimer le relevé</button>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
      <div style={{background:'#f9fafb',borderRadius:8,padding:11,textAlign:'center'}}><div style={{fontSize:16,fontWeight:800,color:'#1a56db'}}>{fmt(total)}</div><div style={{fontSize:10,color:'#6b7280'}}>Total ({rows.length} commande{rows.length>1?'s':''})</div></div>
      <div style={{background:'#f0fdf4',borderRadius:8,padding:11,textAlign:'center'}}><div style={{fontSize:16,fontWeight:800,color:'#16a34a'}}>{fmt(paid)}</div><div style={{fontSize:10,color:'#6b7280'}}>Payé</div></div>
      <div style={{background:due>0?'#fef2f2':'#f0fdf4',borderRadius:8,padding:11,textAlign:'center'}}><div style={{fontSize:16,fontWeight:800,color:due>0?'#dc2626':'#16a34a'}}>{fmt(due)}</div><div style={{fontSize:10,color:'#6b7280'}}>Solde dû</div></div>
    </div>
    {allDue>0&&scope!=='ALL'&&<Alert type="w">Solde dû total sur toutes les commandes (tous statuts) : <b>{fmt(allDue)}</b></Alert>}
    <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse',minWidth:600}}>
      <thead><tr>{['N° PO','Date','Articles','Total','Payé','Solde dû','Statut'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:['Total','Payé','Solde dû'].includes(h)?'right':h==='Statut'?'center':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((o,idx)=>{
        const t=poTotals(o.items,o.shipping);
        const d=t.grandTotal-(o.paidAmount||0);
        return <tr key={o.id} style={{background:idx%2===0?'#fff':'#fafafa'}}>
          <td style={{padding:'7px 11px',fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:'#1a56db',fontWeight:700,borderBottom:'1px solid #f3f4f6'}}>{o.poNum}</td>
          <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{o.orderDate}</td>
          <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.items.map(it=>it.name).join(', ')}</td>
          <td style={{padding:'7px 11px',fontSize:12,fontWeight:700,textAlign:'right',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(t.grandTotal)}</td>
          <td style={{padding:'7px 11px',fontSize:11.5,textAlign:'right',color:'#16a34a',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(o.paidAmount||0)}</td>
          <td style={{padding:'7px 11px',fontSize:12,fontWeight:700,textAlign:'right',color:d>0?'#dc2626':'#16a34a',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(d)}</td>
          <td style={{padding:'7px 11px',textAlign:'center',borderBottom:'1px solid #f3f4f6'}}><span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:99,background:PO_PAY_COLORS[o.paymentStatus]+'22',color:PO_PAY_COLORS[o.paymentStatus]}}>{PO_PAY_LABELS[o.paymentStatus]}</span></td>
        </tr>;
      })}
      {rows.length===0&&<tr><td colSpan={7} style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucune commande pour ce filtre</td></tr>}
      </tbody>
    </table></div>
  </Modal>;
}

// ─── TECHNICIAN STATEMENT MODAL ─────────────────────────────────────────────────
function TechStatementModal({tid,close,ctx}) {
  const {users,cases,techPayments,settings}=ctx;
  const tech=users.find(u=>u.id===tid); if(!tech) return null;
  const [scope,setScope]=useState('ALL'); // 'EARN' | 'PAY' | 'ALL'
  const curMonth=tod().slice(0,7);
  const steps=cases.flatMap(c=>
    c.wf.filter(w=>w.done&&w.s!=='RECEIVED'&&w.s!=='READY'&&(w.tId===tid||(c.techId===tid&&!w.tId)))
      .map(w=>{
        const gain=(w.el||c.teeth?.length||1)*(RATE[w.s]||tech.rate||0);
        const stepDate=(w.end&&w.end.length>=7?w.end:null)||(w.start&&w.start.length>=7?w.start:null)||c.due||curMonth+'-01';
        return {...w,gain,month:stepDate.slice(0,7),caseObj:c};
      })
  ).sort((a,b)=>(b.month||'').localeCompare(a.month||''));
  const payments=(techPayments.filter(p=>p.techId===tid)||[]).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const earned=steps.reduce((s,w)=>s+w.gain,0);
  const versed=payments.reduce((s,p)=>s+p.amount,0);
  const due=Math.max(0,earned-versed);
  const printStatement=()=>{
    const html=buildTechStatementHTML(tech,steps,payments,settings,scope);
    if(!openPrintWindow(html)) return;
  };
  return <Modal title={'Relevé — '+tech.name} onClose={close} wide>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:10}}>
      <div style={{display:'flex',gap:6}}>
        {[{v:'EARN',l:'Gains'},{v:'PAY',l:'Versements'},{v:'ALL',l:'Tout'}].map(o=>
          <button key={o.v} onClick={()=>setScope(o.v)} style={{padding:'6px 14px',borderRadius:99,border:'1px solid '+(scope===o.v?'#1a56db':'#d1d5db'),background:scope===o.v?'#1a56db':'#fff',color:scope===o.v?'#fff':'#374151',fontSize:11.5,fontWeight:600,cursor:'pointer'}}>{o.l}</button>
        )}
      </div>
      <button onClick={printStatement} style={{padding:'7px 14px',borderRadius:8,border:'1px solid #d1d5db',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>🖨 Imprimer le relevé</button>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:14}}>
      <div style={{background:'#eff6ff',borderRadius:8,padding:11,textAlign:'center'}}><div style={{fontSize:16,fontWeight:800,color:'#1a56db'}}>{fmt(earned)}</div><div style={{fontSize:10,color:'#6b7280'}}>Total gagné</div></div>
      <div style={{background:'#f0fdf4',borderRadius:8,padding:11,textAlign:'center'}}><div style={{fontSize:16,fontWeight:800,color:'#16a34a'}}>{fmt(versed)}</div><div style={{fontSize:10,color:'#6b7280'}}>Total versé</div></div>
      <div style={{background:due>0?'#fef2f2':'#f0fdf4',borderRadius:8,padding:11,textAlign:'center'}}><div style={{fontSize:16,fontWeight:800,color:due>0?'#dc2626':'#16a34a'}}>{fmt(due)}</div><div style={{fontSize:10,color:'#6b7280'}}>Restant dû</div></div>
    </div>

    {(scope==='EARN'||scope==='ALL')&&<>
      <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Détail des gains ({steps.length})</div>
      <div className="table-wrap" style={{marginBottom:16}}><table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr>{['Dossier','Patient','Étape','Mois','Gain'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:h==='Gain'?'right':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
        <tbody>{steps.map((w,i)=>{const cfg=SC[w.s]||{l:w.s};return <tr key={w.caseObj.id+w.s} style={{background:i%2===0?'#fff':'#fafafa'}}>
          <td style={{padding:'7px 11px',fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:'#1a56db',fontWeight:600,borderBottom:'1px solid #f3f4f6'}}>{w.caseObj.num}</td>
          <td style={{padding:'7px 11px',fontSize:12,fontWeight:600,borderBottom:'1px solid #f3f4f6'}}>{w.caseObj.pf} {w.caseObj.pl}</td>
          <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{cfg.l}</td>
          <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{w.month}</td>
          <td style={{padding:'7px 11px',fontSize:12,fontWeight:700,textAlign:'right',color:'#1a56db',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(w.gain)}</td>
        </tr>;})}
        {steps.length===0&&<tr><td colSpan={5} style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun gain</td></tr>}
        </tbody>
      </table></div>
    </>}

    {(scope==='PAY'||scope==='ALL')&&<>
      <div style={{fontWeight:700,fontSize:12.5,marginBottom:8}}>Versements ({payments.length})</div>
      <div className="table-wrap"><table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr>{['Date','Note','Montant'].map(h=><th key={h} style={{padding:'7px 11px',textAlign:h==='Montant'?'right':'left',fontSize:9.5,fontWeight:600,color:'#6b7280',textTransform:'uppercase',borderBottom:'2px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
        <tbody>{payments.map((p,i)=><tr key={p.id} style={{background:i%2===0?'#fff':'#fafafa'}}>
          <td style={{padding:'7px 11px',fontSize:11,color:'#6b7280',borderBottom:'1px solid #f3f4f6'}}>{p.date}</td>
          <td style={{padding:'7px 11px',fontSize:11.5,borderBottom:'1px solid #f3f4f6'}}>{p.note||'—'}</td>
          <td style={{padding:'7px 11px',fontSize:12,fontWeight:700,textAlign:'right',color:'#16a34a',borderBottom:'1px solid #f3f4f6'}}>{fmtDA(p.amount)}</td>
        </tr>)}
        {payments.length===0&&<tr><td colSpan={3} style={{padding:20,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun versement</td></tr>}
        </tbody>
      </table></div>
    </>}
  </Modal>;
}

// ─── DOC MODAL ────────────────────────────────────────────────────────────────
function DocModal({uid:eid,close,ctx}) {
  const {users,setUsers,showToast}=ctx;
  const u=eid?users.find(x=>x.id===eid):null;
  const clinics=users.filter(x=>x.role==='CLINIC');
  const [f,setF]=useState({name:u?.name||'',spec:u?.spec||'',phone:u?.phone||'',clinicId:u?.clinicId||clinics[0]?.id||''});
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(!f.name||!f.clinicId){showToast('Nom et clinique sont requis');return;}
    setBusy(true);
    try{
      const linkedClinic=clinics.find(c=>c.id===f.clinicId);
      const body={name:f.name,spec:f.spec,phone:f.phone,clinic_id:f.clinicId};
      if(eid){
        await api.update(api.simple.doctors,eid,body);
        setUsers(p=>p.map(x=>x.id===eid?{...x,...f,clinique:linkedClinic?.name||''}:x));
        showToast('Praticien mis à jour');
      }else{
        const created=await api.create(api.simple.doctors,body);
        setUsers(p=>[...p,{id:created.id,name:f.name,role:'DOCTOR',clinicId:f.clinicId,clinique:linkedClinic?.name||'',active:true,spec:f.spec,phone:f.phone,col:created.color||'#7c3aed'}]);
        showToast('Praticien ajouté');
      }
      close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };
  return <Modal title={eid?'Modifier le praticien':'Ajouter un praticien'} onClose={close}>
    <Alert type="i">Les praticiens n'ont pas de compte de connexion : ils sont gérés via le compte de leur clinique.</Alert>
    <Inp label="Nom complet *" value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Dr. Nom Prénom"/>
    <Fr2><Inp label="Spécialité" value={f.spec} onChange={e=>setF({...f,spec:e.target.value})} placeholder="Généraliste, Orthodontiste..."/><Inp label="Téléphone" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></Fr2>
    <Sel label="Clinique de rattachement *" value={f.clinicId} onChange={e=>setF({...f,clinicId:e.target.value})} options={clinics.map(c=>({v:c.id,l:c.name}))}/>
    {clinics.length===0&&<Alert type="w">Aucune clinique n'existe encore — créez-en une d'abord depuis la page "Cliniques".</Alert>}
    <BtnP onClick={submit} style={{width:'100%',justifyContent:'center'}}>✓ {eid?'Sauvegarder':'Ajouter'}</BtnP>
  </Modal>;
}

// ─── MY DOCTOR MODAL (clinic self-service add/edit — no login credentials) ────
function MyDoctorModal({uid:eid,close,ctx}) {
  const {user,users,setUsers,showToast}=ctx;
  const d=eid?users.find(x=>x.id===eid):null;
  const [f,setF]=useState({name:d?.name||'',spec:d?.spec||'',phone:d?.phone||''});
  const submit=()=>{
    if(!f.name){showToast('Le nom est requis');return;}
    if(eid){setUsers(p=>p.map(x=>x.id===eid?{...x,...f}:x));showToast('Praticien mis à jour');}
    else{setUsers(p=>[...p,{id:'d'+uid(),...f,role:'DOCTOR',clinicId:user.id,clinique:user.name,active:true,col:'#'+Math.floor(Math.random()*16777215).toString(16).padStart(6,'0')}]);showToast('Praticien ajouté ✓');}
    close();
  };
  return <Modal title={eid?'Modifier le praticien':'Ajouter un praticien'} onClose={close}>
    <Inp label="Nom complet *" value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Dr. Nom Prénom"/>
    <Fr2><Inp label="Spécialité" value={f.spec} onChange={e=>setF({...f,spec:e.target.value})} placeholder="Généraliste, Orthodontiste..."/><Inp label="Téléphone" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></Fr2>
    <BtnP onClick={submit} style={{width:'100%',justifyContent:'center'}}>✓ {eid?'Sauvegarder':'Ajouter à ma clinique'}</BtnP>
  </Modal>;
}


// ─── CLINIC MODAL (admin add/edit clinic account) ─────────────────────────────
function ClinicModal({uid:eid,close,ctx}) {
  const {users,setUsers,showToast}=ctx;
  const cl=eid?users.find(x=>x.id===eid):null;
  const [f,setF]=useState({name:cl?.name||'',email:cl?.email||'',pw:'',address:cl?.address||'',phone:cl?.phone||''});
  const [busy,setBusy]=useState(false);
  const myDocs=eid?users.filter(u=>u.role==='DOCTOR'&&u.clinicId===eid):[];
  const otherDocs=users.filter(u=>u.role==='DOCTOR'&&u.clinicId!==eid);
  const submit=async()=>{
    if(busy)return;
    if(!f.name||!f.email||(!eid&&!f.pw)){showToast('Champs requis manquants');return;}
    setBusy(true);
    try{
      const body={name:f.name,email:f.email,address:f.address,phone:f.phone};
      if(f.pw)body.password=f.pw;
      if(eid){
        await api.update('/clinics',eid,body);
        setUsers(p=>p.map(x=>x.id===eid?{...x,name:f.name,email:f.email,address:f.address,phone:f.phone}:x));
        showToast('Clinique mise à jour');
      }else{
        const created=await api.create('/clinics',body);
        setUsers(p=>[...p,{id:created.id,name:f.name,email:f.email,role:'CLINIC',address:f.address,phone:f.phone,col:created.color||'#0e7490',active:true}]);
        showToast('Clinique ajoutée');
      }
      close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };
  const toggleDoc=async(docId,attach)=>{
    try{
      await api.update(api.simple.doctors,docId,{clinic_id:attach?eid:null});
      setUsers(p=>p.map(u=>u.id===docId?{...u,clinicId:attach?eid:null,clinique:attach?f.name:u.clinique}:u));
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}
  };
  return <Modal title={eid?'Modifier la clinique':'Ajouter une clinique'} onClose={close}>
    <Inp label="Nom de la clinique *" value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Clinique El Fath"/>
    <Inp label="Email (identifiant de connexion) *" type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} placeholder="contact@clinique.dz"/>
    <Inp label={eid?"Nouveau mot de passe (laisser vide pour ne pas changer)":"Mot de passe *"} type="password" value={f.pw} onChange={e=>setF({...f,pw:e.target.value})}/>
    <Fr2><Inp label="Téléphone" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/><Inp label="Adresse" value={f.address} onChange={e=>setF({...f,address:e.target.value})}/></Fr2>
    {eid&&<>
      <div style={{fontWeight:700,fontSize:12.5,color:'#111827',margin:'14px 0 8px'}}>Praticiens rattachés ({myDocs.length})</div>
      {myDocs.length===0&&<div style={{fontSize:11.5,color:'#9ca3af',marginBottom:8}}>Aucun praticien rattaché</div>}
      {myDocs.map(d=><div key={d.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',background:'#f0fdf4',borderRadius:7,marginBottom:5}}>
        <span style={{fontSize:12,fontWeight:500}}>{d.name}</span>
        <button onClick={()=>toggleDoc(d.id,false)} style={{fontSize:10.5,color:'#dc2626',background:'none',border:'none',cursor:'pointer'}}>Détacher</button>
      </div>)}
      {otherDocs.length>0&&<>
        <div style={{fontSize:10.5,fontWeight:700,color:'#6b7280',textTransform:'uppercase',margin:'12px 0 6px'}}>Rattacher un praticien existant</div>
        {otherDocs.map(d=><div key={d.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 10px',background:'#f9fafb',borderRadius:7,marginBottom:5}}>
          <span style={{fontSize:12}}>{d.name} {d.clinicId&&<span style={{color:'#9ca3af',fontSize:10.5}}>(actuellement ailleurs)</span>}</span>
          <button onClick={()=>toggleDoc(d.id,true)} style={{fontSize:10.5,color:'#1a56db',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>+ Rattacher</button>
        </div>)}
      </>}
    </>}
    {!eid&&<Alert type="i">Vous pourrez rattacher des praticiens à cette clinique après sa création.</Alert>}
    <BtnP onClick={submit} style={{width:'100%',justifyContent:'center',marginTop:10}}>✓ {eid?'Sauvegarder':'Créer la clinique'}</BtnP>
  </Modal>;
}

// ─── EMP MODAL ────────────────────────────────────────────────────────────────
function EmpModal({uid:eid,close,ctx}) {
  const {users,setUsers,stageDefs,showToast}=ctx;
  const u=eid?users.find(x=>x.id===eid):null;
  const [f,setF]=useState({name:u?.name||'',email:u?.email||'',pw:'',spec:u?.spec||'',rate:u?.rate||400});
  const [acc,setAcc]=useState(u?.acc||[]);
  const [busy,setBusy]=useState(false);
  const tog=s=>setAcc(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s]);
  const submit=async()=>{
    if(busy)return;
    if(!f.name||!f.email||(!eid&&!f.pw)){showToast('Champs requis manquants');return;}
    setBusy(true);
    try{
      if(eid){
        const body={name:f.name,spec:f.spec,rate:f.rate,stageAccess:acc};
        if(f.pw)body.password=f.pw;
        await api.update('/users',eid,body);
        setUsers(p=>p.map(x=>x.id===eid?{...x,name:f.name,spec:f.spec,rate:f.rate,acc}:x));
        showToast('Technicien mis à jour');
      }else{
        const created=await api.create('/users',{name:f.name,email:f.email,password:f.pw,role:'TECHNICIAN',spec:f.spec,rate:f.rate,stageAccess:acc});
        setUsers(p=>[...p,{id:created.id,name:f.name,email:f.email,role:'TECHNICIAN',spec:f.spec,rate:f.rate,acc,col:'#1d4ed8',active:true}]);
        showToast('Technicien ajouté');
      }
      close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };
  const editableStages=stageDefs.filter(s=>s.editable);
  return <Modal title={eid?`Modifier — ${u?.name||''}`:'Ajouter un technicien'} onClose={close}>
    {u&&<div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,padding:'10px 12px',background:'#f9fafb',borderRadius:9}}><Av u={u} sz={36}/><div><div style={{fontWeight:600}}>{u.name}</div><div style={{fontSize:11,color:'#6b7280'}}>{u.spec}</div></div></div>}
    <Inp label="Nom complet *" value={f.name} onChange={e=>setF({...f,name:e.target.value})}/>
    <Fr><Inp label="Email *" type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})} disabled={!!eid}/><Inp label={eid?"Nouveau mot de passe (optionnel)":"Mot de passe *"} type="password" value={f.pw} onChange={e=>setF({...f,pw:e.target.value})}/></Fr>
    <Inp label="Spécialité / désignation du poste" value={f.spec} onChange={e=>setF({...f,spec:e.target.value})} placeholder="ex: Conception & Fraisage"/>
    <Inp label="Tarif de base par élément (DA)" type="number" value={f.rate} onChange={e=>setF({...f,rate:Number(e.target.value)})}/>
    <div style={{marginBottom:10}}>
      <label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:8}}>Étapes du workflow autorisées <span style={{color:'#9ca3af',fontWeight:400}}>(cocher les étapes que ce technicien peut traiter)</span></label>
      <div style={{border:'1px solid #e5e7eb',borderRadius:9,overflow:'hidden'}}>
        {editableStages.map((s,i)=>{const on=acc.includes(s.id);return <div key={s.id} onClick={()=>tog(s.id)} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',cursor:'pointer',background:on?s.bg+'88':'#fff',borderBottom:i<editableStages.length-1?'1px solid #f3f4f6':'none',transition:'background .15s'}}>
          <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${on?s.c:'#d1d5db'}`,background:on?s.c:'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all .15s'}}>
            {on&&<span style={{color:'#fff',fontSize:11,lineHeight:1,fontWeight:700}}>✓</span>}
          </div>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:7}}>
              <span style={{background:s.bg,color:s.c,padding:'2px 9px',borderRadius:99,fontSize:11.5,fontWeight:600}}>{s.label}</span>
              <span style={{fontSize:11,color:'#9ca3af'}}>ID: {s.id}</span>
            </div>
            <div style={{fontSize:10.5,color:'#6b7280',marginTop:2}}>Tarif: <b>{fmt(s.rate)}/élément</b></div>
          </div>
          {on&&<span style={{fontSize:11,color:s.c,fontWeight:600}}>✓ Assignée</span>}
        </div>;})}
      </div>
      {acc.length===0&&<div style={{marginTop:6,fontSize:11.5,color:'#e02424'}}>⚠ Cochez au moins une étape</div>}
      {acc.length>0&&<div style={{marginTop:6,padding:'7px 10px',background:'#f0fdf4',borderRadius:7,fontSize:11,color:'#16a34a'}}>✓ {acc.length} étape{acc.length>1?'s':''} assignée{acc.length>1?'s':''} : {acc.map(sid=>stageDefs.find(x=>x.id===sid)?.label||sid).join(', ')}</div>}
    </div>
    <BtnP onClick={submit} style={{width:'100%',justifyContent:'center',marginTop:4}}>✓ {eid?'Sauvegarder les modifications':'Ajouter le technicien'}</BtnP>
  </Modal>;
}

// ─── RT MODAL ─────────────────────────────────────────────────────────────────
function RTModal({rtId,close,ctx}) {
  const {restoTypes,setRestoTypes,showToast}=ctx;
  const r=rtId?restoTypes.find(x=>x.id===rtId):null;
  const CATS=['Couronne','Bridge','Facette','Implant','Prothèse','Temporaire','Appareil','Autre'];
  const [f,setF]=useState({name:r?.name||'',cat:r?.cat||'Couronne',price:r?.price||4500});
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(!f.name){showToast('Nom requis');return;}
    setBusy(true);
    try{
      if(rtId){
        await api.update(api.simple.restoTypes,rtId,{name:f.name,category:f.cat,price:f.price});
        setRestoTypes(p=>p.map(x=>x.id===rtId?{...x,...f}:x));
        showToast('Type mis à jour');
      }else{
        const created=await api.create(api.simple.restoTypes,{name:f.name,category:f.cat,price:f.price});
        setRestoTypes(p=>[...p,{id:created.id,name:f.name,cat:f.cat,price:f.price,active:true}]);
        showToast('Type ajouté');
      }
      close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };
  return <Modal title={rtId?'Modifier le type':'Ajouter un type de restauration'} onClose={close}>
    <Inp label="Nom *" value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="ex: Couronne Zircone HP"/>
    <Sel label="Catégorie" value={f.cat} onChange={e=>setF({...f,cat:e.target.value})} options={CATS}/>
    <Inp label="Prix par défaut (DA)" type="number" value={f.price} onChange={e=>setF({...f,price:Number(e.target.value)})}/>
    <BtnP onClick={submit} style={{width:'100%',justifyContent:'center'}}>✓ {rtId?'Sauvegarder':'Ajouter'}</BtnP>
  </Modal>;
}

// ─── MAT MODAL ────────────────────────────────────────────────────────────────
function MatModal({close,ctx}) {
  const {setMats,supps,showToast}=ctx;
  const CATS=['ZIRCONIA','PMMA','WAX','TITANIUM','IMPLANT','CONSUMABLE'];
  const [f,setF]=useState({code:'',name:'',cat:'ZIRCONIA',unit:'disc',stock:0,min:5,cost:3500,sup:supps[0]?.id||''});
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(!f.code||!f.name){showToast('Code et nom requis');return;}
    setBusy(true);
    try{
      const created=await api.createMaterial({code:f.code,name:f.name,category:f.cat,unit:f.unit,stock:f.stock,minStock:f.min,cost:f.cost});
      setMats(p=>[...p,{id:created.id,code:f.code,name:f.name,cat:f.cat,unit:f.unit,stock:f.stock,min:f.min,cost:f.cost,active:true}]);
      close();showToast('Matériau ajouté');
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };
  return <Modal title="Ajouter un matériau" onClose={close}>
    <Fr><Inp label="Code *" value={f.code} onChange={e=>setF({...f,code:e.target.value})} placeholder="ZIR-98-XX"/><Sel label="Catégorie" value={f.cat} onChange={e=>setF({...f,cat:e.target.value})} options={CATS}/></Fr>
    <Inp label="Désignation *" value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="Zirconia Disc 98mm..."/>
    <Fr><Inp label="Stock initial" type="number" value={f.stock} onChange={e=>setF({...f,stock:Number(e.target.value)})}/><Inp label="Stock minimum" type="number" value={f.min} onChange={e=>setF({...f,min:Number(e.target.value)})}/></Fr>
    <Fr><Sel label="Unité" value={f.unit} onChange={e=>setF({...f,unit:e.target.value})} options={['disc','piece','set','tube','box']}/><Inp label="Coût unitaire (DA)" type="number" value={f.cost} onChange={e=>setF({...f,cost:Number(e.target.value)})}/></Fr>
    <Sel label="Fournisseur" value={f.sup} onChange={e=>setF({...f,sup:e.target.value})} options={supps.map(s=>({v:s.id,l:s.name}))}/>
    <BtnP onClick={submit} style={{width:'100%',justifyContent:'center'}}>✓ Ajouter</BtnP>
  </Modal>;
}

// ─── DOC CASES MODAL ─────────────────────────────────────────────────────────
function DocCasesModal({docId,close,ctx}) {
  const {users,cases,restoTypes,setModal}=ctx;
  const d=users.find(u=>u.id===docId); if(!d)return null;
  const dc=cases.filter(c=>c.docId===docId);
  const sl={PAID:'Payée',UNPAID:'Impayée'};
  return <Modal title={`Dossiers de ${d.name} — ${d.clinique}`} onClose={close} wide>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
      <div style={{background:'#eff6ff',borderRadius:9,padding:10,textAlign:'center'}}><div style={{fontWeight:700,fontSize:20,color:'#1d4ed8'}}>{dc.length}</div><div style={{fontSize:10.5,color:'#6b7280'}}>Total dossiers</div></div>
      <div style={{background:'#f0fdf4',borderRadius:9,padding:10,textAlign:'center'}}><div style={{fontWeight:700,fontSize:20,color:'#16a34a'}}>{dc.filter(c=>c.status==='READY').length}</div><div style={{fontSize:10.5,color:'#6b7280'}}>Prêts</div></div>
      <div style={{background:'#fff7ed',borderRadius:9,padding:10,textAlign:'center'}}><div style={{fontWeight:700,fontSize:20,color:'#c2410c'}}>{dc.filter(c=>!['DELIVERED','CANCELLED','READY'].includes(c.status)).length}</div><div style={{fontSize:10.5,color:'#6b7280'}}>En production</div></div>
    </div>
    {dc.length===0?<div style={{textAlign:'center',padding:32,color:'#9ca3af',fontSize:13}}>Aucun dossier pour ce dentiste</div>
    :<div style={{display:'flex',flexDirection:'column',gap:8}}>{dc.map(c=>{
      const rt=restoTypes.find(r=>r.id===c.rtId);
      const idx=STAGES.indexOf(c.status),pct=Math.round((idx/(STAGES.length-1))*100);
      return <div key={c.id} style={{border:'1px solid #f3f4f6',borderRadius:9,padding:12,cursor:'pointer',transition:'all .13s'}} onClick={()=>{close();setModal({t:'case',cid:c.id});}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:7}}>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
              <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,color:'#1a56db',fontWeight:600}}>{c.num}</span>
              <SBadge st={c.status}/>
              <PBadge p={c.pri}/>
              {c.remake&&<span style={{fontSize:9.5,background:'#fef3c7',color:'#92400e',padding:'1px 6px',borderRadius:99}}>Remake</span>}
            </div>
            <div style={{fontWeight:600,fontSize:13}}>Patient : {c.pf} {c.pl}</div>
            <div style={{fontSize:11.5,color:'#6b7280',marginTop:2}}>
              {rt?.name||'—'} · Teinte {c.sh||'—'} · {c.teeth?.length||0} dent{(c.teeth?.length||0)>1?'s':''} · Échéance {c.due}
            </div>
          </div>
          <div style={{fontSize:12,fontWeight:600,color:'#1a56db',whiteSpace:'nowrap'}}>{fmt(rt?.price||0)}</div>
        </div>
        <div style={{marginBottom:2}}><div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#9ca3af',marginBottom:2}}><span>Progression</span><span>{pct}%</span></div>
          <div style={{height:4,background:'#f3f4f6',borderRadius:99}}><div style={{height:'100%',background:'#1a56db',borderRadius:99,width:`${pct}%`,transition:'width .4s'}}/></div>
        </div>
        <div style={{fontSize:10.5,color:'#6b7280',marginTop:4}}>Cliquez pour ouvrir le dossier complet →</div>
      </div>;
    })}</div>}
  </Modal>;
}

// ─── SUPP MODAL ───────────────────────────────────────────────────────────────
function SuppModal({sid,close,ctx}) {
  const {supps,setSupps,showToast}=ctx;
  const s=sid?supps.find(x=>x.id===sid):null;
  const [f,setF]=useState({name:s?.name||'',contact:s?.contact||'',email:s?.email||'',phone:s?.phone||'',city:s?.city||'',address:s?.address||'',paymentTerms:s?.paymentTerms||'',notes:s?.notes||''});
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(!f.name){showToast('Nom requis');return;}
    setBusy(true);
    try{
      const body={name:f.name,contact:f.contact,email:f.email,phone:f.phone,city:f.city,address:f.address,payment_terms:f.paymentTerms,notes:f.notes};
      if(sid){
        await api.update(api.simple.suppliers,sid,body);
        setSupps(p=>p.map(x=>x.id===sid?{...x,...f}:x));
        showToast('Fournisseur mis à jour');
      }else{
        const created=await api.create(api.simple.suppliers,body);
        setSupps(p=>[...p,{id:created.id,...f,active:true}]);
        showToast('Fournisseur ajouté');
      }
      close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };
  return <Modal title={sid?'Modifier fournisseur':'Ajouter un fournisseur'} onClose={close}>
    <Inp label="Nom / Société *" value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="DentMed Algeria"/>
    <Fr><Inp label="Personne de contact" value={f.contact} onChange={e=>setF({...f,contact:e.target.value})}/><Inp label="Ville" value={f.city} onChange={e=>setF({...f,city:e.target.value})} placeholder="Alger"/></Fr>
    <Fr><Inp label="Email" type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/><Inp label="Téléphone" value={f.phone} onChange={e=>setF({...f,phone:e.target.value})}/></Fr>
    <Inp label="Adresse" value={f.address} onChange={e=>setF({...f,address:e.target.value})} placeholder="Zone industrielle, rue..."/>
    <Inp label="Conditions de paiement" value={f.paymentTerms} onChange={e=>setF({...f,paymentTerms:e.target.value})} placeholder="ex: 30 jours net, Comptant..."/>
    <Inp label="Notes" value={f.notes} onChange={e=>setF({...f,notes:e.target.value})} placeholder="Remarques diverses..."/>
    <BtnP onClick={submit} style={{width:'100%',justifyContent:'center'}}>✓ {sid?'Sauvegarder':'Ajouter'}</BtnP>
  </Modal>;
}

// ─── EXPENSES PAGE ────────────────────────────────────────────────────────────
function ExpensesPage({user,expenses,setExpenses,expenseCats,setExpenseCats,caisse,setCaisse,showToast,setModal,settings,setArchives,setAuditLog}) {
  const ICON_OPTIONS=['🧱','📎','🔧','🏢','👥','🚗','📢','📦','💊','🖥','🔬','📋','🎯','💡','🏪','📱','🛠','💰','📦','🌐'];
  const COLOR_OPTIONS=['#1d4ed8','#0891b2','#c2410c','#7c3aed','#166534','#d97706','#a21caf','#6b7280','#dc2626','#059669','#9333ea'];
  const [showCatMgr,setShowCatMgr]=useState(false);
  const [catForm,setCatForm]=useState({name:'',icon:'📦',color:'#6b7280'});
  const [editCatId,setEditCatId]=useState(null);
  const [filterCat,setFilterCat]=useState('');
  const [filterMonth,setFilterMonth]=useState('');
  const [tab,setTab]=useState(0);

  const resetCatForm=()=>{setCatForm({name:'',icon:'📦',color:'#6b7280'});setEditCatId(null);};
  const startEditCat=(c)=>{setCatForm({name:c.name,icon:c.icon,color:c.color});setEditCatId(c.id);};
  const saveCat=()=>{
    if(!catForm.name.trim()){showToast('Nom de catégorie requis');return;}
    if(editCatId){
      setExpenseCats(p=>p.map(c=>c.id===editCatId?{...c,...catForm,name:catForm.name.trim()}:c));
      showToast('Catégorie modifiée ✓');
    } else {
      const id='ec'+Date.now();
      setExpenseCats(p=>[...p,{id,...catForm,name:catForm.name.trim()}]);
      showToast('Catégorie ajoutée ✓');
    }
    resetCatForm();
  };
  const deleteCat=(id)=>{
    if(expenses.some(e=>e.catId===id)){showToast('Impossible : des dépenses utilisent cette catégorie');return;}
    if(!window.confirm('Supprimer cette catégorie ?'))return;
    setExpenseCats(p=>p.filter(c=>c.id!==id));
    if(editCatId===id)resetCatForm();
    showToast('Catégorie supprimée');
  };

  const vis=expenses.filter(e=>(!filterCat||e.catId===filterCat)&&(!filterMonth||e.date.startsWith(filterMonth)));
  const total=vis.reduce((s,e)=>s+e.amount,0);
  const byCat={};
  expenses.forEach(e=>{if(!byCat[e.catId])byCat[e.catId]=0;byCat[e.catId]+=e.amount;});
  const months=[...new Set(expenses.map(e=>e.date.slice(0,7)))].sort().reverse();

  const deleteExp=(id)=>{
    if(!window.confirm('Archiver cette dépense ?'))return;
    const e=expenses.find(x=>x.id===id);
    if(e) archiveRecord({user,setArchives,setAuditLog},'expenses',e,'Suppression manuelle');
    api.remove(api.simple.expenses,id).then(()=>{setExpenses(p=>p.filter(x=>x.id!==id));}).catch(err=>showToast('Erreur : '+(err.message||'échec')));
    showToast('Dépense archivée ✓');
  };

  return <>
    {/* KPIs */}
    <div className="kpi-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
      <Kpi label="Total dépenses" val={fmtDA(expenses.reduce((s,e)=>s+e.amount,0))} col="#e02424"/>
      <Kpi label="Ce mois" val={fmtDA(expenses.filter(e=>e.date.startsWith(tod().slice(0,7))).reduce((s,e)=>s+e.amount,0))} col="#d97706"/>
      <Kpi label="Catégories" val={expenseCats.length} col="#1a56db"/>
      <Kpi label="Entrées" val={expenses.length} col="#7e3af2"/>
    </div>

    {/* Tabs */}
    <div style={{display:'flex',borderBottom:'2px solid #f3f4f6',marginBottom:14}}>
      {['📋 Liste des charges','📊 Par catégorie'].map((t,i)=><div key={i} onClick={()=>setTab(i)} style={{padding:'9px 16px',fontSize:12.5,fontWeight:500,cursor:'pointer',color:tab===i?'#1a56db':'#6b7280',borderBottom:`2px solid ${tab===i?'#1a56db':'transparent'}`,marginBottom:-2}}>{t}</div>)}
    </div>

    {tab===0 && <>
      {/* Filters + Add */}
      <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap',alignItems:'flex-end'}}>
        <div style={{flex:1,minWidth:140}}>
          <label style={{fontSize:10.5,color:'#6b7280',display:'block',marginBottom:3}}>Catégorie</label>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{...{fontFamily:"'DM Sans',sans-serif",fontSize:12,padding:'6px 10px',borderRadius:7,border:'1px solid #e5e7eb',background:'#fff',width:'100%',outline:'none'}}}>
            <option value="">Toutes</option>
            {expenseCats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </div>
        <div style={{flex:1,minWidth:140}}>
          <label style={{fontSize:10.5,color:'#6b7280',display:'block',marginBottom:3}}>Mois</label>
          <select value={filterMonth} onChange={e=>setFilterMonth(e.target.value)} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,padding:'6px 10px',borderRadius:7,border:'1px solid #e5e7eb',background:'#fff',width:'100%',outline:'none'}}>
            <option value="">Tous</option>
            {months.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <Btn variant="ghost" onClick={()=>setShowCatMgr(p=>!p)} style={{alignSelf:'flex-end'}}>⚙ Catégories</Btn>
        <Btn variant="ghost" onClick={()=>{
          const rows=[...vis].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>{
            const cat=expenseCats.find(c=>c.id===e.catId);
            return [e.date,(cat?cat.icon+' '+cat.name:'—'),e.desc,fmtDA(e.amount),e.note||'—'];
          });
          const label=(filterCat?' — '+(expenseCats.find(c=>c.id===filterCat)?.name||''):'')+(filterMonth?' — '+filterMonth:'');
          const inner=reportTableHTML(
            [{label:'Date'},{label:'Catégorie'},{label:'Description'},{label:'Montant',align:'right'},{label:'Observation'}],
            rows,
            ['','','TOTAL',fmtDA(total),'']
          );
          printReport(settings,'Charges & Dépenses'+label,vis.length+' dépense(s)',inner);
        }} style={{alignSelf:'flex-end'}}>🖨 Imprimer</Btn>
        <Btn onClick={()=>setModal({t:'addExpense'})} style={{alignSelf:'flex-end'}}>＋ Ajouter dépense</Btn>
      </div>

      {showCatMgr&&<div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)',padding:14,marginBottom:12}}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Gestion des catégories</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:14}}>
          {expenseCats.map(c=><div key={c.id} style={{display:'flex',alignItems:'center',gap:6,padding:'5px 5px 5px 10px',borderRadius:99,background:c.color+'18',border:editCatId===c.id?`1px solid ${c.color}`:'1px solid transparent'}}>
            <span style={{fontSize:12.5,fontWeight:600,color:c.color}}>{c.icon} {c.name}</span>
            <button onClick={()=>startEditCat(c)} style={{border:'none',background:'none',cursor:'pointer',fontSize:12,padding:2}}>✏</button>
            <button onClick={()=>deleteCat(c.id)} style={{border:'none',background:'none',cursor:'pointer',fontSize:12,padding:2}}>🗑</button>
          </div>)}
          {expenseCats.length===0&&<span style={{fontSize:12,color:'#9ca3af'}}>Aucune catégorie</span>}
        </div>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div style={{flex:'1 1 160px',minWidth:140}}>
            <label style={{fontSize:10.5,color:'#6b7280',display:'block',marginBottom:3}}>Nom de la catégorie</label>
            <input value={catForm.name} onChange={e=>setCatForm({...catForm,name:e.target.value})} placeholder="ex: Loyer" style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,padding:'6px 10px',borderRadius:7,border:'1px solid #e5e7eb',width:'100%',outline:'none'}}/>
          </div>
          <div>
            <label style={{fontSize:10.5,color:'#6b7280',display:'block',marginBottom:3}}>Icône</label>
            <select value={catForm.icon} onChange={e=>setCatForm({...catForm,icon:e.target.value})} style={{fontFamily:"'DM Sans',sans-serif",fontSize:14,padding:'6px 8px',borderRadius:7,border:'1px solid #e5e7eb',background:'#fff',outline:'none'}}>
              {ICON_OPTIONS.map(ic=><option key={ic} value={ic}>{ic}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:10.5,color:'#6b7280',display:'block',marginBottom:3}}>Couleur</label>
            <div style={{display:'flex',gap:4}}>
              {COLOR_OPTIONS.map(col=><div key={col} onClick={()=>setCatForm({...catForm,color:col})} style={{width:20,height:20,borderRadius:6,background:col,cursor:'pointer',border:catForm.color===col?'2px solid #111827':'2px solid transparent'}}/>)}
            </div>
          </div>
          <Btn onClick={saveCat}>{editCatId?'✓ Enregistrer':'＋ Ajouter'}</Btn>
          {editCatId&&<Btn variant="ghost" onClick={resetCatForm}>Annuler</Btn>}
        </div>
      </div>}

      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div style={{padding:'11px 14px',background:'#fafafa',borderBottom:'1px solid #f3f4f6',borderRadius:'11px 11px 0 0',fontWeight:700,fontSize:13}}>{vis.length} dépenses — Total : {fmtDA(total)}</div>
        <div className="table-wrap">
          <table style={{width:'100%',borderCollapse:'collapse',minWidth:540}}>
            <thead><tr>{['Date','Catégorie','Description','Montant','Observation',''].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
            <tbody>{vis.sort((a,b)=>b.date.localeCompare(a.date)).map(e=>{
              const cat=expenseCats.find(c=>c.id===e.catId);
              return <tr key={e.id} style={{cursor:'default'}}>
                <td style={{padding:'9px 12px',fontSize:12,borderBottom:'1px solid #f9fafb',fontFamily:"'JetBrains Mono',monospace",color:'#6b7280'}}>{e.date}</td>
                <td style={{padding:'9px 12px',borderBottom:'1px solid #f9fafb'}}><span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11.5,fontWeight:500,padding:'2px 9px',borderRadius:99,background:cat?.color+'18',color:cat?.color}}>{cat?.icon} {cat?.name||'—'}</span></td>
                <td style={{padding:'9px 12px',fontSize:12.5,borderBottom:'1px solid #f9fafb',fontWeight:500}}>{e.desc}</td>
                <td style={{padding:'9px 12px',fontSize:13,borderBottom:'1px solid #f9fafb',fontWeight:700,color:'#e02424'}}>{fmtDA(e.amount)}</td>
                <td style={{padding:'9px 12px',fontSize:11.5,borderBottom:'1px solid #f9fafb',color:'#6b7280',fontStyle:e.note?'normal':'italic'}}>{e.note||'—'}</td>
                <td style={{padding:'9px 12px',borderBottom:'1px solid #f9fafb'}}>
                  <div style={{display:'flex',gap:4}}>
                    <Btn sm variant="ghost" onClick={()=>setModal({t:'editExpense',eid:e.id})}>✏</Btn>
                    <Btn sm variant="danger" onClick={()=>deleteExp(e.id)}>🗑</Btn>
                  </div>
                </td>
              </tr>;
            })}
            {vis.length===0&&<tr><td colSpan={6} style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucune dépense trouvée</td></tr>}
            </tbody>
          </table></div>
      </div>
    </>}

    {tab===1 && <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:12}}>
      {expenseCats.map(cat=>{
        const total=expenses.filter(e=>e.catId===cat.id).reduce((s,e)=>s+e.amount,0);
        const count=expenses.filter(e=>e.catId===cat.id).length;
        const maxTotal=Math.max(...expenseCats.map(c=>expenses.filter(e=>e.catId===c.id).reduce((s,e)=>s+e.amount,0)));
        return <Card key={cat.id} style={{padding:16}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <div style={{width:38,height:38,borderRadius:10,background:cat.color+'18',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20}}>{cat.icon}</div>
            <div><div style={{fontWeight:600,fontSize:13}}>{cat.name}</div><div style={{fontSize:10.5,color:'#6b7280'}}>{count} entrée{count!==1?'s':''}</div></div>
          </div>
          <div style={{fontSize:18,fontWeight:700,color:cat.color,marginBottom:8}}>{fmtDA(total)}</div>
          <div style={{height:5,background:'#f3f4f6',borderRadius:99,overflow:'hidden'}}>
            <div style={{height:'100%',background:cat.color,borderRadius:99,width:`${maxTotal>0?(total/maxTotal)*100:0}%`,transition:'width .4s'}}/>
          </div>
          <div style={{fontSize:10.5,color:'#9ca3af',marginTop:5}}>{maxTotal>0?Math.round((total/maxTotal)*100):0}% du max</div>
        </Card>;
      })}
    </div>}
  </>;
}

// ─── CAISSE PAGE ──────────────────────────────────────────────────────────────
function CaissePage({caisse,setCaisse,showToast,setModal,settings}) {
  const [dateFilter,setDateFilter]=useState('');
  const [typeFilter,setTypeFilter]=useState('');

  const vis=caisse.filter(m=>(!dateFilter||m.date===dateFilter)&&(!typeFilter||m.type===typeFilter));
  const totalIn=caisse.reduce((s,m)=>m.type==='IN'?s+m.amount:s,0);
  const totalOut=caisse.reduce((s,m)=>m.type==='OUT'?s+m.amount:s,0);
  const solde=totalIn-totalOut;

  // Running balance
  const sorted=[...caisse].sort((a,b)=>a.date.localeCompare(b.date));
  let running=0;
  const withBalance=sorted.map(m=>{running+=m.type==='IN'?m.amount:-m.amount;return {...m,balance:running};});
  const visWithBal=withBalance.filter(m=>(!dateFilter||m.date===dateFilter)&&(!typeFilter||m.type===typeFilter)).reverse();

  return <>
    <div className="kpi-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
      <Kpi label="Total entrées" val={fmtDA(totalIn)} col="#059669"/>
      <Kpi label="Total sorties" val={fmtDA(totalOut)} col="#e02424"/>
      <Kpi label="Solde caisse" val={fmtDA(solde)} col={solde>=0?'#1a56db':'#e02424'}/>
      <Kpi label="Mouvements" val={caisse.length} col="#7e3af2"/>
    </div>

    {solde<0&&<Alert type="e" style={{marginBottom:12}}>⚠ Solde caisse négatif : {fmtDA(solde)}</Alert>}

    {/* Filters */}
    <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap',alignItems:'flex-end'}}>
      <div style={{flex:1,minWidth:140}}>
        <label style={{fontSize:10.5,color:'#6b7280',display:'block',marginBottom:3}}>Date</label>
        <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,padding:'6px 10px',borderRadius:7,border:'1px solid #e5e7eb',background:'#fff',width:'100%',outline:'none'}}/>
      </div>
      <div style={{flex:1,minWidth:140}}>
        <label style={{fontSize:10.5,color:'#6b7280',display:'block',marginBottom:3}}>Type</label>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,padding:'6px 10px',borderRadius:7,border:'1px solid #e5e7eb',background:'#fff',width:'100%',outline:'none'}}>
          <option value="">Tous</option>
          <option value="IN">Entrées seulement</option>
          <option value="OUT">Sorties seulement</option>
        </select>
      </div>
      <div style={{display:'flex',gap:6,alignSelf:'flex-end'}}>
        <Btn onClick={()=>setModal({t:'addCaisse',mvType:'IN'})} variant="success">＋ Entrée</Btn>
        <Btn onClick={()=>setModal({t:'addCaisse',mvType:'OUT'})} variant="danger">− Sortie</Btn>
        <Btn variant="ghost" onClick={()=>{
          const rows=visWithBal.map(m=>[
            m.date,
            m.type==='IN'?'▲ Entrée':'▼ Sortie',
            m.desc,
            m.ref||'—',
            (m.type==='IN'?'+':'-')+fmtDA(m.amount),
            fmtDA(m.balance)
          ]);
          const label=(dateFilter?' — '+dateFilter:'')+(typeFilter?' — '+(typeFilter==='IN'?'Entrées':'Sorties'):'');
          const inner=reportTableHTML(
            [{label:'Date'},{label:'Type'},{label:'Description'},{label:'Référence'},{label:'Montant',align:'right'},{label:'Solde cumulé',align:'right'}],
            rows,
            ['','','','TOTAL',fmtDA(totalIn-totalOut),fmtDA(solde)]
          );
          printReport(settings,'Mouvement de Caisse'+label,visWithBal.length+' mouvement(s)',inner);
        }}>🖨 Imprimer</Btn>
      </div>
    </div>

    <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
      <div style={{padding:'11px 14px',background:'#fafafa',borderBottom:'1px solid #f3f4f6',borderRadius:'11px 11px 0 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontWeight:700,fontSize:13}}>Journal de caisse</span><span style={{fontSize:11.5,fontWeight:600,color:solde>=0?'#059669':'#e02424'}}>Solde : {fmtDA(solde)}</span></div>
      <div className="table-wrap" style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr>{['Date','Type','Description','Référence','Montant','Solde cumulé',''].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6'}}>{h}</th>)}</tr></thead>
          <tbody>{visWithBal.map(m=><tr key={m.id}>
            <td style={{padding:'9px 12px',fontSize:11.5,borderBottom:'1px solid #f9fafb',fontFamily:"'JetBrains Mono',monospace",color:'#6b7280'}}>{m.date}</td>
            <td style={{padding:'9px 12px',borderBottom:'1px solid #f9fafb'}}>
              <span style={{fontSize:11,fontWeight:600,padding:'2px 9px',borderRadius:99,background:m.type==='IN'?'#d1fae5':'#fef2f2',color:m.type==='IN'?'#065f46':'#e02424'}}>{m.type==='IN'?'▲ Entrée':'▼ Sortie'}</span>
            </td>
            <td style={{padding:'9px 12px',fontSize:12.5,borderBottom:'1px solid #f9fafb',fontWeight:500}}>{m.desc}</td>
            <td style={{padding:'9px 12px',fontSize:11,borderBottom:'1px solid #f9fafb',fontFamily:"'JetBrains Mono',monospace",color:'#6b7280'}}>{m.ref||'—'}</td>
            <td style={{padding:'9px 12px',fontSize:13,borderBottom:'1px solid #f9fafb',fontWeight:700,color:m.type==='IN'?'#059669':'#e02424'}}>{m.type==='IN'?'+':'-'}{fmtDA(m.amount)}</td>
            <td style={{padding:'9px 12px',fontSize:12,borderBottom:'1px solid #f9fafb',fontWeight:600,color:m.balance>=0?'#1a56db':'#e02424'}}>{fmtDA(m.balance)}</td>
            <td style={{padding:'9px 12px',borderBottom:'1px solid #f9fafb'}}><button onClick={()=>setModal({t:'addCaisse',mvId:m.id})} title="Modifier" style={{border:'none',background:'none',cursor:'pointer',fontSize:13}}>✏</button></td>
          </tr>)}
          {visWithBal.length===0&&<tr><td colSpan={7} style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun mouvement trouvé</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  </>;
}

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage({settings,setSettings,showToast,cases,invoices,users,expenses,caisse}) {
  const [tab,setTab]=useState(0);
  const [s,setS]=useState({...settings});
  const save=async()=>{
    try{
      const updated=await api.updateSettings(s);
      setSettings(updated);
      showToast('Paramètres sauvegardés');
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}
  };

  const THEMES=[{v:'light',l:'Clair ☀️'},{v:'dark',l:'Sombre 🌙'}];
  const LANGS=[{v:'fr',l:'Français'},{v:'ar',l:'العربية'},{v:'en',l:'English'}];
  const CURRENCIES=[{v:'DA',l:'DA — Dinar Algérien'},{v:'EUR',l:'€ — Euro'},{v:'USD',l:'$ — Dollar US'}];
  const FONT_SIZES=[{v:12,l:'Petit'},{v:13.5,l:'Normal'},{v:15,l:'Grand'},{v:16.5,l:'Très grand'}];
  const COLORS=['#1a56db','#059669','#7c3aed','#c2410c','#be123c','#0891b2','#d97706','#111827'];

  // Backup
  const doBackup=()=>{
    const data={cases,invoices,users,expenses,caisse,settings,exportDate:new Date().toISOString(),version:'4.0'};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download=`dentlab_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();showToast('Sauvegarde téléchargée');
  };
  const doRestore=(e)=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{try{const d=JSON.parse(ev.target.result);if(d.version){showToast('Restauration réussie — rechargez la page');}}catch{showToast('Fichier invalide');}};
    reader.readAsText(file);
  };

  const TABS=['🏢 Laboratoire','🎨 Apparence','💾 Sauvegarde'];

  return <>
    <div style={{display:'flex',gap:0,borderBottom:'2px solid #f3f4f6',marginBottom:14}}>
      {TABS.map((t,i)=><div key={i} onClick={()=>setTab(i)} style={{padding:'9px 16px',fontSize:12.5,fontWeight:500,cursor:'pointer',color:tab===i?s.primaryColor:'#6b7280',borderBottom:`2px solid ${tab===i?s.primaryColor:'transparent'}`,marginBottom:-2,whiteSpace:'nowrap'}}>{t}</div>)}
    </div>

    {tab===0&&<div style={{maxWidth:600,display:'flex',flexDirection:'column',gap:12}}>
      <Card>
        <CH title="Informations du laboratoire"/>
        <div style={{padding:'14px 16px'}}>
          <Fr2><Inp label="Nom du laboratoire" value={s.companyName||''} onChange={e=>setS({...s,companyName:e.target.value})} placeholder="DentLab Pro"/>
          <Inp label="Téléphone" value={s.companyPhone||''} onChange={e=>setS({...s,companyPhone:e.target.value})} placeholder="0555 000 000"/></Fr2>
          <Inp label="Adresse complète" value={s.companyAddress||''} onChange={e=>setS({...s,companyAddress:e.target.value})} placeholder="12 Rue des Cliniques, Alger"/>
          <div style={{background:'#f9fafb',borderRadius:9,padding:'14px 16px',marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:12,color:'#111827',marginBottom:10}}>Date et Heure</div>
            <Fr2>
              <SelEl label="Format de date" value={s.dateFormat||'DD/MM/YYYY'} onChange={e=>setS({...s,dateFormat:e.target.value})} options={[{v:'DD/MM/YYYY',l:'JJ/MM/AAAA (28/06/2026)'},{v:'YYYY-MM-DD',l:'AAAA-MM-JJ (2026-06-28)'}]}/>
              <SelEl label="Format heure" value={s.timeFormat||'24h'} onChange={e=>setS({...s,timeFormat:e.target.value})} options={[{v:'24h',l:'Format 24h (14:30)'},{v:'12h',l:'Format 12h (02:30 PM)'}]}/>
            </Fr2>
            <Fr2>
              <SelEl label="Fuseau horaire" value={s.timezone||'Africa/Algiers'} onChange={e=>setS({...s,timezone:e.target.value})} options={[{v:'Africa/Algiers',l:'Alger (UTC+1)'},{v:'Europe/Paris',l:'Paris (UTC+1/2)'},{v:'UTC',l:'UTC+0'}]}/>
              <SelEl label="Debut annee fiscale" value={s.fiscalYear||'01'} onChange={e=>setS({...s,fiscalYear:e.target.value})} options={[{v:'01',l:'Janvier'},{v:'04',l:'Avril'},{v:'07',l:'Juillet'},{v:'10',l:'Octobre'}]}/>
            </Fr2>
            <div style={{padding:'8px 12px',background:'#eff6ff',borderRadius:7,fontSize:11.5,color:'#1e40af',marginTop:6}}>
              Maintenant : <b>{new Date().toLocaleDateString('fr-DZ')} {new Date().toLocaleTimeString('fr-DZ')}</b>
            </div>
          </div>
          <Fr2>
            <Inp label="NIF (N° Identification Fiscale)" value={s.nif||''} onChange={e=>setS({...s,nif:e.target.value})} placeholder="000000000000000"/>
            <Inp label="NIS (N° Identification Statistique)" value={s.nis||''} onChange={e=>setS({...s,nis:e.target.value})} placeholder="000000000000000"/>
          </Fr2>
          <Fr2>
            <Inp label="AI (Article d'Imposition)" value={s.ai||''} onChange={e=>setS({...s,ai:e.target.value})} placeholder="00000000"/>
            <Inp label="RC (Registre de Commerce)" value={s.rc||''} onChange={e=>setS({...s,rc:e.target.value})} placeholder="00/00-0000000B00"/>
          </Fr2>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:6}}>Logo du laboratoire</label>
            <label style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',border:'2px dashed #e5e7eb',borderRadius:9,cursor:'pointer',background:'#fafafa'}}>
              {s.logo?<img src={s.logo} style={{width:60,height:60,objectFit:'contain',borderRadius:6}} alt="logo"/>:<div style={{width:60,height:60,background:'#f3f4f6',borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',fontSize:24}}>🏥</div>}
              <div><div style={{fontSize:12.5,fontWeight:500,color:'#374151'}}>Cliquer pour changer le logo</div><div style={{fontSize:10.5,color:'#9ca3af'}}>PNG, JPG — max 2MB</div></div>
              <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>setS({...s,logo:ev.target.result});r.readAsDataURL(f);}}/>
            </label>
          </div>
        </div>
      </Card>
      <Btn onClick={save} style={{width:'100%',justifyContent:'center',padding:11,fontSize:13,background:s.primaryColor}}>✓ Sauvegarder les informations</Btn>
    </div>}

    {tab===1&&<div style={{maxWidth:600,display:'flex',flexDirection:'column',gap:12}}>
      <Card>
        <CH title="Langue & Devise"/>
        <div style={{padding:'14px 16px'}}>
          <Fr2>
            <SelEl label="Langue d'interface" value={s.lang} onChange={e=>setS({...s,lang:e.target.value})} options={LANGS}/>
            <SelEl label="Devise" value={s.currency} onChange={e=>setS({...s,currency:e.target.value})} options={CURRENCIES}/>
          </Fr2>
        </div>
      </Card>
      <Card>
        <CH title="Taille de police"/>
        <div style={{padding:'14px 16px'}}>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {FONT_SIZES.map(f=><div key={f.v} onClick={()=>setS({...s,fontSize:f.v})} style={{padding:'10px 16px',borderRadius:9,border:`2px solid ${s.fontSize===f.v?s.primaryColor:'#e5e7eb'}`,background:s.fontSize===f.v?s.primaryColor+'11':'#f9fafb',cursor:'pointer',fontSize:f.v*0.85,fontWeight:500,color:s.fontSize===f.v?s.primaryColor:'#374151',transition:'all .13s'}}>{f.l}<br/><span style={{fontSize:10,opacity:.6}}>{f.v}px</span></div>)}
          </div>
        </div>
      </Card>
      <Card>
        <CH title="Thème"/>
        <div style={{padding:'14px 16px',display:'flex',gap:10}}>
          {THEMES.map(t=><div key={t.v} onClick={()=>setS({...s,theme:t.v})} style={{flex:1,padding:'12px',borderRadius:9,border:`2px solid ${s.theme===t.v?s.primaryColor:'#e5e7eb'}`,background:s.theme===t.v?s.primaryColor+'11':'#f9fafb',cursor:'pointer',textAlign:'center',fontWeight:600,fontSize:14,color:s.theme===t.v?s.primaryColor:'#374151'}}>{t.l}</div>)}
        </div>
      </Card>
      <Card>
        <CH title="Couleur principale"/>
        <div style={{padding:'14px 16px',display:'flex',gap:10,flexWrap:'wrap'}}>
          {COLORS.map(col=><div key={col} onClick={()=>setS({...s,primaryColor:col})} style={{width:38,height:38,borderRadius:'50%',background:col,cursor:'pointer',border:`4px solid ${s.primaryColor===col?col:'transparent'}`,outline:`2px solid ${s.primaryColor===col?'#fff':'transparent'}`,boxShadow:s.primaryColor===col?`0 0 0 3px ${col}44`:undefined,transition:'all .15s'}}/>)}
        </div>
      </Card>
      <Btn onClick={save} style={{width:'100%',justifyContent:'center',padding:11,fontSize:13,background:s.primaryColor}}>✓ Sauvegarder l'apparence</Btn>
    </div>}

    {tab===2&&<div style={{maxWidth:600,display:'flex',flexDirection:'column',gap:12}}>
      <Card>
        <CH title="💾 Sauvegarde des données"/>
        <div style={{padding:'14px 16px'}}>
          <Alert type="info">La sauvegarde inclut : dossiers, factures, dépenses, mouvements de caisse, paramètres.</Alert>
          <Btn onClick={doBackup} style={{width:'100%',justifyContent:'center',marginBottom:10,background:s.primaryColor}}>⬇ Télécharger la sauvegarde (JSON)</Btn>
          <div style={{padding:'12px',background:'#f0fdf4',borderRadius:8,fontSize:12,color:'#166534',marginBottom:10}}>Dernière sauvegarde : {new Date().toLocaleDateString('fr-DZ')} — {cases.length} dossiers, {expenses.length} dépenses</div>
        </div>
      </Card>
      <Card>
        <CH title="📂 Restaurer une sauvegarde"/>
        <div style={{padding:'14px 16px'}}>
          <Alert type="warn">⚠ La restauration remplacera toutes les données actuelles.</Alert>
          <label style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,padding:'20px',border:'2px dashed #e5e7eb',borderRadius:9,cursor:'pointer',background:'#fafafa'}}>
            <span style={{fontSize:28}}>📂</span>
            <span style={{fontSize:12.5,fontWeight:500,color:'#374151'}}>Cliquer pour sélectionner le fichier de sauvegarde</span>
            <span style={{fontSize:10.5,color:'#9ca3af'}}>Fichier .json uniquement</span>
            <input type="file" accept=".json" style={{display:'none'}} onChange={doRestore}/>
          </label>
        </div>
      </Card>
    </div>}
  </>;
}
// ─── MODAL: ADD EXPENSE ───────────────────────────────────────────────────────
function AddExpenseModal({eid,close,ctx}) {
  const {expenses,setExpenses,expenseCats,caisse,setCaisse,showToast}=ctx;
  const ex=eid?expenses.find(x=>x.id===eid):null;
  const [f,setF]=useState({catId:ex?.catId||expenseCats[0].id,amount:ex?.amount||0,desc:ex?.desc||'',date:ex?.date||tod(),note:ex?.note||''});
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(!f.desc||!f.amount||f.amount<=0){showToast('Remplissez tous les champs');return;}
    setBusy(true);
    try{
      if(eid){
        await api.update(api.simple.expenses,eid,{category_id:f.catId,amount:Number(f.amount),description:f.desc,date:f.date,note:f.note});
        setExpenses(p=>p.map(x=>x.id===eid?{...x,...f,amount:Number(f.amount)}:x));
        showToast('Dépense mise à jour');
      } else {
        const created=await api.create(api.simple.expenses,{category_id:f.catId,amount:Number(f.amount),description:f.desc,date:f.date,note:f.note});
        setExpenses(p=>[...p,{id:created.id,...f,amount:Number(f.amount)}]);
        // Mouvement de caisse (sortie) créé automatiquement, comme côté serveur logique métier
        const mv=await api.create(api.simple.cashMovements,{type:'OUT',amount:Number(f.amount),description:f.desc,date:f.date,ref:''});
        setCaisse(p=>[...p,{id:mv.id,type:'OUT',amount:Number(f.amount),desc:f.desc,date:f.date,ref:''}]);
        showToast('Dépense ajoutée + mouvement caisse créé');
      }
      close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };
  return <Modal title={eid?'Modifier la dépense':'Ajouter une dépense'} onClose={close}>
    <SelEl label="Catégorie *" value={f.catId} onChange={e=>setF({...f,catId:e.target.value})} options={expenseCats.map(c=>({v:c.id,l:`${c.icon} ${c.name}`}))} required/>
    <Inp label="Description *" value={f.desc} onChange={e=>setF({...f,desc:e.target.value})} placeholder="ex: Achat matières premières" required/>
    <Fr2>
      <Inp label="Montant (DA) *" type="number" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})} min={0} required/>
      <Inp label="Date *" type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})} required/>
    </Fr2>
    <div style={{marginBottom:10}}>
      <label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:3}}>Observation / notes</label>
      <textarea value={f.note} onChange={e=>setF({...f,note:e.target.value})} placeholder="Numéro de facture, détails, référence..." style={{fontFamily:"'DM Sans',sans-serif",fontSize:12.5,padding:'7px 10px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',color:'#111827',width:'100%',outline:'none',resize:'vertical',minHeight:60}}/>
    </div>
    {!eid&&<Alert type="info">💡 Un mouvement de caisse (sortie) sera créé automatiquement.</Alert>}
    <Btn onClick={submit} style={{width:'100%',justifyContent:'center'}}>✓ {eid?'Mettre à jour':'Ajouter la dépense'}</Btn>
  </Modal>;
}

// ─── MODAL: ADD CAISSE MOVEMENT ───────────────────────────────────────────────
function AddCaisseModal({mvType,mvId,close,ctx}) {
  const {caisse,setCaisse,showToast}=ctx;
  const existing=mvId?caisse.find(m=>m.id===mvId):null;
  const [f,setF]=useState(existing?{type:existing.type,amount:existing.amount,desc:existing.desc,date:existing.date,ref:existing.ref||'',note:existing.note||''}:{type:mvType||'IN',amount:0,desc:'',date:tod(),ref:'',note:''});
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(!f.desc||!f.amount||f.amount<=0){showToast('Remplissez tous les champs');return;}
    setBusy(true);
    try{
      if(existing){
        await api.update(api.simple.cashMovements,mvId,{type:f.type,amount:Number(f.amount),description:f.desc,date:f.date,ref:f.ref});
        setCaisse(p=>p.map(m=>m.id!==mvId?m:{...m,...f,amount:Number(f.amount)}));
        showToast('Mouvement modifié ✓');
      } else {
        const created=await api.create(api.simple.cashMovements,{type:f.type,amount:Number(f.amount),description:f.desc,date:f.date,ref:f.ref});
        setCaisse(p=>[...p,{id:created.id,...f,amount:Number(f.amount)}]);
        showToast(`Mouvement ${f.type==='IN'?'entrée':'sortie'} enregistré`);
      }
      close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };
  const del=async()=>{
    if(!window.confirm('Supprimer ce mouvement de caisse ?'))return;
    try{
      await api.remove(api.simple.cashMovements,mvId);
      setCaisse(p=>p.filter(m=>m.id!==mvId));
      showToast('Mouvement supprimé');close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}
  };
  return <Modal title={existing?`Modifier — ${f.type==='IN'?'Entrée ▲':'Sortie ▼'}`:`Nouveau mouvement — ${f.type==='IN'?'Entrée ▲':'Sortie ▼'}`} onClose={close}>
    <div style={{display:'flex',gap:8,marginBottom:14}}>
      {[{v:'IN',l:'▲ Entrée',c:'#059669'},{v:'OUT',l:'▼ Sortie',c:'#e02424'}].map(t=><div key={t.v} onClick={()=>setF({...f,type:t.v})} style={{flex:1,padding:'10px',borderRadius:9,border:`2px solid ${f.type===t.v?t.c:'#e5e7eb'}`,background:f.type===t.v?t.c+'11':'#f9fafb',cursor:'pointer',textAlign:'center',fontWeight:600,fontSize:13,color:f.type===t.v?t.c:'#6b7280',transition:'all .13s'}}>{t.l}</div>)}
    </div>
    <Inp label="Description *" value={f.desc} onChange={e=>setF({...f,desc:e.target.value})} placeholder="ex: Règlement client, Achat..."/>
    <Fr2>
      <Inp label="Montant (DA) *" type="number" value={f.amount} onChange={e=>setF({...f,amount:e.target.value})} min={0}/>
      <Inp label="Date *" type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/>
    </Fr2>
    <Inp label="Référence (facture, dossier...)" value={f.ref} onChange={e=>setF({...f,ref:e.target.value})} placeholder="INV-2024-XXXX ou LAB-2024-XXXX"/>
    <div style={{display:'flex',gap:8}}>
      <Btn onClick={submit} style={{flex:1,justifyContent:'center',background:f.type==='IN'?'#059669':'#e02424'}}>✓ Enregistrer le mouvement</Btn>
      {existing&&<button onClick={del} style={{padding:'10px 16px',borderRadius:8,border:'1px solid #fecaca',background:'#fef2f2',color:'#dc2626',fontSize:13,fontWeight:600,cursor:'pointer'}}>🗑</button>}
    </div>
  </Modal>;
}


// ─── PDF GENERATOR ────────────────────────────────────────────────────────────
const PDF = {
  header(doc, settings, title) {
    const lines = [];
    lines.push(`╔${'═'.repeat(60)}╗`);
    lines.push(`║  ${(settings.companyName||'DentLab Pro').padEnd(58)}║`);
    if(settings.companyAddress) lines.push(`║  ${settings.companyAddress.padEnd(58)}║`);
    if(settings.companyPhone)   lines.push(`║  Tél: ${settings.companyPhone.padEnd(53)}║`);
    if(settings.nif)  lines.push(`║  NIF: ${settings.nif.padEnd(53)}║`);
    if(settings.nis)  lines.push(`║  NIS: ${settings.nis.padEnd(53)}║`);
    if(settings.ai)   lines.push(`║  AI:  ${settings.ai.padEnd(53)}║`);
    lines.push(`╠${'═'.repeat(60)}╣`);
    lines.push(`║  ${title.toUpperCase().padEnd(58)}║`);
    lines.push(`║  Date: ${new Date().toLocaleDateString('fr-DZ').padEnd(52)}║`);
    lines.push(`╚${'═'.repeat(60)}╝`);
    return lines.join('\n');
  },
  row(cols, widths) {
    return cols.map((c,i)=>String(c||'').slice(0,widths[i]).padEnd(widths[i])).join(' │ ');
  },
  sep(widths) { return widths.map(w=>'─'.repeat(w)).join('─┼─'); },
  download(content, filename) {
    // Try download, fallback to new window preview
    try {
      const blob = new Blob([content], {type:'text/plain;charset=utf-8'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>document.body.removeChild(a),1000);
    } catch(e) {
      // fallback: show in modal via global event
      window.__pdfPreview && window.__pdfPreview(content, filename);
    }
  }
};

function genInvoicePDF(inv, cases, users, restoTypes, settings) {
  const doc = users.find(u=>u.id===inv.docId);
  const invCases = inv.caseIds.map(cid=>cases.find(c=>c.id===cid)).filter(Boolean);
  const lines = [PDF.header(settings, settings, `FACTURE ${inv.num}`)];
  lines.push('');
  lines.push(`Client : ${doc?.name||'—'}   Cabinet : ${doc?.clinique||'—'}`);
  lines.push(`Date   : ${inv.date}         Statut : ${inv.status==='PAID'?'PAYÉE':'IMPAYÉE'}`);
  lines.push('');
  lines.push(PDF.row(['N° Dossier','Patient','Type Restauration','Montant'],[14,20,22,12]));
  lines.push(PDF.sep([14,20,22,12]));
  invCases.forEach(c=>{
    const rt=restoTypes.find(r=>r.id===c.rtId);
    lines.push(PDF.row([c.num,`${c.pf} ${c.pl}`,rt?.name||'—',`${rt?.price||0} DA`],[14,20,22,12]));
  });
  lines.push(PDF.sep([14,20,22,12]));
  lines.push(PDF.row(['','','TOTAL',`${inv.total} DA`],[14,20,22,12]));
  lines.push(PDF.row(['','','Payé',`${inv.paid} DA`],[14,20,22,12]));
  lines.push(PDF.row(['','','Restant',`${inv.total-inv.paid} DA`],[14,20,22,12]));
  return lines.join('\n');
}

function genTechPayPDF(user, cases, settings) {
  const steps = cases.flatMap(c=>c.wf.filter(w=>w.tId===user.id&&w.done).map(w=>({...w,caseObj:c})));
  const RATE = {DESIGN:500,MILLING:500,SINTERING:200,FINISHING:300,MAQUILLAGE:400,QC:150};
  const total = steps.reduce((s,w)=>s+(w.el||1)*(RATE[w.s]||0),0);
  const lines = [PDF.header(settings, settings, `DÉTAIL PAIEMENT — ${user.name.toUpperCase()}`)];
  lines.push('');
  lines.push(`Technicien : ${user.name}    Spécialité : ${user.spec||'—'}`);
  lines.push('');
  lines.push(PDF.row(['Dossier','Patient','Étape','Éléments','Tarif/él.','Gain'],[12,18,14,9,10,10]));
  lines.push(PDF.sep([12,18,14,9,10,10]));
  steps.forEach(w=>{
    const gain=(w.el||1)*(RATE[w.s]||0);
    lines.push(PDF.row([w.caseObj.num,`${w.caseObj.pf} ${w.caseObj.pl}`,w.s,w.el||1,`${RATE[w.s]||0} DA`,`${gain} DA`],[12,18,14,9,10,10]));
  });
  lines.push(PDF.sep([12,18,14,9,10,10]));
  lines.push(PDF.row(['','','','TOTAL','',`${total} DA`],[12,18,14,9,10,10]));
  return lines.join('\n');
}

function genCaissePDF(caisse, settings) {
  let running=0;
  const sorted=[...caisse].sort((a,b)=>a.date.localeCompare(b.date));
  const lines = [PDF.header(settings, settings, 'JOURNAL DE CAISSE')];
  lines.push('');
  lines.push(PDF.row(['Date','Type','Description','Montant','Solde'],[12,8,28,12,12]));
  lines.push(PDF.sep([12,8,28,12,12]));
  sorted.forEach(m=>{
    running+=m.type==='IN'?m.amount:-m.amount;
    lines.push(PDF.row([m.date,m.type===`IN`?'ENTREE':'SORTIE',m.desc,`${m.type==='IN'?'+':'−'}${m.amount} DA`,`${running} DA`],[12,8,28,12,12]));
  });
  lines.push(PDF.sep([12,8,28,12,12]));
  const totalIn=caisse.reduce((s,m)=>m.type==='IN'?s+m.amount:s,0);
  const totalOut=caisse.reduce((s,m)=>m.type==='OUT'?s+m.amount:s,0);
  lines.push(`\nTotal Entrées : ${totalIn} DA`);
  lines.push(`Total Sorties : ${totalOut} DA`);
  lines.push(`Solde Final   : ${totalIn-totalOut} DA`);
  return lines.join('\n');
}

function genExpensesPDF(expenses, settings) {
  const lines = [PDF.header(settings, settings, 'RAPPORT DES CHARGES & DÉPENSES')];
  lines.push('');
  lines.push(PDF.row(['Date','Catégorie','Description','Montant','Observation'],[12,16,22,12,18]));
  lines.push(PDF.sep([12,16,22,12,18]));
  [...expenses].sort((a,b)=>a.date.localeCompare(b.date)).forEach(e=>{
    const cat=expenseCats.find(c=>c.id===e.catId);
    lines.push(PDF.row([e.date,cat?.name||'—',e.desc,`${e.amount} DA`,e.note||'—'],[12,16,22,12,18]));
  });
  lines.push(PDF.sep([12,16,22,12,18]));
  const total=expenses.reduce((s,e)=>s+e.amount,0);
  lines.push(PDF.row(['','','TOTAL',`${total} DA`,''],[12,16,22,12,18]));
  return lines.join('\n');
}

function genEquipmentPDF(equipment, settings) {
  const lines = [PDF.header(settings, settings, 'INVENTAIRE ÉQUIPEMENTS')];
  lines.push('');
  lines.push(PDF.row(['Nom','Catégorie','Marque','Prix achat','Date achat','État'],[18,14,12,12,12,8]));
  lines.push(PDF.sep([18,14,12,12,12,8]));
  equipment.forEach(e=>{
    lines.push(PDF.row([e.name,e.category||'—',e.brand||'—',`${e.price||0} DA`,e.purchaseDate||'—',e.status||'—'],[18,14,12,12,12,8]));
  });
  lines.push(PDF.sep([18,14,12,12,12,8]));
  const total=equipment.reduce((s,e)=>s+(e.price||0),0);
  lines.push(`\nValeur totale des équipements : ${total} DA`);
  return lines.join('\n');
}

// ─── PDF PAGE ─────────────────────────────────────────────────────────────────
function PDFPreviewModal({content, filename, onClose}) {
  const copy=()=>{try{navigator.clipboard.writeText(content).then(()=>alert('Copie dans le presse-papiers ✓'));}catch(e){alert('Ctrl+A puis Ctrl+C pour copier');}};
  return <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:500,padding:12}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:'#fff',borderRadius:14,width:'min(94vw,820px)',maxHeight:'92vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}>
      <div style={{padding:'12px 16px',borderBottom:'1px solid #e5e7eb',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}>
        <div><div style={{fontWeight:700,fontSize:13,color:'#111827'}}>Document : {filename}</div><div style={{fontSize:11,color:'#6b7280',marginTop:1}}>Apercu — copiez ou imprimez</div></div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={copy} style={{padding:'5px 12px',borderRadius:7,border:'1px solid #d1d5db',background:'#f9fafb',cursor:'pointer',fontSize:12,fontWeight:500}}>Copier</button>
          <button onClick={()=>window.print()} style={{padding:'5px 12px',borderRadius:7,border:'none',background:'#1a56db',color:'#fff',cursor:'pointer',fontSize:12,fontWeight:500}}>Imprimer</button>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',fontSize:18,color:'#6b7280',padding:'2px 6px'}}>X</button>
        </div>
      </div>
      <pre style={{flex:1,overflowY:'auto',padding:'16px 20px',margin:0,fontFamily:"'Courier New',Courier,monospace",fontSize:11,lineHeight:1.6,color:'#111827',background:'#fafafa',whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{content}</pre>
    </div>
  </div>;
}

function PDFPage({cases,invoices,users,expenses,caisse,settings,restoTypes,equipment,showToast}) {
  const techs=users.filter(u=>u.role==='TECHNICIAN');
  const [selTech,setSelTech]=useState(techs[0]?.id||'');
  const [selInv,setSelInv]=useState(invoices[0]?.id||'');
  const [preview,setPreview]=useState(null);
  const show=(content,filename)=>setPreview({content,filename});
  // Register global handler for PDF.download fallback
  useState(()=>{window.__pdfPreview=(content,filename)=>setPreview({content,filename});return ()=>{delete window.__pdfPreview;};});
  return <>
    {preview&&<PDFPreviewModal content={preview.content} filename={preview.filename} onClose={()=>setPreview(null)}/>}
    <Alert type="i">Cliquez sur Generer pour previsualiser le document. Utilisez Copier ou Imprimer.</Alert>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:12}}>
      <Card style={{padding:14}}>
        <div style={{fontSize:20,marginBottom:6}}>Factures clients</div>
        <div style={{fontSize:11.5,color:'#6b7280',marginBottom:10}}>Facture au format imprimable</div>
        <SelEl label="Facture" value={selInv} onChange={e=>setSelInv(e.target.value)} options={invoices.map(i=>{const d=users.find(u=>u.id===i.docId);return {v:i.id,l:i.num+' — '+(d?.name||'—')};})}/>
        <Btn style={{width:'100%',justifyContent:'center'}} onClick={()=>{const inv=invoices.find(i=>i.id===selInv);if(inv)show(genInvoicePDF(inv,cases,users,restoTypes,settings),inv.num+'.txt');}}>Generer PDF</Btn>
      </Card>
      <Card style={{padding:14}}>
        <div style={{fontSize:20,marginBottom:6}}>Paiement technicien</div>
        <div style={{fontSize:11.5,color:'#6b7280',marginBottom:10}}>Detail travail et gains</div>
        <SelEl label="Technicien" value={selTech} onChange={e=>setSelTech(e.target.value)} options={techs.map(t=>({v:t.id,l:t.name}))}/>
        <Btn style={{width:'100%',justifyContent:'center'}} onClick={()=>{const t=users.find(u=>u.id===selTech);if(t)show(genTechPayPDF(t,cases,settings),'paiement_'+t.name.replace(/ /g,'_')+'.txt');}}>Generer PDF</Btn>
      </Card>
      <Card style={{padding:14}}>
        <div style={{fontSize:20,marginBottom:6}}>Journal de caisse</div>
        <div style={{fontSize:11.5,color:'#6b7280',marginBottom:10}}>Mouvements avec soldes</div>
        <div style={{padding:'6px 10px',background:'#f0fdf4',borderRadius:7,fontSize:11,color:'#166534',marginBottom:10}}>{caisse.length} mouvements</div>
        <Btn style={{width:'100%',justifyContent:'center'}} onClick={()=>show(genCaissePDF(caisse,settings),'journal_caisse.txt')}>Generer PDF</Btn>
      </Card>
      <Card style={{padding:14}}>
        <div style={{fontSize:20,marginBottom:6}}>Rapport depenses</div>
        <div style={{fontSize:11.5,color:'#6b7280',marginBottom:10}}>Charges par categorie</div>
        <div style={{padding:'6px 10px',background:'#fef2f2',borderRadius:7,fontSize:11,color:'#dc2626',marginBottom:10}}>Total : {fmtDA(expenses.reduce((s,e)=>s+e.amount,0))}</div>
        <Btn style={{width:'100%',justifyContent:'center'}} onClick={()=>show(genExpensesPDF(expenses,settings),'rapport_depenses.txt')}>Generer PDF</Btn>
      </Card>
      <Card style={{padding:14,border:'2px solid #1a56db'}}>
        <div style={{fontSize:20,marginBottom:6}}>Export complet</div>
        <div style={{fontSize:11.5,color:'#6b7280',marginBottom:10}}>Tous les rapports</div>
        <Btn style={{width:'100%',justifyContent:'center',background:'#1a56db'}} onClick={()=>{
          let all=PDF.header(settings,settings,'EXPORT COMPLET — DENTLAB PRO')+'\n\n';
          invoices.forEach(inv=>{all+=genInvoicePDF(inv,cases,users,restoTypes,settings)+'\n\n';});
          all+=genExpensesPDF(expenses,settings)+'\n\n';
          all+=genCaissePDF(caisse,settings)+'\n\n';
          show(all,'export_complet_dentlab.txt');
        }}>Tout exporter</Btn>
      </Card>
    </div>
  </>;
}
// ─── EQUIPMENT PAGE ───────────────────────────────────────────────────────────
const INIT_EQUIPMENT = [
  {id:'eq1',name:'Ceramill Motion 2',category:'Fraisage',brand:'Amann Girrbach',price:850000,purchaseDate:'2022-03-15',status:'Actif',observation:'Fraiseur 5 axes — contrat maintenance annuel',serialNo:'CM2-2022-0456'},
  {id:'eq2',name:'Four de Frittage Programat',category:'Four',brand:'Ivoclar Vivadent',price:450000,purchaseDate:'2022-03-15',status:'Actif',observation:'Température max 1600°C',serialNo:'PF-2022-0123'},
  {id:'eq3',name:'Scanner intraoral 3Shape',category:'Scanner',brand:'3Shape',price:1200000,purchaseDate:'2023-01-10',status:'Actif',observation:'Modèle TRIOS 4 — Licence logiciel incluse',serialNo:'3S-2023-0789'},
  {id:'eq4',name:'Imprimante 3D Formlabs',category:'Impression 3D',brand:'Formlabs',price:380000,purchaseDate:'2023-06-20',status:'Actif',observation:'Form 3B+ — résine dentaire biocompatible',serialNo:'FL-2023-0234'},
  {id:'eq5',name:'Presse à injecter',category:'Prothèse',brand:'Ivoclar',price:180000,purchaseDate:'2021-11-05',status:'Maintenance',observation:'Révision planifiée juillet 2024',serialNo:'PI-2021-0567'},
];

const EQ_CATEGORIES = ['Fraisage','Four','Scanner','Impression 3D','Prothèse','Polissage','Stérilisation','Autre'];
const EQ_STATUSES = ['Actif','Maintenance','Hors service','Remplacé'];

function EquipmentPage({equipment,setEquipment,settings,showToast,setModal}) {
  const [filterCat,setFilterCat]=useState('');
  const [filterStatus,setFilterStatus]=useState('');
  const [tab,setTab]=useState(0);

  const vis=equipment.filter(e=>(!filterCat||e.category===filterCat)&&(!filterStatus||e.status===filterStatus));
  const totalValue=vis.reduce((s,e)=>s+(e.price||0),0);
  const byCat={};
  equipment.forEach(e=>{if(!byCat[e.category])byCat[e.category]={count:0,value:0};byCat[e.category].count++;byCat[e.category].value+=e.price||0;});

  const statusColor={Actif:'#059669',Maintenance:'#d97706','Hors service':'#e02424',Remplacé:'#9ca3af'};

  return <>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:14}}>
      <Kpi label="Total équipements" val={equipment.length} col="#1a56db"/>
      <Kpi label="Valeur totale" val={fmtDA(equipment.reduce((s,e)=>s+(e.price||0),0))} col="#7e3af2"/>
      <Kpi label="En maintenance" val={equipment.filter(e=>e.status==='Maintenance').length} col="#d97706"/>
      <Kpi label="Hors service" val={equipment.filter(e=>e.status==='Hors service').length} col="#e02424"/>
    </div>

    <div style={{display:'flex',gap:0,borderBottom:'2px solid #f3f4f6',marginBottom:14}}>
      {['📋 Liste','📊 Par catégorie'].map((t,i)=><div key={i} onClick={()=>setTab(i)} style={{padding:'9px 16px',fontSize:12.5,fontWeight:500,cursor:'pointer',color:tab===i?'#1a56db':'#6b7280',borderBottom:`2px solid ${tab===i?'#1a56db':'transparent'}`,marginBottom:-2}}>{t}</div>)}
    </div>

    {tab===0&&<>
      <div style={{display:'flex',gap:10,marginBottom:12,flexWrap:'wrap',alignItems:'flex-end'}}>
        <div style={{flex:1,minWidth:130}}>
          <label style={{fontSize:10.5,color:'#6b7280',display:'block',marginBottom:3}}>Catégorie</label>
          <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,padding:'6px 10px',borderRadius:7,border:'1px solid #e5e7eb',background:'#fff',width:'100%',outline:'none'}}>
            <option value="">Toutes</option>
            {EQ_CATEGORIES.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{flex:1,minWidth:130}}>
          <label style={{fontSize:10.5,color:'#6b7280',display:'block',marginBottom:3}}>État</label>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,padding:'6px 10px',borderRadius:7,border:'1px solid #e5e7eb',background:'#fff',width:'100%',outline:'none'}}>
            <option value="">Tous</option>
            {EQ_STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <Btn onClick={()=>setModal({t:'addEquipment'})} style={{alignSelf:'flex-end'}}>＋ Ajouter équipement</Btn>
        <Btn variant="ghost" onClick={()=>{PDF.download(genEquipmentPDF(equipment,settings),'inventaire_equipements.txt');showToast('PDF généré');}} style={{alignSelf:'flex-end'}}>⬇ PDF</Btn>
      </div>

      <div style={{background:'#fff',borderRadius:12,border:'1px solid #e5e7eb',boxShadow:'0 1px 3px rgba(0,0,0,.04)'}}>
        <div style={{padding:'11px 14px',background:'#fafafa',borderBottom:'1px solid #f3f4f6',borderRadius:'11px 11px 0 0',fontWeight:700,fontSize:13}}>{vis.length} équipements — Valeur : {fmtDA(totalValue)}</div>
        <div className='table-wrap'><table style={{width:'100%',borderCollapse:'collapse',minWidth:680}}>
            <thead><tr>{['Nom','Catégorie','Marque','N° Série','Prix achat','Date achat','État','Observation',''].map(h=><th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:9.5,fontWeight:600,color:'#9ca3af',textTransform:'uppercase',letterSpacing:'.06em',borderBottom:'1px solid #f3f4f6',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
            <tbody>{vis.map(e=><tr key={e.id}>
              <td style={{padding:'9px 12px',fontSize:13,borderBottom:'1px solid #f9fafb',fontWeight:600}}>{e.name}</td>
              <td style={{padding:'9px 12px',fontSize:11.5,borderBottom:'1px solid #f9fafb'}}><span style={{background:'#eff6ff',color:'#1e40af',padding:'2px 8px',borderRadius:99,fontSize:11}}>{e.category}</span></td>
              <td style={{padding:'9px 12px',fontSize:12,borderBottom:'1px solid #f9fafb',color:'#6b7280'}}>{e.brand||'—'}</td>
              <td style={{padding:'9px 12px',fontSize:11,borderBottom:'1px solid #f9fafb',fontFamily:"'JetBrains Mono',monospace",color:'#9ca3af'}}>{e.serialNo||'—'}</td>
              <td style={{padding:'9px 12px',fontSize:12,borderBottom:'1px solid #f9fafb',fontWeight:600,color:'#1a56db'}}>{fmtDA(e.price||0)}</td>
              <td style={{padding:'9px 12px',fontSize:11,borderBottom:'1px solid #f9fafb',color:'#6b7280'}}>{e.purchaseDate||'—'}</td>
              <td style={{padding:'9px 12px',borderBottom:'1px solid #f9fafb'}}><span style={{fontSize:11,fontWeight:500,padding:'2px 8px',borderRadius:99,background:(statusColor[e.status]||'#9ca3af')+'18',color:statusColor[e.status]||'#9ca3af'}}>{e.status}</span></td>
              <td style={{padding:'9px 12px',fontSize:11.5,borderBottom:'1px solid #f9fafb',color:'#6b7280',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.observation||'—'}</td>
              <td style={{padding:'9px 12px',borderBottom:'1px solid #f9fafb'}}>
                <div style={{display:'flex',gap:4}}>
                  <Btn sm variant="ghost" onClick={()=>setModal({t:'editEquipment',eqId:e.id})}>✏</Btn>
                  <Btn sm variant="danger" onClick={()=>{if(window.confirm('Supprimer ?')){api.remove(api.simple.equipment,e.id).then(()=>{setEquipment(p=>p.filter(x=>x.id!==e.id));showToast('Supprimé');}).catch(err=>showToast('Erreur : '+(err.message||'échec')));}}}>🗑</Btn>
                </div>
              </td>
            </tr>)}
            {vis.length===0&&<tr><td colSpan={9} style={{padding:24,textAlign:'center',color:'#9ca3af',fontSize:12}}>Aucun équipement trouvé</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
    }

    {tab===1&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:12}}>
      {Object.entries(byCat).map(([cat,data])=><Card key={cat} style={{padding:15}}>
        <div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{cat}</div>
        <div style={{fontSize:20,fontWeight:700,color:'#1a56db',marginBottom:2}}>{data.count} unité{data.count>1?'s':''}</div>
        <div style={{fontSize:12,color:'#7e3af2',fontWeight:600,marginBottom:8}}>{fmtDA(data.value)}</div>
        <div style={{height:4,background:'#f3f4f6',borderRadius:99}}>
          <div style={{height:'100%',background:'#1a56db',borderRadius:99,width:`${Math.min((data.value/Math.max(...Object.values(byCat).map(d=>d.value)))*100,100)}%`}}/>
        </div>
      </Card>)}
    </div>}
  </>;
}

// ─── EQUIPMENT MODAL ──────────────────────────────────────────────────────────
function EquipmentModal({eqId,close,ctx}) {
  const {equipment,setEquipment,showToast}=ctx;
  const eq=eqId?equipment.find(x=>x.id===eqId):null;
  const [f,setF]=useState({
    name:eq?.name||'', category:eq?.category||EQ_CATEGORIES[0],
    brand:eq?.brand||'', serialNo:eq?.serialNo||'',
    price:eq?.price||0, purchaseDate:eq?.purchaseDate||tod(),
    status:eq?.status||'Actif', observation:eq?.observation||''
  });
  const [busy,setBusy]=useState(false);
  const submit=async()=>{
    if(busy)return;
    if(!f.name){showToast('Nom requis');return;}
    setBusy(true);
    try{
      const body={name:f.name,category:f.category,brand:f.brand,serial_no:f.serialNo,price:Number(f.price),purchase_date:f.purchaseDate,status:f.status,observation:f.observation};
      if(eqId){
        await api.update(api.simple.equipment,eqId,body);
        setEquipment(p=>p.map(x=>x.id===eqId?{...x,...f,price:Number(f.price)}:x));
        showToast('Équipement mis à jour');
      }else{
        const created=await api.create(api.simple.equipment,body);
        setEquipment(p=>[...p,{id:created.id,...f,price:Number(f.price)}]);
        showToast('Équipement ajouté');
      }
      close();
    }catch(e){showToast('Erreur : '+(e.message||'échec'));}finally{setBusy(false);}
  };
  return <Modal title={eqId?'Modifier équipement':'Ajouter un équipement'} onClose={close}>
    <Inp label="Nom de l'équipement *" value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="ex: Ceramill Motion 2"/>
    <Fr2>
      <SelEl label="Catégorie" value={f.category} onChange={e=>setF({...f,category:e.target.value})} options={EQ_CATEGORIES}/>
      <Inp label="Marque / Fabricant" value={f.brand} onChange={e=>setF({...f,brand:e.target.value})} placeholder="ex: Amann Girrbach"/>
    </Fr2>
    <Fr2>
      <Inp label="Numéro de série" value={f.serialNo} onChange={e=>setF({...f,serialNo:e.target.value})} placeholder="SN-0000"/>
      <SelEl label="État" value={f.status} onChange={e=>setF({...f,status:e.target.value})} options={EQ_STATUSES}/>
    </Fr2>
    <Fr2>
      <Inp label="Prix d'achat (DA)" type="number" value={f.price} onChange={e=>setF({...f,price:e.target.value})} min={0}/>
      <Inp label="Date d'achat" type="date" value={f.purchaseDate} onChange={e=>setF({...f,purchaseDate:e.target.value})}/>
    </Fr2>
    <div style={{marginBottom:10}}>
      <label style={{fontSize:10.5,fontWeight:500,color:'#6b7280',display:'block',marginBottom:3}}>Observation</label>
      <textarea value={f.observation} onChange={e=>setF({...f,observation:e.target.value})} placeholder="Notes, contrat maintenance, pièces, remarques..." style={{fontFamily:"'DM Sans',sans-serif",fontSize:12.5,padding:'7px 10px',borderRadius:8,border:'1px solid #e5e7eb',background:'#fff',color:'#111827',width:'100%',outline:'none',resize:'vertical',minHeight:70}}/>
    </div>
    <Btn onClick={submit} style={{width:'100%',justifyContent:'center'}}>✓ {eqId?'Mettre à jour':'Ajouter l\'équipement'}</Btn>
  </Modal>;
}
