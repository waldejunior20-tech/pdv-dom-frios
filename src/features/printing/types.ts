export type PrintWhen = 'received' | 'approved' | 'payment_confirmed' | 'manual';
export type ReceiptMode = 'complete' | 'summary';
export type CutType = 'partial' | 'full' | 'none';
export type PrinterConnectionMode = 'system' | 'network';
export type PrinterStatus =
  | 'available'
  | 'disconnected'
  | 'no_paper'
  | 'cover_open'
  | 'error'
  | 'unknown';
export type PrinterDestination = 'cozinha' | 'balcao' | 'caixa' | 'entrega' | 'bebidas' | 'todos';
export type PrintJobState = 'pending' | 'processing' | 'completed' | 'failed';
export type PrintOrigin = 'automatic' | 'manual' | 'test' | 'edit';

export type PrintSettings = {
  owner_id?: string;
  auto_print: boolean;
  print_when: PrintWhen;
  auto_approve: boolean;
  confirm_reprint: boolean;
  auto_reprint_on_edit: boolean;
  share_across_devices: boolean;
  copies: number;
  receipt_mode: ReceiptMode;
  auto_cut: boolean;
  cut_type: CutType;
  feed_lines: number;
};

export type PrinterRecord = {
  id: string;
  friendly_name: string;
  model: string | null;
  paper_width: 58 | 80;
  connection_mode: PrinterConnectionMode;
  system_queue: string | null;
  ip: string | null;
  port: number | null;
  timeout_ms: number;
  retry_count: number;
  cut_type: CutType;
  feed_lines: number;
  enabled: boolean;
  status: PrinterStatus;
  status_message: string | null;
  last_seen_at: string | null;
  destinations: PrinterDestination[];
};

export type PrinterDraft = {
  id?: string;
  friendly_name: string;
  model?: string | null;
  paper_width: 58 | 80;
  connection_mode: PrinterConnectionMode;
  system_queue?: string | null;
  ip?: string | null;
  port?: number | null;
  timeout_ms: number;
  retry_count: number;
  cut_type: CutType;
  feed_lines: number;
  enabled: boolean;
  destinations: PrinterDestination[];
};

export type ReceiptLine = {
  text: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  size?: 'normal' | 'double';
};

export type ReceiptPayload = {
  title: string;
  paperWidth: 58 | 80;
  lines: ReceiptLine[];
  cut: CutType;
  feedLines: number;
};

export type SalePrintItem = {
  id?: string;
  productId?: string | null;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  complements?: string[];
  notes?: string | null;
};

export type SalePrintData = {
  id: string;
  createdAt: string;
  customer: string;
  phone?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  orderType: 'retirada' | 'entrega' | 'mesa';
  table?: string | null;
  items: SalePrintItem[];
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
  paymentMethod: 'pix' | 'dinheiro' | 'cartao' | 'prazo';
  paymentStatus: 'pendente' | 'confirmado' | 'falhou' | 'estornado';
  saleStatus: 'recebido' | 'aprovado' | 'cancelado' | 'concluido';
  notes?: string | null;
};

export type PrintJobRecord = {
  id: string;
  venda_id: string | null;
  printer_id: string;
  origin: PrintOrigin;
  state: PrintJobState;
  receipt_payload: ReceiptPayload;
  copies: number;
  attempt_count: number;
  max_attempts: number;
  retry_interval_ms: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type SystemPrinter = {
  queue: string;
  name: string;
  model?: string;
  status: PrinterStatus;
  statusMessage?: string;
  isDefault?: boolean;
};
