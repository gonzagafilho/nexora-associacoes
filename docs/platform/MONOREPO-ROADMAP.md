# Monorepo Roadmap (v4.3.0)

## Objetivo
Definir roteiro técnico para consolidar NEXORA Platform em monorepo, sem mover código nesta etapa.

## Fases

### Fase A - Blueprint e documentação
- Entregar visão, boundaries, mapa atual->futuro e checklist de readiness.
- Sem alterações estruturais no runtime de produção.

### Fase B - Monorepo vazio
- Criar estrutura `nexora-platform/` com workspaces.
- Criar pipelines básicas de lint, test e build por package.

### Fase C - Extrair Platform Core
- Migrar contratos, app registry e APIs de plataforma para `packages/platform-core`.
- Manter adapters no repositório atual até estabilização.

### Fase D - Extrair AI Core
- Migrar assistant, activity logs, intent routing e interfaces.
- Manter compatibilidade de endpoints existentes via gateway.

### Fase E - Extrair Control Center
- Promover `frontend-admin` para `control-center/`.
- Organizar shell de navegação multi-app e governança.

### Fase F - App Associações
- Transformar módulos de associação em `apps/associacoes`.
- Garantir paridade com produção antes do cutover.

### Fase G - Apps externos
- Conectar xpdcnet, guardian e chatbot como apps independentes.
- Publicar contratos de integração no gateway.

### Fase H - SDK
- Criar SDK oficial para apps e integrações de terceiros.

### Fase I - Marketplace
- Catalogar skills, apps e connectors com governança de versões.

## Gate por fase
- Testes de regressão passando.
- Monitoramento e rollback documentados.
- Aprovação técnica e operacional antes de avançar.

## Referências
- [PLATFORM-BLUEPRINT.md](PLATFORM-BLUEPRINT.md)
- [APP-MIGRATION-PLAN.md](APP-MIGRATION-PLAN.md)
- [../adr/ADR-007-monorepo-strategy.md](../adr/ADR-007-monorepo-strategy.md)
