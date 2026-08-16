import { type FormEvent, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from 'react-aria-components';
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Loader2,
  Pencil,
  PlugZap,
  Plus,
  Printer,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { discoverSystemPrinters, getAgentHealth, probePrinter } from './agentClient';
import {
  defaultPrintSettings,
  getPrintSettings,
  hasCompletedPrint,
  listPrinters,
  listRecentPrintJobs,
  listRecentSales,
  removePrinter,
  savePrinter,
  savePrintSettings,
  updatePrinterStatus,
} from './repository';
import { PrinterDraftSchema, PrintSettingsSchema } from './schemas';
import { requiresReprintConfirmation } from './rules';
import { printSaleManually, printTest } from './service';
import type {
  PrintJobRecord,
  PrintSettings,
  PrinterDestination,
  PrinterDraft,
  PrinterRecord,
  PrinterStatus,
  SystemPrinter,
} from './types';

type RecentSale = {
  id: string;
  cliente_nome: string;
  created_at: string;
  total: number | string;
};

const destinationLabels: Record<PrinterDestination, string> = {
  cozinha: 'Cozinha',
  balcao: 'Balcão',
  caixa: 'Caixa',
  entrega: 'Entrega',
  bebidas: 'Bebidas',
  todos: 'Todos os itens',
};

const statusLabels: Record<PrinterStatus, string> = {
  available: 'Disponível',
  disconnected: 'Desconectada',
  no_paper: 'Sem papel',
  cover_open: 'Tampa aberta',
  error: 'Erro',
  unknown: 'Status desconhecido',
};

function emptyPrinter(): PrinterDraft {
  return {
    friendly_name: 'Impressora da cozinha',
    model: 'Goldensky GS-T80E',
    paper_width: 80,
    connection_mode: 'system',
    system_queue: 'GS_T80E',
    ip: '192.168.18.100',
    port: 9100,
    timeout_ms: 3000,
    retry_count: 2,
    cut_type: 'partial',
    feed_lines: 3,
    enabled: true,
    destinations: ['cozinha'],
  };
}

function toDraft(printer: PrinterRecord): PrinterDraft {
  return {
    id: printer.id,
    friendly_name: printer.friendly_name,
    model: printer.model,
    paper_width: printer.paper_width,
    connection_mode: printer.connection_mode,
    system_queue: printer.system_queue,
    ip: printer.ip,
    port: printer.port,
    timeout_ms: printer.timeout_ms,
    retry_count: printer.retry_count,
    cut_type: printer.cut_type,
    feed_lines: printer.feed_lines,
    enabled: printer.enabled,
    destinations: printer.destinations.length ? printer.destinations : ['todos'],
  };
}

function statusIcon(status: PrinterStatus) {
  if (status === 'available') return <CheckCircle2 size={16} />;
  if (status === 'unknown') return <CircleHelp size={16} />;
  return <CircleAlert size={16} />;
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="setting-toggle-row">
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

function PrinterDialog({
  open,
  printer,
  accessToken,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  printer: PrinterDraft;
  accessToken: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(printer);
  const [queues, setQueues] = useState<SystemPrinter[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(printer);
      setMessage('');
      setQueues([]);
    }
  }, [open, printer]);

  function set<K extends keyof PrinterDraft>(key: K, value: PrinterDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function detectQueues() {
    setBusy(true);
    setMessage('Detectando filas instaladas...');
    try {
      const found = await discoverSystemPrinters(accessToken);
      setQueues(found);
      setMessage(found.length ? `${found.length} fila(s) encontrada(s).` : 'Nenhuma fila encontrada neste computador.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível detectar as impressoras.');
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    const parsed = PrinterDraftSchema.safeParse(draft);
    if (!parsed.success) return setMessage(parsed.error.issues[0]?.message ?? 'Confira os campos.');
    setBusy(true);
    setMessage('Testando conexão...');
    try {
      const result = await probePrinter(accessToken, parsed.data);
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao testar a impressora.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = PrinterDraftSchema.safeParse(draft);
    if (!parsed.success) return setMessage(parsed.error.issues[0]?.message ?? 'Confira os campos.');
    setBusy(true);
    setMessage('Salvando impressora...');
    try {
      await savePrinter(parsed.data);
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a impressora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card printer-editor">
          <div className="dialog-head">
            <div>
              <Dialog.Title>{draft.id ? 'Editar impressora' : 'Adicionar impressora'}</Dialog.Title>
              <Dialog.Description>Use a fila real do sistema ou a conexão ESC/POS pela rede.</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button className="dialog-close" aria-label="Fechar">
                <X />
              </Button>
            </Dialog.Close>
          </div>
          <form className="printer-form" onSubmit={submit}>
            <label>
              <span>Nome amigável</span>
              <input value={draft.friendly_name} onChange={(event) => set('friendly_name', event.target.value)} />
            </label>
            <label>
              <span>Modelo</span>
              <input value={draft.model ?? ''} onChange={(event) => set('model', event.target.value)} />
            </label>
            <div className="form-grid two">
              <label>
                <span>Modo</span>
                <select
                  value={draft.connection_mode}
                  onChange={(event) => set('connection_mode', event.target.value as 'system' | 'network')}
                >
                  <option value="system">Instalada no sistema</option>
                  <option value="network">ESC/POS por rede</option>
                </select>
              </label>
              <label>
                <span>Papel</span>
                <select
                  value={draft.paper_width}
                  onChange={(event) => set('paper_width', Number(event.target.value) as 58 | 80)}
                >
                  <option value={80}>80 mm</option>
                  <option value={58}>58 mm</option>
                </select>
              </label>
            </div>

            {draft.connection_mode === 'system' ? (
              <div className="system-queue-box">
                <label>
                  <span>Fila instalada</span>
                  <input
                    value={draft.system_queue ?? ''}
                    onChange={(event) => set('system_queue', event.target.value)}
                    placeholder="GS_T80E"
                  />
                </label>
                <Button type="button" className="secondary-button" onPress={detectQueues} isDisabled={busy}>
                  <RefreshCw size={16} /> Detectar impressoras
                </Button>
                {queues.length > 0 && (
                  <label>
                    <span>Filas detectadas</span>
                    <select
                      value={draft.system_queue ?? ''}
                      onChange={(event) => set('system_queue', event.target.value)}
                    >
                      <option value="">Selecione...</option>
                      {queues.map((queue) => (
                        <option key={queue.queue} value={queue.queue}>
                          {queue.queue}
                          {queue.model ? ` — ${queue.model}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            ) : (
              <div className="form-grid three">
                <label>
                  <span>IP</span>
                  <input value={draft.ip ?? ''} onChange={(event) => set('ip', event.target.value)} placeholder="192.168.18.100" />
                </label>
                <label>
                  <span>Porta</span>
                  <input
                    type="number"
                    value={draft.port ?? 9100}
                    onChange={(event) => set('port', Number(event.target.value))}
                  />
                </label>
                <label>
                  <span>Timeout (ms)</span>
                  <input
                    type="number"
                    value={draft.timeout_ms}
                    onChange={(event) => set('timeout_ms', Number(event.target.value))}
                  />
                </label>
              </div>
            )}

            <div className="form-grid three">
              <label>
                <span>Tentativas</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={draft.retry_count}
                  onChange={(event) => set('retry_count', Number(event.target.value))}
                />
              </label>
              <label>
                <span>Corte</span>
                <select
                  value={draft.cut_type}
                  onChange={(event) => set('cut_type', event.target.value as PrinterDraft['cut_type'])}
                >
                  <option value="partial">Parcial</option>
                  <option value="full">Completo</option>
                  <option value="none">Sem corte</option>
                </select>
              </label>
              <label>
                <span>Linhas antes do corte</span>
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={draft.feed_lines}
                  onChange={(event) => set('feed_lines', Number(event.target.value))}
                />
              </label>
            </div>

            <fieldset className="destination-fieldset">
              <legend>Destinos</legend>
              <div className="destination-grid">
                {(Object.keys(destinationLabels) as PrinterDestination[]).map((destination) => (
                  <label key={destination}>
                    <input
                      type="checkbox"
                      checked={draft.destinations.includes(destination)}
                      onChange={(event) =>
                        set(
                          'destinations',
                          event.target.checked
                            ? [...new Set([...draft.destinations, destination])]
                            : draft.destinations.filter((item) => item !== destination),
                        )
                      }
                    />{' '}
                    {destinationLabels[destination]}
                  </label>
                ))}
              </div>
            </fieldset>

            <Toggle
              checked={draft.enabled}
              onChange={(next) => set('enabled', next)}
              label="Impressora ativa"
              description="Impressoras desativadas não recebem trabalhos automáticos."
            />
            <div className="form-message">{message}</div>
            <div className="dialog-actions">
              <Button type="button" className="secondary-button" onPress={testConnection} isDisabled={busy}>
                <PlugZap size={16} /> Testar conexão
              </Button>
              <button className="primary-button" disabled={busy}>
                {busy ? 'Aguarde...' : 'Salvar impressora'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function PrintingSettings({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const [settings, setSettings] = useState<PrintSettings>(defaultPrintSettings);
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const [jobs, setJobs] = useState<PrintJobRecord[]>([]);
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [agent, setAgent] = useState<{ online: boolean; label: string }>({
    online: false,
    label: 'Verificando agente...',
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPrinter, setEditingPrinter] = useState<PrinterDraft>(emptyPrinter());

  async function refresh() {
    const [nextSettings, nextPrinters, nextJobs, nextSales] = await Promise.all([
      getPrintSettings(),
      listPrinters(),
      listRecentPrintJobs(),
      listRecentSales(),
    ]);
    setSettings(nextSettings);
    setPrinters(nextPrinters);
    setJobs(nextJobs);
    setSales(nextSales as RecentSale[]);
  }

  useEffect(() => {
    Promise.all([
      refresh(),
      getAgentHealth()
        .then((health) => setAgent({ online: true, label: `Agente ${health.data.version} · ${health.data.os}` }))
        .catch(() => setAgent({ online: false, label: 'Agente local não encontrado' })),
    ])
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Falha ao carregar configurações.'))
      .finally(() => setLoading(false));
  }, []);

  const completedBySale = useMemo(
    () => new Set(jobs.filter((job) => job.state === 'completed' && job.venda_id).map((job) => job.venda_id)),
    [jobs],
  );

  async function saveGeneral() {
    const parsed = PrintSettingsSchema.safeParse(settings);
    if (!parsed.success) return setMessage(parsed.error.issues[0]?.message ?? 'Confira as configurações.');
    setSaving(true);
    setMessage('Salvando configurações...');
    try {
      await savePrintSettings(parsed.data);
      setMessage('Configurações de impressão salvas.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleProbe(printer: PrinterRecord) {
    setMessage(`Testando ${printer.friendly_name}...`);
    try {
      const result = await probePrinter(accessToken, printer);
      await updatePrinterStatus(printer.id, result.status, result.message);
      await refresh();
      setMessage(result.message);
    } catch (error) {
      await updatePrinterStatus(
        printer.id,
        'disconnected',
        error instanceof Error ? error.message : 'Sem conexão.',
      ).catch(() => undefined);
      await refresh();
      setMessage(error instanceof Error ? error.message : 'Falha na conexão.');
    }
  }

  async function handleTestPrint(printer: PrinterRecord) {
    setMessage(`Enviando teste para ${printer.friendly_name}...`);
    try {
      const result = await printTest(printer, accessToken);
      await refresh();
      setMessage(result.message);
    } catch (error) {
      await refresh();
      setMessage(error instanceof Error ? error.message : 'A impressão de teste falhou.');
    }
  }

  async function handleRemove(printer: PrinterRecord) {
    if (!window.confirm(`Remover ${printer.friendly_name}? O histórico de impressão será preservado.`)) return;
    setMessage('Removendo impressora...');
    await removePrinter(printer.id);
    await refresh();
    setMessage('Impressora removida ou desativada para preservar o histórico.');
  }

  async function handleManualPrint(saleId: string) {
    const alreadyPrinted = completedBySale.has(saleId) || (await hasCompletedPrint(saleId));
    if (
      requiresReprintConfirmation(settings, alreadyPrinted) &&
      !window.confirm('Este pedido já foi impresso. Deseja reimprimir?')
    )
      return;
    setMessage('Enviando impressão manual...');
    try {
      const result = await printSaleManually(saleId, accessToken);
      await refresh();
      setMessage(result.message);
    } catch (error) {
      await refresh();
      setMessage(error instanceof Error ? error.message : 'A impressão manual falhou.');
    }
  }

  if (loading)
    return (
      <div className="settings-loading">
        <Loader2 className="spin" /> Carregando impressão...
      </div>
    );

  return (
    <main className="printing-page">
      <header className="settings-titlebar">
        <Button className="back-button" onPress={onBack}>
          <ArrowLeft size={18} /> Voltar ao caixa
        </Button>
        <div>
          <span>CONFIGURAÇÕES</span>
          <h1>Impressão</h1>
          <p>Filas do sistema, ESC/POS por rede, automação e histórico.</p>
        </div>
        <div className={`agent-pill ${agent.online ? 'online' : 'offline'}`}>
          {agent.online ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
          {agent.label}
        </div>
      </header>

      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <Settings2 size={20} />
            <div>
              <h2>Configurações gerais</h2>
              <p>Defina quando e como os pedidos devem ser impressos.</p>
            </div>
          </div>
          <button className="primary-button" onClick={saveGeneral} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
        </div>
        <div className="settings-grid">
          <div className="settings-column">
            <Toggle
              checked={settings.auto_print}
              onChange={(auto_print) => setSettings((current) => ({ ...current, auto_print }))}
              label="Impressão automática"
              description="Cria trabalhos automaticamente quando a regra abaixo for atendida."
            />
            <label className="setting-field">
              <span>Quando imprimir</span>
              <select
                value={settings.print_when}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    print_when: event.target.value as PrintSettings['print_when'],
                  }))
                }
              >
                <option value="received">Ao receber o pedido</option>
                <option value="approved">Após aprovação</option>
                <option value="payment_confirmed">Após confirmação do pagamento</option>
                <option value="manual">Somente manualmente</option>
              </select>
            </label>
            <Toggle
              checked={settings.auto_approve}
              onChange={(auto_approve) => setSettings((current) => ({ ...current, auto_approve }))}
              label="Aprovar pedidos automaticamente"
            />
            <Toggle
              checked={settings.confirm_reprint}
              onChange={(confirm_reprint) => setSettings((current) => ({ ...current, confirm_reprint }))}
              label="Avisar antes de reimprimir"
            />
            <Toggle
              checked={settings.auto_reprint_on_edit}
              onChange={(auto_reprint_on_edit) =>
                setSettings((current) => ({ ...current, auto_reprint_on_edit }))
              }
              label="Reimprimir após edição"
            />
            <Toggle
              checked={settings.share_across_devices}
              onChange={(share_across_devices) =>
                setSettings((current) => ({ ...current, share_across_devices }))
              }
              label="Compartilhar configuração entre computadores"
              description="As preferências ficam no Supabase e podem ser usadas por vários caixas."
            />
          </div>
          <div className="settings-column">
            <label className="setting-field">
              <span>Número de cópias</span>
              <input
                type="number"
                min={1}
                max={10}
                value={settings.copies}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, copies: Number(event.target.value) }))
                }
              />
            </label>
            <label className="setting-field">
              <span>Conteúdo</span>
              <select
                value={settings.receipt_mode}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    receipt_mode: event.target.value as PrintSettings['receipt_mode'],
                  }))
                }
              >
                <option value="complete">Impressão completa</option>
                <option value="summary">Impressão resumida</option>
              </select>
            </label>
            <Toggle
              checked={settings.auto_cut}
              onChange={(auto_cut) => setSettings((current) => ({ ...current, auto_cut }))}
              label="Corte automático"
            />
            <label className="setting-field">
              <span>Tipo de corte</span>
              <select
                value={settings.cut_type}
                disabled={!settings.auto_cut}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    cut_type: event.target.value as PrintSettings['cut_type'],
                  }))
                }
              >
                <option value="partial">Parcial</option>
                <option value="full">Completo</option>
                <option value="none">Sem corte</option>
              </select>
            </label>
            <label className="setting-field">
              <span>Linhas de avanço antes do corte</span>
              <input
                type="number"
                min={0}
                max={12}
                value={settings.feed_lines}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, feed_lines: Number(event.target.value) }))
                }
              />
            </label>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <Printer size={20} />
            <div>
              <h2>Suas Impressoras</h2>
              <p>Cadastre filas do sistema operacional ou impressoras ESC/POS na rede.</p>
            </div>
          </div>
          <button
            className="primary-button"
            onClick={() => {
              setEditingPrinter(emptyPrinter());
              setEditorOpen(true);
            }}
          >
            <Plus size={16} /> Adicionar impressora
          </button>
        </div>
        <div className="printer-list">
          {printers.length === 0 && <div className="empty-config">Nenhuma impressora cadastrada.</div>}
          {printers.map((printer) => (
            <article className="printer-card" key={printer.id}>
              <div className="printer-main">
                <span className={`printer-status ${printer.status}`}>
                  {statusIcon(printer.status)} {statusLabels[printer.status]}
                </span>
                <h3>{printer.friendly_name}</h3>
                <p>
                  {printer.model || 'Modelo não informado'} · {printer.paper_width} mm
                </p>
                <p>
                  {printer.connection_mode === 'network'
                    ? `Rede ${printer.ip}:${printer.port}`
                    : `Fila ${printer.system_queue}`}
                </p>
                <div className="destination-tags">
                  {printer.destinations.map((destination) => (
                    <span key={destination}>{destinationLabels[destination]}</span>
                  ))}
                </div>
              </div>
              <div className="printer-actions">
                <Button onPress={() => handleProbe(printer)}>Testar conexão</Button>
                <Button onPress={() => handleTestPrint(printer)}>Imprimir teste</Button>
                <Button
                  onPress={() => {
                    setEditingPrinter(toDraft(printer));
                    setEditorOpen(true);
                  }}
                >
                  <Pencil size={15} /> Editar
                </Button>
                <Button className="danger" onPress={() => handleRemove(printer)}>
                  <Trash2 size={15} /> Remover
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <Printer size={20} />
            <div>
              <h2>Impressão manual</h2>
              <p>Últimas vendas e estado dos trabalhos de impressão.</p>
            </div>
          </div>
        </div>
        <div className="manual-print-list">
          {sales.length === 0 && <div className="empty-config">Nenhuma venda disponível.</div>}
          {sales.map((sale) => (
            <div className="manual-sale" key={sale.id}>
              <div>
                <strong>
                  #{String(sale.id).slice(0, 8).toUpperCase()} · {sale.cliente_nome}
                </strong>
                <span>
                  {new Date(sale.created_at).toLocaleString('pt-BR')} · R${' '}
                  {Number(sale.total).toFixed(2).replace('.', ',')}
                </span>
              </div>
              <span className={completedBySale.has(sale.id) ? 'printed-chip' : 'not-printed-chip'}>
                {completedBySale.has(sale.id) ? 'Já impresso' : 'Não impresso'}
              </span>
              <Button onPress={() => handleManualPrint(sale.id)}>
                {completedBySale.has(sale.id) ? 'Reimprimir' : 'Imprimir'}
              </Button>
            </div>
          ))}
        </div>
        <div className="job-history">
          <h3>Histórico recente</h3>
          {jobs.slice(0, 12).map((job) => (
            <div className="job-row" key={job.id}>
              <span className={`job-state ${job.state}`}>{job.state}</span>
              <span>{job.origin}</span>
              <span>
                {job.attempt_count}/{job.max_attempts} tentativa(s)
              </span>
              <span>
                {job.last_error ||
                  (job.completed_at
                    ? `Concluído ${new Date(job.completed_at).toLocaleTimeString('pt-BR')}`
                    : 'Aguardando')}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div className="settings-feedback" role="status">
        {message}
      </div>
      <PrinterDialog
        open={editorOpen}
        printer={editingPrinter}
        accessToken={accessToken}
        onOpenChange={setEditorOpen}
        onSaved={refresh}
      />
    </main>
  );
}
