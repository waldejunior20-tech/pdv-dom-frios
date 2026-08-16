import iconv from 'iconv-lite';
import type { ReceiptPayload } from './types.js';

const ESC = 0x1b;
const GS = 0x1d;

function command(...bytes: number[]) {
  return Buffer.from(bytes);
}

function sanitize(value: string) {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 32;
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
}

function text(value: string) {
  return iconv.encode(sanitize(value), 'cp850');
}

export function buildEscPos(payload: ReceiptPayload) {
  const chunks: Buffer[] = [command(ESC, 0x40), command(ESC, 0x74, 0x02)];
  for (const line of payload.lines) {
    const align = line.align === 'center' ? 1 : line.align === 'right' ? 2 : 0;
    chunks.push(command(ESC, 0x61, align));
    chunks.push(command(ESC, 0x45, line.bold ? 1 : 0));
    chunks.push(command(GS, 0x21, line.size === 'double' ? 0x11 : 0x00));
    chunks.push(text(line.text), command(0x0a));
  }
  chunks.push(command(ESC, 0x45, 0), command(GS, 0x21, 0), command(ESC, 0x61, 0));
  if (payload.feedLines > 0) chunks.push(command(ESC, 0x64, payload.feedLines));
  if (payload.cut === 'partial') chunks.push(command(GS, 0x56, 0x01));
  if (payload.cut === 'full') chunks.push(command(GS, 0x56, 0x00));
  return Buffer.concat(chunks);
}
