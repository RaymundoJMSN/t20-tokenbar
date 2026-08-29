/**
 * t20-tokenbar — mod do Monk's TokenBar para Tormenta20.
 * Ver docs/superpowers/specs/2026-08-29-t20-tokenbar-design.md
 */
import { MonksTokenBar } from "../../monks-tokenbar/monks-tokenbar.js";
import { TokenBar } from "../../monks-tokenbar/apps/tokenbar.js";
import { EditStats } from "../../monks-tokenbar/apps/editstats.js";
import { Tormenta20Rolls } from "../../monks-tokenbar/systems/tormenta20-rolls.js";
import { podeSubir, classesDe } from "./regras.mjs";

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
     quem oferece o nível agora é o hook updateActor (verificarNivel, mais abaixo). */
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

/* ---- Estimativa do healthEstimate ----
   null = módulo ausente, token fora do canvas, sem PV numérico, ou escondido pelas regras do
   próprio healthEstimate (espelha _handleOverlay — senão o mod vira bypass da visibilidade). */
function estimativa(tokenDoc) {
  const he = game.healthEstimate;
  const t = tokenDoc?.object; // getEstimation exige o placeable, não o TokenDocument
  if (!he || !t?.actor) return null;
  try {
    if (he.breakOverlayRender(t)) return null;
    if (!game.user.isGM && he.hideEstimate(t)) return null;
    const { desc, color, stroke } = he.getEstimation(t);
    if (desc === undefined || desc === "") return null;
    const fraction = Number(he.getFraction(t));
    const { estimate } = he.getStage(t, fraction) ?? {};
    return { desc, color, stroke, valor: estimate?.value ?? Math.round(fraction * 100) };
  } catch {
    return null; // getFraction lança pra token sem PV
  }
}

const esc = (s) => Handlebars.escapeExpression(String(s ?? ""));

/* Mesmo markup do token-list.hbs do monks, pro CSS dele valer igual. */
function statHTML(stat, valor, cor) {
  const escondido = valor == null && !game.settings.get(MTB, "show-undefined");
  const style = `${escondido ? "visibility:hidden;" : ""}color:${cor || "#f0f0f0"}`;
  const icone = stat.icon ? `<i class="fas ${esc(stat.icon)}"></i>` : "";
  return `<div class="token-stat flexrow" data-stat="${esc(stat.stat)}" style="${style}">${icone}<span>${esc(valor ?? "")}</span></div>`;
}

/* ---- Stats do jogador: reescreve .token-stats de cada token depois do render ----
   Por que DOM e não patch no pipeline: updateEntry lê os stats por ficha ANTES do fallback
   global (apps/tokenbar.js:564) — ator com stats customizados entregaria a lista do mestre
   (PV exato) pro jogador por qualquer patch de getter. */
Hooks.on("renderTokenBar", (app, element) => {
  if (game.user.isGM) return;
  const lista = game.settings.get(MOD, "stats-jogador");
  const temLista = Array.isArray(lista) && lista.some((s) => s.stat);
  const pintarBarra = game.settings.get(MOD, "barra-estimativa");

  for (const li of element.querySelectorAll("li.token")) {
    const id = li.dataset.tokenId || li.dataset.actorId;
    const entry = app.entries.find((e) => e.token?.id === id || e.actor?.id === id);
    if (!entry?.actor) continue;
    const est = estimativa(entry.token);

    if (temLista) {
      const bloco = li.querySelector(".token-stats");
      if (bloco) {
        bloco.innerHTML = lista
          .filter((s) => s.stat)
          .map((s) => {
            if (s.stat === "@estimate") return statHTML(s, est?.desc ?? null, est?.color);
            const v =
              TokenBar.processStat(s.stat, entry.actor.system) ||
              TokenBar.processStat(s.stat, entry.token);
            return statHTML(s, v, s.color);
          })
          .join("");
      }
    }

    /* Barra 1 vira a estimativa: cor E largura pela faixa — largura com a fração real
       continuaria vazando o PV que o texto acabou de esconder. */
    if (pintarBarra && est && entry.token?.getBarAttribute("bar1")?.attribute === "attributes.pv") {
      const barra = li.querySelector('.resource[resource="1"] .bar');
      if (barra) {
        barra.style.backgroundColor = est.color;
        barra.style.width = `${Math.clamp(est.valor, 0, 100)}%`;
      }
    }
  }
});

/* O monks só re-renderiza pelo diff da lista DELE; PV pode nem estar nela. */
Hooks.on("updateActor", (actor, changes) => {
  if (foundry.utils.hasProperty(changes, "system.attributes.pv"))
    MonksTokenBar.tokenbar?.render();
});

/* ---- Inspiração ✨N (t20-inspiracao) na caixinha de coroa do monks ----
   O .inspiration-icon existe pra todo token mas só liga com inspiration="true"
   (css/tokenbar.css:411) — e no T20 o booleano do dnd5e nunca liga. Roda pra todo
   usuário: mestre também vê ✨N. */
Hooks.on("renderTokenBar", (app, element) => {
  if (!temInspiracao() || !game.settings.get(MTB, "show-inspiration")) return;
  const cap = game.settings.get("t20-inspiracao", "capMax");
  for (const li of element.querySelectorAll("li.token")) {
    const id = li.dataset.tokenId || li.dataset.actorId;
    const entry = app.entries.find((e) => e.token?.id === id || e.actor?.id === id);
    const icone = li.querySelector(".inspiration-icon");
    if (!entry?.actor || !icone) continue;
    const pontos = Number(entry.actor.getFlag("t20-inspiracao", "pontos")) || 0;
    icone.setAttribute("inspiration", pontos > 0 ? "true" : "");
    icone.innerHTML =
      `<i class="fas fa-crown"></i>` +
      (pontos > 0 ? `<span class="t20tb-n">${pontos}</span>` : "");
    icone.dataset.tooltip = `${esc(entry.actor.name)}: ${pontos}/${cap} inspirações`;
  }
});

Hooks.on("updateActor", (actor, changes) => {
  if (foundry.utils.hasProperty(changes, "flags.t20-inspiracao.pontos"))
    MonksTokenBar.tokenbar?.render();
});

/* Menu de contexto (hook público do monks — apps/tokenbar.js:294; li é HTMLElement). */
Hooks.on("getTokenbarContextOptionsTokenBar", (app, options) => {
  if (!temInspiracao()) return;
  const atorDe = (li) => {
    const id = li.dataset.tokenId || li.dataset.actorId;
    return app.entries.find((e) => e.token?.id === id || e.actor?.id === id)?.actor;
  };
  const mudar = (li, delta) => {
    const a = atorDe(li);
    if (!a) return;
    const cap = game.settings.get("t20-inspiracao", "capMax");
    const p = Math.clamp((Number(a.getFlag("t20-inspiracao", "pontos")) || 0) + delta, 0, cap);
    a.setFlag("t20-inspiracao", "pontos", p);
  };
  const soGMPersonagem = (li) => game.user.isGM && atorDe(li)?.type === "character";
  options.push(
    {
      name: "Dar inspiração ✨",
      icon: '<i class="fas fa-crown"></i>',
      condition: soGMPersonagem,
      callback: (li) => mudar(li, 1)
    },
    {
      name: "Tirar inspiração",
      icon: '<i class="fas fa-crown"></i>',
      condition: soGMPersonagem,
      callback: (li) => mudar(li, -1)
    }
  );
});

/* ---- Subir de nível de verdade ----
   Nível no T20 é DERIVADO: prepareBaseData soma system.niveis dos itens classe — escrever
   nivel.value não persiste. Subir = +1 no item; o sistema recalcula nível/treino/CD.
   "Resolvido" do card é derivado (nivel >= alvo), nunca gravado: o card é do GM e jogador
   não pode atualizar mensagem alheia. */
async function verificarNivel(actor) {
  if (game.users.activeGM?.id !== game.user.id) return;
  if (actor.type !== "character") return;
  if (!game.settings.get(MTB, "send-levelup-whisper")) return;
  const n = actor.system.attributes.nivel;
  if (!podeSubir(n.value, n.xp.value, n.xp.proximo)) return;
  const nivelAlvo = n.value + 1;

  const repetido = game.messages.contents.slice(-50).some((m) => {
    const f = m.flags?.[MOD];
    return f && f.ator === actor.uuid && f.nivelAlvo === nivelAlvo;
  });
  if (repetido) return;

  const dest = game.users
    .filter((u) => u.isGM || actor.testUserPermission(u, "OWNER"))
    .map((u) => u.id);
  await ChatMessage.create({
    content: `<div class="t20tb-card">✨ <b>${esc(actor.name)}</b> tem XP para o nível ${nivelAlvo} (${n.xp.value}/${n.xp.proximo} XP). <button type="button" class="t20tb-levelup">Subir de nível</button></div>`,
    whisper: dest,
    flags: { [MOD]: { ator: actor.uuid, nivelAlvo } }
  });
}

Hooks.on("updateActor", (actor, changes) => {
  if (foundry.utils.hasProperty(changes, "system.attributes.nivel.xp.value"))
    verificarNivel(actor);
});

async function escolherClasse(classes) {
  if (classes.length === 1) return classes[0];
  const opcoes = classes
    .map((c) => `<option value="${c.id}">${esc(c.nome)} (nível ${c.niveis})</option>`)
    .join("");
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Qual classe sobe de nível?" },
    content: `<select name="classe" style="width:100%">${opcoes}</select>`,
    ok: { label: "Subir", callback: (event, button) => button.form.elements.classe.value }
  });
  return classes.find((c) => c.id === id) ?? null; // fechar o diálogo resolve null
}

async function subirNivel(message) {
  const actor = await fromUuid(message.getFlag(MOD, "ator"));
  const nivelAlvo = message.getFlag(MOD, "nivelAlvo");
  if (!actor?.isOwner) return;
  const n = actor.system.attributes.nivel;
  // revalida: clique duplo, XP editado no meio, card velho
  if (n.value >= nivelAlvo)
    return ui.notifications.info(`${actor.name} já está no nível ${n.value}.`);
  if (!podeSubir(n.value, n.xp.value, n.xp.proximo))
    return ui.notifications.warn(`${actor.name} não tem mais XP para subir (o XP mudou?).`);
  const classes = classesDe(actor.items);
  if (!classes.length)
    return ui.notifications.warn(`${actor.name} não tem nenhuma classe na ficha.`);
  const escolhida = await escolherClasse(classes);
  if (!escolhida) return;
  await actor.items.get(escolhida.id).update({ "system.niveis": escolhida.niveis + 1 });
  await ChatMessage.create({
    content: `🎉 <b>${esc(actor.name)}</b> subiu para o nível ${nivelAlvo} (${esc(escolhida.nome)} ${escolhida.niveis + 1}). PV, PM e perícias novas: ajustar na ficha.`
  });
}

Hooks.on("renderChatMessageHTML", (message, html) => {
  const btn = html.querySelector(".t20tb-levelup");
  if (!btn) return;
  const uuid = message.getFlag(MOD, "ator");
  const nivelAlvo = message.getFlag(MOD, "nivelAlvo");
  if (!uuid) return btn.remove();
  const actor = fromUuidSync(uuid);
  if (!actor) return btn.remove();
  if ((actor.system.attributes?.nivel?.value ?? 0) >= nivelAlvo) {
    const feito = document.createElement("span");
    feito.className = "t20tb-feito";
    feito.textContent = `✔ nível ${nivelAlvo} alcançado`;
    btn.replaceWith(feito);
    return;
  }
  if (!actor.isOwner) return btn.remove();
  btn.addEventListener("click", () => subirNivel(message));
});
