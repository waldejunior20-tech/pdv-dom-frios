import { describe, expect, it } from "vitest";
import { parseCupsDiscovery, parseWindowsDiscovery } from "./discovery.js";

describe("printer discovery", () => {
  it("combines installed CUPS queues, devices and state", () => {
    const rows = parseCupsDiscovery({
      queues: "GS_T80E\nCozinha\n",
      devices:
        "device for GS_T80E: socket://192.168.18.100:9100\n" +
        "device for Cozinha: ipp://printer.local/ipp/print\n",
      states:
        "printer GS_T80E is idle. enabled since Sun 16 Aug 2026\n" +
        "printer Cozinha disabled since Sun 16 Aug 2026\n",
      defaultQueue: "system default destination: GS_T80E\n",
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      queue_name: "GS_T80E",
      device_uri: "socket://192.168.18.100:9100",
      host: "192.168.18.100",
      port: 9100,
      status: "available",
      is_default: true,
    });
    expect(rows[1].status).toBe("error");
  });

  it("understands the localized Portuguese CUPS output from macOS", () => {
    const rows = parseCupsDiscovery({
      queues: "GS_T80E\n",
      devices: "dispositivo para GS_T80E: socket://192.168.18.100:9100\n",
      states:
        "impressora GS_T80E está ociosa. ativada desde Sun Aug 16 08:11:07 2026\n",
      defaultQueue: "destino padrão de sistema: GS_T80E\n",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      queue_name: "GS_T80E",
      device_uri: "socket://192.168.18.100:9100",
      status: "available",
      is_default: true,
    });
  });

  it("normalizes multiple Windows spooler queues", () => {
    const rows = parseWindowsDiscovery(
      JSON.stringify([
        {
          Name: "GS-T80E",
          DriverName: "POS-80 1.2",
          PortName: "IP_192.168.18.100",
          PrinterStatus: "Normal",
          HostAddress: "192.168.18.100",
          PortNumber: 9100,
        },
        {
          Name: "Balcao",
          DriverName: "Generic / Text Only",
          PortName: "USB001",
          PrinterStatus: "Offline",
        },
        {
          Name: "Cozinha",
          DriverName: "Generic / Text Only",
          PortName: "WSD-123",
          PrinterStatus: "Normal",
        },
      ]),
    );

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ host: "192.168.18.100", port: 9100 });
    expect(rows[1].status).toBe("disconnected");
    expect(new Set(rows.map((row) => row.queue_name)).size).toBe(3);
  });
});
