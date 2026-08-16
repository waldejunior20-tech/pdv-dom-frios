import { createServer } from "node:http";
import { hostname } from "node:os";
import { createClient } from "@supabase/supabase-js";
import { receiptToEscPos } from "./escpos.js";
import { sendCups, sendTcp, type Printer } from "./adapters.js";
import { discoverPrinters } from "./discovery.js";
import { getInstallationId } from "./installation.js";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} é obrigatório`);
  return value;
};
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY
    ? createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_PUBLISHABLE_KEY,
      )
    : null;
const interval = Math.max(500, Number(process.env.POLL_INTERVAL_MS || 1500));
const agentVersion = "0.2.0";
let working = false;
let agentId: string | null = null;
let discoveredCount = 0;
let lastDiscoveryError: string | null = null;

async function login() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithPassword({
    email: required("PDV_EMAIL"),
    password: required("PDV_PASSWORD"),
  });
  if (error) throw error;
}
async function syncDiscovery() {
  if (!supabase) return;
  const installationId = await getInstallationId();
  const { data, error } = await supabase.rpc("register_print_agent", {
    p_installation_id: installationId,
    p_computer_name: process.env.AGENT_NAME || hostname(),
    p_platform: process.platform,
    p_agent_version: agentVersion,
  });
  if (error) throw error;
  agentId = data as string;
  const queues = await discoverPrinters();
  const { error: syncError } = await supabase.rpc("sync_discovered_printers", {
    p_agent_id: agentId,
    p_queues: queues,
  });
  if (syncError) throw syncError;
  discoveredCount = queues.length;
  lastDiscoveryError = null;
}
async function poll() {
  if (working || !agentId || !supabase) return;
  working = true;
  try {
    const { data: jobs, error } = await supabase
      .from("print_jobs")
      .select("*,printers(*)")
      .or(
        `state.eq.pending,and(state.eq.processing,updated_at.lt.${new Date(Date.now() - 300_000).toISOString()})`,
      )
      .or(
        `next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`,
      )
      .or(`agent_id.eq.${agentId},agent_id.is.null`)
      .order("created_at")
      .limit(5);
    if (error) throw error;
    for (const job of jobs ?? []) {
      if (job.attempt_count >= job.max_attempts) continue;
      const printer = job.printers as Printer & {
        id: string;
        paper_width: number;
        cut_type: "partial" | "full" | "none";
        feed_lines: number;
      };
      const { data: claimed, error: claimError } = await supabase.rpc(
        "claim_print_job",
        { p_job_id: job.id },
      );
      if (claimError) throw claimError;
      if (!claimed) continue;
      await supabase
        .from("print_jobs")
        .update({ attempt_count: job.attempt_count + 1 })
        .eq("id", job.id);
      const started = Date.now();
      try {
        const options = job.receipt_payload.printOptions;
        const bytes = receiptToEscPos(
          job.receipt_payload,
          options?.cutType ?? printer.cut_type,
          options?.feedLines ?? printer.feed_lines,
          printer.paper_width,
        );
        for (let copy = 0; copy < job.copies; copy++)
          await (printer.connection_mode === "network"
            ? sendTcp(printer, bytes)
            : sendCups(printer, bytes));
        await supabase
          .from("print_jobs")
          .update({
            state: "completed",
            completed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", job.id);
        await supabase
          .from("printers")
          .update({
            status: "available",
            status_message: null,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", printer.id);
        await supabase.from("print_attempts").insert({
          job_id: job.id,
          printer_id: printer.id,
          attempt_no: job.attempt_count + 1,
          state: "completed",
          agent_os: process.platform,
          agent_version: agentVersion,
          result_code: "ok",
          result_message: `${Date.now() - started}ms`,
          finished_at: new Date().toISOString(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const exhausted = job.attempt_count + 1 >= job.max_attempts;
        await supabase
          .from("print_jobs")
          .update({
            state: exhausted ? "failed" : "pending",
            last_error: message,
            next_attempt_at: exhausted
              ? null
              : new Date(Date.now() + job.retry_interval_ms).toISOString(),
          })
          .eq("id", job.id);
        await supabase
          .from("printers")
          .update({ status: "disconnected", status_message: message })
          .eq("id", printer.id);
        await supabase.from("print_attempts").insert({
          job_id: job.id,
          printer_id: printer.id,
          attempt_no: job.attempt_count + 1,
          state: "failed",
          agent_os: process.platform,
          agent_version: agentVersion,
          result_code: "print_error",
          result_message: message,
          finished_at: new Date().toISOString(),
        });
      }
    }
  } finally {
    working = false;
  }
}

await login();
await syncDiscovery().catch((error) => {
  lastDiscoveryError = error instanceof Error ? error.message : String(error);
  console.error("Falha ao descobrir impressoras:", lastDiscoveryError);
});
setInterval(
  () =>
    void syncDiscovery().catch((error) => {
      lastDiscoveryError =
        error instanceof Error ? error.message : String(error);
      console.error("Falha ao atualizar impressoras:", lastDiscoveryError);
    }),
  60_000,
);
setInterval(() => void poll().catch(console.error), interval);
void poll();
const defaultOrigins = [
  "https://pdv-dom-frios.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const allowedOrigins = new Set([
  ...defaultOrigins,
  ...(process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean),
]);

createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    response.statusCode = 403;
    return response.end(JSON.stringify({ error: "origin_not_allowed" }));
  }
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Content-Type", "application/json");
  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    return response.end();
  }
  if (request.url === "/health")
    response.end(
      JSON.stringify({
        ok: true,
        working,
        agentId,
        discoveredCount,
        lastDiscoveryError,
      }),
    );
  else if (request.url === "/printers" && request.method === "GET") {
    try {
      const printers = await discoverPrinters();
      response.end(JSON.stringify({ printers }));
    } catch (error) {
      response.statusCode = 503;
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  } else {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  }
}).listen(Number(process.env.AGENT_PORT || 17891), "127.0.0.1");
console.log("Agente Dom Frios ativo em 127.0.0.1");
