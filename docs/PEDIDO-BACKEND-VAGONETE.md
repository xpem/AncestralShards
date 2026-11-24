# Pedido ao backend — mineração ativa enche o vagonete

Origem: sessão do front. O front não altera o backend; este documento descreve o que pedir à sessão do backend.
Referências lidas: `Shards/Service/MineService.cs` (`MineAsync`, `CollectCartAsync`, `EmptyCart`), `docs/CONTRATO-FRONT.md` (3.2 e 3.3).

## Regra nova
Hoje `POST /Shards/mines/{n}/mine` grava os minérios sorteados direto no inventário. Passa a gravá-los **no vagonete da mina**.
O jogador só os recebe no inventário ao **coletar** (`collect-cart`). Como o vagonete tem capacidade, ele precisa coletar
antes de continuar minerando:

- Minerar **soma ao vagonete** e só é bloqueado quando ele **não tem espaço**. Coletar libera espaço.
- Energia, XP, nível, missão `FirstPickaxe` e diária `Energy` continuam sendo contados **na mineração** (não esperam a coleta).

## Mudanças na API

### `POST /Shards/mines/{mineNumber}/mine` (`MineRes`)
- Cada mineração ocupa **1 espaço** do vagonete. Espaço livre = `cartCapacity − cartAmount` (a produção automática e a ativa dividem o mesmo teto).
- Se `times` > espaço livre: erro `CartFull` (400), sem gastar energia nem gravar nada. O front já limita `times` ao espaço, então o erro é só rede de segurança (outra aba, relógio).
- Os `drops` (e o extra do `DoubleDrop`) **vão para o vagonete**, não para o inventário.
  Recomendado: o extra do drop em dobro **não** ocupa espaço (pode passar da capacidade), para não perder minério já sorteado.
- **Novo campo `cart: MineState`** na resposta: o vagonete da mina depois da mineração (`cartAmount` já com os drops).
  É o que o front usa para saber que os drops foram ao vagonete; sem `cart` ele assume servidor antigo e soma ao inventário.
- Continua sem devolver o inventário (ele não muda).

### Novo erro `CartFull` (400)
`{ "code": "CartFull", "message": "..." }`. Texto do front: "O vagonete está cheio. Colete antes de minerar."

### `GET /Shards/state`
`mines[].cartAmount` passa a incluir o que foi minerado e ainda não coletado. `cartFullAtUtc` considera o espaço restante.

## Modelo de dados (sugestão)
Hoje o vagonete é só um contador de tempo (`LastCartCollectionUtc`) e o sorteio do tipo de minério acontece na coleta (`EmptyCart`).
A mineração ativa já sorteia o minério na hora, então o vagonete precisa guardar **o que foi minerado, por tipo**
(ex.: tabela/coluna `MineCartOre { MineId, OreType, Quantity }`), além do contador da produção automática.

- `cartAmount` = minério guardado + produção automática acumulada, limitado à capacidade.
- A produção automática só cresce até `capacidade − guardado` (o tempo que o vagonete ficou cheio não rende).

## Quem esvazia o vagonete deve entregar as duas partes
`EmptyCart` é chamado por `collect-cart`, `production` (troca de produção) e `upgrade-cart`. Nos três, entregar ao inventário:
1. o minério **guardado** da mineração ativa (por tipo, sem sortear de novo);
2. a produção **automática** (sorteada com a produção antiga, como hoje).
E então zerar os dois. `collected`/`total` das respostas devem somar as duas partes.

## Missões e diárias
- Minério obtido (diárias `Quartz`/`Gems`, missão `Collector`): contar **na coleta**, quando entra no inventário,
  e não mais na mineração (senão conta duas vezes). `DailyTracker.OreProgress` em `MineAsync` sai; em `CollectCartAsync` já existe.
- `Cart` (diária) e `FullCart` (missão) seguem na coleta; `FullCart` vale quando a coleta saiu com `cartAmount >= cartCapacity`.
- Avaliar o efeito na economia: o jogador passa a ter de coletar para gastar o que minerou (custos de troca de produção e de ampliação
  já descontam o que sai do vagonete, então coletar antes não é obrigatório para pagar).

## Testes sugeridos (`ShardsTests`)
- Minerar com espaço soma ao vagonete e **não** altera o inventário; `cart.cartAmount` bate com os drops.
- `times` maior que o espaço → `CartFull`, energia intacta.
- Coletar entrega minério guardado + automático, zera os dois e conta as diárias de minério uma única vez.
- `production` e `upgrade-cart` com minério guardado: entregam (e pagam com) o guardado.
- Vagonete cheio de minério guardado: produção automática parada.

## Impacto no front (já feito)
- `MineResult.cart?` e erro `CartFull` em `shards.model.ts`/`shards-errors.ts`.
- `GameStore.mine()` limita as minerações ao espaço do vagonete (`cartSpace`); o botão **Minerar**/**×10** fica desabilitado sem espaço.
- Com `cart` na resposta, o front atualiza o vagonete da mina e **não** soma ao inventário; o resumo mostra "(no vagonete)".
- Compatível com o servidor atual (sem `cart`): continua somando ao inventário, mas já respeita o limite de espaço.
