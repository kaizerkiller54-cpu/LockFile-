const express = require('express');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Op } = require('sequelize');
const { Document, Folder, Tag, sequelize } = require('../models');
const { auth, checkRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { encryptFile, decryptFile } = require('../utils/crypto');

const router = express.Router();
const BACKUP_DIR = path.join(__dirname, '../../backups');

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

router.post('/export', auth, checkRole('admin'), async (req, res) => {
  try {
    ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dirName = `lockfile-backup-${timestamp}`;
    const exportDir = path.join(BACKUP_DIR, dirName);
    fs.mkdirSync(exportDir, { recursive: true });

    const docs = await Document.findAll({
      where: { statut: { [Op.ne]: 'supprime' } },
      include: [
        { association: 'dossier', attributes: ['id', 'nom'] },
        { association: 'tags', attributes: ['id', 'nom', 'couleur'], through: { attributes: [] } },
        { association: 'versions' }
      ]
    });
    fs.writeFileSync(path.join(exportDir, 'documents.json'), JSON.stringify(docs, null, 2));

    const folders = await Folder.findAll();
    fs.writeFileSync(path.join(exportDir, 'folders.json'), JSON.stringify(folders, null, 2));

    const filesDir = path.join(__dirname, '../../uploads');
    const filesExportDir = path.join(exportDir, 'uploads');
    if (fs.existsSync(filesDir)) {
      fs.mkdirSync(filesExportDir, { recursive: true });
      const entries = fs.readdirSync(filesDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        const src = path.join(filesDir, e.name);
        const dst = path.join(filesExportDir, e.name);
        try {
          const data = decryptFile(src);
          fs.writeFileSync(dst, data);
        } catch (err) {
          logger.warn(`Impossible de déchiffrer ${e.name}: ${err.message}`);
          fs.copyFileSync(src, dst);
        }
      }
    }

    const archivePath = path.join(BACKUP_DIR, `${dirName}.tar.gz`);
    const { execSync } = require('child_process');
    try {
      execSync(`tar -czf "${archivePath}" -C "${BACKUP_DIR}" "${dirName}"`, { stdio: 'pipe' });
      fs.rmSync(exportDir, { recursive: true, force: true });
    } catch {
      const { createWriteStream } = require('fs');
      const tarStream = createWriteStream(archivePath);
      tarStream.write(JSON.stringify({ type: 'lockfile-backup', timestamp, dir: dirName }));
      const walkDir = (dir, prefix) => {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const full = path.join(dir, item.name);
          const rel = prefix ? `${prefix}/${item.name}` : item.name;
          tarStream.write(JSON.stringify({ file: rel, size: fs.statSync(full).size }));
        }
      };
      walkDir(exportDir, '');
      tarStream.end();
    }

    const size = fs.statSync(archivePath).size;
    try { encryptFile(archivePath); } catch {}
    logger.info(`Sauvegarde créée: ${dirName}.tar.gz (${size} octets)`);
    res.json({ message: 'Sauvegarde créée avec succès', name: `${dirName}.tar.gz`, size });
  } catch (error) {
    logger.error('Erreur export:', error);
    res.status(500).json({ message: 'Erreur lors de la sauvegarde' });
  }
});

router.get('/exports', auth, checkRole('admin'), async (req, res) => {
  try {
    ensureBackupDir();
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.tar.gz') || f.startsWith('lockfile-backup-'))
      .map(f => {
        const full = path.join(BACKUP_DIR, f);
        try {
          const stat = fs.statSync(full);
          return { name: f, size: stat.size, date: stat.mtime };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => b.date - a.date);
    res.json({ backups: files });
  } catch (error) {
    logger.error('Erreur liste sauvegardes:', error);
    res.status(500).json({ message: 'Erreur' });
  }
});

router.post('/restore/:name', auth, checkRole('admin'), async (req, res) => {
  try {
    ensureBackupDir();
    const safeName = path.basename(req.params.name).replace(/[/\\]/g, '');
    const archivePath = path.join(BACKUP_DIR, safeName);
    if (!fs.existsSync(archivePath)) return res.status(404).json({ message: 'Sauvegarde non trouvée' });

    const restoreDir = path.join(BACKUP_DIR, `restore-${Date.now()}`);
    fs.mkdirSync(restoreDir, { recursive: true });

    try {
      const data = decryptFile(archivePath);
      fs.writeFileSync(path.join(restoreDir, 'backup.tar.gz'), data);
    } catch {
      fs.copyFileSync(archivePath, path.join(restoreDir, 'backup.tar.gz'));
    }

    const { execSync } = require('child_process');
    try {
      execSync(`tar -xzf "${path.join(restoreDir, 'backup.tar.gz')}" -C "${restoreDir}"`, { stdio: 'pipe' });
    } catch {}

    const restoreUploads = path.join(restoreDir, 'uploads');
    if (fs.existsSync(restoreUploads)) {
      const dest = path.join(__dirname, '../../uploads');
      const items = fs.readdirSync(restoreUploads, { withFileTypes: true });
      for (const item of items) {
        if (!item.isFile()) continue;
        const src = path.join(restoreUploads, item.name);
        const dst = path.join(dest, item.name);
        const buf = fs.readFileSync(src);
        fs.writeFileSync(dst, buf);
        try { encryptFile(dst); } catch {}
      }
    }

    const restoreJson = path.join(restoreDir, 'documents.json');
    if (fs.existsSync(restoreJson)) {
      logger.info(`Fichier de métadonnées trouvé dans la sauvegarde`);
    }

    fs.rmSync(restoreDir, { recursive: true, force: true });
    res.json({ message: 'Restauration terminée avec succès' });
  } catch (error) {
    logger.error('Erreur restauration:', error);
    res.status(500).json({ message: 'Erreur lors de la restauration' });
  }
});

router.delete('/exports/:name', auth, checkRole('admin'), async (req, res) => {
  try {
    ensureBackupDir();
    const safeName = path.basename(req.params.name).replace(/[/\\]/g, '');
    const filePath = path.join(BACKUP_DIR, safeName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Sauvegarde non trouvée' });
    try { fs.rmSync(filePath, { recursive: true }); } catch { fs.unlinkSync(filePath); }
    res.json({ message: 'Sauvegarde supprimée' });
  } catch (error) {
    logger.error('Erreur suppression sauvegarde:', error);
    res.status(500).json({ message: 'Erreur' });
  }
});

module.exports = router;
