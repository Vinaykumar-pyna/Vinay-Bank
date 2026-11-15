# Setup and running

## Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | 22.12 or newer (tested on 25 and 26) | Everything |
| Git | any recent | Cloning |
| Java JDK | 21 or newer (optional) | The fraud risk engine; without it the API uses its fallback rules |

You do **not** need to install MongoDB, Maven, Oracle or Docker.

- MongoDB: `npm run dev` downloads the official `mongod` binary once (about 780 MB
  on Windows, less elsewhere) and runs a local single-node replica set on port 27018.
- Maven: the Maven Wrapper downloads Maven 3.9.16 once, verified by SHA-256.
- The general ledger uses SQLite through `sql.js` (WebAssembly), nothing to install.

## First run

```bash
git clone <repository> arthabank
cd arthabank
npm install
npm run dev
```

`npm install` installs the root, backend and frontend packages and then runs
`backend/scripts/setup-dev.mjs`, which:

1. creates `backend/.env` from `backend/.env.example`, filling every
   `__RANDOM_...__` placeholder with fresh random secrets (encryption keys,
   HMAC keys, zone PIN keys, MAC key, SOAP password, risk engine API key);
2. generates the RSA-2048 key pair for signing access tokens (`backend/.secrets`);
3. generates a development certificate authority with server and client
   certificates for mutual TLS on the card network (`backend/.secrets/tls`).

The script is idempotent: run `npm run setup` again at any time; it only adds
what is missing. Neither `.env` nor `.secrets` is committed.

`npm run dev` starts five processes with coloured prefixes:

| Prefix | Process | Port |
|---|---|---|
| `db` | MongoDB replica set (`backend/.data/mongo`) | 27018 |
| `api` | Core banking API (watch mode) | 4000 HTTP, 4001 issuer RPC |
| `switch` | ISO 8583 card switch (watch mode) | 5800 |
| `risk` | Java risk engine (Spring Boot) | 8085 |
| `web` | Vite dev server with API proxy | 5173 |

Open http://localhost:5173 and sign in with a demo account (see the README, or
use the "Demo accounts" panel on the sign-in page). On the first start the
database is seeded with customers, staff, six months of realistic transactions,
payees and demo debit cards.

## Everyday commands

```bash
npm run dev            # everything
npm test               # backend and frontend unit tests
npm run test:e2e       # API end-to-end tests (in-memory MongoDB replica set)
npm run test:java      # risk engine JUnit tests
npm run lint           # ESLint, both apps
npm run typecheck      # TypeScript, both apps
npm run build          # production builds (API, card switch, web app)
npm run db:reset       # drop the local database and ledger (re-seeded on next start)
npm run atm -- echo    # command-line ATM against the card switch
npm run soap -- balance  # SOAP partner client generated from the WSDL
npm run demo:tamper    # edit one audit record directly in MongoDB (demo)
```

## Configuration

All settings are environment variables in `backend/.env`, validated at start-up
with Joi (the API refuses to start with a missing or malformed value). The
template `backend/.env.example` documents each one. Main groups:

| Group | Examples |
|---|---|
| Server | `API_PORT`, `CORS_ORIGINS`, `TRUST_PROXY`, `LOG_LEVEL` |
| Database | `MONGODB_URI`, `LEDGER_DB_TYPE`, `LEDGER_SQLITE_PATH`, `LEDGER_ORACLE_*` |
| Authentication | `JWT_*`, `REFRESH_TOKEN_TTL_DAYS`, `BCRYPT_ROUNDS`, `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_MINUTES`, `COOKIE_SECURE` |
| Encryption | `DATA_ENCRYPTION_KEY` (+ `_PREVIOUS` for rotation), `BLIND_INDEX_KEY`, `APP_HMAC_KEY` |
| Banking rules | `BENEFICIARY_COOLING_HOURS`, `HIGH_VALUE_THRESHOLD_RUPEES`, `NEFT_SETTLEMENT_SECONDS` |
| Card network | `CARD_BIN`, `CARD_SWITCH_*`, `CORE_RPC_*`, `CARD_ZPK_*`, `CARD_MAC_KEY`, `CARD_PVK`, `CARD_CVK`, `TLS_*_PATH` |
| Integrations | `IFSC_API_URL`, `FOREX_API_URL`, `EXTERNAL_HTTP_TIMEOUT_MS`, `SOAP_*` |
| Risk engine | `RISK_ENGINE_ENABLED`, `RISK_ENGINE_URL`, `RISK_ENGINE_API_KEY`, `RISK_ENGINE_TIMEOUT_MS`, `RISK_ENGINE_FAILURE_THRESHOLD`, `RISK_ENGINE_COOLDOWN_MS` |
| Demo | `DEMO_MODE` (simulator, OTPs shown in-app), `SEED_DEMO_DATA` |

## Troubleshooting

**The first `npm run dev` takes a few minutes.** MongoDB and Maven are
downloaded once and cached (`~/.cache/mongodb-binaries`, `~/.m2`).

**Risk engine: "Unable to establish loopback connection" (Windows).** When the
Windows user name contains a space, the JDK's internal NIO pipe cannot use the
temp folder. `npm run dev` already works around it; see
`services/risk-engine/README.md` if you start the jar yourself.

**Risk engine missing.** Without Java 21+, the `risk` process prints a notice and
exits; transfers are scored by the API's built-in rules and the staff dashboard
shows "Fallback rules".

**Port already in use.** Another copy of the stack may still be running.
Stop it, or change `API_PORT`, `CARD_SWITCH_PORT`, `CORE_RPC_PORT` or
`RISK_ENGINE_URL` in `backend/.env` (and the Vite proxy in `frontend/vite.config.ts`).

**Start over with fresh data.** Stop the stack, run `npm run db:reset` (it drops
the MongoDB database and deletes the SQLite ledger, which is a projection of
it), then `npm run dev`.
