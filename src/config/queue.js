const logger = require('../utils/logger');

let Queue = null;
let Worker = null;
let scanQueue = null;
let isRedisAvailable = false;

function init() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info('REDIS_URL non définie, traitement synchrone (pas de file d\'attente)');
    return false;
  }
  try {
    const { Queue: BQueue, Worker: BWorker } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    Queue = BQueue;
    Worker = BWorker;
    scanQueue = new BQueue('document-scan', { connection, defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } } });
    isRedisAvailable = true;
    logger.info('BullMQ + Redis disponible pour les files d\'attente');
    return true;
  } catch (error) {
    logger.warn('BullMQ/Redis non disponible, traitement synchrone:', error.message);
    return false;
  }
}

async function addScanJob(jobData) {
  if (!scanQueue) {
    return { id: null, sync: true };
  }
  try {
    const job = await scanQueue.add('process-scan', jobData);
    logger.info(`Job scan créé: ${job.id}`);
    return { id: job.id, sync: false };
  } catch (error) {
    logger.error('Erreur ajout job scan:', error.message);
    return { id: null, sync: true };
  }
}

async function getJobStatus(jobId) {
  if (!scanQueue || !jobId) return null;
  try {
    const job = await scanQueue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    const progress = job.progress || 0;
    const result = job.returnvalue || null;
    return { id: jobId, state, progress, result, failedReason: job.failedReason || null };
  } catch {
    return null;
  }
}

function getQueue() { return scanQueue; }
function isAvailable() { return isRedisAvailable; }

function startWorker(processFn) {
  if (!isRedisAvailable || !Worker) return null;
  const redisUrl = process.env.REDIS_URL;
  const IORedis = require('ioredis');
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker('document-scan', async job => {
    logger.info(`Traitement job ${job.id} démarré`);
    const result = await processFn(job.data, (progress) => job.updateProgress(progress));
    logger.info(`Job ${job.id} terminé`);
    return result;
  }, { connection });
  worker.on('failed', (job, err) => logger.error(`Job ${job?.id} échoué:`, err.message));
  return worker;
}

module.exports = { init, addScanJob, getJobStatus, getQueue, startWorker, isAvailable };
