@echo off
title 🚀 MASTER STARTUP - CRYPTUM 7.1 (+ MOLTBOT)
echo.
echo ============================================================
echo    CRYPTUM 7.1 - INICIALIZANDO ECOSSISTEMA COMPLETO
echo ============================================================
echo.

set "ROOT_CRYPTUM=c:\cryptum7.1_bot"
set "ROOT_FLASH=c:\THE_FLASH_BOT"
set "PYTHON=C:\Program Files\Python311\python.exe"
set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"

REM 1. Iniciar Guardian Cryptum (que inicia o motor 8002)
echo [1/3] Iniciando Guardian Cryptum 7.1...
start "GUARDIAN_CRYPTUM" /min cmd /k "cd /d %ROOT_CRYPTUM% && "%PYTHON%" backend\watchdog.py"

REM 2. Iniciar MoltBot (Inteligência Compartilhada)
echo [2/3] Iniciando MoltBot AI (Cérebro)...
start "MOLTBOT_AI" /min cmd /c "cd /d %ROOT_FLASH% && MOLTBOT_RUN.bat"

REM 3. Abrir Painel de Controle Vercel
echo [3/3] Abrindo Dashboard Cryptum na Nuvem...
start "" "%CHROME%" --app=https://nexus-crypto-bot.vercel.app/

echo.
echo ============================================================
echo    SISTEMA ONLINE!
echo    - Guardian + Motor 7.1: ATIVOS (Background)
echo    - MoltBot AI: ATIVO (Background)
echo    - Dashboard: https://nexus-crypto-bot.vercel.app/
echo ============================================================
echo.
timeout /t 5
exit
