# Pedido ao backend — balanceamento do início (polir cedo, minas e gemas mais baratas)

Origem: sessão do front. O front não altera o backend; este documento descreve o que pedir à sessão do backend.
Referências lidas: `UniqueServer/appsettings.json` (`Shards:Balance`), `Shards/SIMULACAO-ECONOMIA.md`, `Shards/tools/simulate_economy.py`.

## Motivo
O quartzo é um gargalo grande no início. Para o jogador que visita **1 vez por dia** (referência de calibração):
- a Oficina só abre no **nível 10**, que ele atinge no dia ~7;
- pôr uma mina em gema custa 500 de quartzo (Safira), com renda inicial de ~200 a 280 por dia;
- as minas 4 e 5 custam 1.800 e 5.000, e demoram a sair;
- a lapidação é pesada: 100 por polida e 700 por facetada (3 polidas + 400).

**Meta do dono do projeto:** em 2 a 3 dias o jogador já deve poder polir de forma natural, e o quartzo gasto para polir não pode ser punitivo.

> Ao medir isto, o simulador mostrava "primeira polida no dia 55 a 79" para esse perfil. Isso vinha da política dele
> (mantém 1.500 de quartzo antes de lapidar e só põe ponto na Oficina depois dos 5 do vagonete), não do preço. Sem essa política, o gargalo real
> é o **nível 10 da Oficina** e o **custo da gema**. Vale revisar a política do `simulate_economy.py` ao refazer a simulação.

## Mudanças pedidas (só configuração, `Shards:Balance`)

| Chave | Hoje | Pedido |
|---|---|---|
| `SkillRequirements` Workshop nível 1 (`MinPlayerLevel`) | 10 | **4** |
| `SkillRequirements` Workshop nível 2 (`MinPlayerLevel`) | 14 | **7** |
| `Productions` Sapphire (`SwitchCost`, quartzo) | 500 | **150** |
| `Productions` Ruby | 1.200 | **400** |
| `Productions` Emerald | 3.000 | **1.000** |
| `Workshop` Polished (`Cost`, quartzo) | 100 | **25** |
| `Workshop` Faceted (`Cost`, quartzo) | 400 | **625** |
| `Mines` 3 (`UnlockCost`) | 600 | **300** |
| `Mines` 4 | 1.800 | **700** |
| `Mines` 5 | 5.000 | **1.500** |

Mantidos: Mina 2 (200), `Deposits` (todos os valores, inclusive `PrizePerDefense` 40 e os níveis 14/17/20 de `SkillRequirements`), `CartUpgrades`.

### Por que polida 25 e facetada 625
Uma facetada completa gasta 3 polidas mais o custo da facetada. Com 3 × 25 + 625 = **700**, o total **não muda**. Assim a calibração dos depósitos
(prêmio, defesa, energia de exploração), que assume ~700 de quartzo por facetada, continua valendo sem retunar nada.
Rodado no simulador com `--config`: a tabela 3.1 (custo para quebrar a defesa) fica idêntica e a 3.5 (prêmio/custo) continua em 1,21x a 1,81x.
A polida passa a custar ~10% da renda diária no início, que resolve o quartzo "punitivo" para polir.

Alternativa **rejeitada por ora**: polida 25 e facetada 100 (facetada completa = 175). O prêmio/custo dos depósitos subiria para 3,8x a 6,3x e eles virariam
uma fonte de quartzo; exigiria baixar `PrizePerDefense` (40 → ~12) ou subir as defesas das faixas. Se quiser ir por esse caminho, é uma decisão à parte, com dados reais.

## Efeito esperado (simulador, 1 visita por dia)
| Cenário | Oficina disponível | Primeira polida |
|---|---|---|
| Atual, política de início | nível 10, dia 7 | dia 7 |
| Pedido acima | nível 4, dia 2 | **dia 3** |

Com o nível da Oficina em 4 e a Safira a 150, o jogador converte a mina 2 no dia 2 e poli no dia 3.

## Verificações pedidas ao backend (não consegui confirmar)
1. **Polida como munição de ataque.** Pela configuração, a gema polida também tem ataque (Rubi: 4 pontos, contra 32 da facetada). Com a polida a 25, cada ponto
   de ataque dela custa ~6 de quartzo (25 / 4), contra ~22 da facetada (700 / 32): seria a munição mais eficiente, e alguém poderia atacar depósitos só com polidas.
   O simulador só avalia facetadas. Conferir no código de ataque se `Deposits.MaxAttackStacks` (10) e as regras de ataque contêm isso. Se não contiverem,
   subir um pouco o custo da polida ou reduzir o ataque dela (`Attack.Polished`) antes de aplicar.
2. **Níveis dos depósitos.** Os depósitos seguem exigindo nível 14 (e Oficina 1). O jogador passa a ter polidas ~12 dias antes de poder atacar. Confirmar que isso é desejado
   (o estoque de gemas polidas acumula até lá) ou se vale adiantar o nível dos depósitos.
3. **Missões.** O simulador não modela recompensas de missões e diárias (~3.600 de quartzo em missões únicas). O início real deve ser um pouco mais folgado que o simulado;
   revisar se alguma recompensa em quartzo ficou redundante.

## O que o simulador ainda não cobre
- O vagonete passando a receber o que se minera (`docs/PEDIDO-BACKEND-VAGONETE.md`): a capacidade limita também a mineração ativa, então os primeiros níveis do vagonete pesam mais no começo.
  Os custos dos níveis do vagonete **não** estão neste pedido; se o início seguir apertado depois dele, rever (sugestão a testar: 200 / 500 / 1.200 / 3.000 / 6.000).
- Com o preço da lapidação baixo e **sem reserva**, o jogador que lapida tudo o que pode gasta o quartzo em polir e deixa de comprar a mina 3 por um bom tempo.
  Não é um erro do pedido, mas indica que o quartzo cedo ainda é curto; acompanhar com jogadores reais.

## Como reproduzir
`python Shards/tools/simulate_economy.py --days 90 --markdown --config <appsettings com os valores acima>` (o relatório quebra com `--days` menor que 90).
Para a linha do tempo de início é preciso trocar a política do jogador simulado: ponto na Oficina assim que o nível permitir e `craft_reserve=0`.

## Testes
O pedido é só de configuração, mas `GameBalanceOptionsValidator` e os testes que fixam os valores de `appsettings.json`
(`ShardsTests`: custos de mina, produção, oficina, requisitos de nível) precisam ser atualizados para os valores novos.
