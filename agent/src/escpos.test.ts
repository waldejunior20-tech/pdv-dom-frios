import { describe, expect, it } from 'vitest';
import { buildEscPos } from './escpos.js';

describe('ESC/POS', () => {
  it('emite avanço de 3 linhas e corte parcial', () => {
    const bytes = buildEscPos({
      title: 'Teste',
      paperWidth: 80,
      lines: [{ text: 'DO FRIOS', align: 'center', bold: true }],
      cut: 'partial',
      feedLines: 3,
    });
    expect(bytes.includes(Buffer.from([0x1b, 0x64, 0x03]))).toBe(true);
    expect(bytes.subarray(bytes.length - 3).equals(Buffer.from([0x1d, 0x56, 0x01]))).toBe(true);
  });

  it('não emite comando de corte quando desativado', () => {
    const bytes = buildEscPos({
      title: 'Teste',
      paperWidth: 80,
      lines: [{ text: 'DO FRIOS' }],
      cut: 'none',
      feedLines: 0,
    });
    expect(bytes.includes(Buffer.from([0x1d, 0x56, 0x01]))).toBe(false);
    expect(bytes.includes(Buffer.from([0x1d, 0x56, 0x00]))).toBe(false);
  });
});
