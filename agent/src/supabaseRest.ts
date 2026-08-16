import type { PrintJob, PrinterConfig, PrinterStatus } from './types.js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://ucvutimcfthupaljoxdp.supabase.co';
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ZNgikya1HBy67qA7NSdFYA_zLmdc-9N';

type AttemptRow = { id?: string; [key: string]: unknown };

async function rest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw Object.assign(new Error(`Supabase respondeu ${response.status}.`), { code: 'SUPABASE_ERROR' });
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getJob(jobId: string, token: string) {
  const rows = await rest<PrintJob[]>(`print_jobs?id=eq.${encodeURIComponent(jobId)}&select=*`, token);
  if (!rows[0]) throw Object.assign(new Error('Trabalho de impressão não encontrado.'), { code: 'JOB_NOT_FOUND' });
  return rows[0];
}

export async function claimJob(jobId: string, token: string) {
  return rest<boolean>('rpc/claim_print_job', token, {
    method: 'POST',
    body: JSON.stringify({ p_job_id: jobId }),
  });
}

export async function getPrinter(printerId: string, token: string) {
  const rows = await rest<PrinterConfig[]>(`printers?id=eq.${encodeURIComponent(printerId)}&select=*`, token);
  if (!rows[0]) throw Object.assign(new Error('Impressora não encontrada.'), { code: 'PRINTER_NOT_FOUND' });
  return rows[0];
}

export function updateJob(jobId: string, token: string, patch: Record<string, unknown>) {
  return rest<PrintJob[]>(`print_jobs?id=eq.${encodeURIComponent(jobId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function insertAttempt(token: string, row: Record<string, unknown>) {
  return rest<AttemptRow[]>('print_attempts', token, { method: 'POST', body: JSON.stringify(row) });
}

export function updateAttempt(id: string, token: string, patch: Record<string, unknown>) {
  return rest<AttemptRow[]>(`print_attempts?id=eq.${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function updatePrinterStatus(printerId: string, token: string, status: PrinterStatus, message: string) {
  return rest<PrinterConfig[]>(`printers?id=eq.${encodeURIComponent(printerId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ status, status_message: message, last_seen_at: new Date().toISOString() }),
  });
}
