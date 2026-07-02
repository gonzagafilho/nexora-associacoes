# App Migration Plan (Atual -> Futuro)

## Escopo
Mapeamento de módulos atuais para destino no monorepo, sem movimentação física nesta fase.

## Tabela de migração

| Atual no associacao-bolepix | Futuro no monorepo | Observação |
|---|---|---|
| `backend/src/platform` | `packages/platform-core` | Núcleo e contratos da plataforma |
| `backend/src/modules/platform` | `packages/platform-core/api` | API de exposição da plataforma |
| `backend/src/modules/ai` | `packages/ai-core` | Assistant, logs e roteamento |
| `backend/src/modules/memory` | `packages/memory` | Memória multi-app/multi-tenant |
| `backend/src/modules/ai/skills` | `packages/skills` | Catálogo de skills reutilizável |
| `backend/src/modules/ai/orchestrator` | `packages/orchestrator` | Planejamento e execução central |
| `backend/src/runtime` | `packages/runtime` | Runtime compartilhado |
| `backend/src/services/system` | `packages/events` | Eventos e telemetria de plataforma |
| `backend/src/middlewares/auth.js` | `packages/auth` | Autenticação comum |
| `backend/src/middlewares/requireModule.js` | `packages/permissions` | Regras de permissão |
| `backend/src/services/audit` | `packages/audit` | Auditoria central |
| `frontend-admin/src` | `control-center/` | UI de governança da plataforma |
| `backend/src/modules/associates` | `apps/associacoes/modules/associates` | Domínio do app Associações |
| `backend/src/modules/protocols` | `apps/associacoes/modules/protocols` | Domínio do app Associações |
| `backend/src/modules/financial` | `apps/associacoes/modules/financial` | Domínio do app Associações |
| `backend/src/modules/invoices` | `apps/associacoes/modules/memberbilling` | Cobrança do app Associações |
| `backend/src/modules/projects` | `apps/associacoes/modules/projects` | Projeto como capability de app |
| `backend/src/modules/assets` | `apps/associacoes/modules/assets` | Patrimônio como capability de app |

## Estratégia de corte
- Preservar API pública existente com adapters até conclusão de cada fase.
- Migrar por domínio, não por arquivo isolado.
- Só remover adapters após duas versões estáveis em produção.

## Readiness checklist (pré-migração real)
- [ ] Testes cobrindo Platform API
- [ ] Testes cobrindo Assistant
- [ ] Testes cobrindo Skills
- [ ] Testes cobrindo Orchestrator
- [ ] Testes cobrindo Memory
- [ ] Build frontend validado
- [ ] PM2 online e estável
- [ ] Plano de rollback definido
- [ ] Branch de migração criada
- [ ] Backup do Mongo realizado
- [ ] Backup do repositório realizado
- [ ] Tag criada antes do início da migração

## Riscos e mitigação
- Risco: regressão silenciosa em contratos de API
	Mitigação: testes de contrato por endpoint e observabilidade de erros
- Risco: acoplamento residual de lógica de core dentro de apps
	Mitigação: auditoria de boundaries por fase e ADR obrigatório para exceções
- Risco: aumento de complexidade operacional durante transição
	Mitigação: rollout progressivo por domínio e rollback documentado

## Referências
- [MONOREPO-ROADMAP.md](MONOREPO-ROADMAP.md)
- [PLATFORM-BOUNDARIES.md](PLATFORM-BOUNDARIES.md)
