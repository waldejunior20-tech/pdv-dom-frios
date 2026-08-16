import { describe, expect, it } from "vitest";
import { receiptToEscPos } from "./escpos.js";
describe("ESC/POS", () => {
  it("adds partial cut after three feeds", () => {
    const bytes = receiptToEscPos(
      {
        saleId: "12345678",
        customer: "João",
        payment: "Pix",
        createdAt: "2026-08-16T12:00:00Z",
        total: 10,
        mode: "complete",
        items: [],
      },
      "partial",
      3,
      80,
    );
    expect(bytes.subarray(-3)).toEqual(Buffer.from([0x1d, 0x56, 0x01]));
    expect(bytes.toString("ascii")).toContain("DOM FRIOS");
  });
});
