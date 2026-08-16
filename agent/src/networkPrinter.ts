import net from 'node:net';
import type { PrinterStatus } from './types.js';

function simpleError(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code;
  if (code === 'ECONNREFUSED') return Object.assign(new Error('A porta da impressora recusou a conexão.'), { code });
  if (code === 'ETIMEDOUT') return Object.assign(new Error('A impressora não respondeu dentro do tempo limite.'), { code });
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return Object.assign(new Error('O endereço da impressora não está acessível nesta rede.'), { code });
  }
  return error instanceof Error ? error : new Error('Falha de rede ao acessar a impressora.');
}

export async function probeNetworkPrinter(ip: string, port: number, timeoutMs: number) {
  return new Promise<{ status: PrinterStatus; message: string }>((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port });
    const timer = setTimeout(
      () => socket.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
      timeoutMs,
    );
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve({ status: 'available', message: `Conexão estabelecida com ${ip}:${port}.` });
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(simpleError(error));
    });
  });
}

export async function printNetwork(ip: string, port: number, buffer: Buffer, timeoutMs: number) {
  await probeNetworkPrinter(ip, port, timeoutMs);
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port });
    const timer = setTimeout(
      () => socket.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })),
      timeoutMs,
    );
    socket.once('connect', () => {
      socket.write(buffer, (error) => {
        if (error) return socket.destroy(error);
        socket.end();
      });
    });
    socket.once('close', (hadError) => {
      clearTimeout(timer);
      if (!hadError) resolve(`Dados ESC/POS enviados para ${ip}:${port}.`);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(simpleError(error));
    });
  });
}
