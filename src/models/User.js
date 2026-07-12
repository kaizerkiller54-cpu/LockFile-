const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  supabase_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
    unique: true
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  nom: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  prenom: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  photo: {
    type: DataTypes.STRING(255),
    defaultValue: '/assets/avatar-default.svg'
  },
  role: {
    type: DataTypes.ENUM('admin', 'utilisateur', 'lecteur'),
    defaultValue: 'utilisateur'
  },
  langue: {
    type: DataTypes.ENUM('fr', 'en', 'es', 'de', 'pt', 'ar', 'zh'),
    defaultValue: 'fr'
  },
  telephone: {
    type: DataTypes.STRING(50),
    defaultValue: ''
  },
  poste: {
    type: DataTypes.STRING(100),
    defaultValue: ''
  },
  type: {
    type: DataTypes.ENUM('particulier', 'organisation'),
    defaultValue: 'particulier'
  },
  nombre_employes: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  actif: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  derniere_connexion: {
    type: DataTypes.DATE,
    allowNull: true
  },
  preferences: {
    type: DataTypes.JSONB,
    defaultValue: {
      vue_documents: 'grille',
      notifications_email: true,
      notifications_push: true
    }
  }
}, {
  tableName: 'users',
  timestamps: true,
  underscored: false,
  hooks: {
    beforeSave: async (user) => {
      if (user.changed('password') && user.password) {
        user.password = await bcrypt.hash(user.password, 12);
      }
    }
  }
});

User.prototype.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

User.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

module.exports = User;
