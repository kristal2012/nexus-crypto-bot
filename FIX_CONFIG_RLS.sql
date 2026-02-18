-- 1. Habilitar RLS na tabela de configurações (se não estiver)
alter table bot_configurations enable row level security;

-- 2. Remover políticas antigas para evitar conflitos
drop policy if exists "Enable read access for all users" on bot_configurations;
drop policy if exists "Enable update for all users" on bot_configurations;
drop policy if exists "Enable insert for all users" on bot_configurations;

-- 3. CRIAR POLÍTICA DE LEITURA (SELECT) - Pública
create policy "Enable read access for all users"
on "public"."bot_configurations"
as PERMISSIVE
for SELECT
to public
using (true);

-- 4. CRIAR POLÍTICA DE ATUALIZAÇÃO (UPDATE) - Pública (Essencial para o botão Ligar/Desligar funcionar)
create policy "Enable update for all users"
on "public"."bot_configurations"
as PERMISSIVE
for UPDATE
to public
using (true)
with check (true);

-- 5. CRIAR POLÍTICA DE INSERÇÃO (INSERT) - Pública (Para criar novas configs se precisar)
create policy "Enable insert for all users"
on "public"."bot_configurations"
as PERMISSIVE
for INSERT
to public
with check (true);

-- 6. Garantir que a tabela bot_logs também tenha permissão de inserção pública (para logs do navegador)
alter table bot_logs enable row level security;
create policy "Enable insert for public"
on "public"."bot_logs"
as PERMISSIVE
for INSERT
to public
with check (true);

-- 7. Adicionar bot_configurations ao Realtime (para o robô saber quando mudou)
alter publication supabase_realtime add table bot_configurations;
