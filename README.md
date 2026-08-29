# T20 TokenBar

Mod do [Monk's TokenBar](https://github.com/ironmonk88/monks-tokenbar) para Tormenta20.
Não substitui o monks — os dois ficam ativos juntos.

- **Sobe de nível de verdade.** No T20 o nível é derivado da soma de `system.niveis` dos itens
  `classe`; o monks só somava XP. Quando o XP estoura, sai um card sussurrado com botão.
- **Marcos.** Botão 🏆 na tokenbar (só mestre): anuncia um nível alvo num card público e cada
  jogador clica pra subir o próprio personagem (sem XP nenhum; o mestre pode subir personagem de
  jogador ausente). Também via macro: `game.modules.get("t20-tokenbar").api.marco()`.
- **Inspiração real.** Mostra o número de `flags.t20-inspiracao.pontos` na barra, e o mestre dá/tira
  pelo menu de contexto do token.
- **Stats do mestre × do jogador.** Duas listas. Na do jogador, o stat `@estimate` vira o texto do
  Health Estimate e a barra de PV é pintada pela faixa da estimativa, sem vazar o valor exato.
- **Modificador no diálogo de testes.** `getValue` do T20, que faltava no monks.

Requer `monks-tokenbar`. `healthEstimate` e `t20-inspiracao` são opcionais.

Dev: `X:\FoundryVTT\Data\modules\t20-tokenbar` é junction para esta pasta — editar e dar F5.
Testes: `node scripts/regras.mjs --check`.
