# ADR-006: NEXORA Platform

Status: Accepted
Data: 2026-07-02

## Contexto
O projeto atual concentra núcleo e lógica de app em um único repositório de produto, dificultando expansão para múltiplos apps com governança central.

## Decisão
Adotar arquitetura NEXORA Platform com núcleo compartilhado e apps desacoplados por contratos.

## Consequências
- Positivas: reuso, governança central, escalabilidade multi-app.
- Custos: necessidade de migração incremental e adapters temporários.
- Riscos: regressões de integração durante extrações de domínio.

## Referências
- [../platform/PLATFORM-BLUEPRINT.md](../platform/PLATFORM-BLUEPRINT.md)
