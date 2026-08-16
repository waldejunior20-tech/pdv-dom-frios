import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { receiptToEscPos } from "./escpos.js";
import { sendCups, sendTcp, type Printer } from "./adapters.js";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} é obrigatório`);
  return value;
};
const supabase = createClient(
  required("SUPABASE_URL"),
  required("SUPABASE_PUBLISHABLE_KEY"),
);
const interval = Math.max(500, Number(process.env.POLL_INTERVAL_MS || 1500));
let working = false;

async function login() {
  const { error } = await supabase.auth.signInWithPassword({
    email: required("PDV_EMAIL"),
    password: required("PDV_PASSWORD"),
  });
  if (error) throw error;
}
async function poll() {
  if (working) return;
  working = true;
  try {
    const { data: jobs, error } = await supabase
      .from("print_jobs")
      .select("*,printers(*)")
      .in("state", ["pending", "failed"])
      .or(
        `next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`,
      )
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
      const { data: claimed, error: claimError } = await supabase
        .from("print_jobs")
        .update({
          state: "processing",
          attempt_count: job.attempt_count + 1,
          started_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("state", job.state)
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) continue;
      const started = Date.now();
      try {
        const bytes = receiptToEscPos(
          job.receipt_payload,
          printer.cut_type,
          printer.feed_lines,
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
          agent_version: "0.1.0",
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
            state: "failed",
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
          agent_version: "0.1.0",
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
setInterval(() => void poll().catch(console.error), interval);
void poll();
createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.url === "/health")
    response.end(JSON.stringify({ ok: true, working }));
  else {
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not_found" }));
  }
}).listen(Number(process.env.AGENT_PORT || 17891), "127.0.0.1");
console.log("Agente Dom Frios ativo em 127.0.0.1");
