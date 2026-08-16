import { describe, expect, it } from 'vitest';
import { classifyPrintError } from './executor.js';

function err(code: string, message = 'raw') {
  return Object.assign(new Error(message), { code });
}

describe('classifyPrintError', () => {
  it('traduz IP inacessível/timeout para mensagem simples', () => {
    expect(classifyPrintError(err('ETIMEDOUT')).message).toContain('não respondeu');
  });

  it('traduz porta fechada', () => {
    expect(classifyPrintError(err('ECONNREFUSED')).message).toContain('porta');
  });

  it('traduz fila offline', () => {
    expect(classifyPrintError(err('QUEUE_OFFLINE')).message).toContain('fila instalada');
  });
});
