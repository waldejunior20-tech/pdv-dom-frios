import { describe, expect, it } from 'vitest';
import {
  buildPrintIdempotencyKey,
  canTransitionJob,
  printEventForSale,
  requiresReprintConfirmation,
  shouldPrintForEvent,
} from './rules';
import type { PrintSettings, SalePrintData } from './types';

const defaultPrintSettings: PrintSettings = {
  auto_print: true,
  print_when: 'payment_confirmed',
  auto_approve: true,
  confirm_reprint: true,
  auto_reprint_on_edit: false,
  share_across_devices: true,
  copies: 1,
  receipt_mode: 'complete',
  auto_cut: true,
  cut_type: 'partial',
  feed_lines: 3,
};

const sale: SalePrintData = {
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: new Date().toISOString(),
  customer: 'Teste',
  orderType: 'retirada',
  items: [{ name: 'Bacon', quantity: 1, unit: 'kg', unitPrice: 28, discount: 0 }],
  subtotal: 28,
  discount: 0,
  fee: 0,
  total: 28,
  paymentMethod: 'pix',
  paymentStatus: 'confirmado',
  saleStatus: 'aprovado',
};

describe('regras de impressão', () => {
  it('não imprime antes da confirmação quando a regra é pagamento confirmado', () => {
    const pending = { ...sale, paymentStatus: 'pendente' as const };
    expect(printEventForSale(defaultPrintSettings, pending)).toBeNull();
    expect(shouldPrintForEvent(defaultPrintSettings, 'payment_confirmed', pending)).toBe(false);
  });

  it('imprime quando o pagamento é confirmado', () => {
    expect(printEventForSale(defaultPrintSettings, sale)).toBe('payment_confirmed');
  });

  it('gera chave idempotente estável para a mesma venda/impressora/revisão', () => {
    const params = {
      saleId: sale.id,
      printerId: '22222222-2222-4222-8222-222222222222',
      origin: 'automatic' as const,
      revision: 1,
    };
    expect(buildPrintIdempotencyKey(params)).toBe(buildPrintIdempotencyKey(params));
  });

  it('exige confirmação de reimpressão quando configurado', () => {
    expect(requiresReprintConfirmation(defaultPrintSettings, true)).toBe(true);
    expect(requiresReprintConfirmation({ ...defaultPrintSettings, confirm_reprint: false }, true)).toBe(false);
  });

  it('habilita reimpressão automática em edição somente quando configurado', () => {
    expect(shouldPrintForEvent(defaultPrintSettings, 'edited', sale)).toBe(false);
    expect(shouldPrintForEvent({ ...defaultPrintSettings, auto_reprint_on_edit: true }, 'edited', sale)).toBe(true);
  });

  it('bloqueia transições inválidas da fila', () => {
    expect(canTransitionJob('pending', 'processing')).toBe(true);
    expect(canTransitionJob('completed', 'processing')).toBe(false);
  });
});
