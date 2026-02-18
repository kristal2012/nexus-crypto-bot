
import os
import psycopg2
import sys

# Configurações de Conexão (Mesmas do initialize_db_cryptum.py que funcionou)
DB_HOST = "db.cdudskuxvsexgyxtmtur.supabase.co"
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASS = "&N&6ifTN5uy5krX"
DB_PORT = "5432"

SQL_FILE = "FIX_CONFIG_RLS.sql"

def run_sql_fix():
    print(f"🔗 Conectando ao Banco Supabase para aplicar correções...")
    
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            port=DB_PORT,
            connect_timeout=20
        )
        conn.autocommit = True
        cur = conn.cursor()
        
        print(f"📖 Lendo script de correção: {SQL_FILE}")
        if not os.path.exists(SQL_FILE):
             print(f"❌ Arquivo {SQL_FILE} não encontrado!")
             sys.exit(1)
             
        with open(SQL_FILE, 'r', encoding='utf-8') as f:
            sql = f.read()
            
        print("🚀 Executando comandos SQL de permissão (RLS)...")
        # Executar blocos de comando. O ideal é executar tudo de uma vez se o script permitir.
        cur.execute(sql)
        
        print("✅ Permissões RLS aplicadas com sucesso!")
        print("👉 Agora o Dashboard deve conseguir salvar as configurações (Ligar/Desligar).")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Erro ao aplicar fix: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_sql_fix()
