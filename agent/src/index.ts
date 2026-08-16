import http from 'node:http';
import os from 'node:os';
import { z } from 'zod';
import { executeJob } from './executor.js';
import { probeNetworkPrinter } from './networkPrinter.js';
import { corsHeaders, isOriginAllowed, validateAccessToken } from './security.js';
import { listSystemPrinters, probeSystemQueue } from './systemPrinters.js';
import type { PrinterConfig } from './types.js';

const VERSION = '0.1.0';
const PORT = Number(process.env.PRINT_AGENT_PORT || 17891);
const HOST = '127.0.0.1';

const printerSchema = z.object({
  id: z.string().uuid().optional(),
  friendly_name: z.string().min(1).max(80),
  model: z.string().nullable().optional(),
  paper_width: z.union([z.literal(58), z.literal(80)]),
  connection_mode: z.enum(['system', 'network']),
  system_queue: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  timeout_ms: z.number().int().min(500).max(30000),
  retry_count: z.number().int().min(0).max(5),
  cut_type: z.enum(['partial', 'full', 'none']),
  feed_lines: z.number().int().min(0).max(12),
});

type ErrorWithCode = { code?: unknown };

function send(res: http.ServerResponse, status: number, body: unknown, origin?: string) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const payload = Buffer.concat(chunks);
  if (!payload.length) return {};
  if (payload.length > 64 * 1024) {
    throw Object.assign(new Error('Payload muito grande.'), { code: 'PAYLOAD_TOO_LARGE' });
  }
  return JSON.parse(payload.toString('utf8')) as unknown;
}

function bearer(req: http.IncomingMessage) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? '';
}

const server = http.createServer(async (req, res) => {
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(origin)) {
      return send(res, 403, { ok: false, error: { code: 'ORIGIN_DENIED', message: 'Origem não autorizada.' } });
    }
    res.writeHead(204, corsHeaders(origin));
    return res.end();
  }

  if (!isOriginAllowed(origin)) {
    return send(
      res,
      403,
      { ok: false, error: { code: 'ORIGIN_DENIED', message: 'Este site não está autorizado a usar o agente local.' } },
      origin,
    );
  }

  if (req.url === '/v1/health' && req.method === 'GET') {
    return send(res, 200, { ok: true, data: { version: VERSION, os: `${os.platform()} ${os.release()}` } }, origin);
  }

  const token = bearer(req);
  if (!token) {
    return send(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: 'Sessão do PDV não informada.' } }, origin);
  }

  try {
    await validateAccessToken(token);

    if (req.url === '/v1/printers/system' && req.method === 'GET') {
      const printers = await listSystemPrinters();
      return send(res, 200, { ok: true, data: printers }, origin);
    }

    if (req.url === '/v1/printers/probe' && req.method === 'POST') {
      const parsed = printerSchema.safeParse(await readJson(req));
      if (!parsed.success) {
        return send(
          res,
          400,
          {
            ok: false,
            error: { code: 'INVALID_PRINTER', message: parsed.error.issues[0]?.message || 'Configuração inválida.' },
          },
          origin,
        );
      }
      const printer = parsed.data as PrinterConfig;
      const result =
        printer.connection_mode === 'system'
          ? await probeSystemQueue(printer.system_queue || '')
          : await probeNetworkPrinter(printer.ip || '', printer.port || 9100, printer.timeout_ms);
      return send(res, 200, { ok: true, data: result }, origin);
    }

    const jobMatch = /^\/v1\/jobs\/([0-9a-f-]{36})\/execute$/i.exec(req.url || '');
    if (jobMatch && req.method === 'POST') {
      const result = await executeJob(jobMatch[1], token);
      return send(res, 200, { ok: true, data: result }, origin);
    }

    return send(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }, origin);
  } catch (error) {
    const code = String((error as ErrorWithCode | null)?.code ?? 'AGENT_ERROR');
    const message = error instanceof Error ? error.message : 'Falha interna no agente de impressão.';
    return send(res, code === 'UNAUTHORIZED' ? 401 : 500, { ok: false, error: { code, message } }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dom Frios Print Agent ${VERSION} ouvindo somente em http://${HOST}:${PORT}`);
});
