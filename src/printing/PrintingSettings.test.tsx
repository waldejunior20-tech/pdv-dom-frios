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
    loadDiscoveredPrinters: vi.fn(async () => []),
    loadLocalSystemPrinters: vi.fn(async () => [
      {
        queue_name: "GS_T80E",
        display_name: "GS_T80E",
        driver_name: "POS-80",
        device_uri: "socket://192.168.18.100:9100",
        host: "192.168.18.100",
        port: 9100,
        status: "available",
        is_default: true,
      },
    ]),
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

    expect(
      await screen.findByRole("button", { name: /limpar testes/i }),
    ).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /adicionar/i }));

    expect(
      screen.getByRole("dialog", { name: /adicionar impressora/i }).hidden,
    ).toBe(false);
    expect(screen.queryByLabelText(/endereço ip/i)).toBeNull();
    expect(screen.queryByLabelText(/porta/i)).toBeNull();
    expect(
      (screen.getByLabelText(/^impressora$/i) as HTMLSelectElement).value,
    ).toBe("GS_T80E");
  });
});
