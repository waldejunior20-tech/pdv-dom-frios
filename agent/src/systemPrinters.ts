import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import type { PrinterStatus } from './types.js';

const execFileAsync = promisify(execFile);

type PowerShellPrinter = {
  Name?: unknown;
  DriverName?: unknown;
  PortName?: unknown;
  PrinterStatus?: unknown;
  Default?: unknown;
};

type ExecFailure = Error & { stderr?: string | Buffer };

export type SystemPrinterInfo = {
  queue: string;
  name: string;
  model?: string;
  status: PrinterStatus;
  statusMessage?: string;
  isDefault?: boolean;
};

function parseCups(text: string): SystemPrinterInfo[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const defaultLine = lines.find((line) => line.startsWith('system default destination:'));
  const defaultQueue = defaultLine?.split(':').slice(1).join(':').trim();
  return lines
    .filter((line) => line.startsWith('printer '))
    .map((line) => {
      const match = /^printer\s+(\S+)\s+(.+)$/.exec(line);
      const queue = match?.[1] ?? '';
      const detail = match?.[2] ?? '';
      const disabled = /disabled|stopped/i.test(detail);
      return {
        queue,
        name: queue,
        status: disabled ? ('disconnected' as const) : ('available' as const),
        statusMessage: detail,
        isDefault: queue === defaultQueue,
      };
    })
    .filter((printer) => printer.queue);
}

export async function listSystemPrinters(): Promise<SystemPrinterInfo[]> {
  if (process.platform === 'darwin' || process.platform === 'linux') {
    const { stdout } = await execFileAsync('lpstat', ['-p', '-d'], { timeout: 5000, maxBuffer: 512_000 });
    return parseCups(stdout);
  }

  if (process.platform === 'win32') {
    const script = [
      'Get-Printer |',
      'Select-Object Name,DriverName,PortName,PrinterStatus,Default |',
      'ConvertTo-Json -Compress',
    ].join(' ');
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 7000, maxBuffer: 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout || '[]') as PowerShellPrinter | PowerShellPrinter[];
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.filter(Boolean).map((row) => ({
      queue: String(row.Name ?? ''),
      name: String(row.Name ?? ''),
      model: row.DriverName ? String(row.DriverName) : undefined,
      status: Number(row.PrinterStatus) === 7 ? ('disconnected' as const) : ('unknown' as const),
      statusMessage: row.PortName ? `Porta ${String(row.PortName)}` : undefined,
      isDefault: Boolean(row.Default),
    }));
  }

  return [];
}

export async function probeSystemQueue(queue: string) {
  const printers = await listSystemPrinters();
  const found = printers.find((printer) => printer.queue === queue);
  if (!found) return { status: 'disconnected' as const, message: `A fila ${queue} não foi encontrada neste computador.` };
  return {
    status: found.status === 'available' ? ('available' as const) : found.status,
    message: found.status === 'available' ? `Fila ${queue} disponível.` : found.statusMessage || `Fila ${queue} encontrada.`,
  };
}

async function waitForCupsCompletion(jobId: string, timeoutMs: number) {
  const deadline = Date.now() + Math.max(timeoutMs, 6000);
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync('lpstat', ['-W', 'not-completed', '-o'], {
        timeout: 3000,
        maxBuffer: 128_000,
      });
      if (!stdout.includes(jobId)) return;
    } catch (error) {
      const stderr = String((error as ExecFailure)?.stderr ?? '');
      if (/unknown destination|not found/i.test(stderr)) throw error;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Object.assign(new Error('O CUPS ainda mantém o trabalho pendente. Confira papel, tampa e conexão.'), {
    code: 'CUPS_JOB_PENDING',
  });
}

export async function printSystemQueue(queue: string, buffer: Buffer, timeoutMs: number) {
  const probe = await probeSystemQueue(queue);
  if (probe.status === 'disconnected') {
    throw Object.assign(new Error(probe.message), { code: 'QUEUE_OFFLINE' });
  }

  if (process.platform === 'darwin' || process.platform === 'linux') {
    const child = spawn('lp', ['-d', queue, '-o', 'raw'], { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
    child.stdin.end(buffer);
    const [code] = (await once(child, 'close')) as [number];
    if (code !== 0) {
      throw Object.assign(new Error(Buffer.concat(stderr).toString('utf8') || `lp encerrou com código ${code}.`), {
        code: 'CUPS_PRINT_FAILED',
      });
    }
    const output = Buffer.concat(stdout).toString('utf8');
    const match = /request id is\s+(\S+)/i.exec(output);
    if (!match?.[1]) {
      throw Object.assign(new Error('O CUPS recebeu o arquivo, mas não retornou o identificador do trabalho.'), {
        code: 'CUPS_JOB_ID_MISSING',
      });
    }
    await waitForCupsCompletion(match[1], timeoutMs);
    return `CUPS concluiu o trabalho ${match[1]}.`;
  }

  throw Object.assign(
    new Error('Impressão RAW por fila do Windows ainda não está habilitada. Use o modo ESC/POS por rede neste computador.'),
    { code: 'WINDOWS_RAW_QUEUE_UNAVAILABLE' },
  );
}
