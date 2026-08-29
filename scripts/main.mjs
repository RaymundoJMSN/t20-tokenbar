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
});
