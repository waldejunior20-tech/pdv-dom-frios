import { useEffect, useState } from "react";
import { Button } from "react-aria-components";
import {
  ArrowLeft,
  Plus,
  Printer as PrinterIcon,
  Save,
  Trash2,
  Wifi,
} from "lucide-react";
import {
  enqueueTest,
  loadPrintJobs,
  loadPrinting,
  requeueJob,
  removePrinter,
  savePrinter,
  saveSettings,
} from "./service";
import type { PrintSettings, Printer } from "./types";

const statusLabels = {
  available: "Disponível",
  disconnected: "Desconectada",
  no_paper: "Sem papel",
  cover_open: "Tampa aberta",
  error: "Erro",
  unknown: "Status desconhecido",
};

export function PrintingSettings({
  ownerId,
  onBack,
}: {
  ownerId: string;
  onBack: () => void;
}) {
  const [settings, setSettings] = useState<PrintSettings | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [message, setMessage] = useState("Carregando configuração...");
  const [editing, setEditing] = useState(false);
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    Promise.all([loadPrinting(ownerId), loadPrintJobs()])
      .then(([data, recentJobs]) => {
        setSettings(data.settings);
        setPrinters(data.printers);
        setMessage("");
        setJobs(recentJobs);
      })
      .catch((error: Error) => setMessage(error.message));
  }, [ownerId]);
  if (!settings)
    return (
      <main className="settings-page">
        <p>{message}</p>
      </main>
    );
  const currentSettings = settings;

  const patch = <K extends keyof PrintSettings>(
    key: K,
    value: PrintSettings[K],
  ) =>
    setSettings((current) =>
      current ? { ...current, [key]: value } : current,
    );
  async function persist() {
    setMessage("Salvando...");
    try {
      await saveSettings(currentSettings);
      setMessage("Configurações salvas.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar.");
    }
  }
  async function addGsPrinter() {
    setMessage("Cadastrando impressora...");
    try {
      const printer = await savePrinter(ownerId, {
        friendly_name: "Impressora da cozinha",
        model: "Goldensky GS-T80E",
        paper_width: 80,
        connection_mode: "network",
        system_queue: "GS_T80E",
        ip: "192.168.18.100",
        port: 9100,
        cut_type: "partial",
        feed_lines: 3,
        enabled: true,
      });
      setPrinters((rows) => [...rows, printer]);
      setEditing(false);
      setMessage("GS-T80E cadastrada.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao cadastrar.",
      );
    }
  }
  async function drop(id: string) {
    if (!window.confirm("Remover esta impressora?")) return;
    await removePrinter(id);
    setPrinters((rows) => rows.filter((p) => p.id !== id));
  }
  async function test(printer: Printer) {
    setMessage("Teste adicionado à fila...");
    await enqueueTest(ownerId, printer, currentSettings);
    setJobs(await loadPrintJobs());
    setMessage("Teste enviado à fila.");
  }
  async function reprint(job: Record<string, unknown>) {
    if (
      currentSettings.confirm_reprint &&
      !window.confirm("Este pedido já foi impresso. Reimprimir?")
    )
      return;
    await requeueJob(ownerId, job);
    setJobs(await loadPrintJobs());
    setMessage("Reimpressão adicionada à fila.");
  }

  return (
    <div className="settings-shell">
      <header className="settings-top">
        <Button className="ghost-top" onPress={onBack}>
          <ArrowLeft size={18} /> Voltar ao caixa
        </Button>
        <div>
          <b>Configurações</b>
          <span>Impressão térmica</span>
        </div>
        <Button className="save-button" onPress={persist}>
          <Save size={17} /> Salvar
        </Button>
      </header>
      <main className="settings-page">
        <section className="settings-intro">
          <PrinterIcon />
          <div>
            <h1>Impressão</h1>
            <p>
              Defina quando os pedidos são impressos e quais impressoras recebem
              cada comanda.
            </p>
          </div>
        </section>
        <section className="settings-card">
          <h2>Configurações gerais</h2>
          <div className="settings-grid">
            <Toggle
              label="Impressão automática"
              checked={settings.auto_print}
              onChange={(v) => patch("auto_print", v)}
            />
            <label className="field">
              Quando imprimir
              <select
                value={settings.print_when}
                onChange={(e) =>
                  patch(
                    "print_when",
                    e.target.value as PrintSettings["print_when"],
                  )
                }
              >
                <option value="received">Ao receber o pedido</option>
                <option value="approved">Após aprovação</option>
                <option value="payment_confirmed">
                  Após confirmação do pagamento
                </option>
                <option value="manual">Manualmente</option>
              </select>
            </label>
            <Toggle
              label="Aprovar pedidos automaticamente"
              checked={settings.auto_approve}
              onChange={(v) => patch("auto_approve", v)}
            />
            <Toggle
              label="Avisar antes de reimprimir"
              checked={settings.confirm_reprint}
              onChange={(v) => patch("confirm_reprint", v)}
            />
            <Toggle
              label="Reimprimir ao editar"
              checked={settings.auto_reprint_on_edit}
              onChange={(v) => patch("auto_reprint_on_edit", v)}
            />
            <Toggle
              label="Compartilhar em vários computadores"
              checked={settings.share_across_devices}
              onChange={(v) => patch("share_across_devices", v)}
            />
            <label className="field">
              Número de cópias
              <input
                type="number"
                min="1"
                max="10"
                value={settings.copies}
                onChange={(e) => patch("copies", Number(e.target.value))}
              />
            </label>
            <label className="field">
              Conteúdo
              <select
                value={settings.receipt_mode}
                onChange={(e) =>
                  patch(
                    "receipt_mode",
                    e.target.value as PrintSettings["receipt_mode"],
                  )
                }
              >
                <option value="complete">Completo</option>
                <option value="summary">Resumido</option>
              </select>
            </label>
            <Toggle
              label="Corte automático"
              checked={settings.auto_cut}
              onChange={(v) => patch("auto_cut", v)}
            />
            <label className="field">
              Tipo de corte
              <select
                disabled={!settings.auto_cut}
                value={settings.cut_type}
                onChange={(e) =>
                  patch("cut_type", e.target.value as PrintSettings["cut_type"])
                }
              >
                <option value="partial">Parcial</option>
                <option value="full">Completo</option>
                <option value="none">Sem corte</option>
              </select>
            </label>
            <label className="field">
              Linhas antes do corte
              <input
                type="number"
                min="0"
                max="12"
                value={settings.feed_lines}
                onChange={(e) => patch("feed_lines", Number(e.target.value))}
              />
            </label>
          </div>
        </section>
        <section className="settings-card">
          <div className="card-title">
            <div>
              <h2>Suas Impressoras</h2>
              <p>O status é atualizado pelo agente local.</p>
            </div>
            <Button className="outline-button" onPress={() => setEditing(true)}>
              <Plus size={17} /> Adicionar
            </Button>
          </div>
          {printers.length === 0 && (
            <div className="empty-printers">
              <PrinterIcon />
              <b>Nenhuma impressora cadastrada</b>
              <span>Cadastre a GS-T80E para começar.</span>
            </div>
          )}
          <div className="printer-list">
            {printers.map((printer) => (
              <article className="printer-row" key={printer.id}>
                <div className="printer-glyph">
                  <PrinterIcon />
                </div>
                <div>
                  <b>{printer.friendly_name}</b>
                  <span>
                    {printer.model || "Modelo não informado"} ·{" "}
                    {printer.paper_width} mm
                  </span>
                  <small>
                    <Wifi size={13} />
                    {printer.connection_mode === "network"
                      ? `${printer.ip}:${printer.port}`
                      : printer.system_queue}{" "}
                    · fila {printer.system_queue || "—"}
                  </small>
                </div>
                <span className={`status-badge ${printer.status}`}>
                  {statusLabels[printer.status]}
                </span>
                <Button
                  className="outline-button"
                  onPress={() => test(printer)}
                >
                  Teste
                </Button>
                <Button
                  className="remove-button"
                  aria-label="Remover impressora"
                  onPress={() => drop(printer.id)}
                >
                  <Trash2 />
                </Button>
              </article>
            ))}
          </div>
          {editing && (
            <div className="quick-add">
              <div>
                <b>Goldensky GS-T80E</b>
                <span>
                  LAN 192.168.18.100:9100 · fila GS_T80E · 80 mm · corte parcial
                </span>
              </div>
              <Button className="save-button" onPress={addGsPrinter}>
                Cadastrar padrão
              </Button>
              <Button
                className="outline-button"
                onPress={() => setEditing(false)}
              >
                Cancelar
              </Button>
            </div>
          )}
        </section>
        <section className="settings-card">
          <div className="card-title">
            <div>
              <h2>Histórico de impressão</h2>
              <p>Últimos 20 trabalhos e reimpressões.</p>
            </div>
          </div>
          <div className="job-list">
            {jobs.length === 0 && <p>Nenhuma impressão registrada.</p>}
            {jobs.map((job) => (
              <div className="job-row" key={String(job.id)}>
                <div>
                  <b>
                    {String(
                      (job.receipt_payload as { customer?: string })
                        ?.customer || "Pedido",
                    )}
                  </b>
                  <span>
                    {new Date(String(job.created_at)).toLocaleString("pt-BR")} ·{" "}
                    {String(job.origin)}
                  </span>
                  {job.last_error ? (
                    <small>{String(job.last_error)}</small>
                  ) : null}
                </div>
                <span className={`status-badge ${String(job.state)}`}>
                  {String(job.state)}
                </span>
                <Button className="outline-button" onPress={() => reprint(job)}>
                  Reimprimir
                </Button>
              </div>
            ))}
          </div>
        </section>
        <div className="settings-message" role="status">
          {message}
        </div>
      </main>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}
