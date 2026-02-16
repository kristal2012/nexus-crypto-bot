import time
import requests
import subprocess
import os
import signal
import sys
import logging
from datetime import datetime

# Configure Watchdog Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - [GUARDIAN] - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("watchdog.log", encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)
# Force UTF-8 for stdout/stderr if possible
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
logger = logging.getLogger("Guardian")

# Configuration
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Path to the Cryptum 7.1 workspace
BOT_WORKSPACE = r"c:\cryptum7.1_bot"
# Command: npx tsx src/headless-bot.ts
BOT_START_COMMAND = ["npx", "tsx", "src/headless-bot.ts"]

# Use localhost for internal monitoring
API_URL = "http://127.0.0.1:8001/api/status"
CHECK_INTERVAL = 60  # seconds
MAX_TIMEOUTS = 3     # restarts after 3 failed checks
STALE_DATA_THRESHOLD = 600 # seconds (10 mins)

class BotGuardian:
    def __init__(self):
        self.process = None
        self.failed_checks = 0
        self.last_success_time = time.time()
        self.is_running = True

    def start_bot(self):
        """Starts the bot process using tsx in the correct workspace"""
        if self.process:
            self.stop_bot()
            
        logger.info(f"Starting Volatile Trader Headless in: {BOT_WORKSPACE}")
        try:
            # Capture errors to a file for debugging
            log_path = os.path.join(BOT_WORKSPACE, "bot_error.log")
            with open(log_path, "a") as err_log:
                err_log.write(f"\n--- BOT STARTUP: {datetime.now()} ---\n")
            
            self.error_file = open(log_path, "a", buffering=1)
            # Running with shell=True on Windows to handle npx correctly
            self.process = subprocess.Popen(BOT_START_COMMAND, 
                                         cwd=BOT_WORKSPACE,
                                         stdout=self.error_file, 
                                         stderr=self.error_file,
                                         shell=True) 
            self.failed_checks = 0
            self.last_success_time = time.time()
            logger.info("Bot process spawned via tsx (Errors directed to bot_error.log).")
        except Exception as e:
            logger.error(f"Failed to start bot: {e}")

    def stop_bot(self):
        """Stops the bot process safely"""
        if self.process:
            logger.warning("Stopping bot process...")
            try:
                # Terminate process tree on Windows
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/F", "/T", "/PID", str(self.process.pid)], capture_output=True)
                else:
                    os.kill(self.process.pid, signal.SIGTERM)
                self.process.wait(timeout=5)
            except:
                try:
                    self.process.kill()
                except:
                    pass
            self.process = None
            logger.info("Process terminated.")

    def check_health(self):
        """Checks if the bot API is responsive and healthy"""
        try:
            response = requests.get(API_URL, timeout=10)
            if response.status_code == 200:
                data = response.json()
                is_running = data.get("is_running", True) # Headless returns this
                
                if is_running:
                    logger.info("Health Check: PASS (Bot is active)")
                else:
                    logger.info(f"Health Check: PASS (Bot is IDLE/PAUSED)")
                
                self.failed_checks = 0
                self.last_success_time = time.time()
                return True
            else:
                logger.error(f"Health Check: FAIL (Status Code {response.status_code})")
        except Exception as e:
            if self.failed_checks > 1:
                logger.error(f"Health Check: ERROR ({e})")
        
        self.failed_checks += 1
        return False

    def run(self):
        """Main Watchdog Loop"""
        logger.info("Guardian Watchdog Started. Monitoring Volatile Trader 24/7...")
        self.start_bot()
        time.sleep(60) # Increased wait for bot to initialize and sync cloud

        while self.is_running:
            try:
                # Check if process is still alive at OS level
                if self.process and self.process.poll() is not None:
                    logger.error("BOT PROCESS DIED UNEXPECTEDLY!")
                    self.start_bot()
                    time.sleep(30) 
                
                # Check API Health
                if not self.check_health():
                    if self.failed_checks >= MAX_TIMEOUTS:
                        logger.critical("BOT UNRESPONSIVE. PERFORMING EMERGENCY RESTART...")
                        self.start_bot()
                        time.sleep(60)
                
                time.sleep(CHECK_INTERVAL)
            except KeyboardInterrupt:
                logger.info("👋 Watchdog shutting down...")
                self.is_running = False
                self.stop_bot()
            except Exception as e:
                logger.error(f"Unexpected Guardian Error: {e}")
                time.sleep(10)

if __name__ == "__main__":
    guardian = BotGuardian()
    guardian.run()
