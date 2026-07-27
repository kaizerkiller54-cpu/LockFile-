const { Sequelize } = require('sequelize');

const POOL_MAX = parseInt(process.env.DB_POOL_MAX) || 25;
const POOL_MIN = parseInt(process.env.DB_POOL_MIN) || 2;
const POOL_ACQUIRE = parseInt(process.env.DB_POOL_ACQUIRE) || 30000;
const POOL_IDLE = parseInt(process.env.DB_POOL_IDLE) || 10000;
const RETRY_DELAY = 3000;
const MAX_RETRIES = 3;

function createSequelize() {
  const opts = {
    dialect: 'postgres',
    logging: false,
    pool: { max: POOL_MAX, min: POOL_MIN, acquire: POOL_ACQUIRE, idle: POOL_IDLE },
    retry: { max: 2 }
  };

  if (process.env.DATABASE_URL) {
    opts.dialectOptions = { ssl: { rejectUnauthorized: false } };
    return new Sequelize(process.env.DATABASE_URL, opts);
  }

  return new Sequelize(
    process.env.DB_NAME || 'archivage',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'postgres',
    { ...opts, host: process.env.DB_HOST || 'localhost', port: parseInt(process.env.DB_PORT) || 5432 }
  );
}

const sequelize = createSequelize();
let isConnected = false;

const MIGRATIONS = [
  // Legacy columns
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS firebase_path VARCHAR(500)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_id VARCHAR(255) UNIQUE`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS contenu_ocr TEXT`,
  // Document expiration
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS date_expiration DATE`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS alerte_expiration BOOLEAN DEFAULT true`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS jours_alerte INTEGER DEFAULT 30`,
  // Permission password
  `ALTER TABLE permissions ADD COLUMN IF NOT EXISTS mot_de_passe VARCHAR(255)`,
  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_docs_proprietaire ON documents(proprietaire_id)`,
  `CREATE INDEX IF NOT EXISTS idx_docs_dossier ON documents(dossier_id)`,
  `CREATE INDEX IF NOT EXISTS idx_docs_statut ON documents(statut)`,
  `CREATE INDEX IF NOT EXISTS idx_docs_created ON documents("createdAt")`,
  `CREATE INDEX IF NOT EXISTS idx_docs_expiration ON documents(date_expiration)`,
  `CREATE INDEX IF NOT EXISTS idx_dossiers_proprietaire ON folders(proprietaire_id)`,
  `CREATE INDEX IF NOT EXISTS idx_dossiers_parent ON folders(parent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_destinataire ON notifications(destinataire_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_lu ON notifications(lu)`,
  `CREATE INDEX IF NOT EXISTS idx_versions_document ON versions(document_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_perm_doc_user ON permissions(document_id, utilisateur_id) WHERE document_id IS NOT NULL AND utilisateur_id IS NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_perm_folder_user ON permissions(dossier_id, utilisateur_id) WHERE dossier_id IS NOT NULL AND utilisateur_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_document ON approvals(document_id)`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_approbateur ON approvals(approbateur_id)`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_statut ON approvals(statut)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(utilisateur_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_logs(action)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_logs("createdAt")`,
];

async function runMigrations() {
  for (const sql of MIGRATIONS) {
    try { await sequelize.query(sql); } catch (e) { /* ignore duplicate */ }
  }
}

const connectDB = async (retries = MAX_RETRIES) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sequelize.authenticate({ timeout: 10000 });
      isConnected = true;
      console.log(`PostgreSQL connecté (pool: ${POOL_MAX})`);

      await sequelize.sync({ alter: true });
      await runMigrations();
      console.log('Tables synchronisées + migrations exécutées');
      return;
    } catch (error) {
      console.warn(`PostgreSQL non disponible (tentative ${attempt}/${retries}): ${error.message}`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
      } else {
        console.warn('⚠ L\'application fonctionnera sans persistance de données');
        isConnected = false;
      }
    }
  }
};

const getConnectionStatus = () => isConnected;

function getPoolStats() {
  const pool = sequelize.connectionManager?.pool;
  if (!pool) return { total: 0, idle: 0, active: 0 };
  return {
    total: pool.size || 0,
    idle: pool.available || 0,
    active: (pool.size || 0) - (pool.available || 0),
    waiting: pool.waiting || 0
  };
}

module.exports = { sequelize, connectDB, getConnectionStatus, getPoolStats };
