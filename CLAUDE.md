# AncestralShards — Frontend

<!-- Modelo de CLAUDE.md para o repositório do front. Copie para D:\Emanuel\Projetos\AncestralShards\CLAUDE.md e ajuste. -->

## Projeto

Cliente web do jogo idle **Ancestral Shards** (mineração: o quartzo é a moeda básica; gemas e lapidação nas próximas etapas).
Angular, mobile primeiro, **sem SSR** (é um app logado e interativo).

## Backend

O backend fica em um repositório separado:

**Caminho:** `D:\Emanuel\Projetos\UniqueServer\UniqueServer` (módulo do jogo em `Shards/`)

Ao iniciar qualquer sessão que envolva o backend (rotas, models, regras), solicite acesso a esse diretório via `request_directory` antes de prosseguir.
**Não altere o backend a partir daqui:** se faltar algo na API, descreva o pedido (rota, campo, motivo) e deixe para a sessão do backend.

Documentos de referência (leia antes de mexer em qualquer chamada à API):

- `docs/CONTRATO-FRONT.md` (cópia local; o original não existe mais em `Shards/front/`) — contrato das rotas, interfaces TypeScript, erros e regras de tempo (**fonte de verdade**)
- `Shards/PLANO.md` — decisões e regras do jogo
- `Shards/Shards.http` — roteiro de requisições para testar à mão
- Código: `UniqueServer/Controllers/ShardsController.cs` e `Shards/Model/Res/`

## Stack e decisões

- Angular 20 (como o `XPEMInventory`), componentes standalone, **signals** para o estado, `HttpClient` + interceptor de token.
- Bootstrap 5 para telas de apoio; a tela principal do jogo pode ter CSS próprio.
- Proxy de desenvolvimento: `/api` → `https://localhost:44303` com `pathRewrite` removendo `/api` (o prefixo só existe em produção, via `UsePathBase`). Sem CORS.
- Autenticação: `POST /User/Session` devolve `{ token, refreshToken }`; token de 15 dias, refresh de 90 dias, renovado em `POST /User/Session/Refresh`.
- Reaproveite (copiando) do `D:\Emanuel\Projetos\XpemInventory\XPEMInventory`: `auth.service`, `token-interceptor`, `auth-guard`, login e `proxy.conf.json`.

## Estrutura

- `src/app/pages/` — telas (login, jogo)
- `src/app/services/` — um service por API (`auth`, `shards-api`) e a **store do jogo** (signals)
- `src/app/models/` — interfaces TypeScript do contrato (`docs/CONTRATO-FRONT.md`, seção 6)
- `src/environments/` — ambientes (dev/prod)

## Convenções do jogo (importantes)

1. **Não coloque balanceamento no código.** Custos, chances, metas e recompensas vêm da API (`state.productions`, `state.nextMine`, `state.missions`).
   A única constante do front é o **limite de 100 do `times`** (o intervalo de energia vem em `player.secondsPerEnergy`).
2. **Mineração:** aplique a resposta localmente (`player` + `drops` no inventário + missões mescladas por `type`). Nas demais ações, aplique o que veio e refaça o `GET /Shards/state`.
3. **Use o `times`** para minerar em lote; o limite é de 30 requisições a cada 10 s (`429`). Nunca dispare um POST por clique sem controle.
4. **Erros:** mapeie `code` → texto amigável em um único lugar. Em `409 ConcurrencyConflict`, repita a ação uma vez e refaça o `state`.
5. **Relógio:** use `serverTimeUtc` do `state` para corrigir o relógio do dispositivo; calcule energia e vagonete localmente e reconsulte o `state` quando a aba voltar ao foco.
6. Interfaces TypeScript **escritas à mão** (o OpenAPI tipa inteiros como `integer | string`, não gere cliente automático).

## Como rodar

```bash
npm install
npm start              # ng serve, com o proxy apontando para o backend local
```

O backend local: abrir `D:\Emanuel\Projetos\UniqueServer\UniqueServer` e rodar o projeto `UniqueServer` (perfil `https`, porta 44303 (https)).
Banco de desenvolvimento: `Shards` no Postgres (migrations do módulo já aplicadas).
