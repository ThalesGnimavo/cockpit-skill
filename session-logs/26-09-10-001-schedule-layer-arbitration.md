---
phase: schedule-layer
---

# 26-09-10-001 — schedule-layer : l'arbitrage, écrit avant la première ligne

Session de décision, pas d'implémentation : aucun fichier source n'est touché. Trois briefs
concurrents proposaient une couche de dates pour casp ; cette session les confronte au code de
la 0.17.0 et rend un seul prompt exécutable, `docs/plan/sessions/PHASE-SCHEDULE-LAYER.md`, en
tête de file. L'implémentation est la session suivante.

## 1 · Les quatre bifurcations, et ce qui les a fermées

- **L'horloge dans `casp check` : en WARN, jamais en FAIL.** Un des briefs faisait de « zéro
  horloge dans le gate » sa contrainte unique, avec un test d'identité octet à octet à un an
  d'écart. Ce test échoue déjà sur la 0.17.0 : `CASP-FACT-003` lit `todayISO()` dans
  `src/facts.ts` et passe en FAIL au double du TTL. La doctrine réelle est la comparaison
  déterministe d'une réclamation enregistrée contre une source d'évidence définie, et le
  calendrier en est une quand l'utilisateur a écrit la date. Ce qui reste de ce débat est plus
  étroit et testable : **la famille `CASP-SCHEDULE-*` ne change jamais le code de sortie à cause
  de l'horloge.** Un retard honnêtement enregistré est le registre qui dit vrai, pas une dérive.
- **Un fichier séparé, `casp/schedule.json`, pas un bloc dans `state.json`.** Même panier que
  `facts.json` (0.11) : fichier opt-in, schéma propre, famille de dérive déterministe propre.
  Le schéma d'état n'est pas touché.
- **La clé de jointure est le nom de phase**, l'unité que les trois listes de phases vérifient
  déjà — pas le chemin du prompt, une indirection plus loin et renommé plus souvent.
- **Un verbe, et il imprime une date.** Imprimer le quotient `file ÷ rythme` en refusant la date
  qu'il donne n'a aucune valeur de protection : le lecteur fait l'addition. Ce qui est refusé,
  c'est un nombre dont la méthode est invisible — la fenêtre, les commits utilisés et la méthode
  partagent l'écran avec la date.

## 2 · Ce que le prompt commande

Quatre règles (`001` fichier invalide, FAIL ; `002` phase inconnue, WARN ; `003` calendrier
auto-contradictoire, FAIL, sans horloge ; `004` date passée sur une phase non livrée, WARN, avec
horloge), un verbe `casp schedule [--json] [--since]` qui mesure le rythme dans l'historique git
de `casp/state.json` (delta de `phases_shipped.length` sur une fenêtre imprimée) et énonce la
longueur dérivée de la file comme une arithmétique, une ligne dans `casp status`, et deux tests
de garde : la sévérité de `004` épinglée à WARN, et l'ensemble des FAIL identique quand `today`
bouge d'un an. `today` est injecté par option de `checkOne`, pas par variable d'environnement.

## 3 · Ce qui est écarté, avec la raison

Jalons à statut « prouvé » et critères de sortie (un second registre de « fait » en face de
`phases_shipped`) ; portes de décision, ledger d'heures, capacité, limite de WIP (surface de
gestion de projet) ; rythme enregistré dans le fichier (il dérive du rythme mesuré par
construction) ; projection sous forme de finding (une prévision dans le gate) ; migration
automatique d'un champ `launch_date` inconnu ; rendu, rappels, synchronisation externe. Le
skill est différé, pas refusé ; le site est une session mécanique séparée après publication —
la séquence `fleet`.

## 4 · État

Commit `3fdd282` : le prompt et le rechaînage de `demand-gated-tail` derrière lui. Bump d'état :
`next_prompt` sur le nouveau prompt, `phases_queued` à deux entrées, arbitrage solo enregistré
(un dépôt, une surface couplée, pas de second couloir d'écriture). Rien publié, rien poussé.

## 5 · Amendement du même jour — l'état s'affiche en clôture

Demande CEO : voir où en est le projet à la fin de chaque session, visuellement. Mesure :
`casp close` n'imprime que le bump et le verdict, et aucun protocole de clôture ne demande
l'état. Le prompt gagne trois éléments, tous dessinés à partir de comptes et de dates
enregistrées, jamais d'une estimation : une ligne de progression des phases dans `casp status`,
une ligne de temps dans `casp schedule`, et `casp close` qui termine sur ce tableau. Le « no
rendering » du matin est resserré à ce qu'il visait : pas de page HTML, pas de Gantt, pas de
tracker — le terminal dessine, le gate ne rend pas de page.
