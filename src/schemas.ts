import { z } from 'zod';

export const CartItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  unit: z.string().trim().min(1).max(16),
  quantity: z.number().positive().max(100000),
  unitPrice: z.number().positive().max(1000000),
  discount: z.number().min(0).max(1000000),
  total: z.number().min(0).max(100000000),
  requestId: z.string().uuid(),
});

export const SaleSchema = z
  .object({
    saleId: z.string().uuid(),
    customer: z.string().trim().min(1).max(120),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(240).optional(),
    orderType: z.enum(['retirada', 'entrega', 'mesa']).default('retirada'),
    table: z.string().trim().max(30).optional(),
    fee: z.number().min(0).max(1000000).default(0),
    payment: z.enum(['Pix', 'Dinheiro', 'Cartão', 'Prazo']),
    items: z.array(CartItemSchema).min(1).max(200),
  })
  .superRefine((sale, ctx) => {
    sale.items.forEach((item, index) => {
      const subtotal = item.quantity * item.unitPrice;
      if (item.discount > subtotal) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'discount'],
          message: 'O desconto não pode ultrapassar o subtotal do item.',
        });
      }
    });
    if (sale.orderType === 'entrega' && !sale.address) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Informe o endereço para pedidos de entrega.' });
    }
    if (sale.orderType === 'mesa' && !sale.table) {
      ctx.addIssue({ code: 'custom', path: ['table'], message: 'Informe a mesa.' });
    }
  });

export type Sale = z.infer<typeof SaleSchema>;
export type CartItem = z.infer<typeof CartItemSchema>;
