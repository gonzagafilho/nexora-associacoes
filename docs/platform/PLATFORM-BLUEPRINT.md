# NEXORA Platform Blueprint (v4.3.0)

Status: Draft aprovado para planejamento
Escopo: Blueprint técnico e governança de migração (sem movimentação física de código)

## Objetivo
Transformar o projeto atual em NEXORA Platform, mantendo o sistema de Associações como primeiro app da plataforma e preservando 100% da compatibilidade operacional durante a transição.

## Princípios
- Zero downtime e zero quebra de produção durante a fase de blueprint.
- Migração incremental com feature parity validada a cada fase.
- Núcleo de plataforma reutilizável e independente dos apps.
- Governança central via NEXORA Control Center.

## Arquitetura Alvo
```text
nexora-platform/
  apps/
    associacoes/
    xpdcnet/
    guardian/
    chatbot/
    financeiro/
    workponto/
    palpites/
  packages/
    platform-core/
    ai-core/
    memory/
    skills/
    orchestrator/
    events/
    runtime/
    auth/
    permissions/
    audit/
    sdk/
    shared-ui/
    shared-db/
    shared-utils/
  control-center/
  gateway/
  docs/
```

## Fluxo de IA na Plataforma
Assistant
-> Platform Gateway
-> App Registry
-> Orchestrator
-> Skills
-> Resposta

## Componentes Críticos
- Platform Core: contratos, governança, runtime e observabilidade.
- AI Core: assistant, intents, roteamento e regras de execução.
- Memory: camada multi-app e multi-tenant com isolamento forte.
- Skills: catálogo versionado e reutilizável entre apps.
- Orchestrator: execução central de planos multi-step.
- Control Center: cockpit único de operação da plataforma.

## Decisões Relacionadas
- [MONOREPO-ROADMAP.md](MONOREPO-ROADMAP.md)
- [APP-MIGRATION-PLAN.md](APP-MIGRATION-PLAN.md)
- [PLATFORM-BOUNDARIES.md](PLATFORM-BOUNDARIES.md)
- [CONTROL-CENTER-ROADMAP.md](CONTROL-CENTER-ROADMAP.md)
- [SDK-ROADMAP.md](SDK-ROADMAP.md)
- [../adr/ADR-006-nexora-platform.md](../adr/ADR-006-nexora-platform.md)
