const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const UPLOAD_ROOT = process.env.UPLOAD_DIR || 'uploads';

// Stockage sur disque, organisé par sous-dossier (ex: 'po', 'cases') + id du dossier parent
function makeStorage(subfolder) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOAD_ROOT, subfolder, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, safe);
    },
  });
}

// Limite à 15 Mo par fichier, types courants de documents/images uniquement
const fileFilter = (req, file, cb) => {
  const allowed = /pdf|jpe?g|png|webp|doc|docx|xls|xlsx/i;
  if (allowed.test(path.extname(file.originalname))) cb(null, true);
  else cb(new Error('Type de fichier non autorisé'));
};

function uploader(subfolder) {
  return multer({ storage: makeStorage(subfolder), fileFilter, limits: { fileSize: 15 * 1024 * 1024 } });
}

module.exports = { uploader, UPLOAD_ROOT };
