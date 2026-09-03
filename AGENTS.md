# AGENTS.md

## Project source of truth

The file `PRODUCT_SPEC.md` is the authoritative product and technical specification for this application.

Before implementing or modifying any feature:

1. Read `PRODUCT_SPEC.md`.
2. Understand the relevant business rules and acceptance criteria.
3. Inspect the existing codebase before making architectural changes.
4. Do not invent product behavior that conflicts with the specification.

If an implementation detail is not explicitly defined in PRODUCT_SPEC.md,
choose the simplest production-quality solution consistent with the rest of
the architecture.

## Development approach

Build this application incrementally.

Prioritize:

1. correctness
2. maintainability
3. security
4. testability
5. good UX
6. performance

Do not prematurely optimize or introduce unnecessary infrastructure.

## Quality requirements

For every meaningful implementation:

- maintain type safety;
- validate external input;
- enforce authorization server-side;
- add or update automated tests;
- run linting;
- run type checking;
- run relevant tests;
- fix failures before considering the task complete.

Never disable tests merely to make the build pass.

## Database

Database schema changes must use migrations.

Do not manually alter production database state.

Seed/demo data must remain separate from migrations.

## Security

Never commit secrets.

Use environment variables for credentials and sensitive configuration.

Do not trust client-side authorization.

Validate ownership and permissions on the server.

## Git / scope

Keep changes focused on the requested task.

Do not rewrite unrelated working code.

Avoid large refactors unless required by the specification.

## Completion

Before finishing a task:

1. review the implementation;
2. run the relevant tests;
3. run lint/typecheck where applicable;
4. report what was changed;
5. report tests executed;
6. report any unresolved limitations.
