create table if not exists public.print_agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  installation_id uuid not null,
  computer_name text not null check (char_length(computer_name) between 1 and 120),
  platform text not null check (platform in ('win32','darwin','linux')),
  agent_version text not null,
  status text not null default 'online' check (status in ('online','offline','revoked')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, installation_id)
);

create table if not exists public.discovered_printer_queues (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  agent_id uuid not null references public.print_agents(id) on delete cascade,
  queue_name text not null check (char_length(queue_name) between 1 and 255),
  display_name text not null,
  driver_name text,
  device_uri text,
  port_name text,
  host text,
  port integer check (port is null or port between 1 and 65535),
  status text not null default 'unknown' check (status in ('available','disconnected','error','unknown')),
  status_reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(status_reasons) = 'array'),
  is_default boolean not null default false,
  kind text not null default 'printer' check (kind in ('printer','class')),
  fingerprint text not null,
  fingerprint_strength text not null check (fingerprint_strength in ('strong','weak')),
  installed boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, queue_name)
);

create table if not exists public.printer_bindings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  printer_id uuid not null references public.printers(id) on delete cascade,
  agent_id uuid not null references public.print_agents(id) on delete cascade,
  discovered_queue_id uuid not null references public.discovered_printer_queues(id) on delete restrict,
  priority smallint not null default 1 check (priority between 1 and 99),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (printer_id, agent_id, discovered_queue_id)
);

alter table public.print_jobs add column if not exists agent_id uuid references public.print_agents(id) on delete set null;
alter table public.print_jobs add column if not exists binding_id uuid references public.printer_bindings(id) on delete set null;

alter table public.print_agents enable row level security;
alter table public.discovered_printer_queues enable row level security;
alter table public.printer_bindings enable row level security;

create policy print_agents_own on public.print_agents for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy discovered_printer_queues_own on public.discovered_printer_queues for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy printer_bindings_own on public.printer_bindings for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create index if not exists idx_print_agents_owner_seen on public.print_agents(owner_id, last_seen_at desc);
create index if not exists idx_discovered_queues_agent_seen on public.discovered_printer_queues(agent_id, last_seen_at desc);
create index if not exists idx_printer_bindings_agent on public.printer_bindings(agent_id) where enabled;
create index if not exists idx_print_jobs_agent_state on public.print_jobs(agent_id, state, next_attempt_at, created_at);

create or replace function public.register_print_agent(
  p_installation_id uuid, p_computer_name text, p_platform text, p_agent_version text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.print_agents(owner_id, installation_id, computer_name, platform, agent_version, status, last_seen_at, updated_at)
  values (auth.uid(), p_installation_id, left(p_computer_name, 120), p_platform, p_agent_version, 'online', now(), now())
  on conflict (owner_id, installation_id) do update set
    computer_name = excluded.computer_name, platform = excluded.platform,
    agent_version = excluded.agent_version, status = 'online', last_seen_at = now(), updated_at = now()
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.register_print_agent(uuid,text,text,text) to authenticated;

create or replace function public.sync_discovered_printers(p_agent_id uuid, p_queues jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if not exists (select 1 from public.print_agents where id = p_agent_id and owner_id = auth.uid() and status <> 'revoked') then
    raise exception 'Agente não autorizado';
  end if;
  if jsonb_typeof(p_queues) <> 'array' or jsonb_array_length(p_queues) > 100 then
    raise exception 'Inventário inválido';
  end if;
  update public.discovered_printer_queues set installed = false, updated_at = now()
    where agent_id = p_agent_id and owner_id = auth.uid();
  insert into public.discovered_printer_queues(
    owner_id, agent_id, queue_name, display_name, driver_name, device_uri, port_name,
    host, port, status, status_reasons, is_default, kind, fingerprint,
    fingerprint_strength, installed, last_seen_at, updated_at
  )
  select auth.uid(), p_agent_id, q.queue_name, q.display_name, q.driver_name,
    q.device_uri, q.port_name, q.host, q.port, q.status, coalesce(q.status_reasons, '[]'::jsonb),
    coalesce(q.is_default, false), coalesce(q.kind, 'printer'), q.fingerprint,
    q.fingerprint_strength, true, now(), now()
  from jsonb_to_recordset(p_queues) as q(
    queue_name text, display_name text, driver_name text, device_uri text, port_name text,
    host text, port integer, status text, status_reasons jsonb, is_default boolean,
    kind text, fingerprint text, fingerprint_strength text
  )
  on conflict (agent_id, queue_name) do update set
    display_name=excluded.display_name, driver_name=excluded.driver_name,
    device_uri=excluded.device_uri, port_name=excluded.port_name, host=excluded.host,
    port=excluded.port, status=excluded.status, status_reasons=excluded.status_reasons,
    is_default=excluded.is_default, kind=excluded.kind, fingerprint=excluded.fingerprint,
    fingerprint_strength=excluded.fingerprint_strength, installed=true,
    last_seen_at=now(), updated_at=now();
  get diagnostics v_count = row_count;
  update public.print_agents set last_seen_at=now(), updated_at=now() where id=p_agent_id;
  return v_count;
end $$;
grant execute on function public.sync_discovered_printers(uuid,jsonb) to authenticated;
