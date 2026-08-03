const fs = require('fs');

function isZip(buf) {
  return buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
}

function isOle(buf) {
  return buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0 &&
         buf[4] === 0xA1 && buf[5] === 0xB1 && buf[6] === 0x1A && buf[7] === 0xE1;
}

const SIGNATURES = {
  'application/pdf': [b => b.toString('latin1', 0, 4) === '%PDF'],
  'application/msword': [isOle],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [isZip],
  'application/vnd.ms-excel': [isOle],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [isZip],
  'application/vnd.ms-powerpoint': [isOle],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [isZip],
  'image/jpeg': [b => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF],
  'image/png': [b => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47],
  'image/gif': [b => b.toString('latin1', 0, 4) === 'GIF8'],
  'image/webp': [b => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'],
  'image/tiff': [b => (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2A) || (b[0] === 0x4D && b[1] === 0x4D && b[2] === 0x00 && b[3] === 0x2A)],
  'image/bmp': [b => b.toString('latin1', 0, 2) === 'BM'],
  'image/svg+xml': [b => {
    const s = b.toString('latin1', 0, 16).replace(/^\uFEFF/, '').trimStart();
    return s.startsWith('<svg') || s.startsWith('<?xml') || s.startsWith('<!DOCTYPE');
  }],
  'application/zip': [isZip],
  'application/x-rar-compressed': [b => b.toString('latin1', 0, 7) === 'Rar!\x1a\x07'],
  'video/mp4': [b => b.toString('latin1', 4, 8) === 'ftyp'],
  'audio/mpeg': [b => (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0)]
};

function assertValidFile(filePath, mimetype) {
  const checks = SIGNATURES[mimetype];
  if (!checks) return { ok: true };
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    return { ok: checks.some(check => check(buf)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { assertValidFile };
