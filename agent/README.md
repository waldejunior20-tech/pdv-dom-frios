# Dom Frios Print Agent

Agente local seguro para impressão térmica. O navegador nunca abre TCP 9100 diretamente.

## Segurança

- escuta apenas em `127.0.0.1:17891`;
- aceita somente origens configuradas em `PDV_ALLOWED_ORIGINS`;
- exige um access token válido do Supabase em todas as rotas sensíveis;
- não oferece endpoint de shell nem aceita comandos arbitrários;
- no macOS/Linux só executa os binários fixos `lpstat` e `lp` com argumentos validados;
- trabalhos são buscados no Supabase sob RLS do usuário autenticado.

## Instalação

```bash
cd agent
npm install
cp .env.example .env
npm run build
npm start
```

No Mac, confirme que a fila existe:

```bash
lpstat -p -d
```

Para a Goldensky GS-T80E deste projeto, a fila CUPS esperada é `GS_T80E`.

## Variáveis

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `PDV_ALLOWED_ORIGINS` (separadas por vírgula)
- `PRINT_AGENT_PORT` (padrão `17891`)

## Modos

### Fila do sistema - macOS/Linux

Usa CUPS com `lp -d <fila> -o raw`, envia ESC/POS e acompanha o job com `lpstat` antes de marcar como concluído.

### ESC/POS por rede

Abre o socket TCP somente dentro do agente local. O padrão é porta 9100.

### Windows

A detecção de filas é suportada via PowerShell com comando fixo. Impressão RAW por fila do Windows ainda não é habilitada nesta versão; use o modo ESC/POS por rede no Windows.
