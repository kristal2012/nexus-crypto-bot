import psycopg2
import sys
import os

# Configurações do Banco de Dados Cryptum 7.1 (Usando Pooler Host para AWS US-WEST-1)
# O Host padrão db.ref.supabase.co está falhando no DNS
DB_HOST = "aws-0-us-west-1.pooler.supabase.com"
DB_NAME = "postgres"
DB_USER = "postgres.cdudskuxvsegyxtmtu"
DB_PASS = "jQbI1PEEpXvuSOHZ" # Assumindo a mesma senha do projeto anterior
DB_PORT = "5432"

SQL_FILE = r"c:\cryptum7.1_bot\SETUP_TABLES_CRYPTUM.sql"

def run_sql():
    try:
        print(f"🔗 Conectando ao Banco Supabase via Pooler (Região AWS): {DB_HOST}...")
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
        
        print(f"📖 Lendo SQL de: {SQL_FILE}")
        with open(SQL_FILE, 'r', encoding='utf-8') as f:
            sql = f.read()
            
        print("🚀 Executando inicialização de tabelas...")
        cur.execute(sql)
        
        print("✅ Banco de dados Cryptum inicializado com sucesso!")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"❌ Erro ao inicializar banco: {e}")
        print("\n💡 Possível causa: Senha incorreta ou host de região diferente.")
        sys.exit(1)

if __name__ == "__main__":
    run_sql()
