const logger = require('../utils/logger');

let tesseract = null;
let isAvailable = true;

async function init() {
  try {
    tesseract = require('tesseract.js');
    logger.info('OCR (Tesseract.js) disponible');
  } catch {
    isAvailable = false;
    logger.warn('OCR non disponible: installer tesseract.js');
  }
}

async function extractText(imagePath, lang = 'fra') {
  if (!isAvailable || !tesseract) {
    return { text: null, error: 'OCR non disponible' };
  }
  try {
    const { data } = await tesseract.recognize(imagePath, lang, {
      logger: m => m.status === 'recognizing text' && logger.debug(`OCR: ${Math.round(m.progress * 100)}%`),
    });
    return { text: data.text.trim(), confidence: data.confidence, error: null };
  } catch (error) {
    logger.error('Erreur OCR:', error.message);
    return { text: null, error: error.message };
  }
}

async function extractTextFromBuffer(buffer, lang = 'fra') {
  if (!isAvailable || !tesseract) {
    return { text: null, error: 'OCR non disponible' };
  }
  try {
    const { data } = await tesseract.recognize(buffer, lang, {
      logger: m => m.status === 'recognizing text' && logger.debug(`OCR: ${Math.round(m.progress * 100)}%`),
    });
    return { text: data.text.trim(), confidence: data.confidence, error: null };
  } catch (error) {
    logger.error('Erreur OCR buffer:', error.message);
    return { text: null, error: error.message };
  }
}

module.exports = { init, extractText, extractTextFromBuffer, isAvailable: () => isAvailable };
