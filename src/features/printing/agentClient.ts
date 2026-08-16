import type { PrinterDraft, PrinterRecord, SystemPrinter } from './types';

const AGENT_URL = import.meta.env.VITE_PRINT_AGENT_URL || 'http://127.0.0.1:17891';

type AgentResponse<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

async function agentRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${AGENT_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
    const body = (await response.json()) as AgentResponse<T>;
    if (!response.ok || !body.ok) {
      const error = body.ok ? { code: 'AGENT_ERROR', message: 'O agente local recusou a operação.' } : body.error;
      throw Object.assign(new Error(error.message), { code: error.code });
    }
    return body.data;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw Object.assign(new Error('O agente de impressão não respondeu a tempo.'), { code: 'AGENT_TIMEOUT' });
    }
    if (error instanceof TypeError) {
      throw Object.assign(new Error('Agente local indisponível. Inicie o agente de impressão neste computador.'), {
        code: 'AGENT_OFFLINE',
      });
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function getAgentHealth() {
  const response = await fetch(`${AGENT_URL}/v1/health`, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error('Agente indisponível.');
  return response.json() as Promise<{ ok: true; data: { version: string; os: string } }>;
}

export function discoverSystemPrinters(accessToken: string) {
  return agentRequest<SystemPrinter[]>('/v1/printers/system', accessToken);
}

export function probePrinter(accessToken: string, printer: PrinterDraft | PrinterRecord) {
  return agentRequest<{ status: PrinterRecord['status']; message: string }>('/v1/printers/probe', accessToken, {
    method: 'POST',
    body: JSON.stringify(printer),
  });
}

export function executePrintJob(accessToken: string, jobId: string) {
  return agentRequest<{ state: 'completed' | 'failed' | 'processing'; message: string }>(
    `/v1/jobs/${jobId}/execute`,
    accessToken,
    { method: 'POST', body: '{}' },
  );
}
