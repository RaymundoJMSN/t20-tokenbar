/**
 * t20-tokenbar — mod do Monk's TokenBar para Tormenta20.
 * Ver docs/superpowers/specs/2026-08-29-t20-tokenbar-design.md
 */
import { MonksTokenBar } from "../../monks-tokenbar/monks-tokenbar.js";
import { TokenBar } from "../../monks-tokenbar/apps/tokenbar.js";
import { Tormenta20Rolls } from "../../monks-tokenbar/systems/tormenta20-rolls.js";

const MOD = "t20-tokenbar";
const MTB = "monks-tokenbar";

const temInspiracao = () => game.modules.get("t20-inspiracao")?.active === true;

Hooks.once("init", () => {
  console.log(`${MOD} | init`);
  patchesDoSistema();
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
