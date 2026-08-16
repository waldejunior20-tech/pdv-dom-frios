import { describe, expect, it } from "vitest";
import { defaultSettings, makeReceipt } from "./service";

describe("printing service", () => {
  it("uses the GS-T80E safe defaults", () => {
    expect(defaultSettings("owner")).toMatchObject({
      copies: 1,
      cut_type: "partial",
      feed_lines: 3,
      receipt_mode: "complete",
    });
  });
  it("creates a stable receipt total", () => {
    const receipt = makeReceipt(
      "sale",
      "Balcão",
      "Pix",
      [
        {
          productId: crypto.randomUUID(),
          requestId: crypto.randomUUID(),
          name: "Queijo",
          unit: "kg",
          quantity: 2,
          unitPrice: 10,
          discount: 0,
          total: 20,
        },
      ],
      "complete",
    );
    expect(receipt.total).toBe(20);
  });
});
