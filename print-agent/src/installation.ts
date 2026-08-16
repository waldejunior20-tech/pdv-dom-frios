import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

function configPath() {
  if (process.env.AGENT_STATE_FILE) return process.env.AGENT_STATE_FILE;
  if (process.platform === "win32")
    return join(
      process.env.APPDATA || homedir(),
      "Dom Frios",
      "print-agent.json",
    );
  if (process.platform === "darwin")
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Dom Frios",
      "print-agent.json",
    );
  return join(
    process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
    "dom-frios",
    "print-agent.json",
  );
}

export async function getInstallationId() {
  if (process.env.AGENT_INSTALLATION_ID)
    return process.env.AGENT_INSTALLATION_ID;
  const path = configPath();
  try {
    const stored = JSON.parse(await readFile(path, "utf8")) as {
      installationId?: string;
    };
    if (stored.installationId) return stored.installationId;
  } catch {
    // A primeira execução ainda não possui arquivo de identidade.
  }
  const installationId = randomUUID();
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify({ installationId }, null, 2), {
    mode: 0o600,
  });
  return installationId;
}
