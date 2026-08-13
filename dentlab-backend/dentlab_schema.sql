-- ============================================================================
-- DentLab Pro — Schéma MySQL complet
-- Généré à partir de dentlab-v4-20.jsx
-- Moteur: InnoDB, charset: utf8mb4 (support emojis/accents FR)
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1. UTILISATEURS & AUTHENTIFICATION
-- ============================================================================

-- Personnel du labo : ADMIN, TECHNICIAN, STOCK_MANAGER
CREATE TABLE users (
  id            VARCHAR(32)  PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,           -- bcrypt, jamais le mot de passe en clair
  role          ENUM('ADMIN','TECHNICIAN','STOCK_MANAGER') NOT NULL,
  spec          VARCHAR(150),                     -- spécialité (ex: "Conception & Fraisage")
  color         VARCHAR(7)   DEFAULT '#1a56db',    -- couleur avatar UI
  rate          DECIMAL(10,2) DEFAULT 0,           -- taux horaire/technicien
  active        BOOLEAN      DEFAULT TRUE,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stages accessibles à un technicien (remplace le tableau acc:['DESIGN','MILLING'])
CREATE TABLE user_stage_access (
  user_id  VARCHAR(32) NOT NULL,
  stage_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, stage_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cliniques (comptes clients — remplace role CLINIC dans users)
CREATE TABLE clinics (
  id            VARCHAR(32)  PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  address       VARCHAR(255),
  phone         VARCHAR(30),
  color         VARCHAR(7) DEFAULT '#0e7490',
  active        BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dentistes (docteurs) rattachés à une clinique
CREATE TABLE doctors (
  id         VARCHAR(32)  PRIMARY KEY,
  clinic_id  VARCHAR(32)  NOT NULL,
  name       VARCHAR(150) NOT NULL,
  spec       VARCHAR(150),
  phone      VARCHAR(30),
  color      VARCHAR(7) DEFAULT '#7c3aed',
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id) ON DELETE CASCADE,
  INDEX idx_doctors_clinic (clinic_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 2. CATALOGUE & CONFIGURATION DES ÉTAPES
-- ============================================================================

-- Types de prestations (Couronne Zircone, Bridge, etc.)
CREATE TABLE resto_types (
  id       VARCHAR(32) PRIMARY KEY,
  name     VARCHAR(150) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price    DECIMAL(10,2) NOT NULL DEFAULT 0,
  active   BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Définition des étapes du workflow (éditable : libellé, couleur, tarif technicien)
CREATE TABLE stage_defs (
  id         VARCHAR(32) PRIMARY KEY,          -- RECEIVED, DESIGN, MILLING...
  label      VARCHAR(100) NOT NULL,
  bg         VARCHAR(7), color VARCHAR(7), dot_color VARCHAR(7),
  rate       DECIMAL(10,2) DEFAULT 0,
  editable   BOOLEAN DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 3. DOSSIERS / COMMANDES (CASES)
-- ============================================================================

CREATE TABLE cases (
  id              VARCHAR(32) PRIMARY KEY,
  num             VARCHAR(50) NOT NULL UNIQUE,     -- LAB-2024-0047
  patient_first   VARCHAR(100),
  patient_last    VARCHAR(100),
  doctor_id       VARCHAR(32) NOT NULL,
  resto_type_id   VARCHAR(32) NOT NULL,
  shade           VARCHAR(20),                     -- teinte (A2, B1...)
  priority        ENUM('URGENT','HIGH','NORMAL','LOW') DEFAULT 'NORMAL',
  status          VARCHAR(32) NOT NULL,             -- référence stage_defs.id
  due_date        DATE,
  tech_id         VARCHAR(32),                      -- technicien assigné courant
  remake          BOOLEAN DEFAULT FALSE,
  notes           TEXT,
  material_cost   DECIMAL(10,2) DEFAULT 0,
  labor_cost      DECIMAL(10,2) DEFAULT 0,
  delivered_date  DATE,
  delivered_by    VARCHAR(32),
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  FOREIGN KEY (resto_type_id) REFERENCES resto_types(id),
  FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (delivered_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_cases_doctor (doctor_id),
  INDEX idx_cases_status (status),
  INDEX idx_cases_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Dents concernées par le dossier (teeth:['16','17'])
CREATE TABLE case_teeth (
  case_id VARCHAR(32) NOT NULL,
  tooth   VARCHAR(10) NOT NULL,
  PRIMARY KEY (case_id, tooth),
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Étapes du workflow par dossier (wf:[{s,tId,start,end,dur,done,notes,el}])
CREATE TABLE case_workflow_steps (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  case_id      VARCHAR(32) NOT NULL,
  stage_id     VARCHAR(32) NOT NULL,
  tech_id      VARCHAR(32),
  start_date   DATE,
  end_date     DATE,
  duration_min INT,
  done         BOOLEAN DEFAULT FALSE,
  notes        TEXT,
  elapsed_days INT,
  step_order   INT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (tech_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_wf_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Commentaires sur un dossier (fil de discussion clinique/labo)
CREATE TABLE case_comments (
  id         VARCHAR(32) PRIMARY KEY,
  case_id    VARCHAR(32) NOT NULL,
  user_id    VARCHAR(32),                -- peut être un user labo ou un doctor
  user_type  ENUM('USER','DOCTOR') NOT NULL DEFAULT 'USER',
  text       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  INDEX idx_comments_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pièces jointes / images / STL / photo teinte (attachments, images, shadePhoto)
CREATE TABLE case_attachments (
  id          VARCHAR(32) PRIMARY KEY,
  case_id     VARCHAR(32) NOT NULL,
  kind        ENUM('IMAGE','STL','ZIP','PDF','SHADE_PHOTO','OTHER') DEFAULT 'OTHER',
  file_name   VARCHAR(255) NOT NULL,
  file_path   VARCHAR(500) NOT NULL,     -- chemin sur disque / stockage objet, pas de BLOB en DB
  file_size   BIGINT,
  uploaded_by VARCHAR(32),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  INDEX idx_attach_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 4. FACTURATION
-- ============================================================================

CREATE TABLE invoices (
  id         VARCHAR(32) PRIMARY KEY,
  num        VARCHAR(50) NOT NULL UNIQUE,       -- INV-2024-0012
  doctor_id  VARCHAR(32) NOT NULL,
  total      DECIMAL(10,2) NOT NULL DEFAULT 0,
  paid       DECIMAL(10,2) NOT NULL DEFAULT 0,
  status     ENUM('UNPAID','PARTIAL','PAID') NOT NULL DEFAULT 'UNPAID',
  date       DATE NOT NULL,
  paid_date  DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  INDEX idx_invoices_doctor (doctor_id),
  INDEX idx_invoices_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Une facture peut couvrir plusieurs dossiers (caseIds:[...])
CREATE TABLE invoice_cases (
  invoice_id VARCHAR(32) NOT NULL,
  case_id    VARCHAR(32) NOT NULL,
  PRIMARY KEY (invoice_id, case_id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE invoice_payments (
  id         VARCHAR(32) PRIMARY KEY,
  invoice_id VARCHAR(32) NOT NULL,
  amount     DECIMAL(10,2) NOT NULL,
  date       DATE NOT NULL,
  method     VARCHAR(50),                       -- Espèces, Virement bancaire...
  recorded_by VARCHAR(32),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  INDEX idx_pay_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Paiements versés aux techniciens (techPayments)
CREATE TABLE tech_payments (
  id         VARCHAR(32) PRIMARY KEY,
  tech_id    VARCHAR(32) NOT NULL,
  amount     DECIMAL(10,2) NOT NULL,
  note       VARCHAR(255),
  date       DATE NOT NULL,
  FOREIGN KEY (tech_id) REFERENCES users(id),
  INDEX idx_techpay_tech (tech_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 5. STOCK & MATÉRIAUX
-- ============================================================================

CREATE TABLE materials (
  id       VARCHAR(32) PRIMARY KEY,
  code     VARCHAR(50) NOT NULL UNIQUE,
  name     VARCHAR(200) NOT NULL,
  category VARCHAR(100),
  unit     VARCHAR(30),
  stock    DECIMAL(10,2) DEFAULT 0,
  min_stock DECIMAL(10,2) DEFAULT 0,
  cost     DECIMAL(10,2) DEFAULT 0,             -- coût moyen pondéré
  active   BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stock_movements (
  id         VARCHAR(32) PRIMARY KEY,
  material_id VARCHAR(32) NOT NULL,
  type       ENUM('IN','OUT') NOT NULL,
  qty        DECIMAL(10,2) NOT NULL,
  date       DATE NOT NULL,
  reason     VARCHAR(255),
  ref        VARCHAR(100),                       -- réf. commande ou dossier lié
  performed_by VARCHAR(32),
  FOREIGN KEY (material_id) REFERENCES materials(id),
  FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_stockmv_mat (material_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 6. FOURNISSEURS & BONS DE COMMANDE
-- ============================================================================

CREATE TABLE suppliers (
  id             VARCHAR(32) PRIMARY KEY,
  name           VARCHAR(200) NOT NULL,
  contact        VARCHAR(150),
  email          VARCHAR(150),
  phone          VARCHAR(30),
  city           VARCHAR(100),
  address        VARCHAR(255),
  payment_terms  VARCHAR(100),
  notes          TEXT,
  active         BOOLEAN DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE purchase_orders (
  id              VARCHAR(32) PRIMARY KEY,
  po_num          VARCHAR(50) NOT NULL UNIQUE,
  supplier_id     VARCHAR(32) NOT NULL,
  order_date      DATE NOT NULL,
  expected_date   DATE,
  received_date   DATE,
  status          ENUM('DRAFT','PENDING_APPROVAL','APPROVED','SENT','PARTIAL','RECEIVED','CANCELLED') DEFAULT 'DRAFT',
  payment_status  ENUM('UNPAID','PARTIAL','PAID') DEFAULT 'UNPAID',
  shipping        DECIMAL(10,2) DEFAULT 0,
  paid_amount     DECIMAL(10,2) DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  INDEX idx_po_supplier (supplier_id),
  INDEX idx_po_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE po_items (
  id          VARCHAR(32) PRIMARY KEY,
  po_id       VARCHAR(32) NOT NULL,
  material_id VARCHAR(32),
  name        VARCHAR(200) NOT NULL,
  category    VARCHAR(100),
  qty         DECIMAL(10,2) NOT NULL DEFAULT 1,
  received    DECIMAL(10,2) DEFAULT 0,
  unit        VARCHAR(30),
  unit_price  DECIMAL(10,2) DEFAULT 0,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  tax_pct      DECIMAL(5,2) DEFAULT 0,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL,
  INDEX idx_poitems_po (po_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE po_payments (
  id       VARCHAR(32) PRIMARY KEY,
  po_id    VARCHAR(32) NOT NULL,
  amount   DECIMAL(10,2) NOT NULL,
  date     DATE NOT NULL,
  method   VARCHAR(50),
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE po_attachments (
  id         VARCHAR(32) PRIMARY KEY,
  po_id      VARCHAR(32) NOT NULL,
  kind       ENUM('QUOTATION','INVOICE','DELIVERY_NOTE') NOT NULL,
  file_name  VARCHAR(255) NOT NULL,
  file_path  VARCHAR(500) NOT NULL,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 7. COMPTABILITÉ (DÉPENSES & TRÉSORERIE)
-- ============================================================================

CREATE TABLE expense_categories (
  id    VARCHAR(32) PRIMARY KEY,
  name  VARCHAR(100) NOT NULL,
  icon  VARCHAR(10),
  color VARCHAR(7)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE expenses (
  id          VARCHAR(32) PRIMARY KEY,
  category_id VARCHAR(32) NOT NULL,
  amount      DECIMAL(10,2) NOT NULL,
  description VARCHAR(255) NOT NULL,
  date        DATE NOT NULL,
  note        VARCHAR(255),
  recorded_by VARCHAR(32),
  FOREIGN KEY (category_id) REFERENCES expense_categories(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_expenses_cat (category_id),
  INDEX idx_expenses_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Mouvements de caisse / trésorerie (caisse)
CREATE TABLE cash_movements (
  id          VARCHAR(32) PRIMARY KEY,
  type        ENUM('IN','OUT') NOT NULL,
  amount      DECIMAL(10,2) NOT NULL,
  description VARCHAR(255),
  date        DATE NOT NULL,
  ref         VARCHAR(100),
  recorded_by VARCHAR(32),
  FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_cash_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 8. ÉQUIPEMENTS
-- ============================================================================

CREATE TABLE equipment (
  id            VARCHAR(32) PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  category      VARCHAR(100),
  brand         VARCHAR(150),
  serial_no     VARCHAR(100),
  price         DECIMAL(10,2) DEFAULT 0,
  purchase_date DATE,
  status        ENUM('Actif','Maintenance','Hors service','Remplacé') DEFAULT 'Actif',
  observation   TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historique de maintenance par équipement (mDate, mNote, mHours, mNext)
CREATE TABLE equipment_maintenance (
  id            VARCHAR(32) PRIMARY KEY,
  equipment_id  VARCHAR(32) NOT NULL,
  date          DATE NOT NULL,
  note          TEXT,
  hours         DECIMAL(6,2),
  next_due_date DATE,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 9. ARCHIVES & AUDIT
-- ============================================================================

-- Archivage générique: snapshot JSON de n'importe quel enregistrement supprimé
CREATE TABLE archives (
  id               VARCHAR(32) PRIMARY KEY,
  category         VARCHAR(50) NOT NULL,          -- cases, invoices, clinics, ...
  record_id        VARCHAR(32) NOT NULL,
  record_type      VARCHAR(100),
  data             JSON NOT NULL,                  -- snapshot complet de l'enregistrement
  archive_date     DATE NOT NULL,
  archived_by      VARCHAR(150),
  archive_reason   VARCHAR(255),
  original_created_date DATE,
  last_modified_date    DATE,
  file_size        BIGINT,
  status           ENUM('ARCHIVED','RESTORED') DEFAULT 'ARCHIVED',
  restored_date    DATE,
  restored_by      VARCHAR(150),
  notes            TEXT,
  INDEX idx_archives_cat (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE archive_policy (
  id                  INT PRIMARY KEY DEFAULT 1,
  auto_archive_months INT DEFAULT 12,
  enabled             BOOLEAN DEFAULT FALSE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_log (
  id           VARCHAR(32) PRIMARY KEY,
  action       VARCHAR(50) NOT NULL,               -- ARCHIVE, RESTORE, CREATE, UPDATE, DELETE...
  category     VARCHAR(50),
  record_id    VARCHAR(32),
  record_label VARCHAR(255),
  user_name    VARCHAR(150),
  date         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 10. NOTIFICATIONS & PARAMÈTRES
-- ============================================================================

CREATE TABLE notifications (
  id         VARCHAR(32) PRIMARY KEY,
  user_id    VARCHAR(32),                          -- destinataire (NULL = broadcast)
  title      VARCHAR(200),
  message    TEXT,
  read_flag  BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Paramètres globaux de l'application (une seule ligne, id=1)
CREATE TABLE settings (
  id              INT PRIMARY KEY DEFAULT 1,
  lang            VARCHAR(10) DEFAULT 'fr',
  currency        VARCHAR(10) DEFAULT 'DA',
  currency_symbol VARCHAR(10) DEFAULT 'DA',
  font_size       DECIMAL(4,1) DEFAULT 13.5,
  theme           VARCHAR(20) DEFAULT 'light',
  primary_color   VARCHAR(7) DEFAULT '#1a56db',
  company_name    VARCHAR(150) DEFAULT 'DentLab Pro',
  company_phone   VARCHAR(30),
  company_address VARCHAR(255),
  company_nif     VARCHAR(50),
  company_nis     VARCHAR(50),
  company_ai      VARCHAR(50),
  company_rc      VARCHAR(50),
  logo_path       VARCHAR(500),
  date_format     VARCHAR(20) DEFAULT 'DD/MM/YYYY',
  time_format     VARCHAR(10) DEFAULT '24h',
  timezone        VARCHAR(50) DEFAULT 'Africa/Algiers',
  fiscal_year_start VARCHAR(5) DEFAULT '01'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- DONNÉES DE BASE (seed minimal)
-- ============================================================================

INSERT INTO settings (id) VALUES (1);
INSERT INTO archive_policy (id) VALUES (1);

INSERT INTO stage_defs (id,label,bg,color,dot_color,rate,editable,sort_order) VALUES
 ('RECEIVED','Reçu','#f1f5f9','#475569','#94a3b8',0,FALSE,1),
 ('DESIGN','Conception','#f3f0ff','#7c3aed','#8b5cf6',500,TRUE,2),
 ('MILLING','Fraisage','#eff6ff','#1d4ed8','#3b82f6',500,TRUE,3),
 ('SINTERING','Frittage','#fff7ed','#c2410c','#f97316',200,TRUE,4),
 ('FINISHING','Finition','#fefce8','#a16207','#eab308',300,TRUE,5),
 ('MAQUILLAGE','Maquillage','#fdf4ff','#a21caf','#e879f9',400,TRUE,6),
 ('QC','Contrôle QC','#fff0f0','#be123c','#fb7185',150,TRUE,7),
 ('READY','Prêt','#f0fdf4','#166534','#22c55e',0,FALSE,8),
 ('DELIVERED','Livré','#ecfdf5','#065f46','#10b981',0,FALSE,9);
