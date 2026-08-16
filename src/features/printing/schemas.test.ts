import { describe, expect, it } from 'vitest';
import { PrinterDraftSchema, validateIpv4 } from './schemas';

const base = {
  friendly_name: 'Cozinha',
  model: 'GS-T80E',
  paper_width: 80 as const,
  connection_mode: 'network' as const,
  system_queue: null,
  ip: '192.168.18.100',
  port: 9100,
  timeout_ms: 3000,
  retry_count: 2,
  cut_type: 'partial' as const,
  feed_lines: 3,
  enabled: true,
  destinations: ['cozinha' as const],
};

describe('validação de impressora', () => {
  it('aceita o IP da GS-T80E', () => {
    expect(validateIpv4('192.168.18.100')).toBe(true);
    expect(PrinterDraftSchema.safeParse(base).success).toBe(true);
  });

  it('rejeita IP inválido', () => {
    expect(validateIpv4('192.168.18.999')).toBe(false);
    expect(PrinterDraftSchema.safeParse({ ...base, ip: '192.168.18.999' }).success).toBe(false);
  });

  it('rejeita porta fora da faixa', () => {
    expect(PrinterDraftSchema.safeParse({ ...base, port: 70000 }).success).toBe(false);
  });
});
