const logger = require('../utils/logger');

let supabaseClient = null;
let supabaseAuthClient = null;
let isInitialized = false;

function init() {
  if (isInitialized) return true;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.warn('SUPABASE_URL ou SUPABASE_SERVICE_KEY manquants. Stockage cloud désactivé.');
    return false;
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });
    if (supabaseAnonKey) {
      supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false }
      });
    }
    isInitialized = true;
    logger.info('Supabase initialisé avec succès');
    ensureBuckets();
    return true;
  } catch (error) {
    logger.error('Erreur initialisation Supabase:', error.message);
    return false;
  }
}

async function ensureBuckets() {
  const requiredBuckets = ['documents', 'versions'];
  for (const bucket of requiredBuckets) {
    try {
      const { data, error } = await supabaseClient.storage.getBucket(bucket);
      if (error || !data) {
        const { error: createError } = await supabaseClient.storage.createBucket(bucket, { public: false });
        if (createError) logger.warn(`Bucket "${bucket}" non créé:`, createError.message);
        else logger.info(`Bucket "${bucket}" créé`);
      }
    } catch (e) {
      logger.warn(`Erreur vérification bucket "${bucket}":`, e.message);
    }
  }
}

function getClient() {
  if (!isInitialized) init();
  return supabaseClient;
}

function getAuthClient() {
  if (!isInitialized) init();
  return supabaseAuthClient;
}

function isConfigured() {
  return isInitialized;
}

module.exports = { init, getClient, getAuthClient, isConfigured };
