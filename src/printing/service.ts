import { supabase } from "../lib/supabase";
import type { CartItem } from "../schemas";
import type { PrintSettings, Printer, ReceiptPayload } from "./types";

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
    supabase.from("printers").select("*").order("created_at"),
  ]);
  if (settingsError) throw settingsError;
  if (printersError) throw printersError;
  return {
    settings: (settings ?? defaultSettings(ownerId)) as PrintSettings,
    printers: (printers ?? []) as Printer[],
  };
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

export function makeReceipt(
  saleId: string,
  customer: string,
  payment: string,
  items: CartItem[],
  mode: PrintSettings["receipt_mode"],
): ReceiptPayload {
  return {
    saleId,
    customer,
    payment,
    createdAt: new Date().toISOString(),
    mode,
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
  const rows = active.map((printer) => ({
    owner_id: ownerId,
    venda_id: vendaId,
    printer_id: printer.id,
    idempotency_key: `${origin}:${nonce}:${printer.id}`,
    origin,
    state: "pending",
    receipt_payload: payload,
    copies: settings.copies,
    max_attempts: printer.retry_count + 1,
    retry_interval_ms: 1500,
  }));
  const { error } = await supabase.from("print_jobs").insert(rows);
  if (error && error.code !== "23505") throw error;
  return active.length;
}
