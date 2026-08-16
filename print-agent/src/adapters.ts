import { createConnection } from "node:net";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Printer = {
  connection_mode: "system" | "network";
  system_queue: string | null;
  ip: string | null;
  port: number | null;
  timeout_ms: number;
};

export function sendTcp(printer: Printer, data: Buffer) {
  return new Promise<void>((resolve, reject) => {
    if (!printer.ip || !printer.port)
      return reject(new Error("IP/porta não configurados"));
    const socket = createConnection(
      { host: printer.ip, port: printer.port, timeout: printer.timeout_ms },
      () => socket.end(data),
    );
    socket.once("error", reject);
    socket.once("timeout", () =>
      socket.destroy(new Error("Tempo limite da impressora excedido")),
    );
    socket.once("close", (hadError) => {
      if (!hadError) resolve();
    });
  });
}

export async function sendCups(printer: Printer, data: Buffer) {
  if (
    !printer.system_queue ||
    !/^[A-Za-z0-9_.-]{1,127}$/.test(printer.system_queue)
  )
    throw new Error("Fila CUPS inválida");
  const dir = await mkdtemp(join(tmpdir(), "dom-frios-print-"));
  const file = join(dir, "receipt.bin");
  try {
    await writeFile(file, data);
    await new Promise<void>((resolve, reject) =>
      execFile(
        "lp",
        ["-d", printer.system_queue!, "-o", "raw", file],
        { timeout: printer.timeout_ms },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
