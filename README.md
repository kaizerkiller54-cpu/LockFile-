<<<<<<< HEAD
# LockFile - Application d'Archivage de Documents

Application professionnelle de gestion, archivage et partage de documents avec scan, OCR et stockage cloud.

## Stack

- **Backend** : Node.js + Express
- **Base de données** : PostgreSQL (via Sequelize ORM)
- **Stockage cloud** : Supabase Storage
- **Auth** : Supabase Auth + JWT
- **Frontend** : Vanilla JS SPA (sans framework)
- **PDF/Images** : Sharp, Tesseract.js (optionnels)
- **File d'attente** : BullMQ + Redis (optionnel)
- **Recherche** : Meilisearch (optionnel)

## Déploiement rapide

### Option A : Railway (Backend) + Netlify (Frontend) — recommandé

**1. Backend sur Railway**
```bash
git push origin main
# Va sur https://railway.app → New Project → Deploy from GitHub
# Ajoute le plugin PostgreSQL
```

Définis ces variables d'environnement dans Railway :

| Variable | Description |
|---|---|
| `SUPABASE_URL` | URL de ton projet Supabase |
| `SUPABASE_SERVICE_KEY` | Clé service role Supabase |
| `SUPABASE_ANON_KEY` | Clé anon Supabase |
| `SUPABASE_JWT_SECRET` | JWT secret Supabase |
| `JWT_SECRET` | Secret pour signer les tokens (32+ caractères hex) |
| `ENCRYPTION_KEY` | Clé de chiffrement AES (32+ caractères hex) |
| `JWT_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | `https://ton-site.netlify.app` |

**2. Frontend sur Netlify**
```bash
# Va sur https://netlify.app → New site → Import from Git
# Publish directory: public
```

Dans Netlify → Site settings → Environment Variables :
```
API_BASE_URL = https://ton-backend.railway.app
```

### Option B : Tout sur Railway (plus simple)

Déploie simplement tout le repo sur Railway. Le serveur Express sert les fichiers statiques + l'API sur le même domaine. Pas de CORS à configurer.

### Option C : Local (développement)

```bash
npm install
# Copie .env.example → .env et remplit les valeurs
npm start
```

## Installation des dépendances optionnelles

```bash
# Traitement d'images (conversion, compression)
npm install sharp

# OCR (reconnaissance de texte)
npm install tesseract.js

# File d'attente pour les scans (nécessite Redis)
npm install bullmq ioredis

# Recherche full-text avancée (nécessite Meilisearch)
npm install meilisearch
```

Toutes ces fonctionnalités ont un **fallback automatique** : si le package n'est pas installé, l'application fonctionne sans.

## Structure du projet

```
LockFile/
├── public/                  # Frontend (statique)
│   ├── index.html
│   ├── css/app.css
│   └── js/
│       ├── api.js           # Client API
│       ├── auth.js          # Authentification
│       ├── router.js        # SPA router
│       ├── i18n.js          # Traductions (FR/EN/ES/DE/PT)
│       ├── app.js           # Application principale
│       ├── config.js        # Configuration frontend
│       └── pages/           # Pages de l'application
│           ├── dashboard.js
│           ├── documents.js
│           ├── folders.js
│           ├── tags.js
│           ├── scan.js          # Scanner de documents
│           ├── shared.js
│           ├── notifications.js
│           ├── archive.js
│           ├── trash.js
│           ├── profile.js
│           ├── settings.js
│           ├── search.js
│           ├── admin.js
│           └── backup.js
├── src/
│   ├── server.js            # Point d'entrée Express
│   ├── config/
│   │   ├── db.js            # PostgreSQL / Sequelize
│   │   ├── supabase.js      # Client Supabase
│   │   └── queue.js         # BullMQ + Redis (optionnel)
│   ├── models/
│   │   ├── User.js
│   │   ├── Document.js
│   │   ├── Folder.js
│   │   ├── Tag.js
│   │   ├── Version.js
│   │   ├── Notification.js
│   │   └── Permission.js
│   ├── routes/
│   │   ├── auth.js          # Inscription, connexion, profil
│   │   ├── documents.js     # CRUD documents + versions
│   │   ├── folders.js       # Dossiers
│   │   ├── tags.js          # Étiquettes
│   │   ├── users.js         # Administration utilisateurs
│   │   ├── search.js        # Recherche
│   │   ├── notifications.js # Notifications
│   │   ├── sharing.js       # Partage
│   │   ├── backup.js        # Sauvegarde / restauration
│   │   └── scan.js          # Scan + upload + OCR
│   ├── middleware/
│   │   ├── auth.js          # Middleware JWT
│   │   └── upload.js        # Multer (upload fichiers)
│   ├── services/
│   │   ├── ocrService.js        # OCR (Tesseract.js)
│   │   ├── imageProcessor.js    # Compression, conversion (Sharp)
│   │   └── searchService.js     # Meilisearch
│   └── utils/
│       ├── crypto.js        # Chiffrement AES-256-GCM
│       ├── storage.js       # Upload/download Supabase
│       ├── sanitize.js      # Nettoyage et validation des entrées
│       └── logger.js        # Winston logger
├── netlify.toml             # Configuration Netlify
├── .env.example             # Template variables d'environnement
└── package.json
```

## API Principale

### Authentification
```
POST /api/auth/register     # Inscription
POST /api/auth/login        # Connexion
GET  /api/auth/me           # Profil connecté
PUT  /api/auth/profile      # Modifier profil
PUT  /api/auth/password     # Changer mot de passe
```

### Documents
```
GET    /api/documents             # Lister (paginé)
POST   /api/documents             # Uploader (multipart)
PUT    /api/documents/:id         # Modifier
DELETE /api/documents/:id         # Corbeille
GET    /api/documents/:id         # Détail
GET    /api/documents/download/:id # Télécharger
```

### Scan
```
POST /api/scan/upload       # Upload avec OCR + compression
GET  /api/scan/status/:id   # Statut job asynchrone
```

### Recherche
```
GET /api/search?q=xxx&type=pdf&tags=1,2
```

## Sécurité

- **Validation** : express-validator + sanitize (strip HTML) sur toutes les routes
- **Rate limiting** : 20 req/15min (auth), 150 req/15min (API), 30 req/1h (uploads)
- **Chiffrement** : AES-256-GCM pour les fichiers au repos
- **Headers** : Helmet (CSP, XSS, etc.)
- **CORS** : Configurable via `CORS_ORIGINS`
- **SQLi** : Sequelize ORM (paramétrisé) + `express-validator`
- **Clés** : Jamais dans le code, uniquement en variables d'environnement

## Commandes

```bash
npm start          # Démarrer le serveur
npm run dev        # Mode développement (--watch)
node scripts/generate-keys.js   # Générer des clés sécurisées
```

## Licence

MIT
=======
# LockFile - File Manager & Archiving System

## 🎯 Purpose
LockFile is a file manager designed for secure document storage, archiving, and retrieval.  
It combines cloud storage (e.g., Supabase, Firebase, or S3) with a database for metadata management.

---

## ⚙️ Features
- Upload, download, and delete files
- Archive and restore documents
- Metadata management (title, type, owner, tags, status)
- Tag system for flexible classification
- Secure access with authentication and permissions
- Search and filter by tags, type, or date
- Versioning and activity logs

---

## 🏗️ Tech Stack
- **Backend**: Node.js + Express
- **Database**: MongoDB or PostgreSQL
- **Storage**: Supabase Storage / AWS S3 
- **Frontend**: React or Vue
- **Auth**: JWT (JSON Web Token)

---

## 🚀 API Endpoints
- `POST /documents` → upload a file
- `PATCH /documents/:id/archive` → archive a file
- `PATCH /documents/:id/restore` → restore a file
- `DELETE /documents/:id` → delete a file
- `GET /documents?tags=finance,urgent` → filter by tags
- `POST /tags` → create a tag
- `PATCH /documents/:id/tags` → assign tags to a document

---

## 📂 Project Setup
```bash
# Install dependencies
npm install
click on 'lancer.bat'
>>>>>>> b4bf7d31260dc139e911fa7939c7a08ebdf6fc4a
