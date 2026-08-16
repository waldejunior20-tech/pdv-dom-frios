# PDV Dom Frios

PDV web touch-first da Dom Frios.

## Stack

- React 19 + TypeScript
- Vite
- Supabase Auth + Postgres/RLS
- React Aria Components para interações touch/mouse/teclado
- Radix UI para dialogs
- TanStack Query para dados
- Zod para validação

## Fluxo principal

Produto → peso/quantidade → comanda → pagamento → Supabase.

Cada venda recebe um `venda_id` e cada item mantém um `request_id` para proteção contra duplicidade.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

A branch `main` representa produção e `develop` é usada para desenvolvimento.
