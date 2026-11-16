# General ledger on Oracle

Vinay Bank keeps operational data (customers, accounts, transactions) in
**MongoDB** and the double-entry **general ledger** in a relational database.
Locally the ledger runs on SQLite through `sql.js`, so nothing has to be
installed. These scripts define the same ledger for **Oracle Database 19c or
later**.

> These scripts were written for Oracle but have not been run against an Oracle
> instance in this project's environment. The SQLite version is exercised by the
> automated tests (`apps/api/test/ledger.e2e-spec.ts`).

| Script | What it creates |
|---|---|
| `01_schema.sql` | Tables, constraints (balanced-line CHECK, idempotency UNIQUE, foreign keys), indexes and the `ledger_line_t` / `ledger_line_tab` types |
| `02_seed_chart_of_accounts.sql` | The chart of accounts, as an idempotent `MERGE` |
| `03_ledger_pkg.sql` | PL/SQL package `ledger_pkg`: `post_entry` (balance check, set-based insert, `DUP_VAL_ON_INDEX` idempotency), `account_balance`, `assert_ledger_balanced` |
| `04_reports.sql` | Trial balance view with `ROLLUP`, running-balance statement with an analytic `SUM() OVER`, daily rail volumes, top accounts with `RANK()`, integrity checks |

## Running them

With Oracle Database Free in Docker:

```bash
docker run -d --name oracle -p 1521:1521 -e ORACLE_PASSWORD=change-me gvenzl/oracle-free
```

Then connect as an application user (SQL\*Plus, SQLcl or SQL Developer) and run
the scripts in order: `@01_schema.sql`, `@02_seed_chart_of_accounts.sql`,
`@03_ledger_pkg.sql`, `@04_reports.sql`.

## Pointing the API at Oracle

```bash
cd backend
npm install oracledb
```

Then in `backend/.env`:

```
LEDGER_DB_TYPE=oracle
LEDGER_ORACLE_CONNECT_STRING=localhost:1521/FREEPDB1
LEDGER_ORACLE_USER=vinaybank
LEDGER_ORACLE_PASSWORD=...
```

With Oracle, TypeORM does not create tables (`synchronize: false`); the schema
comes from these scripts, as it would in production through a migration process.
