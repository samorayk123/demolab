// Middleware d'erreur centralisé — toutes les routes passent leurs erreurs
// à next(err) au lieu de faire des try/catch répétitifs partout.
function errorHandler(err, req, res, next) {
  console.error(err);
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Cet enregistrement existe déjà (doublon)' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
    return res.status(400).json({ error: 'Référence invalide (clé étrangère introuvable)' });
  }
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
}
// Wrapper pour éviter les try/catch dans chaque handler async
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { errorHandler, ah };
