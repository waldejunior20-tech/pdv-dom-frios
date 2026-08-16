import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "react-aria-components";
import {
  ArrowLeft,
  Plus,
  Printer as PrinterIcon,
  Save,
  Trash2,
  Wifi,
  X,
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
  const [savingPrinter, setSavingPrinter] = useState(false);
  const [printerDraft, setPrinterDraft] = useState({
    friendly_name: "Impressora da cozinha",
    model: "Goldensky GS-T80E",
    connection_mode: "network" as "network" | "system",
    system_queue: "GS_T80E",
    ip: "192.168.18.100",
    port: 9100,
    paper_width: 80 as 58 | 80,
  });
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
  async function addPrinter() {
    if (!printerDraft.friendly_name.trim())
      return setMessage("Informe o nome amigável da impressora.");
    setMessage("Cadastrando impressora...");
    setSavingPrinter(true);
    try {
      const printer = await savePrinter(ownerId, {
        friendly_name: printerDraft.friendly_name.trim(),
        model: printerDraft.model.trim() || null,
        paper_width: printerDraft.paper_width,
        connection_mode: printerDraft.connection_mode,
        system_queue: printerDraft.system_queue.trim() || null,
        ip:
          printerDraft.connection_mode === "network"
            ? printerDraft.ip.trim()
            : null,
        port:
          printerDraft.connection_mode === "network" ? printerDraft.port : null,
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
    } finally {
      setSavingPrinter(false);
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
      <Dialog.Root
        open={editing}
        onOpenChange={(open) => !savingPrinter && setEditing(open)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="printer-dialog"
            aria-describedby="printer-dialog-description"
          >
            <div className="dialog-head">
              <div>
                <Dialog.Title>Adicionar impressora</Dialog.Title>
                <Dialog.Description id="printer-dialog-description">
                  Revise os dados da GS-T80E ou cadastre outra impressora.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button className="dialog-close" aria-label="Fechar">
                  <X />
                </Button>
              </Dialog.Close>
            </div>
            <div className="printer-form">
              <label className="field">
                Nome amigável
                <input
                  autoFocus
                  value={printerDraft.friendly_name}
                  onChange={(e) =>
                    setPrinterDraft((draft) => ({
                      ...draft,
                      friendly_name: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Modelo
                <input
                  value={printerDraft.model}
                  onChange={(e) =>
                    setPrinterDraft((draft) => ({
                      ...draft,
                      model: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Conexão
                <select
                  value={printerDraft.connection_mode}
                  onChange={(e) =>
                    setPrinterDraft((draft) => ({
                      ...draft,
                      connection_mode: e.target.value as "network" | "system",
                    }))
                  }
                >
                  <option value="network">Rede LAN</option>
                  <option value="system">Fila do sistema/CUPS</option>
                </select>
              </label>
              <label className="field">
                Largura do papel
                <select
                  value={printerDraft.paper_width}
                  onChange={(e) =>
                    setPrinterDraft((draft) => ({
                      ...draft,
                      paper_width: Number(e.target.value) as 58 | 80,
                    }))
                  }
                >
                  <option value="80">80 mm</option>
                  <option value="58">58 mm</option>
                </select>
              </label>
              {printerDraft.connection_mode === "network" && (
                <>
                  <label className="field">
                    Endereço IP
                    <input
                      value={printerDraft.ip}
                      onChange={(e) =>
                        setPrinterDraft((draft) => ({
                          ...draft,
                          ip: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    Porta
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={printerDraft.port}
                      onChange={(e) =>
                        setPrinterDraft((draft) => ({
                          ...draft,
                          port: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                </>
              )}
              <label className="field full-field">
                Fila instalada no sistema
                <input
                  value={printerDraft.system_queue}
                  onChange={(e) =>
                    setPrinterDraft((draft) => ({
                      ...draft,
                      system_queue: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button className="outline-button" isDisabled={savingPrinter}>
                  Cancelar
                </Button>
              </Dialog.Close>
              <Button
                className="save-button"
                isDisabled={savingPrinter}
                onPress={addPrinter}
              >
                {savingPrinter ? "Cadastrando..." : "Cadastrar impressora"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
