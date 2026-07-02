# ADR-008: App Registry como contrato central

Status: Accepted
Data: 2026-07-02

## Contexto
Sem catálogo central de apps, não há governança consistente para permissões, módulos e perfis de agentes.

## Decisão
Instituir App Registry com metadados obrigatórios por app:
- id
- name
- version
- icon
- description
- permissions
- enabled
- routes
- modules
- agentProfile

## Consequências
- Positivas: onboarding padronizado de apps e visibilidade operacional.
- Custos: necessidade de manter metadados atualizados.

## Referências
- [../platform/APP-MIGRATION-PLAN.md](../platform/APP-MIGRATION-PLAN.md)
