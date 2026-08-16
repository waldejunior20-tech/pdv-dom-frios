create index if not exists idx_print_jobs_printer_id on public.print_jobs(printer_id);
create index if not exists idx_print_jobs_requested_by on public.print_jobs(requested_by) where requested_by is not null;
create index if not exists idx_print_attempts_owner_id on public.print_attempts(owner_id);
create index if not exists idx_print_attempts_printer_id on public.print_attempts(printer_id);
create index if not exists idx_printer_destinations_owner_id on public.printer_destinations(owner_id);
