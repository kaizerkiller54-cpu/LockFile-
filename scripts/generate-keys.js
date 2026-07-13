const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keys = {
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
};

console.log('=== NOUVELLES CLES SECURISEES ===');
console.log(`JWT_SECRET=${keys.JWT_SECRET}`);
console.log(`ENCRYPTION_KEY=${keys.ENCRYPTION_KEY}`);
console.log('');
console.log('Copie ces valeurs dans ton .env et sur Railway.');
console.log('Ne partage JAMAIS ces clés.');
