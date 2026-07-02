# ADR-007: Monorepo Strategy

Status: Accepted
Data: 2026-07-02

## Contexto
Múltiplos componentes (apps, core, control center, gateway) exigem versionamento coordenado e contratos compartilhados.

## Decisão
Adotar monorepo `nexora-platform` com `apps/`, `packages/`, `control-center/`, `gateway/` e `docs/`.

## Consequências
- Positivas: visibilidade de dependências e releases coordenados.
- Custos: maior disciplina de boundaries e pipelines.
- Mitigação: roadmap por fases e gates de readiness.

## Referências
- [../platform/MONOREPO-ROADMAP.md](../platform/MONOREPO-ROADMAP.md)
