import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from './security.js';

describe('origens autorizadas do agente', () => {
  it('aceita produção e desenvolvimento local', () => {
    expect(isOriginAllowed('https://pdv-dom-frios.vercel.app')).toBe(true);
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
  });

  it('rejeita sites não autorizados e origem ausente', () => {
    expect(isOriginAllowed('https://site-malicioso.example')).toBe(false);
    expect(isOriginAllowed(undefined)).toBe(false);
  });
});
