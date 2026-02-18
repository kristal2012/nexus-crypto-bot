-- 1. Renomear a tabela errada "logs" para a certa "bot_logs"
alter table if exists logs rename to bot_logs;

-- 2. Garantir que a tabela bot_logs existe (caso nã tenha sido renomeada)
create table if not exists bot_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  level text not null,
  message text not null,
  bot_config_id uuid,
  user_id uuid,
  details jsonb
);

-- 3. Liberar acesso público (Para o Dashboard funcionar sem login)
alter table bot_logs enable row level security;

create policy "Enable read access for all users"
on "public"."bot_logs"
as PERMISSIVE
for SELECT
to public
using (true);

create policy "Enable insert for service role only"
on "public"."bot_logs"
as PERMISSIVE
for INSERT
to service_role
with check (true);

-- 4. Adicionar ao Realtime
alter publication supabase_realtime add table bot_logs;
