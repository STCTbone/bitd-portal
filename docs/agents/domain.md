# Domain docs

## Before exploring

Read the root `GLOSSARY.md` and the ADRs in `docs/adr/` that concern the area being explored. If either is absent, proceed silently. Domain modeling creates these documents when terminology or consequential decisions are resolved.

## Layout

This is a single-context repository:

- `GLOSSARY.md`: canonical domain vocabulary.
- `docs/adr/NNNN-slug.md`: consequential architectural decisions.

## Vocabulary

Use glossary terms in issue titles, proposals, hypotheses, and tests. Respect any listed synonyms to avoid. When an unfamiliar concept needs a name, check its meaning in the project and note a real terminology gap for domain modeling.

## Decision conflicts

If a proposal contradicts an ADR, identify the ADR and explain why the decision should be reopened.
