---
phase: schedule-layer
---

# 26-09-10-002 — schedule-layer : une date enregistrée devient une preuve, et l'horloge ne déplace jamais le code de sortie

Implémentation de `docs/plan/sessions/PHASE-SCHEDULE-LAYER.md`, rendu par la session
`26-09-10-001`. Release cible 0.18.0. Quatre bifurcations avaient été fermées par écrit avant
la première ligne ; aucune n'a été rouverte pendant l'implémentation.

## 1 · Ce qui a été construit

| Fichier | Rôle |
|---|---|
| `src/schedule.ts` (+368) | La couche pure : chargement, validation structurelle, calcul des revendications, émission des quatre constats. Ne lit jamais l'horloge lui-même — `today` est injecté. |
| `src/pace.ts` (+142) | Le rythme, mesuré en parcourant `git log -- casp/state.json` et en lisant `phases_shipped.length` dans le blob de chaque commit. N'écrit rien nulle part. |
| `src/board.ts` (+160) | Les deux dessins, en fonctions pures : barre de progression, frise, ligne « prochaine échéance ». Dégradation UTF-8 → ASCII. |
| `src/schedule-report.ts` (+285) | Le verbe `casp schedule` : rendu humain et `--json`, plus les fonctions que `status` et `close` réutilisent. |
| `src/check.ts` | `CheckOptions { noGit?, today? }`, et la section `7d` qui câble la couche — opt-in, silencieuse sans fichier. |
| `src/rules.ts` | Quatre entrées, neuvième aire `SCHEDULE`. |
| `src/status.ts` | Ligne de progression à chaque exécution, ligne d'échéance quand le fichier existe. `--json` inchangé. |
| `src/close.ts` | Se termine sur le tableau : verdict, rendu `status`, rendu `schedule`. Toujours zéro commande git. |
| `src/shared.ts` | `detectUtf8()` / `setCharset()`, même posture que l'aide couleur : on détecte une fois, on expose la bascule pour que les deux branches soient testables. |
| `schemas/schedule.schema.json`, `schemas/schedule-result.schema.json` | Les deux contrats publiés. |
| `templates/templates/schedule.json` | L'exemple copiable, **sous les scaffolds** — voir § 3. |
| `test/schedule.test.mjs` (+18 tests) | Les deux sens de chaque règle, les deux garde-fous, les dessins épinglés au caractère près. |

Docs : `docs/rules.md` (les quatre codes, l'aire, la doctrine de sévérité), `docs/schedule-json.md`
(nouveau contrat machine), `docs/what-casp-proves.md` (« ne prouve pas qu'un calendrier est
tenable »), `README.md` (une section, une ligne de référence), `CHANGELOG.md` 0.18.0.

## 2 · La frontière, et sa forme mécanique

La doctrine n'est pas « pas d'horloge dans le gate » — `CASP-FACT-003` lit `todayISO()` depuis
la 0.11. La discipline retenue est plus étroite et **testable** : la famille `CASP-SCHEDULE-*`
ne change jamais le code de sortie à cause de l'horloge.

- `003` FAIL — le fichier se contredit : ancres non strictement croissantes, ou tranche en file
  datée à la date de l'ancre qu'elle déclare `before` ou après. Comparaison du fichier avec
  lui-même et avec les listes de phases, toutes deux dans le dépôt.
- `004` WARN — une date passée. Seule règle de la famille qui lit l'horloge, WARN par
  construction.
- `002` WARN — une phase datée qu'aucune liste ne porte. WARN parce qu'un renommage en vol ne
  doit pas bloquer une poussée : faire échouer là-dessus apprend à supprimer le fichier, ce qui
  retire au gate la preuve qu'il est censé vérifier.
- Les phases livrées ne sont jamais inspectées par `003` ni `004` : l'histoire n'est pas une
  dérive.

Deux tests épinglent la frontière plutôt que de la documenter : la sévérité de `004`, et
l'**invariance à l'horloge** — le même fixture vérifié à un an d'écart rend un ensemble de FAIL
identique. Une édition future qui les inverse casse la suite bruyamment.

## 3 · Un écart au prompt, et sa correction

Le prompt demandait `templates/schedule.json` comme exemple copiable, avec la double
affirmation : « `casp init` ne le crée pas et `casp upgrade` ne l'insère pas — vérifier la
seconde plutôt que la croire ». Vérification faite sur un dépôt neuf : `casp upgrade` saute
bien le fichier (`skip schedule.json (your data — never touched)`, allowlist de `isRefreshable`),
mais **`casp init` le créait**, parce qu'`init` recopie toute la racine de `templates/`. La
première affirmation était fausse au moment où on l'a mesurée.

Correction : l'exemple vit désormais en `templates/templates/schedule.json`, donc `casp init`
le dépose en `casp/templates/schedule.json` et jamais en `casp/schedule.json`. L'opt-in devient
**structurel** au lieu d'être une promesse en prose, et un test l'assert dans les deux sens.
C'est exactement ce que « vérifier plutôt que croire » était censé produire.

## 4 · Décisions prises sans le CEO (niveau 2)

1. **`004` ne se déclenche que par tranche datée, jamais sur une ancre orpheline.** Une ancre
   passée dont aucune tranche en file ne dépend n'émet rien. Revenir dessus : ajouter une boucle
   sur les ancres dans `analyzeSchedule`, quelques lignes.
2. **Un fichier `schedule.json` valide émet un PASS `schedule.valid`.** L'opt-in porte sur
   l'absence de fichier (zéro constat), pas sur la présence. Revenir dessus : supprimer le
   `record('schedule.valid', …)` dans `src/check.ts` § 7d.
3. **Largeurs fixées : barre 24 cellules, frise 40.** Choisies pour tenir dans 80 colonnes avec
   les libellés. Revenir dessus : deux constantes en tête de `src/board.ts`.
4. **Dégradation de charset déclenchée par une locale explicitement non-UTF-8, ou `CASP_ASCII=1`,
   ou `--plain`.** Un environnement sans variable de locale est traité comme capable — c'est le
   cas courant dans un conteneur, et punir ce cas ferait dessiner en ASCII partout.
5. **`casp-core` n'adopte pas la couche pour lui-même.** L'adopter obligerait à inventer une date
   de sortie, ce que le produit refuse de faire. Le cockpit reste opté hors.
6. **`casp close` n'appelle plus `runCheck`** mais `checkOneSafe` + `printReport` + le tableau +
   `exit(verdict)`, parce que `runCheck` sort du processus et le tableau doit venir après le
   verdict. Le code de sortie est inchangé, un test l'assert.
7. **Le compte de tests de l'entrée 0.17.0 était faux** (« 231 → 235 » ; `node --test` sur
   l'arbre de ce commit rend 231). L'entrée 0.18.0 le dit et donne ses propres nombres, mesurés
   par la même commande.

## 5 · Vérifications

```
npm run build   → exit 0
npm test        → 251/251, 0 fail   (231 avant cette session, même commande)
casp check      → exit 0
```

`casp explain` répond pour les quatre codes ; `casp rules` les liste dans la neuvième aire ;
`casp schedule --json` valide contre `schemas/schedule-result.schema.json` dans les trois
branches (non adopté, malformé, adopté-valide) ; `casp status --json` est inchangé et son schéma
reste en v1 — aucun champ n'a mérité sa place.

## 6 · Différés / risques

- **La publication npm de 0.18.0 est un acte du CEO**, hors session (niveau 1). `package.json`
  est bumpé, rien n'est publié.
- **Le site n'est pas touché.** `casp-website` porte une aire de règles à jour dans sa copie et
  un fait `casp-rule-count` dans son propre `casp/facts.json` : les deux seront faux tant que la
  session de propagation n'a pas eu lieu. Le prompt successeur, `PHASE-SITE-SCHEDULE-SURFACE`,
  la commande et la conditionne à la publication npm.
- **Le rythme est aveugle à un renommage.** Retirer une phase de `phases_shipped` et en ajouter
  une autre dans le même commit rend un delta nul ; la mesure le signale comme « pas de rythme »
  plutôt que comme un rythme faux, ce qui est la bonne défaillance, mais elle n'est pas
  distinguée d'une réelle absence de livraison.
- **Un jour de décalage possible près de minuit** entre `todayISO()` (date locale) et les
  comparaisons UTC. L'effet maximal est de déplacer un WARN d'un jour ; par construction il ne
  peut pas atteindre un FAIL.

## 7 · État

`schedule-layer` livré. `next_prompt` pointe sur `PHASE-SITE-SCHEDULE-SURFACE` ;
`PHASE-DEMAND-GATED-TAIL` a été re-chaîné derrière lui pour que la file reste un seul fil.
