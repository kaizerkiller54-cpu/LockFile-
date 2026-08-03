const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { ISSUER, AUDIENCE } = require('../config/jwt');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Accès non autorisé' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { issuer: ISSUER, audience: AUDIENCE });
    if (!decoded || !Number.isInteger(decoded.id) || decoded.id <= 0) {
      return res.status(401).json({ message: 'Token invalide' });
    }
    const user = await User.findByPk(decoded.id);
    if (!user || !user.actif) {
      return res.status(401).json({ message: 'Utilisateur non trouvé ou désactivé' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide ou expiré' });
  }
};

const checkRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Permission insuffisante' });
    }
    next();
  };
};

module.exports = { auth, checkRole };
