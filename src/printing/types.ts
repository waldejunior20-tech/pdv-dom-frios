export type PrinterStatus =
  | "available"
  | "disconnected"
  | "no_paper"
  | "cover_open"
  | "error"
  | "unknown";
export type PrintWhen =
  "received" | "approved" | "payment_confirmed" | "manual";
export type CutType = "partial" | "full" | "none";

export type PrintSettings = {
  owner_id: string;
  auto_print: boolean;
  print_when: PrintWhen;
  auto_approve: boolean;
  confirm_reprint: boolean;
  auto_reprint_on_edit: boolean;
  share_across_devices: boolean;
  copies: number;
  receipt_mode: "complete" | "summary";
  auto_cut: boolean;
  cut_type: CutType;
  feed_lines: number;
};

export type Printer = {
  id: string;
  friendly_name: string;
  model: string | null;
  paper_width: 58 | 80;
  connection_mode: "system" | "network";
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
};

export type ReceiptPayload = {
  saleId: string;
  customer: string;
  payment: string;
  createdAt: string;
  total: number;
  mode: "complete" | "summary";
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
  }>;
};
