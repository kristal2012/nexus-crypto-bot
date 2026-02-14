import time
import requests
import subprocess
import os
import signal
import sys
import logging
from datetime import datetime

# Configuração do LOG do Guardian
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [CRYPTUM-GUARDIAN] - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("cryptum_guardian.log", encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("Guardian")

# Configurações
HEALTH_URL = "http://127.0.0.1:8002/api/status"
BOT_SCRIPT = r"c:\cryptum7.1_bot\run_engine_headless.bat"
LOG_FILE = "cryptum_watchdog.log"
CHECK_INTERVAL = 60  # segundos
MAX_TIMEOUTS = 3     # reinicia após 3 falhas seguidas

class CryptumGuardian:
    def __init__(self):
        self.process = None
        self.failed_checks = 0
        self.is_running = True

    def start_bot(self):
        """Inicia o robô capturando a saída para o log"""
        if self.process:
            self.stop_bot()
            
        logger.info(f"🚀 Iniciando robô via: {BOT_SCRIPT}")
        try:
            # Abrir log em modo append
            log_file = open("bot_output.log", "a", encoding='utf-8')
            log_file.write(f"\n--- RESTART: {datetime.now()} ---\n")
            log_file.flush()
            
            # No Windows, usar shell=True e redirecionar streams
            self.process = subprocess.Popen([BOT_SCRIPT], 
                                         shell=True,
                                         stdout=log_file,
                                         stderr=log_file,
                                         bufsize=1,
                                         universal_newlines=True)
            self.failed_checks = 0
            logger.info("✅ Processo do robô iniciado (saída redirecionada para bot_output.log).")
        except Exception as e:
            logger.error(f"❌ Falha ao iniciar robô: {e}")

    def stop_bot(self):
        """Tenta parar o robô (difícil via BAT, mas tentamos taskkill)"""
        logger.warning("Parando instâncias anteriores do robô...")
        try:
            # Mata qualquer processo tsx/node do cryptum (pode ser agressivo se houver outros)
            # Melhor usar o PID se tivéssemos, mas BAT cria sub-processos.
            # Vamos assumir que o usuário só roda um cryptum.
            subprocess.run(["taskkill", "/F", "/FI", "WINDOWTITLE eq Cryptum*", "/T"], capture_output=True)
        except:
            pass

    def check_health(self):
        """Verifica se a API de saúde responde na porta 8002"""
        try:
            response = requests.get(HEALTH_URL, timeout=10)
            if response.status_code == 200:
                data = response.json()
                active = data.get("is_running", True)
                logger.info(f"💓 Health Check: OK (Status: {'Ativo' if active else 'Idle'})")
                self.failed_checks = 0
                return True
            else:
                logger.error(f"⚠️ Health Check: Status {response.status_code}")
        except Exception as e:
            logger.error(f"❌ Health Check: SEM RESPOSTA ({e})")
        
        self.failed_checks += 1
        return False

    def run(self):
        logger.info("🛡️ Cryptum Guardian iniciado. Monitorando 24/7...")
        self.start_bot()
        time.sleep(30) # Espera inicial para boot
        
        while self.is_running:
            try:
                # 1. Verificar se o processo ainda existe no SO
                if self.process and self.process.poll() is not None:
                    logger.error("🚨 O PROCESSO DO ROBÔ MORREU NO SISTEMA!")
                    self.start_bot()
                    time.sleep(30)
                    continue

                # 2. Verificar saúde via API
                if not self.check_health():
                    if self.failed_checks >= MAX_TIMEOUTS:
                        logger.critical("🚨 ROBÔ TRAVADO (TIMEOUT). REINICIANDO...")
                        self.start_bot()
                        time.sleep(30)
                
                time.sleep(CHECK_INTERVAL)
                
            except KeyboardInterrupt:
                logger.info("👋 Guardian desligando...")
                self.is_running = False
            except Exception as e:
                logger.error(f"Erro inesperado no Guardian: {e}")
                time.sleep(10)

if __name__ == "__main__":
    guardian = CryptumGuardian()
    guardian.run()
