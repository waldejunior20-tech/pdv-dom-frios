# Módulo de Impressão — PDV Dom Frios

## Arquitetura

O navegador não acessa a porta TCP 9100. A aplicação web cria trabalhos em `print_jobs` e chama o **Dom Frios Print Agent**, executado somente no computador do caixa em `127.0.0.1`.

O agente:

- valida a origem do navegador;
- valida o access token do Supabase;
- busca o trabalho e a impressora usando o mesmo token/RLS do usuário;
- gera bytes ESC/POS a partir do snapshot persistido do recibo;
- envia para CUPS ou para a impressora de rede;
- registra cada tentativa em `print_attempts`;
- só marca `completed` após a etapa do adaptador concluir.

## GS-T80E no Mac

Configuração conhecida:

- nome: `GS-T80E`;
- fila CUPS: `GS_T80E`;
- modelo: Goldensky GS-T80E;
- papel: 80 mm;
- ESC/POS;
- driver: POS-80 1.2;
- LAN: `socket://192.168.18.100:9100`;
- corte parcial;
- avanço: 3 linhas;
- CUPS atual: `DocCutType=1PartialCutDoc` e `FeedCutAfterJobEnd=3Line`.

### Opção recomendada no Mac

Em **Configurações → Impressão → Adicionar impressora**:

1. Modo: **Instalada no sistema**.
2. Detectar impressoras.
3. Selecionar a fila real **`GS_T80E`**.
4. Papel: **80 mm**.
5. Corte: **Parcial**.
6. Linhas antes do corte: **3**.
7. Destino: **Cozinha** ou **Todos os itens**.
8. Salvar.
9. Testar conexão.
10. Imprimir teste.

O agente usa a fila CUPS em modo RAW (`lp -d GS_T80E -o raw`) para manter o layout e o corte ESC/POS determinísticos. As opções do driver continuam disponíveis no macOS, mas o corte do trabalho do PDV é controlado pelo próprio recibo ESC/POS.

### Opção alternativa

Modo **ESC/POS por rede**:

- IP: `192.168.18.100`;
- porta: `9100`;
- timeout: `3000 ms`;
- tentativas: `2`;
- corte parcial;
- 3 linhas de avanço.

## Instalar e iniciar o agente

```bash
cd agent
npm install
cp .env.example .env
npm run build
npm start
```

Por padrão ele escuta apenas em `http://127.0.0.1:17891`.

Para desenvolvimento local, `PDV_ALLOWED_ORIGINS` já inclui `http://localhost:5173`. Em produção, mantenha apenas os domínios efetivamente usados pelo PDV.

## Teste

Abra **Configurações → Impressão**. O indicador do agente deve ficar verde. Em uma impressora cadastrada:

1. clique **Testar conexão**;
2. confirme o status;
3. clique **Imprimir teste**.

O teste contém `DO FRIOS`, identificação da impressora, data/hora, papel, conexão e status. Em seguida avança as linhas configuradas e executa o corte selecionado.

## Estados da fila

- `pending`: aguardando execução ou nova tentativa;
- `processing`: agente processando;
- `completed`: adaptador concluiu a entrega ao CUPS/dispositivo;
- `failed`: tentativas esgotadas.

Cada tentativa é registrada separadamente.

## Limitações conhecidas

- ESC/POS TCP não oferece confirmação universal de que o papel saiu fisicamente; `completed` significa que a conexão foi aceita e os bytes foram enviados sem erro. No CUPS, o agente acompanha o job até ele deixar a fila de trabalhos não concluídos.
- Algumas impressoras compatíveis com ESC/POS não implementam status detalhado de papel/tampa. Nesses casos a interface exibe `Status desconhecido` em vez de inventar um estado.
- Windows detecta filas, mas a impressão RAW via fila do Windows não está habilitada nesta versão; no Windows use o modo ESC/POS por rede. macOS/Linux têm suporte CUPS completo.
- O cadastro de destinos está pronto. O PDV atual ainda não possui setor por produto; portanto o recibo completo é enviado às impressoras ativas selecionadas. O filtro por item/setor pode ser ligado quando o produto ganhar esse atributo.
- Pagamentos online não existem hoje no PDV. A regra `Após confirmação do pagamento` usa `situacao_pagamento`; vendas locais Pix/Dinheiro/Cartão são confirmadas na finalização e `Prazo` fica pendente. Uma integração online futura só deve alterar esse campo após webhook confirmado.
