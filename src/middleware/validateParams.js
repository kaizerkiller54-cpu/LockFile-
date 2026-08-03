const { param, query, validationResult } = require('express-validator');

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: 'Paramètres invalides', errors: errors.array() });
  }
  next();
}

const idParam = (name = 'id') => [
  param(name).isInt({ min: 1 }).withMessage('Identifiant invalide'),
  handleValidation
];

const paginationQuery = [
  query('page').optional().isInt({ min: 1, max: 10000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidation
];

module.exports = { idParam, paginationQuery, handleValidation };
