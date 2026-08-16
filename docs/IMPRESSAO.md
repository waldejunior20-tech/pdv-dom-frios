# Impressão térmica

O PDV registra a venda em `vendas`, mantém os itens em `pedidos` e cria trabalhos idempotentes em `print_jobs`. O agente local consulta apenas os dados do usuário autenticado, gera ESC/POS e envia pela fila do sistema ou TCP 9100.

## Configuração padrão GS-T80E

- Nome amigável: Impressora da cozinha
- Modelo: Goldensky GS-T80E
- Papel: 80 mm
- Fila CUPS: `GS_T80E`
- Rede: `192.168.18.100:9100`
- URI CUPS: `socket://192.168.18.100:9100`
- Corte parcial e avanço de 3 linhas
- Driver do Mac: POS-80 1.2
- Opções CUPS: `DocCutType=1PartialCutDoc FeedCutAfterJobEnd=3Line`

Cadastre o padrão em **Configurações → Impressão → Adicionar → Cadastrar padrão**. A conexão `network` envia ESC/POS diretamente pela LAN; a conexão `system` usa `lp -o raw` e a fila instalada.

## Instalação do agente no Mac

Requer Node.js 20 ou superior e a impressora já instalada quando for usado o adaptador CUPS.

```bash
cd print-agent
npm install
cp .env.example .env
```

Preencha `.env` com a URL e chave publicável do projeto e com um usuário operacional do PDV. A senha fica somente no Mac e nunca é enviada ao navegador ou armazenada no Git. Carregue o arquivo e inicie:

```bash
set -a
source .env
set +a
npm run build
npm start
```

O agente escuta somente em `127.0.0.1:17891`. Verifique com `curl http://127.0.0.1:17891/health`. Não exponha essa porta na rede.

## Operação e diagnóstico

O agente tenta novamente conforme a configuração da impressora, grava cada tentativa em `print_attempts` e atualiza o status exibido no PDV. `Disponível` confirma o último envio; `Desconectada` indica falha de conexão. Sensores de papel/tampa dependem do retorno suportado pelo modelo/driver e permanecem como status desconhecido quando não houver telemetria.

Para validar a rede: confirme que o Mac alcança `192.168.18.100:9100`. Para CUPS, confirme que `lpstat -p GS_T80E` lista a fila. O job mantém uma chave de idempotência por venda e impressora para evitar cópia automática duplicada.

## Segurança

- O agente aceita HTTP apenas no loopback.
- A autenticação usa chave publicável + usuário, nunca `service_role`.
- As tabelas públicas têm RLS e políticas por `owner_id`.
- O nome da fila é validado e passado ao processo sem shell.
- Arquivos temporários do adaptador CUPS são removidos após cada tentativa.
