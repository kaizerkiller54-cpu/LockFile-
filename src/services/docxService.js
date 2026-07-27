const logger = require('../utils/logger');

let mammoth = null;
let isAvailable = true;

async function init() {
  try {
    mammoth = require('mammoth');
    logger.info('docxService (mammoth) disponible');
  } catch {
    isAvailable = false;
    logger.warn('docxService non disponible: npm install mammoth');
  }
}

async function extractText(filePath) {
  if (!isAvailable || !mammoth) {
    return { text: null, error: 'Mammoth non disponible' };
  }
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = result.value.trim();
    if (!text) return { text: null, error: 'Aucun texte trouvé dans le document' };
    return { text, error: null };
  } catch (error) {
    logger.error('Erreur extraction docx:', error.message);
    return { text: null, error: error.message };
  }
}

module.exports = { init, extractText, isAvailable: () => isAvailable };
