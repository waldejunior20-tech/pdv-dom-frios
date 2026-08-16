import { describe, expect, it } from 'vitest';
import { generateReceipt, generateTestReceipt } from './receipt';
import type { SalePrintData } from './types';

const sale: SalePrintData = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-08-16T12:00:00.000Z',
  customer: 'Cliente Teste',
  phone: '64999999999',
  address: 'Rua Principal, 100',
  neighborhood: 'Centro',
  orderType: 'entrega',
  items: [{ name: 'Mussarela Corlasa', quantity: 1.5, unit: 'kg', unitPrice: 38, discount: 2 }],
  subtotal: 57,
  discount: 2,
  fee: 3,
  total: 58,
  paymentMethod: 'pix',
  paymentStatus: 'confirmado',
  saleStatus: 'aprovado',
  notes: 'Entregar no portão lateral',
};

describe('generateReceipt', () => {
  it('gera recibo 80 mm com os dados essenciais', () => {
    const receipt = generateReceipt(sale, { paperWidth: 80, mode: 'complete', cut: 'partial', feedLines: 3 });
    const text = receipt.lines.map((line) => line.text).join('\n');
    expect(text).toContain('DO FRIOS');
    expect(text).toContain('PEDIDO 11111111');
    expect(text).toContain('Mussarela Corlasa');
    expect(text).toContain('TOTAL');
    expect(receipt.cut).toBe('partial');
    expect(receipt.feedLines).toBe(3);
  });

  it('omite observações no modo resumido', () => {
    const receipt = generateReceipt(sale, { paperWidth: 80, mode: 'summary', cut: 'none', feedLines: 0 });
    expect(receipt.lines.map((line) => line.text).join('\n')).not.toContain('Entregar no portão lateral');
  });
});

describe('generateTestReceipt', () => {
  it('gera o comprovante de teste solicitado', () => {
    const receipt = generateTestReceipt(
      'Impressora da cozinha',
      'Fila GS_T80E',
      80,
      'partial',
      3,
      new Date('2026-08-16T12:00:00Z'),
    );
    const text = receipt.lines.map((line) => line.text).join('\n');
    expect(text).toContain('TESTE DE IMPRESSAO');
    expect(text).toContain('Impressora da cozinha');
    expect(text).toContain('Status: OK');
    expect(receipt.feedLines).toBe(3);
  });
});
