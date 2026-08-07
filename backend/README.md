# Moto Assistant Backend

NestJS 11 backend using a single `AppModule`, Express, TypeORM and PostgreSQL.

## Development

Copy `.env.example` to `.env`, update `DATABASE_URL`, then run:

```sh
pnpm install
pnpm dev
```

The API listens on port `7410` and uses the `/api/v1` global prefix. The health
endpoint is available at `GET /api/v1/health`.

## Database

PostgreSQL tables belong to the `moto_assistant` schema. Database commands read
the connection string from `DATABASE_URL` in `.env`.

### Generate a migration

After changing the entities, generate a migration by passing its output path and
name to `tmg`:

```sh
pnpm tmg -- ./src/database/migrations/InitTables
```

For subsequent changes, use a descriptive name:

```sh
pnpm tmg -- ./src/database/migrations/AddUserStatus
```

The command builds the project, loads the compiled migration data source, and
compares the entities with the database referenced by `DATABASE_URL`. Always
review the generated SQL before committing it.

### Synchronize a development database

For a disposable local development database, synchronize its schema directly
from the entities:

```sh
pnpm tm:sync
```

This command bypasses migrations and may drop or alter existing structures. Do
not run it against shared, staging, or production databases.

Do not synchronize a database immediately before using `tmg` against that same
database: once synchronization has applied the entity changes, there is no
remaining difference from which TypeORM can generate a migration. Generate
migrations against a database that is at the previously migrated version.
