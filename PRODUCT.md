# Dom Frios — contexto do produto

## O que é

Sistema web operacional da Dom Frios para registrar vendas, acompanhar pedidos,
administrar o catálogo e operar impressão térmica. A interface é usada no balcão
em computadores desktop, mas deve continuar utilizável em tablets e telas menores.

## Usuários e contexto

- Operadores de caixa que precisam lançar uma venda rapidamente.
- Proprietário/gestor que acompanha pedidos e configura a operação.
- Uso diário, com pouco tempo para treinamento e necessidade de leitura rápida.
- Uma loja pode ter vários computadores e até três impressoras térmicas.

## Capacidades atuais

- Autenticação com Supabase.
- Catálogo de produtos ativos, incluindo produtos por unidade e por peso.
- Carrinho, pagamento e finalização transacional da venda.
- Pedidos e cabeçalhos de venda armazenados no Supabase.
- Configuração, descoberta local, fila, histórico e agente de impressão térmica.

## Direção desta fase

- Pedidos é a página inicial após o acesso.
- O caixa existente passa a se chamar Venda+.
- Navegação lateral persistente organiza Pedidos, Cardápio, Financeiro, Entrega,
  Fidelidade, Venda+, Sistema e Configurações.
- Módulos ainda não implementados devem declarar “Em breve”; nunca simular dados
  ou ações que não existem.

## Direção visual

- Identidade Dom Frios: verde-petróleo como destaque e azul-carvão na navegação.
- Área de trabalho clara, tipografia direta, cartões contidos e estados legíveis.
- Referências fornecidas pelo usuário orientam a arquitetura de navegação e os
  fluxos operacionais, sem copiar marca, conteúdo ou detalhes proprietários.

## Princípios

1. Verdade funcional: controles visíveis precisam funcionar.
2. Operação primeiro: decisões frequentes ficam mais próximas e mais claras.
3. Crescimento modular: cada nova área entra sem aumentar o acoplamento do caixa.
4. Acessibilidade: foco visível, alvos confortáveis e navegação por teclado.
5. Segurança: toda leitura e gravação respeita autenticação e RLS do Supabase.

## Suposições desta fase

- A resposta “sim, pode” foi interpretada como aprovação para usar Pedidos como
  página inicial e manter o caixa atual em Venda+.
- Dados reais de `vendas` são a fonte da visão inicial de pedidos.
- Cardápio, Financeiro, Entrega e Fidelidade serão implementados em fases futuras.
