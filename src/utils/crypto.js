const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');
const logger = require('./logger');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return null;
  return crypto.scryptSync(key, 'lockfile-salt', 32);
}

function encryptBuffer(buffer) {
  const key = getKey();
  if (!key) return buffer;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decryptBuffer(buffer) {
  const key = getKey();
  if (!key) return buffer;
  const iv = buffer.slice(0, IV_LENGTH);
  const tag = buffer.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.slice(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function encryptFile(filePath) {
  if (!process.env.ENCRYPTION_KEY) return;
  const buffer = fs.readFileSync(filePath);
  const encrypted = encryptBuffer(buffer);
  fs.writeFileSync(filePath, encrypted);
}

function decryptFile(filePath) {
  if (!process.env.ENCRYPTION_KEY) return fs.readFileSync(filePath);
  const buffer = fs.readFileSync(filePath);
  return decryptBuffer(buffer);
}

function compressBuffer(buffer) {
  return zlib.gzipSync(buffer);
}

function decompressBuffer(buffer) {
  return zlib.gunzipSync(buffer);
}

module.exports = { encryptBuffer, decryptBuffer, encryptFile, decryptFile, compressBuffer, decompressBuffer };
