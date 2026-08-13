const crypto = require('crypto');
// Génère un identifiant court unique (équivalent du uid() côté frontend)
function genId(prefix = '') {
  return prefix + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
}
module.exports = { genId };
