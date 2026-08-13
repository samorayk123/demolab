const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { errorHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const clinicsRoutes = require('./routes/clinics.routes');
const casesRoutes = require('./routes/cases.routes');
const invoicesRoutes = require('./routes/invoices.routes');
const materialsRoutes = require('./routes/materials.routes');
const purchaseOrdersRoutes = require('./routes/purchaseOrders.routes');
const settingsRoutes = require('./routes/settings.routes');
const simpleRoutes = require('./routes/simple.routes');

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' })); // limite généreuse pour les payloads avec pièces jointes en base64
app.use('/uploads', express.static(process.env.UPLOAD_DIR || 'uploads'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/clinics', clinicsRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/purchase-orders', purchaseOrdersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api', simpleRoutes); // /api/doctors, /api/resto-types, /api/stage-defs, /api/suppliers, /api/expenses, /api/expense-categories, /api/cash-movements, /api/equipment, /api/tech-payments

app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));
app.use(errorHandler);

module.exports = app;
