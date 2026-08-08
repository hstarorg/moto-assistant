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

Required configuration:

- `DATABASE_URL`: PostgreSQL connection string.
- `WECHAT_APP_ID` and `WECHAT_APP_SECRET`: WeChat mini-program login.
- `QINIU_ACCESS_KEY`, `QINIU_SECRET_KEY` and `QINIU_BUCKET`: vehicle image upload.
- `QINIU_KEY_PREFIX` and `IMAGE_BASE_URL`: object key prefix and public image URL.

## API

The NestJS service provides these endpoints:

| Method | Path | Authentication | Description |
| --- | --- | --- | --- |
| `POST` | `/api/v1/account/token` | None | Exchange WeChat login data for a user and token. |
| `GET` | `/api/v1/motos` | `x-ma-token` | List the current user's active vehicles. |
| `POST` | `/api/v1/motos` | `x-ma-token` | Create a vehicle using multipart field `file`. |
| `GET` | `/api/v1/motos/:motoId/fuel` | `x-ma-token` | Return `statisticsData` and `fuelList`. |
| `POST` | `/api/v1/motos/:motoId/fuel` | `x-ma-token` | Create a fuel record. |

Request and response fields use camel case. Fuel prices use `unitPrice`, audit
timestamps use `createdAt` and `updatedAt`, and timestamp responses are ISO 8601
strings. Vehicle status values are lowercase. Fuel statistics intentionally
exclude the latest fuel record, matching the established calculation. Fuel
endpoints verify that the vehicle belongs to the authenticated user.

Authentication sessions are stored in the `auth_sessions` table. Clients receive
the random token while PostgreSQL stores only its SHA-256 hash. Sessions have a
two-hour absolute lifetime and a twenty-minute sliding idle timeout. They survive
application restarts and can be shared by multiple application instances using
the same database.

## Database

PostgreSQL tables belong to the `moto_assistant` schema. Database commands read
the connection string from `DATABASE_URL` in `.env`.

### Generate a migration

After changing the entities, generate a migration by passing its output path and
name to `tmg`:

```sh
pnpm tmg ./src/database/migrations/InitTables
```

For subsequent changes, use a descriptive name:

```sh
pnpm tmg ./src/database/migrations/AddUserStatus
```

The command builds the project, loads the compiled migration data source, and
compares the entities with the database referenced by `DATABASE_URL`. Always
review the generated SQL before committing it.

### Apply migrations

Apply committed migrations to local, test, staging and production databases with:

```sh
pnpm tm:run
```

New local databases should also be initialized with `pnpm tm:run`, starting from
the committed initial migration. All environments therefore follow the same
schema history. When a deployed schema needs correction, create another forward
migration instead of synchronizing entities or relying on automatic rollback.

For production, build and run migrations as a separate deployment step before
starting the new application version. Back up the database first, review the SQL,
and run the same migration against a staging copy.

TypeORM migrations change PostgreSQL structure; they do not copy data from the
legacy MySQL database. The one-time MySQL-to-PostgreSQL data transfer should be a
separate, repeatable import job with row-count and aggregate verification before
traffic is switched.
