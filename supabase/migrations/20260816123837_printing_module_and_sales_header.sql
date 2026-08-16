-- Additive migration: sale header + thermal printing domain.
create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_nome text not null,
  whatsapp text,
  bairro text,
  endereco text,
  tipo_pedido text not null default 'retirada' check (tipo_pedido in ('retirada','entrega','mesa')),
  mesa text,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  desconto numeric(12,2) not null default 0 check (desconto >= 0 and desconto <= subtotal),
  taxa numeric(12,2) not null default 0 check (taxa >= 0),
  total numeric(12,2) generated always as (round((subtotal - desconto + taxa), 2)) stored,
  forma_pagamento text not null check (forma_pagamento in ('pix','dinheiro','cartao','prazo')),
  situacao_pagamento text not null default 'confirmado' check (situacao_pagamento in ('pendente','confirmado','falhou','estornado')),
  status text not null default 'aprovado' check (status in ('recebido','aprovado','cancelado','concluido')),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.vendas (
  id, owner_id, cliente_nome, whatsapp, bairro, endereco, tipo_pedido,
  subtotal, desconto, taxa, forma_pagamento, situacao_pagamento, status,
  observacao, created_at, updated_at
)
select
  p.venda_id, p.owner_id, max(p.cliente_nome), max(p.whatsapp), max(p.bairro), max(p.endereco), 'retirada',
  round(sum(p.quantidade * p.preco_unitario), 2), round(sum(coalesce(p.desconto, 0)), 2), 0,
  max(p.forma_pagamento),
  case when bool_or(p.forma_pagamento = 'prazo') then 'pendente' else 'confirmado' end,
  case when bool_and(p.status = 'cancelado') then 'cancelado' when bool_and(p.status = 'entregue') then 'concluido' else 'aprovado' end,
  max(p.observacao), min(p.created_at), max(p.updated_at)
from public.pedidos p
where p.venda_id is not null and not exists (select 1 from public.vendas v where v.id = p.venda_id)
group by p.venda_id, p.owner_id;

alter table public.pedidos
  add constraint pedidos_venda_id_fkey foreign key (venda_id) references public.vendas(id) on delete cascade;
create index if not exists idx_pedidos_venda_id on public.pedidos(venda_id);
create index if not exists idx_vendas_owner_created_at on public.vendas(owner_id, created_at desc);

create table public.print_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  auto_print boolean not null default true,
  print_when text not null default 'payment_confirmed' check (print_when in ('received','approved','payment_confirmed','manual')),
  auto_approve boolean not null default true,
  confirm_reprint boolean not null default true,
  auto_reprint_on_edit boolean not null default false,
  share_across_devices boolean not null default true,
  copies smallint not null default 1 check (copies between 1 and 10),
  receipt_mode text not null default 'complete' check (receipt_mode in ('complete','summary')),
  auto_cut boolean not null default true,
  cut_type text not null default 'partial' check (cut_type in ('partial','full','none')),
  feed_lines smallint not null default 3 check (feed_lines between 0 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.printers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  friendly_name text not null check (char_length(friendly_name) between 1 and 80),
  model text,
  paper_width smallint not null default 80 check (paper_width in (58,80)),
  connection_mode text not null check (connection_mode in ('system','network')),
  system_queue text,
  ip inet,
  port integer,
  timeout_ms integer not null default 3000 check (timeout_ms between 500 and 30000),
  retry_count smallint not null default 2 check (retry_count between 0 and 5),
  cut_type text not null default 'partial' check (cut_type in ('partial','full','none')),
  feed_lines smallint not null default 3 check (feed_lines between 0 and 12),
  enabled boolean not null default true,
  status text not null default 'unknown' check (status in ('available','disconnected','no_paper','cover_open','error','unknown')),
  status_message text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (connection_mode = 'system' and system_queue is not null and char_length(system_queue) > 0)
    or (connection_mode = 'network' and ip is not null and port between 1 and 65535)
  )
);

create table public.printer_destinations (
  printer_id uuid not null references public.printers(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  destination text not null check (destination in ('cozinha','balcao','caixa','entrega','bebidas','todos')),
  created_at timestamptz not null default now(),
  primary key (printer_id, destination)
);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  venda_id uuid references public.vendas(id) on delete cascade,
  printer_id uuid not null references public.printers(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 180),
  origin text not null check (origin in ('automatic','manual','test','edit')),
  state text not null default 'pending' check (state in ('pending','processing','completed','failed')),
  receipt_payload jsonb not null check (jsonb_typeof(receipt_payload) = 'object'),
  copies smallint not null default 1 check (copies between 1 and 10),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 20),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  retry_interval_ms integer not null default 1500 check (retry_interval_ms between 250 and 60000),
  next_attempt_at timestamptz,
  requested_by uuid default auth.uid() references auth.users(id) on delete set null,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, idempotency_key)
);

create table public.print_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null references public.print_jobs(id) on delete cascade,
  printer_id uuid not null references public.printers(id) on delete restrict,
  attempt_no smallint not null check (attempt_no between 1 and 20),
  state text not null check (state in ('processing','completed','failed')),
  agent_os text,
  agent_version text,
  result_code text,
  result_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique(job_id, attempt_no)
);

create index idx_printers_owner on public.printers(owner_id, enabled);
create index idx_print_jobs_owner_state on public.print_jobs(owner_id, state, created_at);
create index idx_print_jobs_venda on public.print_jobs(venda_id);
create index idx_print_attempts_job on public.print_attempts(job_id, attempt_no);

alter table public.vendas enable row level security;
alter table public.print_settings enable row level security;
alter table public.printers enable row level security;
alter table public.printer_destinations enable row level security;
alter table public.print_jobs enable row level security;
alter table public.print_attempts enable row level security;

create policy vendas_select_own on public.vendas for select using (owner_id = (select auth.uid()));
create policy vendas_insert_own on public.vendas for insert with check (owner_id = (select auth.uid()));
create policy vendas_update_own on public.vendas for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy vendas_delete_own on public.vendas for delete using (owner_id = (select auth.uid()));
create policy print_settings_select_own on public.print_settings for select using (owner_id = (select auth.uid()));
create policy print_settings_insert_own on public.print_settings for insert with check (owner_id = (select auth.uid()));
create policy print_settings_update_own on public.print_settings for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy printers_select_own on public.printers for select using (owner_id = (select auth.uid()));
create policy printers_insert_own on public.printers for insert with check (owner_id = (select auth.uid()));
create policy printers_update_own on public.printers for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy printers_delete_own on public.printers for delete using (owner_id = (select auth.uid()));
create policy printer_destinations_select_own on public.printer_destinations for select using (owner_id = (select auth.uid()));
create policy printer_destinations_insert_own on public.printer_destinations for insert with check (owner_id = (select auth.uid()) and exists (select 1 from public.printers p where p.id = printer_id and p.owner_id = (select auth.uid())));
create policy printer_destinations_delete_own on public.printer_destinations for delete using (owner_id = (select auth.uid()));
create policy print_jobs_select_own on public.print_jobs for select using (owner_id = (select auth.uid()));
create policy print_jobs_insert_own on public.print_jobs for insert with check (owner_id = (select auth.uid()) and exists (select 1 from public.printers p where p.id = printer_id and p.owner_id = (select auth.uid())) and (venda_id is null or exists (select 1 from public.vendas v where v.id = venda_id and v.owner_id = (select auth.uid()))));
create policy print_jobs_update_own on public.print_jobs for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy print_attempts_select_own on public.print_attempts for select using (owner_id = (select auth.uid()));
create policy print_attempts_insert_own on public.print_attempts for insert with check (owner_id = (select auth.uid()) and exists (select 1 from public.print_jobs j where j.id = job_id and j.owner_id = (select auth.uid())));
create policy print_attempts_update_own on public.print_attempts for update using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create trigger vendas_set_updated_at before update on public.vendas for each row execute function public.set_updated_at();
create trigger print_settings_set_updated_at before update on public.print_settings for each row execute function public.set_updated_at();
create trigger printers_set_updated_at before update on public.printers for each row execute function public.set_updated_at();
create trigger print_jobs_set_updated_at before update on public.print_jobs for each row execute function public.set_updated_at();

create or replace function public.finalizar_venda(p_venda jsonb, p_itens jsonb)
returns uuid
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid := coalesce(nullif(p_venda->>'id','')::uuid, gen_random_uuid());
  v_subtotal numeric(12,2);
  v_desconto numeric(12,2);
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'sale must contain at least one item'; end if;
  if exists (select 1 from public.vendas where id = v_id and owner_id = v_owner) then return v_id; end if;
  select round(sum(((i->>'quantity')::numeric) * ((i->>'unitPrice')::numeric)), 2), round(sum(coalesce((i->>'discount')::numeric, 0)), 2)
    into v_subtotal, v_desconto from jsonb_array_elements(p_itens) i;
  if v_subtotal is null or v_subtotal <= 0 then raise exception 'invalid sale subtotal'; end if;
  if v_desconto < 0 or v_desconto > v_subtotal then raise exception 'invalid sale discount'; end if;
  insert into public.vendas (id, owner_id, cliente_nome, whatsapp, bairro, endereco, tipo_pedido, mesa, subtotal, desconto, taxa, forma_pagamento, situacao_pagamento, status, observacao)
  values (v_id, v_owner, coalesce(nullif(trim(p_venda->>'customer'), ''), 'Venda rápida'), nullif(trim(p_venda->>'phone'), ''), nullif(trim(p_venda->>'neighborhood'), ''), nullif(trim(p_venda->>'address'), ''), coalesce(nullif(p_venda->>'orderType',''), 'retirada'), nullif(trim(p_venda->>'table'), ''), v_subtotal, v_desconto, coalesce(nullif(p_venda->>'fee','')::numeric, 0), p_venda->>'paymentMethod', coalesce(nullif(p_venda->>'paymentStatus',''), 'confirmado'), coalesce(nullif(p_venda->>'status',''), 'aprovado'), nullif(trim(p_venda->>'notes'), ''));
  insert into public.pedidos (owner_id, cliente_nome, whatsapp, bairro, endereco, produto_id, produto_nome, quantidade, unidade, preco_unitario, desconto, forma_pagamento, status, observacao, request_id, venda_id)
  select v_owner, coalesce(nullif(trim(p_venda->>'customer'), ''), 'Venda rápida'), nullif(trim(p_venda->>'phone'), ''), nullif(trim(p_venda->>'neighborhood'), ''), nullif(trim(p_venda->>'address'), ''), nullif(i->>'productId','')::uuid, trim(i->>'name'), (i->>'quantity')::numeric, coalesce(nullif(i->>'unit',''), 'un'), (i->>'unitPrice')::numeric, coalesce(nullif(i->>'discount','')::numeric, 0), p_venda->>'paymentMethod', 'pendente', nullif(trim(p_venda->>'notes'), ''), (i->>'requestId')::uuid, v_id
  from jsonb_array_elements(p_itens) i;
  return v_id;
end;
$$;
revoke all on function public.finalizar_venda(jsonb, jsonb) from public;
grant execute on function public.finalizar_venda(jsonb, jsonb) to authenticated;
