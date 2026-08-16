# Migração do PDV Dom Frios

## Repositório oficial

`waldejunior20-tech/pdv-dom-frios`

## Estrutura

- `main`: Touch POS V2 validado por CI e candidato à produção.
- `develop`: desenvolvimento contínuo; atualmente sincronizado com `main`.

## Legado temporário

A versão estática que ainda serve como referência para o sistema antigo permanece temporariamente no repositório `waldejunior20-tech/jarvis-web`, branches:

- `pdv-dom-frios`
- `pdv-dom-frios-v2`

Essas branches não devem receber novas alterações. Elas só devem ser removidas depois que a Vercel estiver conectada ao repositório oficial e a nova versão estiver validada em produção.

## Vercel atual

Projeto existente: `pdv-dom-frios`

Domínio atual: `pdv-dom-frios.vercel.app`

A migração da origem Git deve apontar para o repositório oficial acima antes de remover o legado do Jarvis.
