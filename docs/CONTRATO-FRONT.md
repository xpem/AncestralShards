# Ancestral Shards — Contrato da API para o front

Este documento é a fonte de verdade para quem constrói o cliente web. O backend vive em `D:\Emanuel\Projetos\UniqueServer\UniqueServer`
(módulo `Shards/`). Em caso de dúvida, vale o código: `Shards/Service/*`, `Shards/Model/Res/*` e `UniqueServer/Controllers/ShardsController.cs`.
Para testar as rotas à mão: `Shards/Shards.http`. Regras de balanceamento: `Shards/PLANO.md` (seção 3 e seção 7).

## 1. Convenções gerais

| Item | Valor |
|---|---|
| Base em desenvolvimento | `http://localhost:5022` (perfil `http`/`https` do `UniqueServer`) |
| Base em produção | mesmo domínio, prefixo `/api` (nginx) |
| JSON | `camelCase`; enums como **texto** (`"Quartz"`, `"Active"`); datas em ISO 8601 UTC com `Z` |
| Rotas | `/Shards/...` (o ASP.NET não diferencia maiúsculas: `/shards/state` também funciona) |
| Autenticação | `Authorization: Bearer <token>` em **todas** as rotas do Shards. O jogador é sempre o dono do token |
| CORS | não é preciso: use o proxy `/api` do Angular (mesma origem), como no `XPEMInventory` |
| Rate limit | **30 requisições a cada 10 s por jogador** (resposta `429`, texto simples). Por isso a mineração tem o campo `times` |
| Status | `200` ok · `400` regra de negócio (`{code,message}`) · `401` sem token/expirado · `409` conflito de concorrência · `429` rate limit |

### Atenção: o OpenAPI tipa inteiros como `integer | string`
É uma peculiaridade do .NET 10. **Não gere o cliente a partir do OpenAPI**: escreva as interfaces à mão (seção 6).

### Erros de regra de negócio
Sempre que uma regra do jogo impede a ação, a resposta é `400` (ou `409`) com este corpo:

```json
{ "code": "NotEnoughEnergy", "message": "Energia insuficiente." }
```

Mapeie por `code` (estável); `message` está em português e serve de reserva. Códigos na seção 5.

Dois erros **não** têm esse formato (são do ASP.NET): corpo JSON malformado, por exemplo `{"times":"abc"}` → `400` com `ProblemDetails`;
e o `429` (texto). Trate qualquer `400` sem `code` como "pedido inválido".

## 2. Autenticação (módulo de usuários, já existente)

| Rota | Body | Resposta |
|---|---|---|
| `POST /User` | `{ "name": "...", "email": "...", "password": "...", "source": "shards" }` | cria a conta (nome 4–150, senha 4–30 caracteres) |
| `POST /User/Session` | `{ "email": "...", "password": "...", "source": "shards" }` | `200 { "token": "...", "refreshToken": "..." }` |
| `POST /User/Session/Refresh` | `{ "refreshToken": "..." }` | `200 { "token": "...", "refreshToken": "..." }` (o refresh token **é trocado** a cada uso) |
| `GET /User` | — | dados do usuário (precisa de token) |

- O `token` vale **15 dias**; o `refreshToken`, **90 dias**.
- Em erro, essas rotas respondem `400` com **texto simples** (ex.: `User/Password incorrect`), não JSON `{code,message}`.
- Reaproveite do `XPEMInventory`: `auth.service`, `token-interceptor`, `auth-guard` e a tela de login.

## 3. Rotas do jogo (7)

Todas exigem token. Exceto o `GET /Shards/state`, todas são `POST`.

### 3.1 `GET /Shards/state` — estado completo
Cria o jogador no primeiro acesso (nível 0, energia 100/100, Mina 1, Missão 1). É a **única** rota que traz `serverTimeUtc`, `productions` e `nextMine`.

```json
{
  "serverTimeUtc": "2026-10-13T00:05:00Z",
  "player": { "level": 0, "experience": 0, "experienceToNextLevel": 15, "skillPoints": 0,
              "energy": 100, "maxEnergy": 100, "secondsPerEnergy": 216, "nextEnergyAtUtc": null },
  "skills": [ { "type": "DoubleDrop", "level": 0, "maxLevel": 5 }, { "type": "MineSlots", "level": 0, "maxLevel": 4 },
              { "type": "CartCapacity", "level": 0, "maxLevel": 5 } ],
  "mineSlots": { "used": 1, "total": 1 },
  "inventory": [],
  "mines": [ { "mineNumber": 1, "production": "Quartz", "cartLevel": 0, "cartCapacity": 100, "cartAmount": 0,
               "cartFullAtUtc": "2026-10-13T05:08:00Z", "oresPerMinute": 0.33 } ],
  "cartUpgrades": [ { "mineNumber": 1, "cartLevel": 0,
                      "next": { "level": 1, "capacity": 150, "cost": [ { "oreType": "Quartz", "quantity": 300 } ],
                                "canAfford": false, "skillAllows": false } } ],
  "missions": [ { "type": "FirstPickaxe", "name": "Primeira Picaretagem", "description": "Gaste 10 pontos de energia minerando.",
                  "status": "Active", "progress": 0, "goal": 10, "reward": { "xp": 15, "ores": [] } } ],
  "nextMine": { "mineNumber": 2, "cost": [ { "oreType": "Quartz", "quantity": 200 } ], "canAfford": false, "hasSlot": false },
  "productions": [
    { "focus": "Quartz",   "switchCost": [], "canAfford": true,
      "drops": [ { "oreType": "Quartz", "chance": 1, "xp": 1 } ] },
    { "focus": "Sapphire", "switchCost": [ { "oreType": "Quartz", "quantity": 500 } ], "canAfford": false,
      "drops": [ { "oreType": "Sapphire", "chance": 0.9, "xp": 3 }, { "oreType": "Quartz", "chance": 0.1, "xp": 1 } ] }
  ]
}
```

- `inventory` só lista minérios com quantidade > 0. `skills` lista **todas** as skills (nível 0 se o jogador não tem).
- `missions` traz só as **visíveis**: `Active` ou `Completed` (ainda não resgatadas). Resgatadas somem.
- `nextMine` é `null` quando não há mais minas à venda. `canAfford` vale para o inventário atual. `hasSlot` indica espaço livre para mais uma mina (skill `MineSlots`); comprar exige `hasSlot` **e** `canAfford`.
- `mineSlots` = `{ used, total }`: minas que o jogador tem / quantas pode ter. `total` nunca fica abaixo de `used` (contas antigas podem ter mais minas que espaços).
- Tipos de skill desconhecidos podem aparecer em `skills[]`: a tela deve tolerá-los (mostre o nome cru).
- `productions[].canAfford` também considera só o inventário (não o que o vagonete entregaria na troca).
- `cartUpgrades[]`: uma entrada por mina. `next` é `null` no nível máximo; senão `{ level, capacity, cost, canAfford, skillAllows }`.
  `canAfford` olha o inventário atual; `skillAllows` diz se a skill `CartCapacity` já permite esse nível.
- `cartAmount` é a quantidade **no momento da resposta**; `cartFullAtUtc` é quando enche (`null` se a mina não produz).

### 3.2 `POST /Shards/mines/{mineNumber}/mine` — mineração ativa
Body **opcional**: `{ "times": 10 }` (1 a 100; padrão 1). Gasta 1 de energia por mineração.

```json
{ "drops": [ { "oreType": "Sapphire", "quantity": 10 }, { "oreType": "Quartz", "quantity": 1 } ],
  "doubleDrops": 1, "xpGained": 28, "levelUp": true,
  "player": { "level": 1, "experience": 28, "experienceToNextLevel": 17, "skillPoints": 1, "energy": 90, "maxEnergy": 100,
              "secondsPerEnergy": 216, "nextEnergyAtUtc": "2026-10-13T00:09:24Z" },
  "missions": [ { "type": "FirstPickaxe", "...": "...", "status": "Completed", "progress": 10, "goal": 10 } ] }
```

- Exemplo para `times: 10` numa mina em Safira: 10 minerações, das quais 1 rendeu minério extra (`doubleDrops`), por isso são 11 minérios nos `drops`.
  O XP é o do drop, uma vez por mineração (9 safiras × 3 + 1 quartzo × 1 = 28).
- **Não devolve o inventário**: some `drops` ao inventário local.
- `missions` traz só as que **mudaram** nesta ação (mescle por `type`).
- `doubleDrops` = quantas minerações renderam minério extra (skill DoubleDrop). Os `drops` já incluem o extra.
- Erros: `InvalidTimes`, `NotEnoughEnergy`, `MineNotFound`, `PlayerNotFound`.

### 3.3 `POST /Shards/mines/{mineNumber}/collect-cart` — esvaziar o vagonete
Sem body.

```json
{ "collected": [ { "oreType": "Quartz", "quantity": 33 } ], "total": 33,
  "cart": { "mineNumber": 1, "production": "Quartz", "cartLevel": 0, "cartCapacity": 100, "cartAmount": 0, "cartFullAtUtc": "...", "oresPerMinute": 0.33 },
  "inventory": [ { "oreType": "Quartz", "quantity": 45 } ] }
```
- `inventory` é o inventário **completo** atualizado. Sem XP, sem drop duplo. Erros: `CartEmpty`, `MineNotFound`.

### 3.4 `POST /Shards/mines/{mineNumber}/production` — tipo de produção da mina
Body: `{ "focus": "Sapphire" }` (`Quartz`, `Sapphire`, `Ruby` ou `Emerald`).

```json
{ "mine": { "mineNumber": 1, "production": "Sapphire", "...": "..." },
  "collected": [ { "oreType": "Quartz", "quantity": 3 } ],
  "spent": [ { "oreType": "Quartz", "quantity": 500 } ],
  "inventory": [ { "oreType": "Quartz", "quantity": 3 } ],
  "missions": [ { "type": "FirstGem", "status": "Completed", "...": "..." } ] }
```
- O custo é **por mina e a cada mudança**. Voltar para `Quartz` é de graça (`spent` vazio).
- A troca **esvazia o vagonete antes**, com a produção antiga (`collected`); isso conta para pagar a troca. Sem recursos: `NotEnoughResources` e nada muda.
- Erros: `InvalidProduction`, `SameProduction`, `NotEnoughResources`, `MineNotFound`.

### 3.5 `POST /Shards/mines/unlock` — comprar a próxima mina
Sem body. Exige espaço livre (`nextMine.hasSlot`) **e** `nextMine.cost` (200 Quartzo para a Mina 2). Sem espaço: `MineSlotsFull`, antes de cobrar.
Ordem das verificações: `NoMoreMines`, `MineSlotsFull`, `NotEnoughResources`.

```json
{ "mine": { "mineNumber": 2, "production": "Quartz", "...": "..." }, "inventory": [ ... ], "missions": [ ... ] }
```
- Erros: `MineSlotsFull`, `NotEnoughResources`, `NoMoreMines`. A mina nova sempre começa produzindo `Quartz`, com o vagonete vazio.

### 3.6 `POST /Shards/skills/distribute` — gastar ponto de habilidade
Body: `{ "skillType": "DoubleDrop" }`, `{ "skillType": "MineSlots" }` ou `{ "skillType": "CartCapacity" }`. Cada ponto sobe a skill 1 nível (máximo em `skills[].maxLevel`).
Cada ponto em `MineSlots` libera 1 espaço de mina (1 de base + até 4 níveis = 5 minas).
`CartCapacity` é um **teto**, não um total: com a skill no nível N, **cada** mina pode ser ampliada até o nível N (máximo em `skills[].maxLevel`, hoje 5).

```json
{ "skills": [ { "type": "DoubleDrop", "level": 1, "maxLevel": 5 }, { "type": "MineSlots", "level": 0, "maxLevel": 4 }, { "type": "CartCapacity", "level": 0, "maxLevel": 5 } ], "skillPoints": 0, "missions": [ ... ] }
```
- Erros: `InvalidSkill`, `SkillMaxLevel`, `NoSkillPoints`.

### 3.7 `POST /Shards/mines/{mineNumber}/upgrade-cart` — ampliar o vagonete
Sem body. Sobe a mina um nível de vagonete (`cartUpgrades[].next`), pagando `next.cost` em quartzo.

```json
{ "mine": { "mineNumber": 1, "production": "Quartz", "cartLevel": 1, "cartCapacity": 150, "...": "..." },
  "collected": [ { "oreType": "Quartz", "quantity": 33 } ],
  "spent": [ { "oreType": "Quartz", "quantity": 300 } ],
  "inventory": [ { "oreType": "Quartz", "quantity": 45 } ] }
```
- `inventory` é o inventário **completo** atualizado. Sem `missions`.
- O vagonete é **esvaziado antes** de ampliar (`collected`); esse minério conta para pagar. Sem recursos: nada é gravado, nem a coleta.
- Ordem das verificações: `CartMaxLevel`, `CartUpgradeLocked`, `NotEnoughResources`. Erros: esses três, `MineNotFound`, `PlayerNotFound`.

### 3.8 `POST /Shards/missions/{missionType}/claim` — resgatar missão concluída
Sem body. `missionType` é o nome (`FirstPickaxe`, `Specialization`, `OperationalExpansion`, `FirstGem`).

```json
{ "rewards": { "xp": 15, "ores": [] }, "levelUp": true,
  "player": { "...": "..." }, "inventory": [ ... ],
  "missions": [ { "type": "FirstPickaxe", "status": "Claimed", "...": "..." },
                { "type": "Specialization", "status": "Active", "...": "..." } ] }
```
- `missions` traz a missão resgatada (`Claimed` → remova da lista) e a **nova** missão liberada (adicione).
- Erros: `MissionNotFound`, `MissionNotCompleted`, `MissionAlreadyClaimed`.

## 4. Como manter o estado no cliente

**Regra prática:** a mineração é a única ação frequente. Nela, **aplique a resposta localmente** (`player` + `drops` no inventário + `missions` mescladas por `type`).
Depois das demais ações (coleta, troca de produção, compra de mina, skill, resgate), **aplique o que veio e refaça `GET /state`**: campos derivados como
`nextMine`, `productions[].canAfford`, a lista de minas e a Missão nova só são exatos no `state`.
Refaça o `state` também quando a aba voltar ao foco e depois de um `409`.

Mesclar missões: para cada missão da resposta, substitua a de mesmo `type`; se `status == "Claimed"`, remova; se não existe, adicione.

## 5. Códigos de erro

| `code` | HTTP | Quando | Texto sugerido |
|---|---|---|---|
| `PlayerNotFound` | 400 | Chamou uma ação antes do primeiro `GET /state` | "Jogador não encontrado." |
| `MineNotFound` | 400 | O jogador não tem essa mina | "Você ainda não tem esta mina." |
| `NotEnoughEnergy` | 400 | Energia menor que `times` | "Energia insuficiente." |
| `CartEmpty` | 400 | Vagonete sem minério inteiro acumulado | "O vagonete está vazio." |
| `NoSkillPoints` | 400 | Sem ponto de habilidade | "Sem pontos de habilidade." |
| `SkillMaxLevel` | 400 | Skill já no nível máximo | "A habilidade já está no máximo." |
| `InvalidSkill` | 400 | Nome de skill inexistente | "Habilidade inválida." |
| `NotEnoughResources` | 400 | Inventário não cobre o custo | "Recursos insuficientes." |
| `NoMoreMines` | 400 | Não há próxima mina | "Não há mais minas disponíveis." |
| `MineSlotsFull` | 400 | Comprar mina sem espaço livre (antes de cobrar) | "Sem espaço para uma nova mina. Use um ponto de habilidade em Minas." |
| `CartUpgradeLocked` | 400 | A skill `CartCapacity` ainda não permite este nível | "Use um ponto de habilidade em Vagonete para liberar este nível." |
| `CartMaxLevel` | 400 | O vagonete da mina já está no nível máximo | "Vagonete no nível máximo." |
| `MissionNotCompleted` | 400 | Resgate de missão ainda não concluída | "A missão ainda não foi concluída." |
| `MissionNotFound` | 400 | Missão inexistente ou ainda não liberada | "Missão não encontrada." |
| `MissionAlreadyClaimed` | 400 | Recompensa já resgatada | "Recompensa já resgatada." |
| `InvalidTimes` | 400 | `times` fora de 1–100 | "Quantidade inválida (1 a 100)." |
| `InvalidProduction` | 400 | Tipo de produção inexistente | "Tipo de produção inválido." |
| `SameProduction` | 400 | A mina já produz esse minério | "A mina já produz este minério." |
| `ConcurrencyConflict` | **409** | Duas ações concorrentes; **repita** a ação uma vez | "Tente novamente." |

## 6. Interfaces TypeScript (copie para `src/app/models/`)

```ts
export type OreType = 'Quartz' | 'Ruby' | 'Sapphire' | 'Emerald';
export type SkillType = 'DoubleDrop' | 'MineSlots' | 'CartCapacity';
export type MissionType = 'FirstPickaxe' | 'Specialization' | 'OperationalExpansion' | 'FirstGem';
export type MissionStatus = 'Active' | 'Completed' | 'Claimed';

export interface OreAmount { oreType: OreType; quantity: number; }
export interface Drop { oreType: OreType; chance: number; xp: number; }   // chance de 0 a 1

export interface Player {
  level: number; experience: number; experienceToNextLevel: number; skillPoints: number;
  energy: number; maxEnergy: number; secondsPerEnergy: number; nextEnergyAtUtc: string | null;
}
export interface Skill { type: SkillType; level: number; maxLevel: number; }
export interface MineState {
  mineNumber: number; production: OreType; cartLevel: number; cartCapacity: number; cartAmount: number;
  cartFullAtUtc: string | null; oresPerMinute: number;
}
export interface MissionReward { xp: number; ores: OreAmount[]; }
export interface Mission {
  type: MissionType; name: string; description: string; status: MissionStatus;
  progress: number; goal: number; reward: MissionReward;
}
export interface NextMine { mineNumber: number; cost: OreAmount[]; canAfford: boolean; hasSlot: boolean; }
export interface NextCartUpgrade { level: number; capacity: number; cost: OreAmount[]; canAfford: boolean; skillAllows: boolean; }
export interface MineCartUpgrade { mineNumber: number; cartLevel: number; next: NextCartUpgrade | null; }   // next null = nível máximo
export interface MineSlots { used: number; total: number; }               // total nunca fica abaixo de used
export interface ProductionOption { focus: OreType; switchCost: OreAmount[]; drops: Drop[]; canAfford: boolean; }

export interface ShardsState {
  serverTimeUtc: string; player: Player; skills: Skill[]; inventory: OreAmount[]; mines: MineState[];
  missions: Mission[]; nextMine: NextMine | null; productions: ProductionOption[]; mineSlots: MineSlots;
  cartUpgrades: MineCartUpgrade[];
}
export interface MineRequest { times?: number; }                       // body opcional
export interface MineResult { drops: OreAmount[]; doubleDrops: number; xpGained: number; levelUp: boolean; player: Player; missions: Mission[]; }
export interface CollectCartResult { collected: OreAmount[]; total: number; cart: MineState; inventory: OreAmount[]; }
export interface SetProductionRequest { focus: OreType; }
export interface SetProductionResult { mine: MineState; collected: OreAmount[]; spent: OreAmount[]; inventory: OreAmount[]; missions: Mission[]; }
export interface UpgradeCartResult { mine: MineState; collected: OreAmount[]; spent: OreAmount[]; inventory: OreAmount[]; }
export interface UnlockMineResult { mine: MineState; inventory: OreAmount[]; missions: Mission[]; }
export interface DistributeSkillRequest { skillType: SkillType; }
export interface DistributeSkillResult { skills: Skill[]; skillPoints: number; missions: Mission[]; }
export interface ClaimMissionResult { rewards: MissionReward; levelUp: boolean; player: Player; inventory: OreAmount[]; missions: Mission[]; }
export interface ShardsError { code: string; message: string; }
export interface AuthTokens { token: string; refreshToken: string; }
```

## 7. Regras de tempo (para barras e contadores)

- **Energia:** +1 ponto a cada `player.secondsPerEnergy` segundos (hoje 216 s: 100 pontos = 6 h). O `state` e as ações devolvem `energy`, `secondsPerEnergy` e
  `nextEnergyAtUtc` (quando o próximo ponto chega; `null` com a energia cheia).
  Para exibir ao vivo: se `nextEnergyAtUtc <= agora`, os pontos ganhos desde então são `1 + floor((agora − nextEnergyAtUtc) / secondsPerEnergy)`, limitado a `maxEnergy`.
- **Vagonete:** `cartAmount` vale no instante da resposta; cresce `oresPerMinute` por minuto até `cartCapacity`. O servidor arredonda **para baixo**, então mostre "≈". `cartFullAtUtc` diz quando enche.
- **Relógio:** a hora do dispositivo pode estar errada. No `state`, calcule `deslocamento = serverTimeUtc − relógioLocalNoRecebimento` e use `agora = relógioLocal + deslocamento`.
- Só o `state` traz `serverTimeUtc`; nas demais respostas, use o último deslocamento calculado.

## 8. Regras do jogo que a interface deve refletir (valores atuais, **vêm da API: não coloque no código**)

| Tema | Regra atual |
|---|---|
| Mineração ativa | 1 energia por mineração; 1 sorteio por mineração; `times` até 100 numa chamada |
| Nível | XP acumulado para o nível N = `15 × N × (N+1) / 2` (15, 45, 90, 150, 225…). Cada nível dá 1 ponto de habilidade |
| Skill DoubleDrop | +15% de chance de minério extra por nível, até o nível 5. Vale só na mineração ativa (não no vagonete) |
| Vagonete | Começa com 100 minérios, 0,33 por minuto (~5 h para encher); coletar zera o relógio. Pode ser ampliado por mina (ver abaixo) |
| Skill CartCapacity | Teto: com a skill no nível N, cada mina pode ser ampliada até o nível N (até 5). Cada melhoria custa quartzo, por mina: 150 (300) · 220 (800) · 320 (2.000) · 450 (5.000) · 600 (12.000) [capacidade (custo)]; no nível 5 enche em ~30 h |
| Produção Quartz | 100% quartzo, +1 XP por mineração |
| Produção gema (Safira 500 / Rubi 1.200 / Esmeralda 3.000 de quartzo) | 90% gema (+3 XP) e 10% quartzo (+1 XP); o custo é por mina e a cada mudança; voltar ao quartzo é de graça |
| Skill MineSlots | Cada nível libera 1 espaço de mina; 1 mina de base + até 4 níveis = 5 minas |
| Minas 2 a 5 | 200 / 600 / 1.800 / 5.000 quartzo (vêm em `nextMine.cost`). Comprar exige espaço (`hasSlot`) **e** quartzo |
| Missões | 1 `FirstPickaxe` (gastar 10 de energia → +15 XP) · 2 `Specialization` (1º ponto de habilidade em qualquer skill → 25 quartzo) · 3 `OperationalExpansion` (liberar espaço com `MineSlots` e comprar a Mina 2 → sem recompensa) · 4 `FirstGem` (pôr uma mina em gema → +50 XP). Resgate **manual**; a seguinte só aparece depois do resgate da anterior |

Custos, capacidades, probabilidades, metas e recompensas vêm em `state.productions`, `state.nextMine`, `state.cartUpgrades` e `state.missions[].goal/reward`. O único valor que o front precisa
conhecer por conta própria é o **limite de 100 do `times`**.

## 9. Fora do escopo por enquanto

Venda/mercado de minérios, Oficina de Lapidação (estágios bruto/polido/facetado), combate e elementos das gemas. As gemas hoje só se acumulam no inventário.

## 10. Atualização — novas missões e missões diárias (Evoluções 6 e 7)

Detalhes e exemplos de JSON: `PLANO-FRONT-OFICINA.md` (seções 12 e 13, no backend). Os tipos estão em `src/app/models/shards.model.ts`.

**Novas missões (sem rota nova).** `MissionType` passa de 4 para 17 valores (`CartTraining`, `CartUpgrade`, `OpenWorkshop`, `FirstPolish`, `FirstFacet`, `Diversification`, `Collector`, `PolishBatch`, `FullSet`, `FacetBatch`, `ThirdMine`, `FullCart`, `DoubleLuck` somados aos 4 antigos). `collect-cart`, `upgrade-cart` e `workshop/craft` agora devolvem `missions` (mesclar por `type`; `Claimed` sai da lista). Missão pode nascer `Completed`. `CartTraining`, `OpenWorkshop` e `DoubleLuck` exigem ponto de habilidade.

**Diárias.**
- `ShardsState.daily: DailyState | null` (nulo até resgatar a Missão 1: esconder o painel). `DailyState = { day, resetsAtUtc, missions: DailyMission[3], chest: { claimed, canClaim, reward }, streak: { days, cycleDays } }`; `DailyMissionType = Login | Energy | Cart | Quartz | Gems | Polish | Facet`.
- `mine`, `collect-cart` e `workshop/craft` trazem `dailyMissions` (as que mudaram; mesclar por `type`). Diária `Claimed` **permanece** na lista até a virada do dia. `production` e `upgrade-cart` não contam para `Cart`/`Quartz`/`Gems`.
- `POST /Shards/daily/{type}/claim` e `POST /Shards/daily/chest/claim` → `{ rewards, levelUp, player, inventory, daily }` (o `daily` devolvido substitui o local).
- `chest.reward` é o do **próximo** baú; `canClaim` só com as 3 diárias `Claimed`; o último dia do ciclo (`cycleDays`) paga o dobro.
- Ao passar de `resetsAtUtc` refazer `GET /state` (o servidor só cria o dia novo nele).
- Erros (400): `DailyNotFound`, `DailyNotCompleted`, `DailyAlreadyClaimed`, `ChestNotReady`, `ChestAlreadyClaimed`.
