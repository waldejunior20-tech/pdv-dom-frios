import { supabase } from '../../lib/supabase';
import type {
  PrintJobRecord,
  PrintOrigin,
  PrintSettings,
  PrinterDraft,
  PrinterRecord,
  ReceiptPayload,
  SalePrintData,
} from './types';

export const defaultPrintSettings: PrintSettings = {
  auto_print: true,
  print_when: 'payment_confirmed',
  auto_approve: true,
  confirm_reprint: true,
  auto_reprint_on_edit: false,
  share_across_devices: true,
  copies: 1,
  receipt_mode: 'complete',
  auto_cut: true,
  cut_type: 'partial',
  feed_lines: 3,
};

export async function getPrintSettings(): Promise<PrintSettings> {
  const { data, error } = await supabase.from('print_settings').select('*').maybeSingle();
  if (error) throw error;
  if (!data) return defaultPrintSettings;
  return {
    auto_print: data.auto_print,
    print_when: data.print_when,
    auto_approve: data.auto_approve,
    confirm_reprint: data.confirm_reprint,
    auto_reprint_on_edit: data.auto_reprint_on_edit,
    share_across_devices: data.share_across_devices,
    copies: Number(data.copies),
    receipt_mode: data.receipt_mode,
    auto_cut: data.auto_cut,
    cut_type: data.cut_type,
    feed_lines: Number(data.feed_lines),
  };
}

export async function savePrintSettings(settings: PrintSettings) {
  const { error } = await supabase.from('print_settings').upsert(settings, { onConflict: 'owner_id' });
  if (error) throw error;
}

export async function listPrinters(): Promise<PrinterRecord[]> {
  const [{ data: printers, error }, { data: destinations, error: destinationError }] = await Promise.all([
    supabase.from('printers').select('*').order('created_at'),
    supabase.from('printer_destinations').select('printer_id,destination'),
  ]);
  if (error) throw error;
  if (destinationError) throw destinationError;
  return (printers ?? []).map((printer) => ({
    ...printer,
    paper_width: Number(printer.paper_width) as 58 | 80,
    port: printer.port ? Number(printer.port) : null,
    timeout_ms: Number(printer.timeout_ms),
    retry_count: Number(printer.retry_count),
    feed_lines: Number(printer.feed_lines),
    ip: printer.ip ? String(printer.ip) : null,
    destinations: (destinations ?? [])
      .filter((destination) => destination.printer_id === printer.id)
      .map((destination) => destination.destination),
  })) as PrinterRecord[];
}

export async function savePrinter(printer: PrinterDraft): Promise<string> {
  const payload = {
    id: printer.id,
    friendly_name: printer.friendly_name,
    model: printer.model || null,
    paper_width: printer.paper_width,
    connection_mode: printer.connection_mode,
    system_queue: printer.connection_mode === 'system' ? printer.system_queue : null,
    ip: printer.connection_mode === 'network' ? printer.ip : null,
    port: printer.connection_mode === 'network' ? printer.port : null,
    timeout_ms: printer.timeout_ms,
    retry_count: printer.retry_count,
    cut_type: printer.cut_type,
    feed_lines: printer.feed_lines,
    enabled: printer.enabled,
  };
  const { data, error } = await supabase.from('printers').upsert(payload).select('id').single();
  if (error) throw error;

  const printerId = data.id as string;
  const { error: deleteError } = await supabase.from('printer_destinations').delete().eq('printer_id', printerId);
  if (deleteError) throw deleteError;
  const { error: insertError } = await supabase.from('printer_destinations').insert(
    printer.destinations.map((destination) => ({ printer_id: printerId, destination })),
  );
  if (insertError) throw insertError;
  return printerId;
}

export async function removePrinter(id: string) {
  const { error } = await supabase.from('printers').delete().eq('id', id);
  if (!error) return;
  if (error.code === '23503') {
    const { error: disableError } = await supabase.from('printers').update({ enabled: false }).eq('id', id);
    if (disableError) throw disableError;
    return;
  }
  throw error;
}

export async function updatePrinterStatus(
  id: string,
  status: PrinterRecord['status'],
  statusMessage?: string,
) {
  const { error } = await supabase
    .from('printers')
    .update({ status, status_message: statusMessage || null, last_seen_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function loadSalePrintData(vendaId: string): Promise<SalePrintData> {
  const [{ data: sale, error: saleError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from('vendas').select('*').eq('id', vendaId).single(),
    supabase.from('pedidos').select('*').eq('venda_id', vendaId).order('created_at'),
  ]);
  if (saleError) throw saleError;
  if (itemsError) throw itemsError;

  return {
    id: sale.id,
    createdAt: sale.created_at,
    customer: sale.cliente_nome,
    phone: sale.whatsapp,
    neighborhood: sale.bairro,
    address: sale.endereco,
    orderType: sale.tipo_pedido,
    table: sale.mesa,
    items: (items ?? []).map((item) => ({
      id: item.id,
      productId: item.produto_id,
      name: item.produto_nome,
      quantity: Number(item.quantidade),
      unit: item.unidade,
      unitPrice: Number(item.preco_unitario),
      discount: Number(item.desconto ?? 0),
      notes: item.observacao,
    })),
    subtotal: Number(sale.subtotal),
    discount: Number(sale.desconto),
    fee: Number(sale.taxa),
    total: Number(sale.total),
    paymentMethod: sale.forma_pagamento,
    paymentStatus: sale.situacao_pagamento,
    saleStatus: sale.status,
    notes: sale.observacao,
  };
}

export async function listRecentSales(limit = 12) {
  const { data, error } = await supabase
    .from('vendas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listRecentPrintJobs(limit = 30): Promise<PrintJobRecord[]> {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((job) => ({
    ...job,
    copies: Number(job.copies),
    attempt_count: Number(job.attempt_count),
    max_attempts: Number(job.max_attempts),
    retry_interval_ms: Number(job.retry_interval_ms),
  })) as PrintJobRecord[];
}

export async function createPrintJob(params: {
  vendaId?: string | null;
  printerId: string;
  idempotencyKey: string;
  origin: PrintOrigin;
  payload: ReceiptPayload;
  copies: number;
  maxAttempts: number;
  retryIntervalMs?: number;
}) {
  const row = {
    venda_id: params.vendaId ?? null,
    printer_id: params.printerId,
    idempotency_key: params.idempotencyKey,
    origin: params.origin,
    receipt_payload: params.payload,
    copies: params.copies,
    max_attempts: params.maxAttempts,
    retry_interval_ms: params.retryIntervalMs ?? 1500,
  };
  const { data, error } = await supabase.from('print_jobs').insert(row).select('*').single();
  if (!error) return data as PrintJobRecord;
  if (error.code !== '23505') throw error;
  const { data: existing, error: existingError } = await supabase
    .from('print_jobs')
    .select('*')
    .eq('idempotency_key', params.idempotencyKey)
    .single();
  if (existingError) throw existingError;
  return existing as PrintJobRecord;
}

export async function hasCompletedPrint(vendaId: string) {
  const { count, error } = await supabase
    .from('print_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('venda_id', vendaId)
    .eq('state', 'completed');
  if (error) throw error;
  return Boolean(count);
}
