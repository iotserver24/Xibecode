---
description: SQL migrations, queries, and safe data access
tags: sql, database, migrations
---

# Database Patterns

## Migrations

- Add migrations through the project's tool (Prisma, Knex, Flyway, etc.); never hand-edit production schema without a migration file.
- Make migrations reversible when the toolchain supports rollbacks.

## Queries

- Prefer parameterized queries — never concatenate user input into SQL strings.
- Add indexes when introducing new filters or joins that will run at scale; note the trade-off in the PR if significant.

## Transactions

- Use transactions for multi-step updates that must succeed or fail together.
- Keep transactions short to avoid long locks.
