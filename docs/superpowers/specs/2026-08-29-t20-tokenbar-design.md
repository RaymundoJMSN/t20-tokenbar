# t20-tokenbar — mod do Monk's TokenBar para Tormenta20

Data: 2026-08-29
Status: aprovado, pronto pro plano de implementação

## Problema

O Monk's TokenBar tem suporte a Tormenta20 (`systems/tormenta20-rolls.js`), mas incompleto:

1. **Não sobe de nível.** `assignXP` soma XP e sussurra "você subiu de nível", só isso. No T20
   `system.attributes.nivel.value` é **derivado**: `prepareBaseData` (tormenta20.mjs:17046) o
   recalcula como a soma de `system.niveis` dos itens `classe` (getter `nivel`, tormenta20.mjs:7711).
   Escrever `nivel.value` não persiste.
2. **Inspiração é do dnd5e.** A barra lê `system.attributes.inspiration` (booleano, coroa,
   `apps/tokenbar.js:616`). No módulo `t20-inspiracao` do Ray a inspiração é um número em
   `flags.t20-inspiracao.pontos`.
3. **Uma lista de stats só.** O setting `stats` é de mundo, então mestre e jogador veem os mesmos
   números — incluindo o PV exato dos NPCs e uns dos outros. O `healthEstimate` já resolve isso no
   canvas, mas não chega na barra.
4. **`getValue` devolve `null`.** Ao pedir um teste, o diálogo do monks mostra o modificador de cada
   ator ao lado do nome; em T20 vem vazio.

## Solução

Um módulo separado, `t20-tokenbar`, que patcha o monks de fora. Não substitui nada: os dois ficam
ativos juntos, o monks continua atualizando sozinho.

Não é fork. Forkar significaria carregar 8.700 linhas com 15 sistemas dentro e fazer merge manual a
cada release do IronMonk — a dor do `tah-t20`, dez vezes maior. Como mod, só os 2 patches e os 5
hooks podem quebrar num update.

### Onde vive

- Repo/dev: `C:\Users\rayna\Soltos\t20-tokenbar` (git local, sem GitHub).
- Foundry: junction `X:\FoundryVTT\Data\modules\t20-tokenbar` → pasta acima. Editar e dar F5.
- Mesmo padrão de `t20-inspiracao` e `t20-nivel-poderes`.

### Arquivos

```
module.json
scripts/main.mjs            hooks, patches, settings, UI
scripts/regras.mjs          regras puras de nível (node scripts/regras.mjs --check)
styles/t20-tokenbar.css     badge ✨N e cor da estimativa
docs/superpowers/specs/     este spec
```

### module.json

```json
{
  "id": "t20-tokenbar",
  "title": "T20 TokenBar",
  "version": "1.0.0",
  "compatibility": { "minimum": "13", "verified": "13" },
  "relationships": {
    "requires": [{ "id": "monks-tokenbar", "type": "module" }],
    "systems":  [{ "id": "tormenta20", "type": "system" }]
  },
  "esmodules": ["scripts/main.mjs"],
  "styles": ["styles/t20-tokenbar.css"],
  "flags": { "hotReload": { "extensions": ["css"], "paths": ["styles/t20-tokenbar.css"] } }
}
```

`healthEstimate` e `t20-inspiracao` ficam **fora** do `requires`: são opcionais, detectados em
runtime com `game.modules.get(id)?.active`. Sem eles, `@estimate` e o ✨N simplesmente não aparecem.

### Como o main.mjs alcança as classes do monks

Import estático no topo, resolvido pela mesma URL que o Foundry usa pra carregar o monks — logo, a
mesma instância de módulo:

```js
import { MonksTokenBar } from "../../monks-tokenbar/monks-tokenbar.js";
import { TokenBar }      from "../../monks-tokenbar/apps/tokenbar.js";
import { EditStats }     from "../../monks-tokenbar/apps/editstats.js";
import { Tormenta20Rolls } from "../../monks-tokenbar/systems/tormenta20-rolls.js";
```

Se o monks estiver desativado o import quebra — por isso o `requires`, que faz o Foundry recusar
ligar o `t20-tokenbar` sozinho. Os patches vão em `Hooks.once("init")`, que roda antes do
`ready` onde o monks instancia a barra (`monks-tokenbar.js:484`).

---

## Feature 1 — Stats do mestre × stats do jogador

A barra é uma `ApplicationV2` renderizada por cliente, **sem socket** (`apps/tokenbar.js` não emite
nada). Então não é preciso barra dupla: basta ramificar em `game.user.isGM`.

### Configuração

- Setting `stats-jogador`: `scope: "world"`, `config: false`, `type: Object`, default `[]`.
- `game.settings.registerMenu("t20-tokenbar", "editStatsJogador", { restricted: true, type: EditStatsJogador })`
  com nome "Stats dos jogadores".

`EditStatsJogador extends EditStats` reusa o editor do monks inteiro. Só muda:

- `DEFAULT_OPTIONS`: `id` próprio, título "Stats dos jogadores", `form.handler` próprio.
- Construtor: `super(null, options)` e depois `this.stats = <setting stats-jogador>` (com `id` gerado
  por item, como o original faz).
- `onSubmitForm`: grava em `t20-tokenbar.stats-jogador` e chama `MonksTokenBar.tokenbar?.refresh()`.
- Acrescenta `"@estimate"` na lista de autocomplete `this.attributes`.

Sem lista configurada, o jogador vê a lista do mestre (comportamento atual, nada muda).

### Renderização

Tudo num único `Hooks.on("renderTokenBar", (app, element) => ...)`, que roda depois de cada render
da barra. Para **não-GM**, cada `<li.token>` tem o bloco `.token-stats` reescrito a partir da lista
`stats-jogador`:

- valor de um stat normal: `TokenBar.processStat(f, actor.system) || TokenBar.processStat(f, tokenDoc)`
  — exatamente as duas chamadas que o monks faz em `apps/tokenbar.js:572`;
- valor de `@estimate`: ver Feature 2;
- `null` com `show-undefined` desligado → `visibility:hidden`, igual ao monks.

**Por que reescrever no DOM e não patchar o pipeline:** `updateEntry` lê
`entry.actor.getFlag('monks-tokenbar','stats')` **antes** do fallback global
(`apps/tokenbar.js:564`). Um ator com stats customizados por ficha entregaria a lista do mestre pro
jogador — o PV exato — e nenhum patch no getter `MonksTokenBar.stats` alcançaria isso. Reescrever no
render também evita o `TypeError` latente da linha 577 (`defStat.color` com `defStat` indefinido
quando o stat da ficha não existe na lista global).

**Re-render:** o monks só re-renderiza quando o próprio diff dele muda. Como a lista do jogador pode
não ter nada em comum com a do mestre, o módulo garante o gatilho:

```js
Hooks.on("updateActor", (actor, changes) => {
  if (foundry.utils.hasProperty(changes, "system.attributes.pv")
   || foundry.utils.hasProperty(changes, "flags.t20-inspiracao.pontos"))
    MonksTokenBar.tokenbar?.render();
});
```

O GM continua vendo a barra do monks intocada (só o ✨N da Feature 3 se aplica aos dois).

---

## Feature 2 — `@estimate`: o texto do Health Estimate como stat

Um stat cuja fórmula é a string `@estimate` resolve pro texto do healthEstimate daquele token.

```js
function estimativa(tokenDoc) {
  const he = game.healthEstimate;
  const t = tokenDoc?.object;                    // getEstimation exige o placeable
  if (!he || !t?.actor) return null;
  if (he.breakOverlayRender(t)) return null;
  if (!game.user.isGM && he.hideEstimate(t)) return null;
  return he.getEstimation(t);                    // { desc, color, stroke }
}
```

`getEstimation` (healthEstimate.js:4020) usa `token.document`, `token.actor`, `token.combatant` e
`token.name` — precisa do **placeable**, não do `TokenDocument`; daí o `.object`. Se o token não
estiver no canvas, `.object` é `null` e o stat some.

As duas guardas espelham o que o healthEstimate faz no canvas (`_handleOverlay`, linha 3783): se ele
esconde a estimativa daquele usuário lá, esconde aqui também. Sem elas o mod viraria um bypass das
configurações de visibilidade do healthEstimate.

- **Texto:** `desc` (pode vir com `*` no fim quando o token tem `hideHealthEstimate` e quem olha é
  mestre — é o próprio healthEstimate marcando isso, mantemos).
- **Cor do texto:** `color` da estimativa, aplicada no `style` do `.token-stat`. A cor configurada no
  stat é ignorada só nesse caso (a do monks é fixa: gravada uma vez em `apps/tokenbar.js:577` e nunca
  mais atualizada).

### Barra 1 pintada pela estimativa

Setting `barra-estimativa` (`world`, `Boolean`, default `true`).

Para não-GM, quando ligado e a barra 1 do token rastreia PV
(`tokenDoc.getBarAttribute('bar1')?.attribute === "attributes.pv"` — é o `primaryTokenAttribute` do
sistema, `system.json:336`), o mesmo passo de render:

- pinta `.resource[resource="1"] .bar` com a cor da estimativa;
- **troca a largura pela faixa da estimativa** (`estimate.value`%) no lugar da fração real de PV.

A troca de largura não é cosmética: sem ela a barrinha continua mostrando a fração exata que o texto
acabou de esconder, e a feature inteira não serve pra nada.

Quando `estimativa()` devolve `null`, a barra fica como o monks deixou.

---

## Feature 3 — Inspiração ✨N

No mesmo `renderTokenBar`, para todos os usuários, quando `t20-inspiracao` estiver ativo e o setting
`show-inspiration` do monks estiver ligado (é `client`, `settings.js:247`):

- `pontos = actor.getFlag("t20-inspiracao", "pontos") || 0`;
- `.inspiration-icon` recebe `inspiration="true"` quando `pontos > 0` (o CSS do monks usa esse
  atributo pra sair do `display:none`, `css/tokenbar.css:411`);
- conteúdo vira `<i class="fas fa-crown"></i><span class="t20tb-n">N</span>` — mantém a coroa do
  monks (combina com o resto da barra) e acrescenta o número; o ✨ fica só nos rótulos de texto
  (tooltip e menu), como no `t20-inspiracao`;
- tooltip `"<nome>: N/<cap> inspirações"`.

O CSS do módulo alarga a caixa de 20px (`width:auto; min-width:20px; padding:0 3px`) pro número
caber, escopado em `#tokenbar .token .inspiration-icon`.

### Menu de contexto do mestre

O monks já expõe o hook — `_createContextMenu` com `hookName: "getTokenbarContextOptions"`
(`apps/tokenbar.js:294`), que o core transforma em `getTokenbarContextOptionsTokenBar`
(`application.mjs:1226`, `#callHooks` acrescenta `{}` e substitui pelo nome da classe). Zero patch:

```js
Hooks.on("getTokenbarContextOptionsTokenBar", (app, options) => { /* push +1 / −1 */ });
```

Duas entradas, só pro GM, só quando `t20-inspiracao` está ativo: **Dar inspiração** (+1, respeitando
o cap de `t20-inspiracao`) e **Tirar inspiração** (−1, mínimo 0). Escrevem direto no flag; o hook de
`updateActor` re-renderiza a barra.

---

## Feature 4 — `getValue`: modificador no diálogo de teste

Override de `Tormenta20Rolls.prototype.getValue`. Usado em `apps/savingthrow.js:739` e
`apps/contestedroll.js:401` pra mostrar o modificador de cada ator antes de rolar.

```js
getValue(actor, type, key) {
  const src = type === "ability" ? actor.system.atributos : actor.system.pericias;
  return src?.[key]?.value;
}
```

`save` e `skill` caem os dois em `pericias`: no T20 Fortitude/Reflexos/Vontade **são** perícias — é
o mesmo `rollPericia` no `roll()` do próprio `tormenta20-rolls.js`. E `pericias[k].value` é o total
já derivado (é o que o sistema usa como `rollData.skill`, tormenta20.mjs:6492).

---

## Feature 5 — Subir de nível de verdade

Subir de nível = `+1` em `system.niveis` de um item `classe`. O sistema recalcula nível, treino e CD
sozinho (`_onUpdate` do item, tormenta20.mjs:6649 → `prepareBaseData`).

### Origem do XP

Override de `Tormenta20Rolls.prototype.assignXP`: soma o XP e mais nada. O sussurro original é
removido porque não fazia nada útil e duplicaria o card novo.

```js
async assignXP(msgactor) {
  const actor = game.actors.get(msgactor.id);
  await actor.update({
    "system.attributes.nivel.xp.value":
      parseInt(actor.system.attributes.nivel.xp.value) + parseInt(msgactor.xp)
  });
}
```

### Gatilho do card

`Hooks.on("updateActor")`, executado só pelo GM ativo (`game.user.isActiveGM`), pega XP de
**qualquer** origem — inclusive edição na mão pela ficha:

- mudou `system.attributes.nivel.xp.value`;
- `actor.type === "character"`;
- `regras.podeSubir(nivel, xp.value, xp.proximo)`.

Cria um `ChatMessage` sussurrado aos donos do ator + GM, com `flags["t20-tokenbar"] = { ator: uuid,
nivelAlvo: n+1 }`. Respeita o setting `send-levelup-whisper` do próprio monks (`settings.js:325`) —
sem setting novo, e a semântica é exatamente a mesma.

Anti-duplicata: antes de criar, varre as últimas 50 mensagens de `game.messages` procurando um card
do módulo com o mesmo `ator` e `nivelAlvo` ainda não resolvido.

### O botão

`Hooks.on("renderChatMessageHTML", ...)` (v13, mesmo hook que o `t20-inspiracao` usa) liga o botão
**Subir de nível**, visível pro dono do ator e pro mestre. No clique:

1. revalida `podeSubir` (evita clique duplo e XP alterado no meio do caminho);
2. `classes = regras.classesDe(actor.items)`; se vazio, avisa "sem classe na ficha" e para;
3. se houver mais de uma, `DialogV2` pra escolher qual sobe; se houver uma só, sobe direto;
4. `classe.update({ "system.niveis": niveis + 1 })`;
5. marca o card como resolvido (`flag.resolvido = true`, botão vira texto) e posta a confirmação
   pública: `"Fulano subiu para o nível 4 (Guerreiro 4)"`.

PV, PM, perícias novas e poder de classe seguem manuais na ficha — fora do escopo por decisão
explícita (o assistente completo exigiria mapear os compêndios de classe do T20).

### `scripts/regras.mjs`

Puro, sem Foundry, com self-test como no `t20-inspiracao`:

```js
export const NIVEL_MAX = 20;
export function podeSubir(nivel, xp, proximo)  // nivel < 20 && xp >= proximo && proximo > 0
export function classesDe(items)               // [{ id, nome, niveis }] dos itens type === "classe"
```

`nivel < 20` é obrigatório: `getLevelExp` faz `min(nivel, 19)` sobre um array de 20 posições
(tormenta20.mjs:7902), então no nível 20 `xp.proximo` congela em 190000 e a condição ficaria
verdadeira pra sempre.

Checagens de `--check`:

- nível 1 com 1000/1000 → sobe; com 999/1000 → não;
- nível 20 com 999999 XP → não sobe (teto);
- `proximo` 0 ou indefinido → não sobe (ator sem XP configurado);
- `classesDe` ignora itens que não são `classe` e devolve `niveis` numérico (default 1 quando vazio,
  como o `nivel` do sistema faz);
- `classesDe([])` → `[]`.

---

## Superfície de contato com o monks

| Alvo | Tipo | Feature |
|---|---|---|
| `Tormenta20Rolls.prototype.getValue` | override | 4 |
| `Tormenta20Rolls.prototype.assignXP` | override | 5 |
| `EditStats` | subclasse | 1 |
| `TokenBar.processStat` | chamada (sem patch) | 1 |
| `renderTokenBar` | hook nativo | 1, 2, 3 |
| `getTokenbarContextOptionsTokenBar` | hook nativo | 3 |
| `updateActor` | hook nativo | 1, 3, 5 |
| `renderChatMessageHTML` | hook nativo | 5 |

Dois patches. O resto é hook público ou classe estendida.

## Fora do escopo

Decidido explicitamente, não é esquecimento:

- **Diálogo de XP pós-combate.** `showXP` é `false` no `tormenta20-rolls.js`, então o Assign XP não
  abre sozinho ao fim do combate (`monks-tokenbar.js:800`). Ligar exigiria também um `calcXP` por ND
  dos monstros.
- **Moeda T$ no Lootables.** `getCurrency` cai no default `CONFIG.T20.currencies`, que não existe.
- **Assistente completo de nível** (rolar PV, aplicar PM, marcar perícias, puxar poder de classe).

## Testes

- `node scripts/regras.mjs --check` — regras de nível.
- Manual no Foundry: mestre e um jogador na mesma cena, um ator com PV parcial, um com
  `hideHealthEstimate`, um multiclasse com XP estourado, e um ator com stats customizados na ficha
  (o caso que motivou reescrever o bloco no render).
