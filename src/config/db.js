const { Sequelize } = require('sequelize');

let sequelize;

if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: { rejectUnauthorized: false }
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'archivage',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'postgres',
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      dialect: 'postgres',
      logging: false,
      pool: {
        max: 10,
        min: 0,
        acquire: 30000,
        idle: 10000
      }
    }
  );
}

let isConnected = false;

const connectDB = async () => {
  try {
    await sequelize.authenticate({ timeout: 5000 });
    isConnected = true;
    console.log(`PostgreSQL connecté: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);

    await sequelize.sync({ alter: true });
    console.log('Tables synchronisées');

    try {
      await sequelize.query(
        `ALTER TABLE documents ADD COLUMN IF NOT EXISTS firebase_path VARCHAR(500)`
      );
    } catch (e) { console.warn('Column check:', e.message); }

    try {
      await sequelize.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS supabase_id VARCHAR(255) UNIQUE`
      );
    } catch (e) { console.warn('Column check supabase_id:', e.message); }
  } catch (error) {
    console.warn(`⚠ PostgreSQL non disponible (${error.message})`);
    console.warn('⚠ L\'application fonctionnera sans persistance de données');
    isConnected = false;
  }
};

const getConnectionStatus = () => isConnected;

module.exports = { sequelize, connectDB, getConnectionStatus };
