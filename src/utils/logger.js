const winston = require('winston');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, requestId, userId, ...meta }) => {
      const parts = [`${timestamp} [${level.toUpperCase()}]`];
      if (requestId) parts.push(`[${requestId}]`);
      if (userId) parts.push(`[user:${userId}]`);
      parts.push(message);
      const metaStr = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
      return parts.join(' ') + metaStr;
    })
  ),
  transports: [
    new winston.transports.Console({
      format: isProd
        ? winston.format.combine(winston.format.json())
        : winston.format.combine(winston.format.colorize(), winston.format.simple())
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/error.log'),
      level: 'error',
      maxsize: 10485760,
      maxFiles: 10,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/combined.log'),
      maxsize: 10485760,
      maxFiles: 20,
      tailable: true
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/audit.log'),
      level: 'info',
      maxsize: 10485760,
      maxFiles: 30,
      tailable: true
    })
  ]
});

module.exports = logger;
