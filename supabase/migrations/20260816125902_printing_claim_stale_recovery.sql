create or replace function public.claim_print_job(p_job_id uuid)
returns boolean language plpgsql security invoker set search_path = 'public', 'pg_temp' as $$
declare v_owner uuid := auth.uid(); v_claimed integer;
begin
  if v_owner is null then raise exception 'authentication required'; end if;
  update public.print_jobs set state='processing', started_at=coalesce(started_at,now()), updated_at=now()
  where id=p_job_id and owner_id=v_owner and (state='pending' or (state='processing' and updated_at < now() - interval '5 minutes'));
  get diagnostics v_claimed = row_count;
  return v_claimed=1;
end; $$;
