import os from 'node:os';
import { buildEscPos } from './escpos.js';
import { printNetwork } from './networkPrinter.js';
import { printSystemQueue } from './systemPrinters.js';
import {
  claimJob,
  getJob,
  getPrinter,
  insertAttempt,
  updateAttempt,
  updateJob,
  updatePrinterStatus,
} from './supabaseRest.js';
import type { PrinterConfig } from './types.js';

const AGENT_VERSION = '0.1.0';

type ErrorWithCode = { code?: unknown };

export function classifyPrintError(error: unknown) {
  const code = String((error as ErrorWithCode | null)?.code ?? 'PRINT_FAILED');
  const message = error instanceof Error ? error.message : 'Falha desconhecida na impressão.';
  if (code === 'ETIMEDOUT') {
    return { code, message: 'A impressora não respondeu. Verifique se está ligada e na mesma rede.' };
  }
  if (code === 'ECONNREFUSED') {
    return { code, message: 'A porta da impressora está fechada ou o IP/porta estão incorretos.' };
  }
  if (code === 'QUEUE_OFFLINE') {
    return { code, message: 'A fila instalada não está disponível neste computador.' };
  }
  if (code === 'CUPS_JOB_PENDING') return { code, message };
  return { code, message };
}

export async function runPrinterAdapter(printer: PrinterConfig, buffer: Buffer) {
  if (printer.connection_mode === 'system') {
    if (!printer.system_queue) {
      throw Object.assign(new Error('Fila do sistema não informada.'), { code: 'QUEUE_MISSING' });
    }
    return printSystemQueue(printer.system_queue, buffer, printer.timeout_ms);
  }
  if (!printer.ip || !printer.port) {
    throw Object.assign(new Error('IP/porta da impressora não informados.'), { code: 'NETWORK_CONFIG_INVALID' });
  }
  return printNetwork(printer.ip, printer.port, buffer, printer.timeout_ms);
}

export async function executeJob(jobId: string, token: string, adapter = runPrinterAdapter) {
  let job = await getJob(jobId, token);
  if (job.state === 'completed') {
    return { state: 'completed' as const, message: 'Este trabalho já foi concluído.' };
  }
  if (job.state === 'failed') {
    return { state: 'failed' as const, message: job.state === 'failed' ? 'Este trabalho já esgotou as tentativas.' : '' };
  }

  const claimed = await claimJob(job.id, token);
  if (!claimed) {
    job = await getJob(job.id, token);
    if (job.state === 'completed') {
      return { state: 'completed' as const, message: 'Este trabalho já foi concluído.' };
    }
    return {
      state: 'processing' as const,
      message: 'Este trabalho já está sendo processado por outro agente/computador.',
    };
  }

  job = await getJob(job.id, token);
  const printer = await getPrinter(job.printer_id, token);
  if (!printer.id) throw Object.assign(new Error('Impressora sem identificador válido.'), { code: 'PRINTER_INVALID' });
  const printerId = printer.id;
  const maxAttempts = Math.max(1, Number(job.max_attempts));
  const initialAttempt = Number(job.attempt_count);
  const buffer = buildEscPos(job.receipt_payload);

  for (let index = initialAttempt + 1; index <= maxAttempts; index += 1) {
    const attempts = await insertAttempt(token, {
      job_id: job.id,
      printer_id: printerId,
      attempt_no: index,
      state: 'processing',
      agent_os: `${os.platform()} ${os.release()}`,
      agent_version: AGENT_VERSION,
    });
    const attemptId = attempts[0]?.id;
    await updateJob(job.id, token, { attempt_count: index, state: 'processing', updated_at: new Date().toISOString() });

    try {
      let lastMessage = '';
      for (let copy = 0; copy < Math.max(1, Number(job.copies)); copy += 1) {
        lastMessage = await adapter(printer, buffer);
      }
      if (attemptId) {
        await updateAttempt(attemptId, token, {
          state: 'completed',
          result_code: 'OK',
          result_message: lastMessage,
          finished_at: new Date().toISOString(),
        });
      }
      await updatePrinterStatus(printerId, token, 'available', lastMessage);
      await updateJob(job.id, token, {
        state: 'completed',
        completed_at: new Date().toISOString(),
        next_attempt_at: null,
        last_error: null,
      });
      return { state: 'completed' as const, message: lastMessage || 'Impressão concluída.' };
    } catch (error) {
      const friendly = classifyPrintError(error);
      if (attemptId) {
        await updateAttempt(attemptId, token, {
          state: 'failed',
          result_code: friendly.code,
          result_message: friendly.message,
          finished_at: new Date().toISOString(),
        });
      }
      const finalAttempt = index >= maxAttempts;
      await updatePrinterStatus(
        printerId,
        token,
        friendly.code === 'QUEUE_OFFLINE' ? 'disconnected' : 'error',
        friendly.message,
      ).catch(() => undefined);
      await updateJob(job.id, token, {
        state: finalAttempt ? 'failed' : 'processing',
        last_error: friendly.message,
        next_attempt_at: finalAttempt ? null : new Date(Date.now() + Number(job.retry_interval_ms)).toISOString(),
      });
      if (finalAttempt) return { state: 'failed' as const, message: friendly.message };
      await new Promise((resolve) => setTimeout(resolve, Number(job.retry_interval_ms)));
    }
  }

  return { state: 'failed' as const, message: 'O trabalho excedeu o número de tentativas.' };
}
