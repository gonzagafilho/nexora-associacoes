# ADR-010: AI Core Boundaries

Status: Accepted
Data: 2026-07-02

## Contexto
Há risco de espalhar lógica central de IA em módulos específicos de app, gerando acoplamento difícil de manter.

## Decisão
Definir AI Core central com boundaries obrigatórias:
- Core não depende de app.
- Skills reutilizáveis e versionáveis.
- Orchestrator central.
- Memory multi-app/multi-tenant.
- Apps consomem contratos do core via adapters/gateway.

## Consequências
- Positivas: reuso e previsibilidade de evolução.
- Custos: refatorações graduais em módulos legados.

## Referências
- [../platform/PLATFORM-BOUNDARIES.md](../platform/PLATFORM-BOUNDARIES.md)
