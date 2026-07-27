@echo off
echo ====================================
echo  SETUP GIT + GITHUB - LockFile
echo ====================================
echo.

:: Verifier que git est installe
where git >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Git n'est pas installe.
    echo Telechargez-le sur : https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/6] Initialisation du depot Git...
cd /d "%~dp0"
git init

echo [2/6] Verification que .env n'est pas tracke...
git rm --cached .env 2>nul
echo    OK - .env exclu du tracking

echo [3/6] Ajout de tous les fichiers...
git add -A

echo.
echo [INFO] Fichiers qui seront commites :
echo ----------------------------------------
git status --short
echo ----------------------------------------
echo.

set /p confirm="Continuer le commit ? (O/N) : "
if /i not "%confirm%"=="O" (
    echo Annule.
    pause
    exit /b 0
)

echo.
set /p msg="Message de commit (defaut: initial commit) : "
if "%msg%"=="" set "msg=initial commit"

echo [4/6] Creation du commit...
git commit -m "%msg%"

echo.
echo [5/6] Configuration de la branche principale...
git branch -M main

echo.
echo ====================================
echo  ETAPES MANUELLES RESTANTES
echo ====================================
echo.
echo  1. Creer un depot sur GitHub :
echo     https://github.com/new
echo.
echo  2. Copier l'URL du depot (HTTPS)
echo.
echo  3. Executer ces commandes :
echo     git remote add origin VOTRE_URL
echo     git push -u origin main
echo.
echo  IMPORTANT : Ne jamais commiter le fichier .env !
echo ====================================
echo.
pause
