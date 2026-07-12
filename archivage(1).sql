-- phpMyAdmin SQL Dump
-- version 5.1.1
-- https://www.phpmyadmin.net/
--
-- Hôte : 127.0.0.1:3306
-- Généré le : dim. 19 mai 2024 à 12:45
-- Version du serveur : 5.7.36
-- Version de PHP : 7.4.26

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de données : `archivage`
--

-- --------------------------------------------------------

--
-- Structure de la table `dossier`
--

DROP TABLE IF EXISTS `dossier`;
CREATE TABLE IF NOT EXISTS `dossier` (
  `Nom_Dossier` char(30) DEFAULT NULL,
  `Id_Utilisateur` int(11) DEFAULT NULL,
  `Id_Dossier` int(11) NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`Id_Dossier`),
  KEY `Id_Utilisateur` (`Id_Utilisateur`)
) ENGINE=MyISAM AUTO_INCREMENT=19 DEFAULT CHARSET=latin1;

--
-- Déchargement des données de la table `dossier`
--

INSERT INTO `dossier` (`Nom_Dossier`, `Id_Utilisateur`, `Id_Dossier`) VALUES
('systeme d\'informations', NULL, 11),
('Support Mobile', NULL, 4),
('Ressources Humaines', NULL, 5),
('Support Bum', NULL, 6),
('Developpement Web', NULL, 7),
('Support Radio FM', NULL, 18);

-- --------------------------------------------------------

--
-- Structure de la table `fichier`
--

DROP TABLE IF EXISTS `fichier`;
CREATE TABLE IF NOT EXISTS `fichier` (
  `Nom_Fich` char(30) DEFAULT NULL,
  `Taille_Fich` varchar(10) DEFAULT NULL,
  `Date_archivage_Fich` date DEFAULT NULL,
  `Id_Dossier` int(11) DEFAULT NULL,
  `Id_Fich` int(11) NOT NULL AUTO_INCREMENT,
  `Id_Utilisateur` int(11) DEFAULT NULL,
  `Heure_archivage_Fich` time DEFAULT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_path` varchar(255) NOT NULL,
  `departement` char(30) DEFAULT NULL,
  PRIMARY KEY (`Id_Fich`),
  UNIQUE KEY `Id_Utilisateur` (`Id_Utilisateur`),
  KEY `Id_Dossier` (`Id_Dossier`)
) ENGINE=MyISAM AUTO_INCREMENT=160 DEFAULT CHARSET=latin1;

--
-- Déchargement des données de la table `fichier`
--

INSERT INTO `fichier` (`Nom_Fich`, `Taille_Fich`, `Date_archivage_Fich`, `Id_Dossier`, `Id_Fich`, `Id_Utilisateur`, `Heure_archivage_Fich`, `file_name`, `file_path`, `departement`) VALUES
('contrat de baille', '12234mo', '2024-05-25', NULL, 157, NULL, '12:22:00', 'David WAFFO MONGO TAGNE.pdf', 'uploads/David WAFFO MONGO TAGNE.pdf', 'Support Bum'),
('Accident', '123mo', '2024-06-02', NULL, 158, NULL, '23:33:00', 'Corrig -SI-Bac-Blanc-TI-Nord-Ouest-2018_NoRestriction.pdf', 'uploads/SI-TleTI-Bac-Blanc-Lycee-Molyko-Buea-2017-2018_NoRestriction.pdf', 'systeme d\'informations');

-- --------------------------------------------------------

--
-- Structure de la table `utilisateur`
--

DROP TABLE IF EXISTS `utilisateur`;
CREATE TABLE IF NOT EXISTS `utilisateur` (
  `Nom_util` char(30) DEFAULT NULL,
  `Pren_util` char(30) DEFAULT NULL,
  `Email_util` char(30) DEFAULT NULL,
  `Pass_util` char(15) DEFAULT NULL,
  `Poste_util` char(50) DEFAULT NULL,
  `Role_util` char(15) DEFAULT NULL,
  `Id_Utilisateur` int(11) NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`Id_Utilisateur`)
) ENGINE=MyISAM AUTO_INCREMENT=70 DEFAULT CHARSET=latin1;

--
-- Déchargement des données de la table `utilisateur`
--

INSERT INTO `utilisateur` (`Nom_util`, `Pren_util`, `Email_util`, `Pass_util`, `Poste_util`, `Role_util`, `Id_Utilisateur`) VALUES
('Litcheu', 'James', 'James@gmail.com', '12345', 'Secretaire', 'Administrateur', 42),
('Ebenezer kepombia', 'Jean', 'ebenezer@gmail.com', 'MOT', 'DRH', 'Administrateur', 40),
('Wandji', 'Williams karl', 'waffoeva9@gmail.com', 'QQQ', 'Courriel', 'User', 41),
('Waffo', 'Eva', 'waffoeva2@gmail.com', '12', 'Directrice gÃ©nÃ©ral', 'Administrateur', 39),
('Waffo sengue', 'Eva', 'waffoeva29@gmail.com', '12345', 'COURRIEL', 'Administrateur', 44),
('waffo', 'sengue', 'Waffoeva@gmail.com', '12345', 'Secretaire CT', 'User', 50),
('Waffo', 'Eva', 'waffoeva49@gmail.com', '12', 'Courriel', 'Administrateur', 52),
('Maman', 'lois', 'lois2@gmail.com', '1234', 'DGA', 'Administrateur', 66),
('La fontaine', 'Jean de dieu', 'jeandedieu34@gmail.com', '1234', 'Directeur gÃ©nÃ©ral', 'Administrateur', 67);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
