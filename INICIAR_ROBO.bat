@echo off
color 0B
echo ==================================================
echo       INICIANDO CRYPTUM 7.1 (MODO NUVEM)
echo ==================================================
echo.

cd /d "%~dp0"

echo [1/2] Ligando o MOTOR do Robo (Necessario para operar)...
start "MOTOR CRYPTUM - NAO FECHE" cmd /k "npm run start:bot"

echo [2/2] Acessando o Painel na NUVEM (Vercel) via CHROME...
timeout /t 3 >nul
start chrome https://nexus-crypto-bot.vercel.app

echo.
echo ==================================================
echo       CONECTADO!
echo ==================================================
echo.
echo O robo esta rodando aqui (janela preta) e enviando dados para o site.
echo Voce pode controlar tudo pelo Chrome.
echo.
echo NAO FECHE ESTA JANELA PRETA ENQUANTO QUISER OPERAR.
pause
