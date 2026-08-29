/**
 * Regras puras de nível do T20 — sem Foundry, testável com:
 *   node scripts/regras.mjs --check
 */

/** Nível máximo do T20. `xpPorNivel` tem 20 posições e `getLevelExp` faz min(nivel, 19), então no
 *  nível 20 `xp.proximo` congela em 190000 e a comparação ficaria verdadeira para sempre. */
export const NIVEL_MAX = 20;

/** Um personagem só sobe se tem nível, não chegou ao teto e o XP alcançou o próximo marco. */
export function podeSubir(nivel, xp, proximo) {
  nivel = Number(nivel) || 0;
  xp = Number(xp) || 0;
  proximo = Number(proximo) || 0;
  return nivel >= 1 && nivel < NIVEL_MAX && proximo > 0 && xp >= proximo;
}

/** Itens de classe da ficha, na forma que o diálogo de escolha usa. */
export function classesDe(items) {
  return Array.from(items ?? [])
    .filter((i) => i?.type === "classe")
    .map((i) => ({ id: i.id, nome: i.name, niveis: Number(i.system?.niveis) || 1 }));
}

if (globalThis.process?.argv?.includes("--check")) {
  const assert = (cond, msg) => { if (!cond) { console.error(`FALHOU: ${msg}`); process.exit(1); } };

  // podeSubir
  assert(podeSubir(1, 1000, 1000) === true, "nível 1 com XP exato do próximo sobe");
  assert(podeSubir(1, 1200, 1000) === true, "XP acima do próximo sobe");
  assert(podeSubir(1, 999, 1000) === false, "1 XP a menos não sobe");
  assert(podeSubir(20, 999999, 190000) === false, "nível 20 é o teto, nunca sobe");
  assert(podeSubir(19, 190000, 190000) === true, "nível 19 ainda sobe");
  assert(podeSubir(3, 6000, 0) === false, "sem 'proximo' definido não sobe");
  assert(podeSubir(3, 6000, undefined) === false, "'proximo' indefinido não sobe");
  assert(podeSubir(0, 5000, 1000) === false, "ficha sem nível não sobe");
  assert(podeSubir(undefined, undefined, undefined) === false, "tudo indefinido não sobe");
  assert(podeSubir("2", "3000", "3000") === true, "aceita número em string");

  // classesDe
  const items = [
    { id: "a", type: "classe", name: "Guerreiro", system: { niveis: 3 } },
    { id: "b", type: "poder", name: "Ataque Poderoso", system: {} },
    { id: "c", type: "classe", name: "Ladino", system: { niveis: "2" } },
    { id: "d", type: "classe", name: "Bardo", system: {} }
  ];
  const classes = classesDe(items);
  assert(classes.length === 3, "só itens type 'classe' entram");
  assert(classes[0].nome === "Guerreiro" && classes[0].niveis === 3, "lê nome e níveis");
  assert(classes[1].niveis === 2, "níveis em string vira número");
  assert(classes[2].niveis === 1, "classe sem 'niveis' conta como 1");
  assert(classes[0].id === "a", "devolve o id do item");
  assert(classesDe([]).length === 0, "lista vazia devolve []");
  assert(classesDe(undefined).length === 0, "undefined devolve []");

  console.log("regras.mjs OK");
}
