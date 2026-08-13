# DentLab Pro — Backend API

## Installation
1. `npm install`
2. Copier `.env.example` en `.env` et renseigner les identifiants MySQL + un `JWT_SECRET` long et aléatoire.
3. Importer `dentlab_schema.sql` dans votre base MySQL.
4. Créer un premier compte ADMIN directement en base (le mot de passe doit être haché en bcrypt — voir script `hash_password.js` ci-dessous), puis se connecter via `/api/auth/login`.
5. `npm start` (ou `npm run dev` en développement).

## Générer un hash bcrypt pour créer le premier admin manuellement
```js
node -e "require('bcryptjs').hash('votreMotDePasse',10).then(console.log)"
```
Puis :
```sql
INSERT INTO users (id,name,email,password_hash,role) VALUES ('admin1','Admin Lab','admin@lab.dz','<hash généré>','ADMIN');
```

## Structure
- `src/config/db.js` — pool de connexions MySQL
- `src/middleware/auth.js` — JWT (requireAuth, requireRole)
- `src/routes/` — un fichier par module métier
- `src/utils/crudFactory.js` — génère un CRUD standard pour les tables simples (cliniques, dentistes, fournisseurs, dépenses, équipement...)

## Modules avec logique métier dédiée
- **cases** (dossiers) : création avec initialisation automatique du workflow, avancement d'étape (`PATCH /:id/advance`), commentaires
- **invoices** (factures) : paiements avec recalcul automatique du statut (UNPAID/PARTIAL/PAID)
- **materials** (stock) : mouvements IN/OUT avec ajustement transactionnel du stock (verrouillage `FOR UPDATE`)
- **purchase-orders** (bons de commande) : réception d'articles avec mise à jour du stock, paiements, changement de statut

## Notes de sécurité
- Tous les mots de passe sont hachés avec bcrypt — jamais stockés en clair.
- Toutes les routes (sauf `/api/auth/login` et `/api/health`) exigent un token JWT (`Authorization: Bearer <token>`).
- Pensez à restreindre `CORS_ORIGIN` à votre domaine frontend en production.
