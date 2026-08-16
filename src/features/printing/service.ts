import { executePrintJob } from './agentClient';
import { generateReceipt, generateTestReceipt } from './receipt';
import { createPrintJob, getPrintSettings, listPrinters, loadSalePrintData } from './repository';
import { buildPrintIdempotencyKey, printEventForSale } from './rules';
import type { PrintOrigin, PrinterRecord, SalePrintData } from './types';

function cutForPrinter(printer: PrinterRecord, settingsCut: PrinterRecord['cut_type'], autoCut: boolean) {
  if (!autoCut) return 'none' as const;
  return printer.cut_type === 'none' ? settingsCut : printer.cut_type;
}

export async function printSale(params: {
  sale: SalePrintData;
  accessToken: string;
  origin: PrintOrigin;
  revision?: number;
}) {
  const [settings, printers] = await Promise.all([getPrintSettings(), listPrinters()]);
  const enabled = printers.filter((printer) => printer.enabled);
  if (!enabled.length) {
    return { jobs: 0, completed: 0, pending: 0, failed: 0, message: 'Nenhuma impressora ativa.' };
  }

  let completed = 0;
  let pending = 0;
  let failed = 0;

  for (const printer of enabled) {
    const payload = generateReceipt(params.sale, {
      paperWidth: printer.paper_width,
      mode: settings.receipt_mode,
      cut: cutForPrinter(printer, settings.cut_type, settings.auto_cut),
      feedLines: printer.feed_lines,
    });
    const job = await createPrintJob({
      vendaId: params.sale.id,
      printerId: printer.id,
      idempotencyKey: buildPrintIdempotencyKey({
        saleId: params.sale.id,
        printerId: printer.id,
        origin: params.origin,
        revision: params.revision,
      }),
      origin: params.origin,
      payload,
      copies: settings.copies,
      maxAttempts: Math.max(1, printer.retry_count + 1),
    });

    if (job.state === 'completed') {
      completed += 1;
      continue;
    }

    try {
      const result = await executePrintJob(params.accessToken, job.id);
      if (result.state === 'completed') completed += 1;
      else if (result.state === 'processing') pending += 1;
      else failed += 1;
    } catch {
      pending += 1;
    }
  }

  return {
    jobs: enabled.length,
    completed,
    pending,
    failed,
    message: pending
      ? 'Venda salva. Há impressão pendente ou em processamento.'
      : failed
        ? 'Venda salva, mas uma impressão falhou.'
        : 'Venda salva e impressão processada.',
  };
}

export async function maybeAutoPrintSale(vendaId: string, accessToken: string) {
  const [settings, sale] = await Promise.all([getPrintSettings(), loadSalePrintData(vendaId)]);
  const event = printEventForSale(settings, sale);
  if (!event) return { attempted: false, message: 'Venda salva.' };
  const result = await printSale({ sale, accessToken, origin: 'automatic' });
  return { attempted: true, ...result };
}

export async function printSaleManually(vendaId: string, accessToken: string, revision = Date.now()) {
  const sale = await loadSalePrintData(vendaId);
  return printSale({ sale, accessToken, origin: 'manual', revision });
}

export async function printTest(printer: PrinterRecord, accessToken: string) {
  const settings = await getPrintSettings();
  const payload = generateTestReceipt(
    printer.friendly_name,
    printer.connection_mode === 'network' ? `Rede ${printer.ip}:${printer.port}` : `Fila ${printer.system_queue}`,
    printer.paper_width,
    settings.auto_cut ? printer.cut_type : 'none',
    printer.feed_lines,
  );
  const job = await createPrintJob({
    printerId: printer.id,
    idempotencyKey: buildPrintIdempotencyKey({
      printerId: printer.id,
      origin: 'test',
      testNonce: crypto.randomUUID(),
    }),
    origin: 'test',
    payload,
    copies: 1,
    maxAttempts: Math.max(1, printer.retry_count + 1),
  });
  return executePrintJob(accessToken, job.id);
}
