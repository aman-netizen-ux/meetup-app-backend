# Node.js backend architecture

The API uses module-first clean architecture. Keep **one class per TypeScript file**. Types/interfaces and small top-level functions may each have a focused file. HTTP routes, business rules, and PostgreSQL must remain separate.

```text
src/
  server.ts                      Process entry point
  app/create_app.ts              Composition root and module registration
  modules/<feature>/
    presentation/               Fastify routes, request/response mapping
    application/                Use cases and transaction orchestration
    domain/entities/            Business types, no Fastify or SQL
    domain/ports/               Repository/provider interfaces
    domain/                     Pure policy and invariant logic
    infrastructure/             Repository/provider implementations
  shared/infrastructure/         Shared PostgreSQL connection and adapters
scripts/                         Development/maintenance CLI, outside runtime src
migrations/                      Backend-only SQL
tests/                           Contract and database checks
```

Dependency direction: `presentation -> application -> domain`; infrastructure implements domain ports and is wired into use cases by `app/create_app.ts`. Domain code cannot import Fastify, `pg`, environment variables, or route-provider SDKs. SQL stays in infrastructure/migrations, never in HTTP handlers. Routes validate/authenticate and delegate; they do not contain circle lifecycle or privacy rules.

The API has a health route and registers account routes when Firebase and PostgreSQL are configured. Auth uses a Firebase identity verifier behind a domain port and PostgreSQL repositories behind user/token ports. `CircleAccessPolicy` is a pure domain rule used later by location ingestion; `PgPoolProvider` is confined to infrastructure. `scripts/spike_routes.ts` is a development-only Node CLI that calls the map provider; it is outside the Flutter project and outside runtime `src`.

For B-05, implement a use case per action, a repository port in domain, a PostgreSQL adapter in infrastructure, and a thin Fastify route in presentation. Test the domain rule and use case independently, then test the HTTP adapter and SQL integration where it adds risk.
