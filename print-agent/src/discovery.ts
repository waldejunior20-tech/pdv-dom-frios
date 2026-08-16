import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const run = promisify(execFile);

export type DiscoveredQueue = {
  queue_name: string;
  display_name: string;
  driver_name: string | null;
  device_uri: string | null;
  port_name: string | null;
  host: string | null;
  port: number | null;
  status: "available" | "disconnected" | "error" | "unknown";
  status_reasons: string[];
  is_default: boolean;
  kind: "printer" | "class";
  fingerprint: string;
  fingerprint_strength: "strong" | "weak";
};

function endpoint(uri: string | null) {
  if (!uri) return { host: null, port: null };
  try {
    const parsed = new URL(uri);
    return {
      host: parsed.hostname || null,
      port: parsed.port
        ? Number(parsed.port)
        : parsed.protocol === "socket:"
          ? 9100
          : null,
    };
  } catch {
    return { host: null, port: null };
  }
}

function fingerprint(
  queue: Omit<DiscoveredQueue, "fingerprint" | "fingerprint_strength">,
) {
  const strong = Boolean(queue.device_uri || queue.host);
  const identity =
    queue.device_uri ||
    `${process.platform}:${queue.queue_name}:${queue.port_name || ""}`;
  return {
    fingerprint: createHash("sha256")
      .update(identity.toLowerCase())
      .digest("hex"),
    fingerprint_strength: strong ? ("strong" as const) : ("weak" as const),
  };
}

export function parseCupsDiscovery(input: {
  queues: string;
  devices: string;
  states: string;
  defaultQueue: string;
}): DiscoveredQueue[] {
  const devices = new Map<string, string>();
  for (const line of input.devices.split("\n")) {
    const match = line.match(/^device for ([^:]+):\s+(.+)$/);
    if (match) devices.set(match[1], match[2].trim());
  }
  const states = new Map<string, DiscoveredQueue["status"]>();
  for (const line of input.states.split("\n")) {
    const match = line.match(/^printer (\S+)\s+(.+)$/);
    if (!match) continue;
    states.set(
      match[1],
      /disabled|stopped/i.test(match[2])
        ? "error"
        : /idle|printing/i.test(match[2])
          ? "available"
          : "unknown",
    );
  }
  const defaultName = input.defaultQueue.match(/:\s*(\S+)/)?.[1];
  return input.queues
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((queueName) => {
      const deviceUri = devices.get(queueName) || null;
      const address = endpoint(deviceUri);
      const row = {
        queue_name: queueName,
        display_name: queueName,
        driver_name: null,
        device_uri: deviceUri,
        port_name: null,
        ...address,
        status: states.get(queueName) || ("unknown" as const),
        status_reasons: [],
        is_default: queueName === defaultName,
        kind: "printer" as const,
      };
      return { ...row, ...fingerprint(row) };
    });
}

type WindowsPrinter = {
  Name: string;
  DriverName?: string;
  PortName?: string;
  PrinterStatus?: string | number;
  HostAddress?: string;
  PortNumber?: number;
  Default?: boolean;
  Type?: string;
};

export function parseWindowsDiscovery(json: string): DiscoveredQueue[] {
  const parsed = JSON.parse(json) as WindowsPrinter | WindowsPrinter[];
  return (Array.isArray(parsed) ? parsed : [parsed])
    .filter(Boolean)
    .map((item) => {
      const statusText = String(item.PrinterStatus ?? "").toLowerCase();
      const status: DiscoveredQueue["status"] =
        /offline|not available|error/.test(statusText)
          ? "disconnected"
          : /normal|idle|printing/.test(statusText)
            ? "available"
            : "unknown";
      const deviceUri = item.HostAddress
        ? `socket://${item.HostAddress}:${item.PortNumber || 9100}`
        : null;
      const row = {
        queue_name: item.Name,
        display_name: item.Name,
        driver_name: item.DriverName || null,
        device_uri: deviceUri,
        port_name: item.PortName || null,
        host: item.HostAddress || null,
        port: item.HostAddress ? item.PortNumber || 9100 : null,
        status,
        status_reasons: status === "disconnected" ? [statusText] : [],
        is_default: Boolean(item.Default),
        kind:
          item.Type === "Connection"
            ? ("class" as const)
            : ("printer" as const),
      };
      return { ...row, ...fingerprint(row) };
    });
}

export async function discoverPrinters(): Promise<DiscoveredQueue[]> {
  if (process.platform === "win32") {
    const script = [
      "$ports=@{}; Get-PrinterPort | ForEach-Object { $ports[$_.Name]=$_ }",
      "Get-Printer -Full | ForEach-Object { $p=$ports[$_.PortName]; [pscustomobject]@{ Name=$_.Name; DriverName=$_.DriverName; PortName=$_.PortName; PrinterStatus=$_.PrinterStatus.ToString(); Type=$_.Type.ToString(); HostAddress=$p.PrinterHostAddress; PortNumber=$p.PortNumber } } | ConvertTo-Json -Compress",
    ].join("; ");
    const { stdout } = await run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        timeout: 8_000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
      },
    );
    return stdout.trim() ? parseWindowsDiscovery(stdout) : [];
  }
  const options = {
    timeout: 5_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, LC_ALL: "C" },
  };
  const [devices, states, defaultQueue] = await Promise.all([
    run("lpstat", ["-v"], options),
    run("lpstat", ["-p"], options),
    run("lpstat", ["-d"], options).catch(() => ({ stdout: "" })),
  ]);
  const installedQueues = states.stdout
    .split("\n")
    .map((line) => line.match(/^printer (\S+)/)?.[1])
    .filter((queue): queue is string => Boolean(queue))
    .join("\n");
  return parseCupsDiscovery({
    queues: installedQueues,
    devices: devices.stdout,
    states: states.stdout,
    defaultQueue: defaultQueue.stdout,
  });
}
