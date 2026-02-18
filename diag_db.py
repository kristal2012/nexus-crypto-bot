import psycopg2
import sys

def test_conn(host, port, user, password):
    try:
        print(f"Testing {host}:{port}...")
        conn = psycopg2.connect(
            host=host,
            database="postgres",
            user=user,
            password=password,
            port=port,
            connect_timeout=5
        )
        print(f"✅ SUCCESS: Connected to {host}:{port}")
        conn.close()
        return True
    except Exception as e:
        print(f"❌ FAILED: {host}:{port} - {e}")
        return False

user = "postgres.cdudskuxvsexgyxtmtur"
password = "&N&6ifTN5uy5krX"

hosts = [
    ("db.cdudskuxvsexgyxtmtur.supabase.co", 5432),
    ("aws-0-us-east-1.pooler.supabase.com", 5432),
    ("aws-0-us-west-1.pooler.supabase.com", 5432),
    ("aws-0-sa-east-1.pooler.supabase.com", 5432), # Brazil region
]

for h, p in hosts:
    if test_conn(h, p, user, password):
        print(f"\n🚀 FOUND CORRECT SETTINGS: Host={h}, Port={p}")
        break
else:
    print("\n❌ All attempts failed. Please double check the password and region.")
