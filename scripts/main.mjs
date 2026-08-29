/**
 * t20-tokenbar — mod do Monk's TokenBar para Tormenta20.
 * Ver docs/superpowers/specs/2026-08-29-t20-tokenbar-design.md
 */
import { MonksTokenBar } from "../../monks-tokenbar/monks-tokenbar.js";
import { TokenBar } from "../../monks-tokenbar/apps/tokenbar.js";
import { EditStats } from "../../monks-tokenbar/apps/editstats.js";
import { Tormenta20Rolls } from "../../monks-tokenbar/systems/tormenta20-rolls.js";

const MOD = "t20-tokenbar";
const MTB = "monks-tokenbar";

const temInspiracao = () => game.modules.get("t20-inspiracao")?.active === true;

Hooks.once("init", () => {
  console.log(`${MOD} | init`);
  patchesDoSistema();

  game.settings.register(MOD, "stats-jogador", {
    scope: "world",
    config: false,
    type: Object,
    default: []
  });

  game.settings.register(MOD, "barra-estimativa", {
    name: "Barra de PV vira estimativa (jogadores)",
    hint: "Para quem não é mestre, a barra 1 dos tokens na tokenbar usa a cor e a faixa do Health Estimate em vez da fração exata de PV.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.registerMenu(MOD, "editStatsJogador", {
    name: "Stats dos jogadores",
    label: "Editar stats dos jogadores",
    hint: "Lista de stats que quem não é mestre vê na tokenbar. Vazia = a mesma lista do mestre. Aceita @estimate (texto do Health Estimate).",
    icon: "fas fa-users",
    restricted: true,
    type: EditStatsJogador
  });
});

function patchesDoSistema() {
  /* O monks devolve null aqui, então o diálogo de teste mostra o nome do ator sem modificador.
     No T20 resistências SÃO perícias — é o mesmo rollPericia no roll() do tormenta20-rolls.js —
     então 'save' e 'skill' caem os dois em system.pericias. */
  Tormenta20Rolls.prototype.getValue = function (actor, type, key) {
    const src = type === "ability" ? actor?.system?.atributos : actor?.system?.pericias;
    return src?.[key]?.value;
  };

  /* Só soma o XP. O sussurro original do monks dizia "você subiu de nível" e não subia nada;
     quem oferece o nível agora é o hook updateActor (ver nivel.js nesta mesma pasta). */
  Tormenta20Rolls.prototype.assignXP = async function (msgactor) {
    const actor = game.actors.get(msgactor.id);
    if (!actor) return;
    const atual = Number(actor.system?.attributes?.nivel?.xp?.value) || 0;
    await actor.update({
      "system.attributes.nivel.xp.value": atual + (Number(msgactor.xp) || 0)
    });
  };
}

/* ---- Editor da lista de stats dos jogadores (reusa o EditStats do monks inteiro) ----
   Overrides mínimos e por quê:
   - construtor passa {} (não null) — onSubmitForm/resetDefaults do monks fazem
     Object.keys(this.object), que explode com null;
   - onSubmitForm do pai gravaria em monks-tokenbar.stats (a lista do MESTRE) quando o
     objeto é vazio — o nosso grava no nosso setting;
   - resetDefaults aqui = lista vazia = jogadores voltam a ver a lista do mestre;
   - get title() — o pai tem getter que ignora window.title das options. */
class EditStatsJogador extends EditStats {
  constructor(object, options = {}) {
    super({}, options);
    const salvos = game.settings.get(MOD, "stats-jogador");
    this.stats = (Array.isArray(salvos) ? foundry.utils.duplicate(salvos) : [])
      .map((s) => ({ ...s, id: s.id || foundry.utils.randomID() }));
    this.attributes = [...(this.attributes ?? []), "@estimate"];
  }

  static DEFAULT_OPTIONS = {
    id: "editstats-jogador",
    actions: { resetDefault: EditStatsJogador.resetDefaults },
    form: { handler: EditStatsJogador.onSubmitForm, closeOnSubmit: true }
  };

  get title() {
    return "Stats dos jogadores";
  }

  static onSubmitForm() {
    game.settings.set(MOD, "stats-jogador", this.stats);
    MonksTokenBar.tokenbar?.refresh();
    this.submitting = true;
  }

  static resetDefaults() {
    this.stats = [];
    this.render(true);
  }
}
