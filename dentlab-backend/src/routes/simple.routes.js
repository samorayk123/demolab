// Monte tous les modules "simples" (CRUD standard) sur leurs préfixes respectifs.
const express = require('express');
const { crudFactory } = require('../utils/crudFactory');

const router = express.Router();

router.use('/doctors', crudFactory({
  table: 'doctors', idPrefix: 'd',
  allowedFields: ['clinic_id','name','spec','phone','color','active'],
}));

router.use('/resto-types', crudFactory({
  table: 'resto_types', idPrefix: 'rt',
  allowedFields: ['name','category','price','active'],
}));

router.use('/stage-defs', crudFactory({
  table: 'stage_defs', idPrefix: '', orderBy: 'sort_order',
  allowedFields: ['label','bg','color','dot_color','rate','editable','sort_order'],
  writeRoles: ['ADMIN'],
}));

router.use('/suppliers', crudFactory({
  table: 'suppliers', idPrefix: 's',
  allowedFields: ['name','contact','email','phone','city','address','payment_terms','notes','active'],
}));

router.use('/expense-categories', crudFactory({
  table: 'expense_categories', idPrefix: 'ec',
  allowedFields: ['name','icon','color'],
}));

router.use('/expenses', crudFactory({
  table: 'expenses', idPrefix: 'ex', orderBy: 'date DESC',
  allowedFields: ['category_id','amount','description','date','note','recorded_by'],
}));

router.use('/cash-movements', crudFactory({
  table: 'cash_movements', idPrefix: 'mv', orderBy: 'date DESC',
  allowedFields: ['type','amount','description','date','ref','recorded_by'],
}));

router.use('/equipment', crudFactory({
  table: 'equipment', idPrefix: 'eq',
  allowedFields: ['name','category','brand','serial_no','price','purchase_date','status','observation'],
}));

router.use('/tech-payments', crudFactory({
  table: 'tech_payments', idPrefix: 'tp', orderBy: 'date DESC',
  allowedFields: ['tech_id','amount','note','date'],
}));

module.exports = router;
