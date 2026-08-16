# Pesquisa: descoberta e roteamento de impressoras

Data da pesquisa: 16 de agosto de 2026.

## Conclusão executiva

Um aplicativo web hospedado em HTTPS não deve tentar enumerar ou controlar diretamente as impressoras do computador. O desenho recomendado mantém um agente local Node/TypeScript em cada computador, vinculado à conta/loja, e separa três conceitos:

1. **Impressora lógica da loja**: “Cozinha”, “Balcão”, “Caixa”; é compartilhada e recebe regras de roteamento.
2. **Dispositivo físico**: a impressora real, idealmente identificada por UUID/serial e, na falta deles, por URI/IP/porta normalizados.
3. **Fila local**: o nome que um sistema operacional usa para alcançar o dispositivo (`GS_T80E` no Mac, por exemplo). Uma mesma impressora física pode ter filas com nomes diferentes em vários computadores, e um computador pode ter três ou mais filas.

O Supabase guarda configuração, vínculos e trabalhos; cada agente descobre apenas o que existe no próprio computador, sincroniza um inventário limitado e consome somente os trabalhos destinados às suas vinculações. A impressão continua funcionando se a loja tiver várias impressoras ou vários computadores, sem fixar `GS_T80E` no código.

## O que as plataformas realmente oferecem

### Windows

O módulo oficial PrintManagement fornece `Get-Printer`, que lista impressoras e conexões instaladas no computador e não exige privilégios administrativos. `Get-PrinterPort` lista as portas locais e também não exige administrador. Isso permite correlacionar uma fila com `DriverName`, `PortName`, compartilhamento e estado, e depois resolver portas TCP/IP para endereço/porta quando esses dados estiverem disponíveis. Fontes: [Get-Printer](https://learn.microsoft.com/en-us/powershell/module/printmanagement/get-printer), [Get-PrinterPort](https://learn.microsoft.com/en-us/powershell/module/printmanagement/get-printerport).

Recomendação de descoberta:

- executar PowerShell sem perfil e retornar JSON estruturado, combinando `Get-Printer -Full` e `Get-PrinterPort`;
- conservar `Name`, `ComputerName`, `Type`, `DriverName`, `PortName`, `Shared`, `ShareName`, `PrinterStatus` e a configuração da porta;
- distinguir filas físicas de destinos virtuais como PDF/XPS antes de oferecê-las para pedidos;
- não instalar, remover ou alterar filas durante a descoberta. Operações de configuração são outra permissão e algumas exigem administrador; por exemplo, `Set-Printer` exige credenciais administrativas ([Set-Printer](https://learn.microsoft.com/en-us/powershell/module/printmanagement/set-printer)).

Uma `PortName` não é necessariamente um IP: pode representar USB, WSD, compartilhamento, arquivo ou porta TCP/IP. Portanto, endereço e porta são dados opcionais e não devem ser inferidos apenas do texto do nome. Para portas TCP/IP padrão, o Windows admite host, número da porta, protocolo RAW/LPR e SNMP ([prnport](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/prnport)).

### macOS e Linux (CUPS)

CUPS chama as filas de **destinations**; uma destination pode ser uma impressora ou uma classe/pool. A API `cupsEnumDests` enumera destinos disponíveis, inclusive descoberta dinâmica, e recomenda limitar enumeração interativa a no máximo cinco segundos. Ela também expõe atributos como `printer-state`, `printer-state-reasons`, `printer-make-and-model` e `printer-uri-supported` ([CUPS Programming Manual](https://openprinting.github.io/cups/doc/cupspm.html)).

Para uma primeira implementação portátil sem addon nativo:

- `lpstat -p -d` lista filas instaladas e a padrão;
- `lpstat -v` relaciona filas aos respectivos device URIs;
- `lpstat -e` também inclui destinos disponíveis na rede, que podem ainda não estar configurados localmente;
- `lpstat -l -p <fila>` acrescenta detalhes e estado.

Essas opções são documentadas no manual oficial de [`lpstat`](https://openprinting.github.io/cups/cups-local/lpstat.html). A lista de backends deixa claro que uma URI pode ser `dnssd`, `ipp`, `ipps`, `lpd`, `socket` ou `usb`; URIs diretas são específicas do sistema e devem ser usadas como reportadas ([administração CUPS](https://openprinting.github.io/cups/doc/admin.html)).

O agente deve preferir filas **instaladas** para impressão normal. Destinos apenas descobertos devem aparecer em uma seção “Encontradas na rede”, com ação explícita de associação/configuração; encontrá-los não significa que exista driver, fila utilizável ou autorização para imprimir.

CUPS também aceita classes, que distribuem trabalhos entre membros para balanceamento ou redundância. Elas devem ser marcadas como `kind=class`, não deduplicadas como se fossem uma impressora física ([administração CUPS](https://openprinting.github.io/cups/doc/admin.html)).

### Estado e diagnóstico

Não existe garantia de que uma térmica barata reporte papel, tampa ou corte. Quando CUPS/IPP possui informação, `printer-state` distingue ociosa, imprimindo e parada, e `printer-state-reasons` pode indicar `cover-open`, `media-empty`, `media-jam`, `timed-out` etc. ([CUPS Programming Manual](https://openprinting.github.io/cups/doc/cupspm.html), [estados de backend CUPS](https://openprinting.github.io/cups/doc/api-filter.html)). No Windows, o estado fornecido pelo spooler também depende do driver/monitor da porta.

Assim, a UI deve usar estado em camadas:

- `available`: fila habilitada e agente ativo, sem erro conhecido;
- `disconnected`, `no_paper`, `cover_open`, `error`: somente quando a plataforma/driver fornece evidência;
- `unknown`: informação indisponível ou antiga;
- `agent_offline`: o computador não envia heartbeat dentro do prazo.

Um teste de conexão TCP em `9100` só prova que algum serviço aceitou a conexão; não prova papel, tampa, compatibilidade ESC/POS nem conclusão da impressão. “Trabalho aceito pelo spooler” também não equivale a “papel saiu”.

## Limitações do navegador e comunicação com o agente

A página pública em HTTPS não tem uma API web geral para enumerar as filas do sistema. A enumeração precisa acontecer fora do sandbox do navegador. Além disso, browsers estão restringindo requisições de sites públicos para rede privada e loopback. A documentação do Chrome descreve a permissão Local Network Access para conexões a dispositivos locais e software no próprio computador; ela só pode ser solicitada por contextos seguros ([Chrome Local Network Access](https://developer.chrome.com/blog/local-network-access)). O MDN inclui `fetch`, WebSocket, WebTransport e outros tipos de requisição nessas restrições e distingue os espaços `local` e `loopback` ([MDN Local network access](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Local_network_access)).

Recomendação para o agente HTTP local:

- escutar exclusivamente em `127.0.0.1`/`::1`, nunca em `0.0.0.0`;
- validar `Origin` por allowlist exata da produção e desenvolvimento; não responder com CORS curinga;
- exigir pareamento inicial com código curto e depois token local aleatório, rotacionável, em toda chamada;
- aceitar somente métodos, caminhos e esquemas de payload conhecidos; limitar tamanho, taxa e tempo;
- não oferecer endpoint de “executar comando” nem aceitar caminho de executável/opções arbitrários;
- informar claramente na UI quando a permissão de rede local do browser foi negada;
- permitir que o agente sincronize diretamente com Supabase como caminho operacional principal. Assim, a descoberta e o processamento da fila não dependem de a página conseguir chamar loopback o tempo todo; loopback serve a pareamento, diagnóstico e atualização imediata da tela.

## Identidade estável e deduplicação

Não usar somente o nome da fila. Ele é editável, local ao computador e pode colidir. A identidade deve ser construída por precedência:

1. UUID de impressora/IPP, serial USB ou outro identificador de hardware confiável;
2. URI canônica do dispositivo com UUID DNS-SD;
3. para conexão RAW explícita, `tcp://<ip-normalizado>:<porta>` dentro de uma loja;
4. para IPP, URI normalizada preservando caminho da fila;
5. fallback local: hash de `installation_id + os + queue_name + port_name`, marcado como identidade fraca.

Não fundir automaticamente duas filas só porque têm o mesmo modelo ou IP. Um servidor de impressão pode publicar várias filas no mesmo host, e uma classe CUPS não é o mesmo objeto que seus membros. IP por DHCP também pode mudar. Quando a evidência for fraca, mostrar “possível duplicata” e pedir confirmação.

Modelo recomendado:

```text
stores
  logical_printers          # Cozinha/Balcão/Caixa e regras compartilhadas
  physical_printers         # identidade física deduplicada dentro da loja
  agent_installations       # um registro por computador/instalação
  discovered_queues         # inventário efêmero por agente e fila local
  printer_bindings          # logical_printer + agent + discovered_queue
  print_jobs
  print_job_attempts
```

Chaves/constraints importantes:

- `agent_installations`: UUID gerado na instalação, não hostname; hostname pode mudar e não é secreto;
- `discovered_queues`: único por `(agent_installation_id, platform_queue_id)`;
- `physical_printers`: unicidade parcial por `(store_id, strong_fingerprint)` somente quando a impressão digital for forte;
- `printer_bindings`: único por `(logical_printer_id, agent_installation_id)` se cada computador tiver um único caminho para aquele destino, ou incluir `queue_id` quando houver failover explícito;
- `print_jobs`: chave de idempotência por evento, destino lógico e versão do pedido;
- `print_job_attempts`: um claim atômico por agente, lease com expiração e registro imutável de resultado.

## Três ou mais impressoras e vários computadores

O roteamento deve selecionar **destinos lógicos**, não nomes de fila. Exemplo:

```text
Pedido 412
  itens frios     -> Cozinha -> PC-Cozinha / GS_T80E
  comprovante     -> Caixa   -> PC-Caixa / EPSON-TM-T20
  expedição       -> Balcão  -> Notebook / Impressora_Balcao
```

Cada destino lógico pode ter:

- uma vinculação primária e uma reserva;
- filtros por categoria/tipo de documento;
- número de cópias e layout próprios;
- política `one_agent` (exatamente um agente imprime) ou `all_bindings` (uma cópia em cada vínculo), escolhida explicitamente.

Para evitar duplicatas com dois computadores online, o banco deve conceder o trabalho por RPC/transação atômica (`FOR UPDATE SKIP LOCKED` ou atualização condicional), emitir um lease curto e exigir idempotency key. O compartilhamento de configuração nunca deve significar que todos os agentes imprimem o mesmo job por padrão.

Quando uma fila desaparece, o agente a marca `last_seen_at`; não apaga imediatamente o vínculo. Isso suporta notebook desligado, rede temporariamente indisponível e renomeação. Depois de um período, a UI oferece remapear a fila mantendo a impressora lógica e o histórico.

## Sincronização segura com Supabase

Tabelas expostas devem ter RLS e grants mínimos. A documentação Supabase exige RLS nos schemas expostos e alerta que chaves secret/service-role ignoram RLS e nunca devem ser distribuídas ao frontend ou a computadores de clientes ([Securing your data](https://supabase.com/docs/guides/database/secure-data), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)).

Portanto:

- não embutir `service_role` ou secret key no agente;
- parear cada instalação com identidade revogável, limitada a uma loja e a um `agent_installation_id`;
- preferir RPCs estreitas para `heartbeat`, `sync_discovery`, `claim_jobs`, `complete_attempt` e `fail_attempt`;
- políticas devem validar loja, instalação, usuário e transições de estado; o agente não deve poder escolher arbitrariamente outra loja;
- o inventário enviado deve conter metadados de impressão necessários, não usuários, documentos, senhas SNMP nem credenciais de compartilhamentos;
- atualizar por upsert e marcar ausentes por `last_seen_at`; não aceitar exclusão em massa vinda do agente;
- registrar versão do agente, plataforma e capabilities; nunca confiar em status enviado para decisões financeiras;
- reter histórico de tentativas, mas limitar logs e remover conteúdo sensível do pedido.

## Execução segura de ferramentas do sistema

No Node, usar `execFile`/`spawn` com `shell: false`, caminho do binário conhecido e argumentos em array. A documentação oficial observa que `execFile` não abre shell por padrão e alerta para não passar entrada não sanitizada quando shell estiver habilitado ([Node.js child_process](https://nodejs.org/api/child_process.html)).

Controles mínimos:

- allowlist de comandos (`lpstat`, `lp`, PowerShell com script empacotado) e de opções;
- nunca interpolar fila, arquivo, IP ou texto do pedido numa linha de shell;
- timeout, limite de saída, ambiente mínimo e diretório de trabalho fixo;
- validar queue ID contra a última descoberta antes de imprimir;
- arquivos temporários com permissões restritas e remoção após spool;
- executar como usuário comum, sem administrador/root;
- para ESC/POS TCP, permitir somente endpoints previamente vinculados à loja, bloquear loopback/link-local/metadados de nuvem e revalidar o destino antes da conexão.

O comando ESC/POS de corte varia por equipamento. A referência Epson documenta `GS V`: `m=0/48` para corte total, `m=1/49` para parcial e as variantes `65/66` para avançar e cortar ([Epson GS V](https://download4.epson.biz/sec_pubs/pos/reference_en/escpos/gs_cv.html)). Como a GS-T80E é compatível, não uma Epson, a capability deve ser configurável/testada por modelo; não se deve presumir suporte universal.

## Plano recomendado de implementação

1. Criar o modelo de `agent_installations`, `discovered_queues`, `physical_printers` e `printer_bindings`, mantendo migração compatível com as impressoras já cadastradas.
2. Implementar adaptadores de descoberta somente leitura: Windows PrintManagement; macOS/Linux CUPS. Normalizar para um DTO comum com `installed`, `discoverable`, `kind`, `queue`, `device_uri`, endereço opcional, driver/modelo, estado, reasons, capabilities e fingerprint strength.
3. Implementar heartbeat e sincronização por RPC com RLS, upsert e `last_seen_at`.
4. Alterar “Adicionar impressora” para primeiro consultar o agente: abas “Instaladas neste computador”, “Encontradas na rede” e “Configuração manual”. Permitir selecionar várias, dar nomes lógicos e confirmar possíveis duplicatas.
5. Adicionar vinculação por computador e roteamento por destino lógico, com política explícita de primária/reserva ou todas.
6. Endurecer claim/lease/idempotência para impedir impressão duplicada quando vários agentes estiverem online.
7. Testar matriz: Mac e Windows apontando para a mesma GS-T80E; três impressoras em uma loja; fila renomeada; DHCP alterado; agente offline durante job; spooler aceita mas dispositivo falha; dois agentes concorrendo; destino CUPS descoberto mas não instalado.

## Armadilhas a evitar

- confundir descoberta de rede com fila pronta para imprimir;
- usar nome amigável, hostname ou modelo como identidade física;
- assumir que IP é estável ou que toda `PortName` é IP;
- transformar “compartilhar em vários computadores” em impressão duplicada;
- declarar “sem papel” sem evidência do driver/IPP;
- varrer toda a sub-rede por portas; além de lento e ruidoso, não identifica capabilities com segurança;
- deixar o agente acessível pela LAN ou aceitar CORS universal;
- guardar secret/service-role no instalador;
- executar comandos compostos com shell ou dados do usuário;
- enviar ESC/POS diretamente para uma fila cujo driver espera PDF/raster;
- depender exclusivamente da chamada HTTPS -> localhost, sujeita a permissão/restrições do navegador;
- presumir que comandos de corte Epson funcionam de forma idêntica em todo clone ESC/POS.
