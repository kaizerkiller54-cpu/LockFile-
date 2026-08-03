# LockFile — Application d'Archivage de Documents

Application professionnelle de gestion, archivage, partage et sécurisation de documents : scan, OCR, chiffrement, versions, notifications, approbations et stockage cloud.

## ✨ Fonctionnalités

- **Tableau de bord** : documents récents + statistiques
- **Upload** de fichiers (PDF, Word, Excel, PowerPoint, images, vidéos, audio) avec barre de progression
- **Organisation** : dossiers hiérarchiques + tags personnalisables
- **Recherche** intégrée (titre, date, mot-clé, tag, contenu OCR)
- **Affichage** liste ou grille, tri (date, récent, type, taille)
- **Versions** : historique et restauration des anciennes versions
- **Partage** : par utilisateur (lecture/écriture) et liens sécurisés avec expiration + mot de passe
- **Drag & drop** : glisser un document vers « Dossiers » pour le déplacer (clic maintenu 350 ms)
- **Notifications** : nouveau document, partage, mise à jour, expirations
- **Approbations** : workflow réservé aux organisations
- **Profil** : photo, langue (FR/EN/ES/DE/PT), thème clair/sombre
- **Scan + OCR** : scanner un document, reconnaissance de texte (Tesseract.js), compression (Sharp)
- **Sauvegardes** : export/restauration (admin)
- **Corbeille & archive** : restauration, suppression définitive, archivage compressé

## 🏗️ Stack

| Couche | Technologie |
|---|---|
| Backend | Node.js 18+ / Express 4 |
| Base de données | PostgreSQL (Sequelize ORM) |
| Stockage cloud | Supabase Storage (fallback disque local) |
| Auth | Supabase Auth + JWT (issuer/audience vérifiés) |
| Frontend | Vanilla JS SPA (sans framework) + Service Worker |
| Sécurité | Helmet (CSP), express-rate-limit, AES-256-GCM, magic-bytes |
| Optional | Sharp (images), Tesseract.js (OCR), BullMQ+Redis (file d'attente), Meilisearch (full-text) |

Toutes les fonctionnalités optionnelles ont un **fallback automatique** : l'application fonctionne sans elles.

## 🚀 Démarrage rapide

### Local (développement)

```bash
npm install
copy .env.example .env   # puis remplir les valeurs
node scripts/generate-keys.js   # générer JWT_SECRET et ENCRYPTION_KEY
npm start                # ou lancer.bat (Windows)
```

> PostgreSQL requis en local (base `archivage`). Création automatique via `lancer.bat`.

## ☁️ Déploiement

### Option A : Tout sur Railway (recommandé)

1. Créer un projet Railway → **Deploy from GitHub** → sélectionner ce dépôt
2. Ajouter le plugin **PostgreSQL** (injecte `DATABASE_URL`, SSL auto)
3. Ajouter les variables d'environnement (tableau ci-dessous)
4. Railway détecte `Procfile` (`web: node server.js`) et sert le frontend + l'API sur le même domaine

### Option B : Railway (backend) + Netlify (frontend)

- **Railway** : déployer le dépôt comme en Option A, définir `CORS_ORIGINS=https://<site>.netlify.app`
- **Netlify** : importer le repo, `Publish directory = public`, redirection SPA dans `netlify.toml`
- Variable Netlify : `API_BASE_URL` doit pointer vers l'URL Railway (voir `public/js/config.js`)

### Variables d'environnement

| Variable | Requis | Description |
|---|---|---|
| `DATABASE_URL` | Railway | Injectée par le plugin PostgreSQL (SSL) |
| `JWT_SECRET` | ✅ | ≥ 32 caractères aléatoires (`node scripts/generate-keys.js`) |
| `ENCRYPTION_KEY` | ✅ | Clé AES ≥ 32 caractères (les fichiers chiffrés en dépendent) |
| `SUPABASE_URL` | opt. | URL du projet Supabase (stockage cloud) |
| `SUPABASE_SERVICE_KEY` | opt. | Clé service role Supabase |
| `SUPABASE_ANON_KEY` | opt. | Clé anon Supabase |
| `SUPABASE_JWT_SECRET` | opt. | JWT secret Supabase |
| `CORS_ORIGINS` | opt. | Liste séparée par des virgules (désactive CORS si absent) |
| `NODE_ENV` | opt. | `production` |
| `PORT` | opt. | Port (défaut 5000, Railway l'injecte) |
| `JWT_EXPIRES_IN` | opt. | Défaut `7d` |
| `MAX_FILE_SIZE` | opt. | Octets, défaut 50 Mo |
| `UPLOAD_DIR` | opt. | Répertoire disque, défaut `uploads` |
| `DB_POOL_MAX` | opt. | Taille du pool, défaut 25 |

> ⚠️ Sur Railway le disque est éphémère : les fichiers uploadés sont envoyés dans **Supabase Storage** et les métadonnées en base. Les fichiers locaux (`uploads/`) ne sont qu'un cache de restauration.

## 🔐 Sécurité

- **CSP stricte** (Helmet) : `script-src-attr` autorisé pour les handlers inline, CDN Font Awesome/Google Fonts explicitement autorisés
- **Rate limiting** : auth 20/15min, API 100/min, uploads 120/h, partage 50/15min, downloads 300/h
- **Chiffrement au repos** : AES-256-GCM sur chaque fichier (locale) + compression pour l'archivage
- **Validation fichiers** : magic bytes (signatures réelles) — un fichier au contenu incohérent est rejeté (415)
- **Contrôle d'accès** : ownership des dossiers vérifiée, permissions lecture/écriture, approbations réservées aux organisations
- **Anti path-traversal** : les chemins de téléchargement/restauration sont contraints sous `uploads/`
- **JWT durci** : issuer/audience vérifiés, id entier positif, utilisateur actif requis
- **Secrets** : uniquement en variables d'environnement, jamais dans le code ni les logs (journaux sur `req.path`)
- **CORS** : restreint à `CORS_ORIGINS` (désactivé si absent)

## 📡 API

### Authentification
```
POST /api/auth/register    Inscription (particulier / organisation)
POST /api/auth/login       Connexion → JWT
GET  /api/auth/me          Profil connecté
PUT  /api/auth/profile     Modifier le profil
PUT  /api/auth/password    Changer le mot de passe
```

### Documents
```
GET    /api/documents              Lister (pagination, filtres : dossier, statut, favori, tag, sort)
POST   /api/documents              Upload multipart (champ `fichier`, `titre`, `dossier`, `tags`)
GET    /api/documents/:id          Détail
PUT    /api/documents/:id          Modifier / nouvelle version (multipart)
DELETE /api/documents/:id          Corbeille
PATCH  /api/documents/:id/tags     Assigner des tags
GET    /api/documents/download/:id Télécharger (auth Bearer obligatoire)
POST   /api/documents/:id/restore  Restaurer depuis la corbeille
POST   /api/documents/:id/archive  Archiver (compressé)
POST   /api/documents/:id/unarchive
GET    /api/documents/:id/versions Historique des versions
POST   /api/documents/:id/restore-version/:versionId
POST   /api/documents/:id/approve  Demander une approbation (organisation)
DELETE /api/documents/:id/permanent  Suppression définitive
```

### Dossiers & Tags
```
GET/POST   /api/folders       Liste / création
PUT/DELETE /api/folders/:id   Modifier / supprimer
GET        /api/folders/tree  Arborescence (drag & drop)
GET/POST   /api/tags          Liste / création
```

### Partage
```
POST   /api/sharing/documents/:id/share   Partager avec un utilisateur (niveau, email/username)
DELETE /api/sharing/documents/:id/share/:permissionId
POST   /api/sharing/folders/:id/share     Partager un dossier
POST   /api/sharing/documents/:id/link    Créer un lien sécurisé (niveau, expiration, mot_de_passe)
GET    /api/sharing/access/:link          Accès au lien (password en query si protégé)
```

### Recherche / Notifications / Activité
```
GET /api/search?q=...&page=&limit=     Recherche (titre, tags, OCR, dossier)
GET /api/notifications                 Notifications de l'utilisateur
GET /api/activity                      Journal d'activité
```

### Approbations (organisations uniquement)
```
GET  /api/approvals/pending          Approbations en attente
GET  /api/approvals/my-requests      Mes demandes
POST /api/approvals/:id/decision     Approuver / refuser
POST /api/approvals/:id/cancel       Annuler
```

### Administration (admin)
```
GET  /api/users                      Utilisateurs
GET  /api/stats                      Statistiques serveur (pool, mémoire)
POST /api/backup/export              Sauvegarde
POST /api/backup/restore/:name       Restauration
```

### Scan / OCR
```
POST /api/scan/preview   Aperçu (compression, correction)
POST /api/scan/confirm   Validation → création du document
```

## 📂 Structure

```
LockFile/
├── public/                # Frontend SPA
│   ├── index.html
│   ├── css/app.css
│   ├── js/ (app.js, api.js, auth.js, router.js, i18n.js, drag-drop.js, ...)
│   └── js/pages/          # Une page par vue
├── src/
│   ├── server.js          # Point d'entrée Express
│   ├── config/            # db.js, supabase.js, rateLimit.js, jwt.js, queue.js
│   ├── models/            # Sequelize (User, Document, Folder, Tag, Version, ...)
│   ├── routes/            # API par domaine
│   ├── middleware/        # auth.js (JWT), upload.js (Multer), security.js
│   ├── services/          # ocrService, imageProcessor, searchService, ...
│   └── utils/             # crypto (AES-256-GCM), storage, sanitize, logger
├── Procfile               # web: node server.js
├── netlify.toml           # Déploiement frontend Netlify
└── .env.example           # Template des variables d'environnement
```

## 🛠️ Commandes

```bash
npm start                        # Démarrer le serveur
npm run dev                      # Mode développement (--watch)
node scripts/generate-keys.js    # Générer des clés sécurisées
```

## 📜 Licence

MIT
