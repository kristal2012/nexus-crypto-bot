@echo off
color 0A
echo ==================================================
echo       INICIANDO SISTEMA CRYPTUM 7.1
echo ==================================================
echo.

cd /d "%~dp0"

echo [1/2] Ligando o Cerebro do Robo (Backend)...
start "CEREBRO DO ROBO - NAO FECHE" cmd /k "npm run start:bot"

echo [2/2] Abrindo o Painel de Controle (Dashboard)...
echo O navegador abrira automaticamente em instantes...
start "DASHBOARD - NAO FECHE" cmd /k "npm run dev -- --open"

echo.
echo ==================================================
echo       SISTEMA INICIADO COM SUCESSO!
echo ==================================================
echo.
echo Mantenha as janelas pretas abertas para o robo funcionar.
echo Voce pode minimizar esta janela agora.
timeout /t 10
