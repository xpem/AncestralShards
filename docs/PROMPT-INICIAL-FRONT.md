# Prompt inicial para a sessão do front

<!--
Como usar:
1. Crie a pasta D:\Emanuel\Projetos\AncestralShards e abra uma sessão nova do Claude Code nela.
2. Copie Shards\front\CLAUDE.md.modelo para D:\Emanuel\Projetos\AncestralShards\CLAUDE.md (ajuste se quiser).
3. Cole o texto abaixo (a partir de "Vamos criar...") como primeira mensagem.
-->

Vamos criar o front do jogo idle **Ancestral Shards**, em Angular, nesta pasta (`D:\Emanuel\Projetos\AncestralShards`), que ainda está vazia.

**Contexto**
O backend já está pronto e fica em `D:\Emanuel\Projetos\UniqueServer\UniqueServer` (módulo `Shards/`). Peça acesso a esse diretório com `request_directory` e leia, nesta ordem:

1. `Shards/front/CONTRATO-FRONT.md` — o contrato da API (rotas, formatos, erros, regras de tempo, interfaces TypeScript). É a fonte de verdade.
2. `Shards/PLANO.md` — as regras e as decisões do jogo.
3. `Shards/Shards.http` — roteiro das requisições.

Meu outro front Angular, `D:\Emanuel\Projetos\XpemInventory\XPEMInventory` (Angular 20, Bootstrap 5, proxy `/api`, interceptor de token, guard), é a referência de padrões e de onde copiar autenticação, interceptor, guard, tela de login e `proxy.conf.json`. Não altere esse projeto.

**Decisões já tomadas**
- Angular 20, componentes standalone, **signals** para o estado, **sem SSR**, mobile primeiro.
- Bootstrap 5 nas telas de apoio; a tela principal do jogo pode ter CSS próprio e deve funcionar bem no celular.
- Proxy de desenvolvimento `/api` → `http://localhost:5022` (sem CORS).
- **Não coloque balanceamento no código**: custos, chances, metas e recompensas vêm da API. A única constante do front é o limite 100 do `times` (o intervalo de energia vem em `player.secondsPerEnergy`).
- Interfaces TypeScript escritas à mão (seção 6 do contrato). **Não gere cliente a partir do OpenAPI.**
- Não altere o backend. Se faltar algo na API, descreva o pedido (rota/campo/motivo) para eu levar à sessão do backend.

**O que quero nesta sessão (primeiro ciclo)**
1. Criar o projeto Angular 20, com o `CLAUDE.md` baseado em `Shards/front/CLAUDE.md.modelo` (ajuste os caminhos e o que fizer sentido).
2. Login (e cadastro) reaproveitando o padrão do `XPEMInventory`, com guard e interceptor.
3. A **store do jogo** (signals): carrega o `GET /Shards/state`, aplica as respostas das ações e corrige o relógio com `serverTimeUtc`. Um service `shards-api` com as 7 rotas e o mapa de erros `code → texto`.
4. A **tela principal**: barra de energia ao vivo, inventário, minas com o vagonete (barra e "≈" de minérios), missões ativas e botões de ação.
5. Minerar (um clique e em lote com `times`) e coletar o vagonete.
6. Missões (resgate), habilidades e compra da Mina 2.
7. Por último, a troca de produção da mina (o `state.productions` traz custos e chances).

**Como trabalhar**
- Antes de escrever código, me mostre um plano curto (estrutura de pastas, telas e a ordem), e eu aprovo.
- Faça em passos pequenos e rode `ng build` a cada passo. Teste as chamadas contra o backend local (`UniqueServer`, perfil `http`, porta 5022). Se o backend não estiver rodando, me avise em vez de simular respostas.
- Se encontrar divergência entre o contrato e o comportamento real da API, **pare e me avise**: o código do backend é quem vale, e o contrato precisa ser corrigido.
- Pergunte antes de decisões grandes (biblioteca de UI, animações, PWA, hospedagem).
