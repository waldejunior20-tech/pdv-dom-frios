type Receipt = {
  saleId: string;
  customer: string;
  payment: string;
  createdAt: string;
  total: number;
  mode: "complete" | "summary";
  printOptions?: { cutType: "partial" | "full" | "none"; feedLines: number };
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
  }>;
};
const money = (value: number) => `R$ ${value.toFixed(2).replace(".", ",")}`;
const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
const line = (left: string, right = "", width = 48) =>
  plain(left)
    .slice(0, Math.max(0, width - right.length - 1))
    .padEnd(Math.max(0, width - right.length)) + right;

export function receiptToEscPos(
  receipt: Receipt,
  cut: "partial" | "full" | "none",
  feedLines: number,
  paperWidth: number,
) {
  const width = paperWidth === 58 ? 32 : 48;
  const chunks: Buffer[] = [
    Buffer.from([0x1b, 0x40]),
    Buffer.from([0x1b, 0x61, 0x01]),
    Buffer.from([0x1b, 0x45, 0x01]),
    Buffer.from("DOM FRIOS\n"),
    Buffer.from([0x1b, 0x45, 0x00]),
    Buffer.from([0x1b, 0x61, 0x00]),
  ];
  const body = [
    line(`PEDIDO ${receipt.saleId.slice(0, 8)}`, "", width),
    line(new Date(receipt.createdAt).toLocaleString("pt-BR"), "", width),
    "-".repeat(width),
    line(`Cliente: ${receipt.customer}`, "", width),
    line(`Pagamento: ${receipt.payment}`, "", width),
    "-".repeat(width),
  ];
  for (const item of receipt.items) {
    body.push(line(item.name, money(item.total), width));
    if (receipt.mode === "complete")
      body.push(
        line(
          `  ${item.quantity.toFixed(3)} ${item.unit} x ${money(item.unitPrice)}`,
          "",
          width,
        ),
      );
  }
  body.push(
    "-".repeat(width),
    line("TOTAL", money(receipt.total), width),
    "",
    "Obrigado!",
  );
  chunks.push(Buffer.from(plain(body.join("\n") + "\n")));
  chunks.push(Buffer.from("\n".repeat(Math.max(0, Math.min(12, feedLines)))));
  if (cut !== "none")
    chunks.push(
      Buffer.from(cut === "partial" ? [0x1d, 0x56, 0x01] : [0x1d, 0x56, 0x00]),
    );
  return Buffer.concat(chunks);
}
