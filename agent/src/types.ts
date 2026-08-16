export type PrinterStatus = 'available' | 'disconnected' | 'no_paper' | 'cover_open' | 'error' | 'unknown';
export type CutType = 'partial' | 'full' | 'none';

export type PrinterConfig = {
  id?: string;
  friendly_name: string;
  model?: string | null;
  paper_width: 58 | 80;
  connection_mode: 'system' | 'network';
  system_queue?: string | null;
  ip?: string | null;
  port?: number | null;
  timeout_ms: number;
  retry_count: number;
  cut_type: CutType;
  feed_lines: number;
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

export type PrintJob = {
  id: string;
  printer_id: string;
  state: 'pending' | 'processing' | 'completed' | 'failed';
  receipt_payload: ReceiptPayload;
  copies: number;
  attempt_count: number;
  max_attempts: number;
  retry_interval_ms: number;
};
