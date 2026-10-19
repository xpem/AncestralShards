# Pedido ao backend — novas missões (vagonete, skills e oficina)

Origem: sessão do front. O front não altera o backend; este documento descreve o que pedir à sessão do backend.
Referências lidas: `Shards/Rules/MissionCatalog.cs`, `Shards/Service/MissionTracker.cs`, `MineService.cs`.

## Motivo
A cadeia atual termina em `FirstGem`. Vagonete (ampliação e skill), skill Workshop e lapidação não têm missão, então
o jogador não é levado a essas telas. As missões já funcionam como tutorial; o pedido é estender a cadeia.

## Novas missões (anexar ao fim de `MissionCatalog.All`, nesta ordem)

| # | `MissionType` | Nome | Descrição | Goal | Condição "já satisfeita" | Avança em |
|---|---|---|---|---|---|---|
| 5 | `CartTraining` | Treinamento de Vagonete | Use um ponto de habilidade em Vagonete. | 1 | skill `CartCapacity` com `Level > 0` | `skills/distribute` com `CartCapacity` |
| 6 | `CartUpgrade` | Vagonete Ampliado | Amplie o vagonete de uma mina. | 1 | alguma mina com `CartLevel` acima do inicial | `upgrade-cart` (sucesso) |
| 7 | `OpenWorkshop` | Abrir a Oficina | Use um ponto de habilidade em Oficina. | 1 | skill `Workshop` com `Level > 0` | `skills/distribute` com `Workshop` |
| 8 | `FirstPolish` | Primeira Lapidação | Pole uma gema na Oficina. | 1 | existe item com `Stage = Polished` ou `Faceted` no inventário | `workshop/craft` com `stage = Polished` |
| 9 | `FirstFacet` | Gema Facetada | Faceteie uma gema na Oficina. | 1 | existe item com `Stage = Faceted` | `workshop/craft` com `stage = Faceted` |

Nomes dos tipos são sugestão; ajuste ao padrão do enum `MissionType` (valores 5 a 9).

## Regras de implementação
1. **Cadeia sequencial.** Como hoje, a seguinte só é criada quando a anterior é resgatada (`CreateMissingNext`).
2. **`CompleteIfAlreadySatisfied`.** Adicionar os 5 casos acima, para quem já fez a ação antes de a missão ser liberada.
   - `CartTraining` e `OpenWorkshop` usam `skills` (já é parâmetro).
   - `CartUpgrade` usa `mines` (já é parâmetro).
   - `FirstPolish` e `FirstFacet` precisam do **inventário por estágio**. A assinatura atual
     (`skills`, `mines`) não o recebe: incluir um parâmetro com os itens do jogador e ajustar os chamadores
     (resgate e `GET /state`).
3. **Pontos de avanço.** Chamar `MissionTracker.AdvanceChanged(...)` nos services de skills, vagonete e oficina, e
   devolver as missões alteradas no campo `missions` das respostas. O front já mescla `missions` por `type` nas
   respostas de `unlock`, `production`, `distribute` e `claim`.
4. **Respostas que ainda não trazem `missions`:**
   - `POST /mines/{n}/upgrade-cart` (`UpgradeCartResult`) → incluir `missions`.
   - `POST /workshop/craft` (`CraftRes`) → incluir `missions`.
   O front sempre refaz o `GET /state` depois dessas ações, então, se preferir não mexer nas respostas, o `state`
   cobre; mas incluir `missions` mantém o padrão do contrato.
5. **Satisfação retroativa de `FirstPolish`/`FirstFacet`:** craftar `Faceted` implica ter passado por `Polished`;
   se o jogador facetar sem ter a missão `FirstPolish` ativa, as duas devem terminar coerentes (a primeira nasce
   concluída pela regra de "já satisfeita").
6. **Testes.** Estender `ShardsTests` com: avanço de cada tipo, criação já concluída, e cadeia completa até o fim.

## Recompensas sugeridas (balanceamento é do servidor; ajuste livremente)
Seguir o padrão atual (XP e minério bruto). Evitar recompensa em gemas lapidadas, para não pular a oficina.

| Missão | XP | Minério |
|---|---|---|
| `CartTraining` | 20 | — |
| `CartUpgrade` | 30 | 50 Quartzo |
| `OpenWorkshop` | 30 | 100 Quartzo (cobre uma polida) |
| `FirstPolish` | 50 | 400 Quartzo (cobre uma facetada) |
| `FirstFacet` | 100 | — |

## Impacto no front
Pequeno: acrescentar os novos valores em `MissionType` em `src/app/models/shards.model.ts`. Nome, descrição, meta e
recompensa já chegam em `state.missions`. Nenhum texto de missão fica no código do front.

## Fora do escopo
Missões repetíveis (ex.: "lapide 10 gemas") ficam para depois de observar o uso das cinco acima.
