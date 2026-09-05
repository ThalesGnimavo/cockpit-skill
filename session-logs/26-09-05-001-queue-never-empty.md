---
phase: queue-never-empty
---

# 26-09-05-001 — queue-never-empty : une feuille de route finie n'est pas un projet fini

Le déclencheur est un cockpit produit (`tap.ci`), le jour même : son dernier chantier en file
est livré, la session ferme proprement — `next_prompt: null`, `phases_queued: []` — et
`casp check` répond PASS, « genuinely parked ». Le CEO refuse : **la file ne doit jamais être
vide.** Ce qui suit une feuille de route implémentée n'est pas le repos, c'est une conversation
avec lui — comment le produit se fait connaître (recherche, réseaux sociaux, vidéo, réseaux
professionnels), quel chantier ensuite — et cette conversation est **une session**. La règle
« parked doit être vrai » (0.4) ne disait rien de faux ; elle ne disait pas assez.

## 1 · La règle — `CASP-PROMPT-011`

FAIL quand `phases_shipped` est non vide, la file vide et le pointeur vide. **L'exemption est
délibérée** : un cockpit qui n'a rien livré n'est pas fini, il n'a pas commencé — `casp init`
reste vert, le test « fresh parked state » reste vert, et `CASP-PROMPT-005` (parked pendant que la
file est pleine) ne change pas. Le détail rend le compte de ce qui a été livré ; la remédiation
nomme le geste : un prompt de discussion.

## 2 · Le prompt de discussion — `kind: discussion`

Un nouveau gabarit, `templates/templates/discussion-prompt.md`, servi aux cockpits existants par
`casp upgrade` (l'allowlist couvre `templates/`). `casp new discussion --slug <slug>` écrit
`DISCUSSION-<SLUG>.md` — nommé pour ce qu'il est, pour qu'un humain voie d'un coup d'œil dans le
répertoire des prompts lesquels l'attendent. Le gabarit nomme les quatre décisions que toute
feuille de route finie doit : la prochaine feuille de route, la distribution, le prix, le
support — et laisse la place à celles du projet. Livrable : des décisions écrites, avec la raison
qui a décidé, et les prompts qu'elles produisent. **Pas de code.**

`casp next` annonce le genre sur stderr, avant le corps : le corps part toujours sur stdout,
les tubes continuent de marcher, et personne ne lance une conversation en headless sans l'avoir
lu.

## 3 · Ce que la session a aussi trouvé

Un test pourri par l'horloge : `casp fact list` affirmait `fresh: true` sur un fait vérifié le
2026-07-20 avec un TTL de 30 jours — rouge depuis le 2026-08-20 sur toute machine, alors que le
fichier documente lui-même en tête pourquoi les dates de fixture doivent être relatives. Corrigé
(`isoDaysAgo(0)`).

## Vérifications

- `npm test` : **231 tests, 231 verts** (quatre nouveaux : la règle dans ses deux branches, un
  prompt de discussion en tête de file avec l'annonce de `casp next`, le scaffold).
- `casp check` sur ce cockpit : 0 FAIL après le bump.
- Le cockpit déclencheur (`tap.ci`) a été vérifié avec le binaire construit ici (`dist/cli.js`) :
  la règle mord sur son état vide, et passe une fois le prompt de discussion en file.

## La release

`0.17.0` (commit `d815b77`) — version bumpée, CHANGELOG écrit, README à jour. **Non publiée sur npm dans cette
session** : le go CEO manque, et publier est irréversible. `npm publish` est le seul geste qui
reste.

## Non fait, et pourquoi

- `status --json` n'expose pas le `kind` du prompt de tête. Additif, sans demande.
- Le site (`roadmap.html`, `llms.txt`) et la présentation privée sont mis à jour dans leurs
  dépôts respectifs, dans la même journée ; ils ne font pas partie de ce paquet.
