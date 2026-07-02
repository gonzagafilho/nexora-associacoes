# Platform Boundaries

## Regras de dependência
- Platform Core não pode depender de apps.
- Apps podem depender da Platform.
- Apps não podem trocar dependências diretas entre si sem contrato explícito.

## Regras de domínio
- Skills devem ser reutilizáveis e independentes do app quando possível.
- Memory deve ser multi-app e multi-tenant por contrato.
- Orchestrator deve ser central e governado por policy engine.
- Control Center deve governar plataforma e apps.
- Lógica central de IA não pode permanecer dentro de módulos específicos de app.

## Regras de API
- Endpoints legados permanecem disponíveis durante migração.
- Contratos novos devem ser versionáveis.
- Alterações breaking exigem ADR e janela de migração.

## Regras de dados
- Isolamento por tenant obrigatório em todos os módulos.
- Chaves de app e projectKey devem ser explícitas no contexto.
- Eventos de auditoria e atividade precisam registrar origem (core/app).

## Regras de release
- Cada fase deve ter checklist de readiness e plano de rollback.
- Tag obrigatória antes de migração estrutural.

## Referências
- [PLATFORM-BLUEPRINT.md](PLATFORM-BLUEPRINT.md)
- [../adr/ADR-010-ai-core-boundaries.md](../adr/ADR-010-ai-core-boundaries.md)
