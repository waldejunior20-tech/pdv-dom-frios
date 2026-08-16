import { z } from 'zod';

const ipv4 = z.string().trim().refine((value) => {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}, 'Informe um IPv4 válido, por exemplo 192.168.18.100.');

export const PrintSettingsSchema = z.object({
  auto_print: z.boolean(),
  print_when: z.enum(['received', 'approved', 'payment_confirmed', 'manual']),
  auto_approve: z.boolean(),
  confirm_reprint: z.boolean(),
  auto_reprint_on_edit: z.boolean(),
  share_across_devices: z.boolean(),
  copies: z.number().int().min(1).max(10),
  receipt_mode: z.enum(['complete', 'summary']),
  auto_cut: z.boolean(),
  cut_type: z.enum(['partial', 'full', 'none']),
  feed_lines: z.number().int().min(0).max(12),
});

export const PrinterDraftSchema = z
  .object({
    id: z.string().uuid().optional(),
    friendly_name: z.string().trim().min(1, 'Informe um nome para a impressora.').max(80),
    model: z.string().trim().max(120).nullable().optional(),
    paper_width: z.union([z.literal(58), z.literal(80)]),
    connection_mode: z.enum(['system', 'network']),
    system_queue: z.string().trim().max(180).nullable().optional(),
    ip: z.string().trim().nullable().optional(),
    port: z.number().int().min(1).max(65535).nullable().optional(),
    timeout_ms: z.number().int().min(500).max(30000),
    retry_count: z.number().int().min(0).max(5),
    cut_type: z.enum(['partial', 'full', 'none']),
    feed_lines: z.number().int().min(0).max(12),
    enabled: z.boolean(),
    destinations: z.array(z.enum(['cozinha', 'balcao', 'caixa', 'entrega', 'bebidas', 'todos'])).min(1),
  })
  .superRefine((printer, ctx) => {
    if (printer.connection_mode === 'system') {
      if (!printer.system_queue) {
        ctx.addIssue({ code: 'custom', path: ['system_queue'], message: 'Selecione a fila instalada no sistema.' });
      }
      return;
    }

    const parsedIp = ipv4.safeParse(printer.ip ?? '');
    if (!parsedIp.success) {
      ctx.addIssue({ code: 'custom', path: ['ip'], message: parsedIp.error.issues[0]?.message ?? 'IP inválido.' });
    }
    if (!printer.port) {
      ctx.addIssue({ code: 'custom', path: ['port'], message: 'Informe a porta da impressora.' });
    }
  });

export const AgentPrinterSchema = z.object({
  id: z.string().uuid().optional(),
  friendly_name: z.string().min(1).max(80),
  model: z.string().nullable().optional(),
  paper_width: z.union([z.literal(58), z.literal(80)]),
  connection_mode: z.enum(['system', 'network']),
  system_queue: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  timeout_ms: z.number().int().min(500).max(30000),
  retry_count: z.number().int().min(0).max(5),
  cut_type: z.enum(['partial', 'full', 'none']),
  feed_lines: z.number().int().min(0).max(12),
});

export function validateIpv4(value: string) {
  return ipv4.safeParse(value).success;
}
