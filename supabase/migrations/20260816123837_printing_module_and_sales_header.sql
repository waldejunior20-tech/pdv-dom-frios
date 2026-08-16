create table if not exists public.vendas (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_nome text not null, whatsapp text, bairro text, endereco text,
  tipo_pedido text not null default 'retirada' check (tipo_pedido in ('retirada','entrega','mesa')), mesa text,
  subtotal numeric not null default 0 check (subtotal >= 0), desconto numeric not null default 0, taxa numeric not null default 0 check (taxa >= 0),
  total numeric generated always as (round((subtotal - desconto) + taxa, 2)) stored,
  forma_pagamento text not null check (forma_pagamento in ('pix','dinheiro','cartao','prazo')),
  situacao_pagamento text not null default 'confirmado' check (situacao_pagamento in ('pendente','confirmado','falhou','estornado')),
  status text not null default 'aprovado' check (status in ('recebido','aprovado','cancelado','concluido')),
  observacao text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.pedidos add column if not exists venda_id uuid references public.vendas(id) on delete cascade;

create table if not exists public.print_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  auto_print boolean not null default true, print_when text not null default 'payment_confirmed' check (print_when in ('received','approved','payment_confirmed','manual')),
  auto_approve boolean not null default true, confirm_reprint boolean not null default true, auto_reprint_on_edit boolean not null default false,
  share_across_devices boolean not null default true, copies smallint not null default 1 check (copies between 1 and 10),
  receipt_mode text not null default 'complete' check (receipt_mode in ('complete','summary')), auto_cut boolean not null default true,
  cut_type text not null default 'partial' check (cut_type in ('partial','full','none')), feed_lines smallint not null default 3 check (feed_lines between 0 and 12),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.printers (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  friendly_name text not null check (char_length(friendly_name) between 1 and 80), model text, paper_width smallint not null default 80 check (paper_width in (58,80)),
  connection_mode text not null check (connection_mode in ('system','network')), system_queue text, ip inet, port integer,
  timeout_ms integer not null default 3000 check (timeout_ms between 500 and 30000), retry_count smallint not null default 2 check (retry_count between 0 and 5),
  cut_type text not null default 'partial' check (cut_type in ('partial','full','none')), feed_lines smallint not null default 3 check (feed_lines between 0 and 12), enabled boolean not null default true,
  status text not null default 'unknown' check (status in ('available','disconnected','no_paper','cover_open','error','unknown')), status_message text, last_seen_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((connection_mode = 'system' and system_queue is not null) or (connection_mode = 'network' and ip is not null and port between 1 and 65535))
);
create table if not exists public.printer_destinations (
  printer_id uuid not null references public.printers(id) on delete cascade, owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  destination text not null check (destination in ('cozinha','balcao','caixa','entrega','bebidas','todos')), created_at timestamptz not null default now(), primary key (printer_id,destination)
);
create table if not exists public.print_jobs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  venda_id uuid references public.vendas(id) on delete cascade, printer_id uuid not null references public.printers(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 180), origin text not null check (origin in ('automatic','manual','test','edit')),
  state text not null default 'pending' check (state in ('pending','processing','completed','failed')), receipt_payload jsonb not null check (jsonb_typeof(receipt_payload) = 'object'),
  copies smallint not null default 1 check (copies between 1 and 10), attempt_count smallint not null default 0 check (attempt_count between 0 and 20),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10), retry_interval_ms integer not null default 1500 check (retry_interval_ms between 250 and 60000),
  next_attempt_at timestamptz, requested_by uuid default auth.uid() references auth.users(id) on delete set null, last_error text, started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id,idempotency_key)
);
create table if not exists public.print_attempts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id uuid not null references public.print_jobs(id) on delete cascade, printer_id uuid not null references public.printers(id) on delete restrict,
  attempt_no smallint not null check (attempt_no between 1 and 20), state text not null check (state in ('processing','completed','failed')),
  agent_os text, agent_version text, result_code text, result_message text, started_at timestamptz not null default now(), finished_at timestamptz, created_at timestamptz not null default now(), unique(job_id,attempt_no)
);

alter table public.vendas enable row level security; alter table public.print_settings enable row level security; alter table public.printers enable row level security;
alter table public.printer_destinations enable row level security; alter table public.print_jobs enable row level security; alter table public.print_attempts enable row level security;

create policy vendas_own on public.vendas for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy print_settings_own on public.print_settings for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy printers_own on public.printers for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy printer_destinations_own on public.printer_destinations for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy print_jobs_own on public.print_jobs for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy print_attempts_own on public.print_attempts for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create index if not exists idx_vendas_owner_created_at on public.vendas(owner_id,created_at desc);
create index if not exists idx_printers_owner on public.printers(owner_id);
create index if not exists idx_print_jobs_owner_state on public.print_jobs(owner_id,state,next_attempt_at,created_at);
create index if not exists idx_print_jobs_venda on public.print_jobs(venda_id);
create index if not exists idx_print_attempts_job on public.print_attempts(job_id,attempt_no);
