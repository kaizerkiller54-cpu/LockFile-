@echo off
title LockFile - Application d'archivage
cd /d "%~dp0"

echo ====================================
echo    LockFile - Archivage Documents
echo ====================================
echo.

:: Lire le mot de passe depuis .env
for /f "usebackq tokens=1,* delims==" %%a in ("%cd%\.env") do (
    if "%%a"=="DB_PASSWORD" set "DB_PASSWORD=%%b"
    if "%%a"=="PORT" set "PORT=%%b"
)
if "%PORT%"=="" set "PORT=5000"

:: Tuer les anciens processus node sur le port
echo [NETTOYAGE] Arret des anciens processus sur le port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% "') do (
    taskkill /F /PID %%a >nul 2>&1 && echo [OK] Processus %%a arreté
)
timeout /t 2 /nobreak >nul

:: Verifier que le port est libre
netstat -ano | findstr ":%PORT% " >nul 2>&1
if not errorlevel 1 (
    echo.
    echo [ERREUR] Le port %PORT% est toujours utilise.
    echo          Fermez le programme qui l'utilise ou lancez ce script
    echo          en tant qu'administrateur.
    echo.
    pause
    exit /b 1
)

:: Installer les dependances si necessaire
if not exist "node_modules" (
    echo [INFO] Installation des dependances...
    call npm install
)

:: Creer la base si elle n'existe pas
where psql >nul 2>&1
if not errorlevel 1 (
    set "PGPASSWORD=%DB_PASSWORD%"
    psql -U postgres -h localhost -d archivage -c "SELECT 1;" >nul 2>&1
    if errorlevel 1 (
        echo [INFO] Creation de la base de donnees...
        psql -U postgres -h localhost -c "CREATE DATABASE archivage;" >nul 2>&1
    )
)

:: Lancer le serveur
echo.
echo [INFO] Demarrage du serveur sur http://localhost:%PORT%
echo [INFO] Appuyez sur Ctrl+C pour arreter
echo.
start http://localhost:%PORT%
node server.js

pause
