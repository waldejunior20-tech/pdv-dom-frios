alter table public.pedidos
  add column if not exists complementos jsonb not null default '[]'::jsonb check (jsonb_typeof(complementos) = 'array');
alter table public.pedidos add column if not exists observacao_item text;

create or replace function public.claim_print_job(p_job_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = 'public', 'pg_temp'
as $$
declare
  v_owner uuid := auth.uid();
  v_claimed integer;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  update public.print_jobs
     set state = 'processing', started_at = coalesce(started_at, now()), updated_at = now()
   where id = p_job_id and owner_id = v_owner and state = 'pending';
  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$$;

revoke all on function public.claim_print_job(uuid) from public;
grant execute on function public.claim_print_job(uuid) to authenticated;
