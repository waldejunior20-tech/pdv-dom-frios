# Dom Frios Operations UI

## Visual thesis

Uma central operacional sóbria e rápida: navegação escura e estável à esquerda,
conteúdo claro à direita e verde-petróleo reservado para ação, seleção e estado.

## Tokens

- Sidebar: `#17222c`
- Sidebar elevada: `#22313f`
- Accent: `#07978a`
- Accent escuro: `#087c73`
- Canvas: `#f2f4f4`
- Surface: `#ffffff`
- Texto: `#242b31`
- Texto secundário: `#667078`
- Perigo: `#d83b48`
- Raio: 8px em superfícies; 6px em controles
- Sombra: curta e discreta, apenas para separar superfícies

## Layout

- Sidebar desktop: 264px, altura total, navegação rolável e conta no rodapé.
- Conteúdo: cabeçalho contextual seguido de área com largura fluida.
- Mobile: sidebar vira gaveta; barra superior mantém nome da seção e botão do menu.
- Venda+: preserva o fluxo em duas colunas; em telas menores vira fluxo vertical.

## Componentes

- Itens de navegação: ícone, rótulo e estado ativo com fundo elevado e filete verde.
- Botão primário: fundo verde-petróleo, texto branco e altura mínima de 44px.
- Cartões de resumo: número grande, rótulo curto e marcador semântico discreto.
- Estado vazio: orientação direta e uma ação útil, sem ilustração decorativa excessiva.
- “Em breve”: sempre explícito e acompanhado de alternativa funcional.

## Interação

- Troca de módulo não recarrega a aplicação.
- Foco visível em todos os controles.
- Sidebar fecha após navegar em telas estreitas.
- Pedidos reais podem ser pesquisados por cliente ou identificador.
