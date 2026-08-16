import { z } from "zod";

export const CartItemSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  discount: z.number().min(0),
  total: z.number().min(0),
  requestId: z.string().uuid(),
});

export const SaleSchema = z
  .object({
    saleId: z.string().uuid(),
    customer: z.string().min(1),
    payment: z.enum(["Pix", "Dinheiro", "Cartão", "Prazo"]),
    items: z.array(CartItemSchema).min(1),
  })
  .superRefine((sale, ctx) => {
    sale.items.forEach((item, index) => {
      const subtotal = item.quantity * item.unitPrice;
      if (item.discount > subtotal) {
        ctx.addIssue({
          code: "custom",
          path: ["items", index, "discount"],
          message: "O desconto não pode ultrapassar o subtotal do item.",
        });
      }
    });
  });

export type Sale = z.infer<typeof SaleSchema>;
export type CartItem = z.infer<typeof CartItemSchema>;
