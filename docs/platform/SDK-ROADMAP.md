# SDK Roadmap

## Objetivo
Fornecer SDK oficial para integração de apps com NEXORA Platform.

## Escopo inicial do SDK
- Registro de app no App Registry.
- Provedor de contexto por tenant/app/user.
- Cliente de Skills e Orchestrator.
- Cliente de eventos e logs de auditoria.
- Tipos compartilhados para requests/responses.

## Artefatos previstos
- `@nexora/sdk-core`
- `@nexora/sdk-ai`
- `@nexora/sdk-events`
- `@nexora/sdk-auth`

## Fases
1. Definir contratos e tipagens base.
2. Implementar wrappers HTTP para gateway.
3. Validar integração com app Associações.
4. Publicar guias de onboarding para apps externos.

## Critérios de pronto
- Cobertura mínima de testes do SDK.
- Exemplo funcional de app integrado.
- Versionamento semântico e changelog.

## Referências
- [MONOREPO-ROADMAP.md](MONOREPO-ROADMAP.md)
- [../adr/ADR-008-app-registry.md](../adr/ADR-008-app-registry.md)
