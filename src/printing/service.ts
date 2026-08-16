import { supabase } from "../lib/supabase";
import type { CartItem } from "../schemas";
import type {
  DiscoveredPrinterQueue,
  PrintSettings,
  Printer,
  ReceiptPayload,
} from "./types";

export const defaultSettings = (ownerId: string): PrintSettings => ({
  owner_id: ownerId,
  auto_print: true,
  print_when: "payment_confirmed",
  auto_approve: true,
  confirm_reprint: true,
  auto_reprint_on_edit: false,
  share_across_devices: true,
  copies: 1,
  receipt_mode: "complete",
  auto_cut: true,
  cut_type: "partial",
  feed_lines: 3,
});

export async function loadPrinting(ownerId: string) {
  const [
    { data: settings, error: settingsError },
    { data: printers, error: printersError },
  ] = await Promise.all([
    supabase.from("print_settings").select("*").maybeSingle(),
    supabase
      .from("printers")
      .select("*,printer_bindings(id,agent_id,enabled,priority)")
      .order("created_at"),
  ]);
  if (settingsError) throw settingsError;
  if (printersError) throw printersError;
  return {
    settings: (settings ?? defaultSettings(ownerId)) as PrintSettings,
    printers: (printers ?? []) as Printer[],
  };
}

export async function loadDiscoveredPrinters() {
  const { data, error } = await supabase
    .from("discovered_printer_queues")
    .select(
      "*,print_agents(id,computer_name,platform,status,last_seen_at),printer_bindings(id)",
    )
    .eq("installed", true)
    .order("display_name");
  if (error) throw error;
  return ((data ?? []) as unknown as DiscoveredPrinterQueue[]).filter(
    (queue) => !queue.printer_bindings?.length,
  );
}

export async function addDiscoveredPrinter(
  ownerId: string,
  queue: DiscoveredPrinterQueue,
) {
  const isNetworkIp = Boolean(
    queue.host &&
    (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(queue.host) || queue.host.includes(":")),
  );
  const printer = await savePrinter(ownerId, {
    friendly_name: queue.display_name,
    model: queue.driver_name,
    paper_width: 80,
    connection_mode: isNetworkIp && queue.port ? "network" : "system",
    system_queue: queue.queue_name,
    ip: isNetworkIp ? queue.host : null,
    port: isNetworkIp ? queue.port : null,
    status: queue.status,
  });
  const { data: binding, error } = await supabase
    .from("printer_bindings")
    .insert({
      owner_id: ownerId,
      printer_id: printer.id,
      agent_id: queue.agent_id,
      discovered_queue_id: queue.id,
    })
    .select("id,agent_id,enabled,priority")
    .single();
  if (error) {
    await removePrinter(printer.id);
    throw error;
  }
  return { ...printer, printer_bindings: [binding] } as Printer;
}

export async function saveSettings(settings: PrintSettings) {
  const { error } = await supabase
    .from("print_settings")
    .upsert(settings, { onConflict: "owner_id" });
  if (error) throw error;
}

export async function savePrinter(
  ownerId: string,
  printer: Partial<Printer> &
    Pick<Printer, "friendly_name" | "connection_mode">,
) {
  const row = {
    owner_id: ownerId,
    model: null,
    paper_width: 80,
    timeout_ms: 3000,
    retry_count: 2,
    cut_type: "partial",
    feed_lines: 3,
    enabled: true,
    ...printer,
  };
  const { data, error } = await supabase
    .from("printers")
    .upsert(row)
    .select()
    .single();
  if (error) throw error;
  return data as Printer;
}

export async function removePrinter(id: string) {
  const { error } = await supabase.from("printers").delete().eq("id", id);
  if (error) throw error;
}

export async function loadPrintJobs() {
  const { data, error } = await supabase
    .from("print_jobs")
    .select(
      "id,state,origin,created_at,last_error,printer_id,agent_id,binding_id,receipt_payload,copies,max_attempts,retry_interval_ms,venda_id",
    )
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function requeueJob(
  ownerId: string,
  job: Record<string, unknown>,
) {
  const { error } = await supabase.from("print_jobs").insert({
    owner_id: ownerId,
    venda_id: job.venda_id,
    printer_id: job.printer_id,
    agent_id: job.agent_id,
    binding_id: job.binding_id,
    idempotency_key: `manual:${crypto.randomUUID()}:${job.printer_id}`,
    origin: "manual",
    state: "pending",
    receipt_payload: job.receipt_payload,
    copies: job.copies,
    max_attempts: job.max_attempts,
    retry_interval_ms: job.retry_interval_ms,
  });
  if (error) throw error;
}

export async function enqueueTest(
  ownerId: string,
  printer: Printer,
  settings: PrintSettings,
) {
  const payload: ReceiptPayload = {
    saleId: crypto.randomUUID(),
    customer: "TESTE DE IMPRESSÃO",
    payment: "—",
    createdAt: new Date().toISOString(),
    total: 0,
    mode: settings.receipt_mode,
    printOptions: {
      cutType: settings.auto_cut ? settings.cut_type : "none",
      feedLines: settings.feed_lines,
    },
    items: [
      {
        name: "GS-T80E configurada com sucesso",
        quantity: 1,
        unit: "un",
        unitPrice: 0,
        total: 0,
      },
    ],
  };
  return enqueueReceipt(ownerId, null, payload, settings, [printer], "test");
}

export function makeReceipt(
  saleId: string,
  customer: string,
  payment: string,
  items: CartItem[],
  settings: PrintSettings,
): ReceiptPayload {
  return {
    saleId,
    customer,
    payment,
    createdAt: new Date().toISOString(),
    mode: settings.receipt_mode,
    printOptions: {
      cutType: settings.auto_cut ? settings.cut_type : "none",
      feedLines: settings.feed_lines,
    },
    total: items.reduce((sum, item) => sum + item.total, 0),
    items: items.map(({ name, quantity, unit, unitPrice, total }) => ({
      name,
      quantity,
      unit,
      unitPrice,
      total,
    })),
  };
}

export async function enqueueReceipt(
  ownerId: string,
  vendaId: string | null,
  payload: ReceiptPayload,
  settings: PrintSettings,
  printers: Printer[],
  origin: "automatic" | "manual" | "test" | "edit" = "automatic",
) {
  const active = printers.filter((printer) => printer.enabled);
  if (!active.length) return 0;
  const nonce = origin === "automatic" ? payload.saleId : crypto.randomUUID();
  const rows = active.flatMap((printer) => {
    const bindings = (printer.printer_bindings ?? []).filter(
      (binding) => binding.enabled,
    );
    const targets = bindings.length
      ? [bindings.sort((a, b) => a.priority - b.priority)[0]]
      : [null];
    return targets.map((binding) => ({
      owner_id: ownerId,
      venda_id: vendaId,
      printer_id: printer.id,
      agent_id: binding?.agent_id ?? null,
      binding_id: binding?.id ?? null,
      idempotency_key: `${origin}:${nonce}:${printer.id}`,
      origin,
      state: "pending",
      receipt_payload: payload,
      copies: settings.copies,
      max_attempts: printer.retry_count + 1,
      retry_interval_ms: 1500,
    }));
  });
  const { data, error } = await supabase
    .from("print_jobs")
    .upsert(rows, {
      onConflict: "owner_id,idempotency_key",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}
