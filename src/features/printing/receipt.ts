import type { ReceiptLine, ReceiptMode, ReceiptPayload, SalePrintData } from './types';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function widthForPaper(paperWidth: 58 | 80) {
  return paperWidth === 58 ? 32 : 42;
}

function clean(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrap(text: string, width: number) {
  const normalized = clean(text);
  if (!normalized) return [];
  const words = normalized.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word.length > width ? word.slice(0, width) : word;
      continue;
    }
    if (`${current} ${word}`.length <= width) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word.length > width ? word.slice(0, width) : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function divider(width: number) {
  return '-'.repeat(width);
}

function labelValue(label: string, value: string, width: number): ReceiptLine[] {
  const prefix = `${label}: `;
  const available = Math.max(8, width - prefix.length);
  const wrapped = wrap(value, available);
  if (!wrapped.length) return [];
  return wrapped.map((line, index) => ({
    text: index === 0 ? `${prefix}${line}` : `${' '.repeat(prefix.length)}${line}`,
  }));
}

function itemLines(order: SalePrintData, mode: ReceiptMode, width: number): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  order.items.forEach((item) => {
    wrap(item.name, width).forEach((line, index) => lines.push({ text: line, bold: index === 0 }));
    const qty = item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    lines.push({
      text: `${qty} ${item.unit} x ${money.format(item.unitPrice)} = ${money.format(item.quantity * item.unitPrice - item.discount)}`,
    });
    if (mode === 'complete') {
      item.complements?.forEach((complement) =>
        wrap(`+ ${complement}`, width).forEach((text) => lines.push({ text })),
      );
      if (item.notes) {
        wrap(`OBS ITEM: ${item.notes}`, width).forEach((text) => lines.push({ text, bold: true }));
      }
    }
  });
  return lines;
}

export function generateReceipt(
  order: SalePrintData,
  options: { paperWidth: 58 | 80; mode: ReceiptMode; cut: ReceiptPayload['cut']; feedLines: number },
): ReceiptPayload {
  const width = widthForPaper(options.paperWidth);
  const lines: ReceiptLine[] = [
    { text: 'DO FRIOS', align: 'center', bold: true, size: 'double' },
    { text: `PEDIDO ${order.id.slice(0, 8).toUpperCase()}`, align: 'center', bold: true, size: 'double' },
    { text: dateTime.format(new Date(order.createdAt)), align: 'center' },
    { text: divider(width) },
    {
      text: `TIPO: ${order.orderType.toUpperCase()}${order.table ? ` - MESA ${clean(order.table)}` : ''}`,
      bold: true,
    },
    ...labelValue('Cliente', order.customer, width),
    ...labelValue('Telefone', order.phone ?? '', width),
  ];

  if (order.orderType === 'entrega') {
    lines.push(...labelValue('Endereco', order.address ?? '', width));
    lines.push(...labelValue('Bairro', order.neighborhood ?? '', width));
  }

  lines.push({ text: divider(width) }, ...itemLines(order, options.mode, width), { text: divider(width) });
  lines.push({ text: `Subtotal ${money.format(order.subtotal)}` });
  if (order.discount > 0) lines.push({ text: `Desconto -${money.format(order.discount)}` });
  if (order.fee > 0) lines.push({ text: `Taxa ${money.format(order.fee)}` });
  lines.push({ text: `TOTAL ${money.format(order.total)}`, bold: true, size: 'double' });
  lines.push({ text: `Pagamento: ${order.paymentMethod.toUpperCase()}` });
  lines.push({ text: `Situacao: ${order.paymentStatus.toUpperCase()}` });

  if (options.mode === 'complete' && order.notes) {
    lines.push({ text: divider(width) });
    wrap(`OBSERVACOES: ${order.notes}`, width).forEach((text) => lines.push({ text, bold: true }));
  }

  lines.push({ text: divider(width) });
  lines.push({ text: 'Conferir itens antes da saida', align: 'center' });

  return {
    title: `Pedido ${order.id.slice(0, 8).toUpperCase()}`,
    paperWidth: options.paperWidth,
    lines,
    cut: options.cut,
    feedLines: options.feedLines,
  };
}

export function generateTestReceipt(
  printerName: string,
  connection: string,
  paperWidth: 58 | 80,
  cut: ReceiptPayload['cut'],
  feedLines: number,
  now = new Date(),
): ReceiptPayload {
  const width = widthForPaper(paperWidth);
  return {
    title: 'Teste de impressão',
    paperWidth,
    cut,
    feedLines,
    lines: [
      { text: 'DO FRIOS', align: 'center', bold: true, size: 'double' },
      { text: 'TESTE DE IMPRESSAO', align: 'center', bold: true },
      { text: divider(width) },
      { text: `Impressora: ${clean(printerName)}` },
      { text: `Data: ${dateTime.format(now)}` },
      { text: `Papel: ${paperWidth} mm` },
      { text: `Conexao: ${clean(connection)}` },
      { text: 'Status: OK', bold: true },
      { text: divider(width) },
      { text: 'Impressora configurada com sucesso', align: 'center', bold: true },
    ],
  };
}
