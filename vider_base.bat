@echo off
REM ============================================
REM  VIDER LA BASE POSTGRES LOCALE (archivage)
REM ============================================
REM  ATTENTION : supprime TOUTES les données !
REM  Les tables seront recréées automatiquement
REM  au prochain demarrage du serveur.
REM ============================================

echo.
echo ============================================
echo  VIDAGE COMPLET DE LA BASE : archivage
echo ============================================
echo.
echo   HOTE     : localhost
echo   PORT     : 5432
echo   BASE     : archivage
echo   UTILISATEUR : postgres
echo.
echo   ATTENTION : TOUTES les donnees seront
echo   SUPPRIMEES definitivement !
echo.
echo ============================================
echo.

set /p confirm="Taper OUI puis Entree pour confirmer le vidage : "
if /i not "%confirm%"=="OUI" (
    echo.
    echo Annule.
    pause
    exit /b 0
)

echo.
echo Connexion a PostgreSQL...
echo.

REM Chemin vers psql (ajuster si necessaire)
set PSQL="C:\Program Files\PostgreSQL\16\bin\psql.exe"
if not exist %PSQL% set PSQL="C:\Program Files\PostgreSQL\17\bin\psql.exe"
if not exist %PSQL% set PSQL="C:\Program Files\PostgreSQL\15\bin\psql.exe"
if not exist %PSQL% set PSQL="C:\Program Files\PostgreSQL\14\bin\psql.exe"
if not exist %PSQL% set PSQL=psql

%PSQL% -h localhost -p 5432 -U postgres -d archivage -c "
DO $$ DECLARE
    r RECORD;
BEGIN
    -- Desactiver les triggers le temps du vidage
    SET session_replication_role = 'replica';

    -- Vider toutes les tables dans l'ordre (CASCADE gere les FK)
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'pg_stat_statements') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
        RAISE NOTICE 'Truncated: %', r.tablename;
    END LOOP;

    -- Reactiver les triggers
    SET session_replication_role = 'origin';

    RAISE NOTICE 'Base videe avec succes';
END $$;
"

if %errorlevel% neq 0 (
    echo.
    echo ERREUR : impossible de se connecter a PostgreSQL.
    echo Verifiez que PostgreSQL est lance et que le mot de passe est correct.
    echo Le mot de passe est defini dans le fichier .env : DB_PASSWORD
    pause
    exit /b 1
)

echo.
echo ============================================
echo  BASE VIDEE AVEC SUCCES !
echo ============================================
echo.
echo Les tables seront recreees automatiquement
echo au prochain demarrage du serveur (node server.js).
echo.
pause
