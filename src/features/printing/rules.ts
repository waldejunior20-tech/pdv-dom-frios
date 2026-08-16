import type { PrintJobState, PrintOrigin, PrintSettings, SalePrintData } from './types';

export type PrintEvent = 'received' | 'approved' | 'payment_confirmed' | 'edited';

export function shouldPrintForEvent(settings: PrintSettings, event: PrintEvent, sale: SalePrintData) {
  if (!settings.auto_print || settings.print_when === 'manual') return false;
  if (event === 'edited') return settings.auto_reprint_on_edit;
  if (settings.print_when !== event) return false;
  if (event === 'approved' && sale.saleStatus !== 'aprovado') return false;
  if (event === 'payment_confirmed' && sale.paymentStatus !== 'confirmado') return false;
  return true;
}

export function printEventForSale(settings: PrintSettings, sale: SalePrintData): PrintEvent | null {
  if (!settings.auto_print || settings.print_when === 'manual') return null;
  if (settings.print_when === 'received') return 'received';
  if (settings.print_when === 'approved') return sale.saleStatus === 'aprovado' ? 'approved' : null;
  if (settings.print_when === 'payment_confirmed') {
    return sale.paymentStatus === 'confirmado' ? 'payment_confirmed' : null;
  }
  return null;
}

export function requiresReprintConfirmation(settings: PrintSettings, alreadyPrinted: boolean) {
  return alreadyPrinted && settings.confirm_reprint;
}

export function buildPrintIdempotencyKey(params: {
  saleId?: string | null;
  printerId: string;
  origin: PrintOrigin;
  revision?: number;
  testNonce?: string;
}) {
  if (params.origin === 'test') {
    return `test:${params.printerId}:${params.testNonce ?? crypto.randomUUID()}`;
  }
  return `${params.saleId}:${params.printerId}:${params.origin}:r${params.revision ?? 1}`;
}

const transitions: Record<PrintJobState, PrintJobState[]> = {
  pending: ['processing', 'failed'],
  processing: ['pending', 'completed', 'failed'],
  completed: [],
  failed: ['pending'],
};

export function canTransitionJob(from: PrintJobState, to: PrintJobState) {
  return transitions[from].includes(to);
}
