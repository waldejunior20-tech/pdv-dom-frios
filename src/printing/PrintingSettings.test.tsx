// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PrintingSettings } from "./PrintingSettings";
import { defaultSettings } from "./service";

vi.mock("./service", async (importOriginal) => {
  const original = await importOriginal<typeof import("./service")>();
  return {
    ...original,
    loadPrinting: vi.fn(async () => ({
      settings: defaultSettings("00000000-0000-0000-0000-000000000001"),
      printers: [],
    })),
    loadPrintJobs: vi.fn(async () => []),
  };
});

describe("PrintingSettings", () => {
  it("abre um formulário visível ao pressionar Adicionar", async () => {
    const user = userEvent.setup();
    render(
      <PrintingSettings
        ownerId="00000000-0000-0000-0000-000000000001"
        onBack={() => undefined}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /adicionar/i }));

    expect(
      screen.getByRole("dialog", { name: /adicionar impressora/i }).hidden,
    ).toBe(false);
    expect(screen.getByLabelText(/nome amigável/i).hidden).toBe(false);
  });
});
