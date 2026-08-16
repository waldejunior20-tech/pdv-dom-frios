create index if not exists idx_discovered_queues_owner on public.discovered_printer_queues(owner_id);
create index if not exists idx_printer_bindings_owner on public.printer_bindings(owner_id);
create index if not exists idx_printer_bindings_queue on public.printer_bindings(discovered_queue_id);
create index if not exists idx_print_jobs_binding on public.print_jobs(binding_id);
