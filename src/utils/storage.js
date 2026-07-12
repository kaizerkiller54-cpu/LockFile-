const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const { getClient, isConfigured } = require('../config/supabase');
const { encryptFile, decryptFile, compressBuffer, decompressBuffer } = require('./crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

function getLocalPath(filename) {
  return path.join(UPLOAD_DIR, filename);
}

async function ensureBucket(bucketName) {
  const supabase = getClient();
  const { error } = await supabase.storage.createBucket(bucketName, { public: false });
  if (error && !error.message?.includes('already exists')) {
    logger.warn(`Création bucket "${bucketName}" échouée:`, error.message);
  }
}

async function supabaseUpload(bucketName, destPath, buffer, mimetype) {
  if (!isConfigured()) return null;
  const supabase = getClient();
  await ensureBucket(bucketName);
  const { error } = await supabase.storage
    .from(bucketName)
    .upload(destPath, buffer, {
      contentType: mimetype,
      upsert: true
    });
  if (error) throw error;
}

async function supabaseSignedUrl(bucketName, destPath, expiresInSeconds) {
  if (!isConfigured()) return null;
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(destPath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

async function supabaseDelete(bucketName, paths) {
  if (!isConfigured()) return;
  const supabase = getClient();
  const { error } = await supabase.storage
    .from(bucketName)
    .remove(paths);
  if (error) throw error;
}

async function uploadFile(tempPath, originalName, mimetype, userId) {
  const ext = path.extname(originalName);
  const uniqueName = `${uuidv4()}${ext}`;
  const localPath = getLocalPath(uniqueName);

  fs.copyFileSync(tempPath, localPath);
  try { encryptFile(localPath); } catch {}

  let cloudPath = null;
  let downloadUrl = null;

  if (isConfigured()) {
    try {
      const destPath = `${userId}/${uniqueName}`;
      const buffer = decryptFile(localPath);

      await supabaseUpload('documents', destPath, buffer, mimetype);

      const signedUrl = await supabaseSignedUrl('documents', destPath, 604800);

      cloudPath = `documents/${destPath}`;
      downloadUrl = signedUrl;
      logger.info(`Fichier uploadé vers Supabase: ${destPath}`);
    } catch (error) {
      logger.error('Erreur upload Supabase:', error.message);
    }
  }

  return {
    filename: uniqueName,
    path: localPath,
    cloudPath,
    url: downloadUrl
  };
}

async function deleteFile(filename, cloudPath) {
  const localPath = getLocalPath(filename);
  try { if (fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}

  if (cloudPath && isConfigured()) {
    try {
      const parts = cloudPath.split('/');
      const bucketName = parts[0];
      const objPath = parts.slice(1).join('/');
      await supabaseDelete(bucketName, [objPath]);
      logger.info(`Fichier supprimé de Supabase: ${cloudPath}`);
    } catch (error) {
      logger.error('Erreur suppression Supabase:', error.message);
    }
  }
}

async function getDownloadUrl(cloudPath) {
  if (!cloudPath || !isConfigured()) return null;
  try {
    const parts = cloudPath.split('/');
    const bucketName = parts[0];
    const objPath = parts.slice(1).join('/');
    return await supabaseSignedUrl(bucketName, objPath, 86400);
  } catch (error) {
    logger.error('Erreur génération URL Supabase:', error.message);
    return null;
  }
}

async function uploadVersionFile(tempPath, originalName, mimetype, userId) {
  const ext = path.extname(originalName);
  const uniqueName = `${uuidv4()}${ext}`;
  const localPath = getLocalPath(uniqueName);

  fs.copyFileSync(tempPath, localPath);
  try { encryptFile(localPath); } catch {}

  let cloudPath = null;

  if (isConfigured()) {
    try {
      const destPath = `${userId}/${uniqueName}`;
      const buffer = decryptFile(localPath);
      await supabaseUpload('versions', destPath, buffer, mimetype);
      cloudPath = `versions/${destPath}`;
      logger.info(`Version uploadée vers Supabase: ${destPath}`);
    } catch (error) {
      logger.error('Erreur upload version Supabase:', error.message);
    }
  }

  return {
    filename: uniqueName,
    path: localPath,
    cloudPath
  };
}

async function uploadArchivedFile(filePath, userId) {
  if (!isConfigured()) return { cloudPath: null, url: null };

  try {
    const destPath = `archives/${userId}/${uuidv4()}.gz`;
    const buffer = decryptFile(filePath);
    const compressed = compressBuffer(buffer);

    await supabaseUpload('documents', destPath, compressed, 'application/gzip');
    const signedUrl = await supabaseSignedUrl('documents', destPath, 604800);

    logger.info(`Fichier archivé compressé vers Supabase: ${destPath}`);
    return { cloudPath: `documents/${destPath}`, url: signedUrl };
  } catch (error) {
    logger.error('Erreur upload archivé:', error.message);
    return { cloudPath: null, url: null };
  }
}

async function downloadFile(cloudPath) {
  if (!cloudPath || !isConfigured()) return null;
  const parts = cloudPath.split('/');
  const bucketName = parts[0];
  const objPath = parts.slice(1).join('/');
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(bucketName)
    .download(objPath);
  if (error) throw error;
  const buffer = Buffer.from(await data.arrayBuffer());
  return buffer;
}

module.exports = { uploadFile, deleteFile, getDownloadUrl, uploadVersionFile, getLocalPath, uploadArchivedFile, downloadFile };
