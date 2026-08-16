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

Com o agente ativo, abra **Configurações → Impressão → Adicionar** e escolha uma das filas encontradas. O cadastro manual continua disponível. A conexão `network` envia ESC/POS diretamente pela LAN; a conexão `system` usa a fila instalada no computador.

## Instalação do agente no Mac, Windows ou Linux

Requer Node.js 20 ou superior e a impressora já instalada no sistema operacional. No Mac/Linux, o agente consulta CUPS. No Windows, consulta o spooler com `Get-Printer` e `Get-PrinterPort`, sem instalar ou alterar drivers.

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

O agente escuta somente em `127.0.0.1:17891`. Verifique no navegador com `http://127.0.0.1:17891/health`. Não exponha essa porta na rede. A resposta informa quantas filas foram encontradas e eventual erro de descoberta.

Cada instalação recebe um identificador local próprio. Por isso, uma loja pode ter três ou mais impressoras no mesmo computador e também computadores diferentes com nomes de fila distintos. O painel informa em qual computador cada fila está instalada e direciona o trabalho somente ao agente vinculado.

Para dar um nome reconhecível ao computador, defina `AGENT_NAME`, por exemplo `PC-Cozinha` ou `Caixa-Windows`. A descoberta é refeita automaticamente a cada minuto. Filas que desaparecem são preservadas no histórico como não instaladas, em vez de apagadas.

## Operação e diagnóstico

O agente tenta novamente conforme a configuração da impressora, grava cada tentativa em `print_attempts` e atualiza o status exibido no PDV. `Disponível` confirma o último envio; `Desconectada` indica falha de conexão. Sensores de papel/tampa dependem do retorno suportado pelo modelo/driver e permanecem como status desconhecido quando não houver telemetria.

Para validar a rede: confirme que o computador alcança `192.168.18.100:9100`. No CUPS, confirme que `lpstat -p GS_T80E` lista a fila. No Windows, confirme que a impressora aparece em **Configurações → Bluetooth e dispositivos → Impressoras e scanners**. O job mantém chave de idempotência e vínculo com o agente correto para evitar impressão automática duplicada.

## Segurança

- O agente aceita HTTP apenas no loopback.
- A autenticação usa chave publicável + usuário, nunca `service_role`.
- As tabelas públicas têm RLS e políticas por `owner_id`.
- O nome da fila é validado e passado ao processo sem shell.
- Arquivos temporários do adaptador CUPS são removidos após cada tentativa.
