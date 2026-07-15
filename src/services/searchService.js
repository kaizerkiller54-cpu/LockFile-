const logger = require('../utils/logger');

let meiliClient = null;
let isAvailable = false;

function init() {
  const host = process.env.MEILI_HOST || process.env.MEILISEARCH_HOST;
  const apiKey = process.env.MEILI_API_KEY || process.env.MEILISEARCH_API_KEY;
  if (!host) {
    logger.info('MEILI_HOST non définie, recherche via Sequelize (pas Meilisearch)');
    return false;
  }
  try {
    const MeiliSearch = require('meilisearch');
    meiliClient = new MeiliSearch({ host, apiKey: apiKey || '' });
    isAvailable = true;
    logger.info(`Meilisearch connecté: ${host}`);
    ensureIndex('documents');
    ensureIndex('folders');
    return true;
  } catch (error) {
    logger.warn('Meilisearch non disponible:', error.message);
    return false;
  }
}

async function ensureIndex(indexName) {
  if (!meiliClient) return;
  try {
    const indexes = await meiliClient.getIndexes();
    const exists = indexes.results?.some(i => i.uid === indexName);
    if (!exists) {
      await meiliClient.createIndex(indexName, { primaryKey: 'id' });
      logger.info(`Index Meilisearch créé: ${indexName}`);
    }
  } catch (error) {
    logger.warn(`Erreur création index ${indexName}:`, error.message);
  }
}

async function indexDocument(doc) {
  if (!meiliClient) return;
  try {
    const index = meiliClient.index('documents');
    await index.addDocuments([{
      id: String(doc.id),
      titre: doc.titre,
      description: doc.description || '',
      nom_original: doc.nom_original || '',
      type_fichier: doc.type_fichier || '',
      contenu_ocr: doc.contenu_ocr || '',
      proprietaire_id: doc.proprietaire_id,
      tags: doc.tags || [],
      statut: doc.statut,
      createdAt: doc.createdAt,
    }]);
    logger.debug(`Document indexé: ${doc.id}`);
  } catch (error) {
    logger.warn(`Erreur indexation document ${doc.id}:`, error.message);
  }
}

async function indexFolder(folder) {
  if (!meiliClient) return;
  try {
    const index = meiliClient.index('folders');
    await index.addDocuments([{
      id: String(folder.id),
      nom: folder.nom,
      description: folder.description || '',
      proprietaire_id: folder.proprietaire_id,
    }]);
  } catch (error) {
    logger.warn(`Erreur indexation dossier ${folder.id}:`, error.message);
  }
}

async function searchDocuments(query, filters = {}) {
  if (!meiliClient) return null;
  try {
    const index = meiliClient.index('documents');
    const searchParams = { limit: 20 };
    if (filters.proprietaire_id) searchParams.filter = [`proprietaire_id = ${filters.proprietaire_id}`];
    if (filters.statut) searchParams.filter = [...(searchParams.filter || []), `statut = '${filters.statut}'`];
    const results = await index.search(query, searchParams);
    return results;
  } catch (error) {
    logger.error('Erreur recherche Meilisearch:', error.message);
    return null;
  }
}

async function removeDocument(id) {
  if (!meiliClient) return;
  try {
    await meiliClient.index('documents').deleteDocument(String(id));
  } catch {}
}

module.exports = { init, indexDocument, indexFolder, searchDocuments, removeDocument, isAvailable: () => isAvailable };
