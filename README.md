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
