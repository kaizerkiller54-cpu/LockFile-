const logger = require('../utils/logger');

let admin = null;
let bucket = null;
let isInitialized = false;

function init() {
  if (isInitialized) return true;
  try {
    admin = require('firebase-admin');
  } catch {
    logger.warn('firebase-admin non installé. Stockage Firebase désactivé.');
    return false;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;

  if (!projectId || !clientEmail || !privateKey || !storageBucket) {
    logger.warn('Variables Firebase manquantes. Stockage Firebase désactivé.');
    return false;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n')
      }),
      storageBucket
    });
    bucket = admin.storage().bucket();
    isInitialized = true;
    logger.info('Firebase Storage initialisé avec succès');
    return true;
  } catch (error) {
    logger.error('Erreur initialisation Firebase:', error);
    return false;
  }
}

function getBucket() {
  if (!isInitialized) init();
  return bucket;
}

function isConfigured() {
  return isInitialized;
}

module.exports = { init, getBucket, isConfigured, admin };
