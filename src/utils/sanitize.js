function stripHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '').replace(/[<>"'\\]/g, '');
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return stripHtml(str).trim();
}

function sanitizeOptional(str) {
  if (str === undefined || str === null) return str;
  return sanitizeString(str);
}

function toInt(val) {
  const n = parseInt(val);
  return isNaN(n) ? null : n;
}

function sanitizeTags(tags) {
  if (!tags) return [];
  const arr = Array.isArray(tags) ? tags : (() => { try { return JSON.parse(tags); } catch { return []; } })();
  return arr.map(t => toInt(t)).filter(t => t !== null);
}

module.exports = { stripHtml, sanitizeString, sanitizeOptional, toInt, sanitizeTags };
