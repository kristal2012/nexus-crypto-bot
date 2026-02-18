
import psycopg2
import sys

# Lista de hosts para tentar (Poolers Comuns)
HOSTS = [
    "aws-0-sa-east-1.pooler.supabase.com", # Brasil
    "aws-0-us-east-1.pooler.supabase.com", # US East
    "aws-0-eu-central-1.pooler.supabase.com" # Europe
]

DB_NAME = "postgres"
DB_USER = "postgres.cdudskuxvsexgyxtmtur" # Formato de user do pooler
DB_PASS = "&N&6ifTN5uy5krX"
DB_PORT = "6543" # Porta do Pooler (transaction mode) ou 5432 (session)

def probe():
    print(f"🕵️ Iniciando varredura de conexão DB para usuário: {DB_USER}")
    
    for host in HOSTS:
        print(f"\n⚡ Tentando conectar em: {host}:{DB_PORT}...")
        try:
            conn = psycopg2.connect(
                host=host,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASS,
                port=DB_PORT,
                connect_timeout=5
            )
            print(f"✅ SUCESSO! Conectado em {host}")
            conn.close()
            
            # Se conectou, salvar este host e sair
            with open("VALID_DB_HOST.txt", "w") as f:
                f.write(host)
            sys.exit(0)
            
        except Exception as e:
            print(f"❌ Falha: {e}")

    print("\n⚠️ Nenhuma conexão bem sucedida.")
    sys.exit(1)

if __name__ == "__main__":
    probe()
