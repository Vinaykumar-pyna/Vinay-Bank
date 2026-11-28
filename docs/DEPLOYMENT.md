# Deployment

> **What was run.** Docker Compose was run end to end on Docker Desktop
> (Docker 29.9, Windows 11): all five containers start; the web app works
> through nginx; live notifications arrive over WebSockets; the ATM CLI and
> the SOAP client talk to the containers; the API reaches the Java risk engine
> with its API key; HTTP clients on the host call the API and the risk engine
> directly on their published ports, over both loopback addresses. The nginx
> edge configuration, the systemd units, the PM2 file and the Oracle scripts
> follow standard practice but were **not run** (there was no Linux server,
> nginx or Oracle in the development environment). Treat those as a reviewed
> starting point.

## Topology

```mermaid
flowchart LR
  internet([Internet]) -->|443| nginx[nginx: TLS, headers, rate limits, static files]
  nginx -->|/api /socket.io /soap| api[API :4000]
  atm([ATM / POS network]) -->|mutual TLS :5800| switch[Card switch]
  switch -->|mutual TLS :4001| api
  api --> risk[Risk engine :8085]
  api --> mongo[(MongoDB replica set)]
  api --> ledger[(Oracle: general ledger)]
```

Only nginx (443) and the card switch (5800, mutual TLS, ideally on a private
network for acquirers) are exposed. The API, the issuer RPC port, the risk
engine and the databases stay on internal networks.

## Option 1: Docker Compose

```bash
npm install                    # creates backend/.env and backend/.secrets
docker compose up -d --build   # MongoDB, API, card switch, risk engine, web app
```

Open http://localhost:8080; the demo sign-ins work as in development. The
first build downloads about 1.5 GB of base images and packages and takes a few
minutes; later builds reuse the cache.

- **Stop `npm run dev` first**: both use ports 4000, 5800 and 8085.
- nginx (8080) and the card switch (5800) are published. The API (4000) and
  the risk engine (8085) are published on the loopback addresses only
  (`127.0.0.1` and `::1`), so HTTP clients on this machine can call them
  directly (see [Calling the APIs directly](#calling-the-apis-directly)). The
  issuer RPC port (4001) stays inside the Compose network.
- MongoDB is published on `127.0.0.1:27017` only, so database clients on this
  machine can connect (see [Inspecting the data](#inspecting-the-data)). It has
  no password, which is why it is never exposed beyond localhost. If another
  MongoDB already uses port 27017, change the host port in `docker-compose.yml`
  (for example `127.0.0.1:27019:27017`).
- Point the terminal clients at the containers:

```bash
npm run atm -- balance --demo --pin 4826 --api http://localhost:8080/api/v1
npm run soap -- security --url http://localhost:8080/soap/banking
```

- Logs: `docker compose logs -f api card-switch` (JSON lines from both).
- Stop with `docker compose down`. Add `-v` to delete the database and ledger
  volumes; the demo data is seeded again on the next start.

Files: `docker-compose.yml`, `backend/Dockerfile` (one image, two commands: API
and card switch), `frontend/Dockerfile` (build, then unprivileged nginx),
`services/risk-engine/Dockerfile` (Maven build, then a JRE image running as a
non-root user). The MongoDB health check initiates the replica set on first
start. Secrets are mounted read-only, never baked into images. The Maven
Wrapper checks the Maven download against a pinned SHA-256; the build stage
installs `unzip` because without it the wrapper fetches the `.tar.gz`, whose
checksum differs from the pinned `.zip`.

### Calling the APIs directly

The API and the risk engine answer at the same addresses as with `npm run dev`,
so the request files in [`http/`](../http/README.md) and any other HTTP client
on this machine work against the containers unchanged.

| Service | Address | Authentication |
|---|---|---|
| REST API | http://localhost:4000/api/v1 | Bearer access token from `POST /auth/login` |
| API docs (OpenAPI) | http://localhost:4000/api/docs (JSON spec: `/api/docs-json`) | None |
| SOAP service | http://localhost:4000/soap/banking (WSDL: `?wsdl`) | WS-Security UsernameToken |
| Risk engine | http://localhost:8085/api/v1/risk | `X-Api-Key` header |
| Risk engine health | http://localhost:8085/actuator/health | None |

- The SOAP password and the risk engine API key are generated per installation
  and stored in `backend/.env` (`SOAP_PASSWORD`, `RISK_ENGINE_API_KEY`); the
  sign-ins are listed in the [README](../README.md#demo-sign-in).
- Requests to port 4000 skip nginx; http://localhost:8080/api/v1 reaches the
  same API through it. The WSDL advertises the nginx address
  (`SOAP_PUBLIC_URL`), so clients generated from it call port 8080.
- The card switch (5800) and the issuer RPC (4001) use mutual TLS, not HTTP;
  `http/card-network.http` drives the card network through the API instead.
- Both loopback addresses are published because some clients try `::1` before
  `127.0.0.1`; without `::1`, each of their new connections would wait for that
  attempt to fail (about two seconds on Windows). If Docker cannot bind `::1`
  (IPv6 disabled on the host), delete the two `[::1]` lines in
  `docker-compose.yml`.
- Quick check from a terminal: `curl http://localhost:4000/api/v1/health`.

### Inspecting the data

These steps work with any MongoDB or SQLite client, database IDE or command
line.

**MongoDB** (customers, accounts, transactions, audit trail):

- Connection string: `mongodb://localhost:27017/vinaybank?directConnection=true`
  (no user name or password).
- Keep `directConnection=true`. The single-node replica set announces itself
  as `mongo:27017`, a host name that only resolves inside the Compose network;
  without the option, clients try to reach that name and time out.
- Without a client installed, open the MongoDB shell inside the container:
  `docker compose exec mongo mongosh vinaybank`.

**General ledger** (SQLite, inside the `api` container): the API keeps the
ledger in memory and rewrites `/app/.data/ledger.sqlite` after every change, so
copy a snapshot and open the copy with any SQLite client. Copy it again to
refresh; changes made to the copy never reach the application.

```bash
docker compose cp api:app/.data/ledger.sqlite ledger-snapshot.sqlite
```

The container path has no leading `/` so that the command works unchanged in
every shell. `ledger-snapshot.sqlite` is listed in `.gitignore`.

While browsing:

- Amounts are integers in paise: `ledgerBalance: 24861540` is Rs 2,48,615.40.
- Some fields are encrypted at rest (AES-256-GCM) and look random on purpose,
  for example `kyc.panEncrypted` and `cards.panEncrypted`; masked versions such
  as `kyc.panMasked` and `last4` are readable.
- Treat the data as read-only. Each `audit_logs` record is chained to the one
  before it by a SHA-256 hash, so an edit made outside the API is reported by
  "Verify integrity" (`npm run demo:tamper` demonstrates exactly that).

## Option 2: Linux server (systemd)

1. Install Node.js 22 LTS, Java 21, nginx and MongoDB (3-node replica set in production).
2. Create a service user: `sudo useradd --system --home /opt/vinaybank vinaybank`.
3. Build: `npm ci && npm run build`, and `./mvnw -B package` in `services/risk-engine`.
4. Copy `backend/dist`, `backend/package*.json` (then `npm ci --omit=dev`),
   `backend/.env`, `backend/.secrets` and the risk engine jar to `/opt/vinaybank`.
   Restrict permissions: `chmod 600 .env`, `chmod 700 .secrets`.
5. Install the units from `deploy/systemd/` and start them:

```bash
sudo cp deploy/systemd/*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now vinaybank-api vinaybank-switch vinaybank-risk
journalctl -u vinaybank-api -f
```

The units run as the unprivileged user with `ProtectSystem=strict`,
`NoNewPrivileges`, a private `/tmp` and no capabilities; only the data folder is
writable.

6. Build the web app (`npm --prefix frontend run build`), copy `frontend/dist`
   to `/var/www/vinaybank`, install `deploy/nginx/vinaybank.conf` and the proxy
   snippet in it, get a certificate (for example with certbot) and reload nginx.

**PM2** is an alternative to systemd: `pm2 start deploy/pm2/ecosystem.config.cjs`
(the file explains why the API runs as a single process).

## Production settings

| Setting | Value |
|---|---|
| `NODE_ENV` | `production` |
| `COOKIE_SECURE` | `true` (HTTPS only) |
| `TRUST_PROXY` | `1` behind one proxy, so rate limits and audit logs see real client IPs |
| `CORS_ORIGINS` | The exact public origin |
| `DEMO_MODE`, `SEED_DEMO_DATA` | `false` |
| `MONGODB_URI` | A replica set with authentication and TLS |
| `LEDGER_DB_TYPE` | `oracle` with the schema from `database/oracle` |
| Secrets | From a vault or KMS rather than files; the card keys in an HSM |
| Certificates | The card network CA and certificates from the bank's PKI, not the development CA |

## Operations

- **Health**: `GET /api/v1/health` (liveness) and `/api/v1/health/ready`
  (readiness, checks MongoDB); the risk engine has `/actuator/health`.
- **Logs**: JSON lines (pino) with request IDs, ready for a log pipeline.
- **Graceful shutdown**: SIGTERM closes listeners and finishes in-flight work
  (NestJS shutdown hooks, Spring `server.shutdown: graceful`).
- **Backups**: MongoDB (oplog-based), Oracle RMAN; the SQL ledger can also be
  rebuilt from MongoDB because it is a projection.
- **Scaling**: the API is stateless apart from Socket.IO and the SQLite ledger;
  with Oracle and the Socket.IO Redis adapter it can run several instances
  behind nginx.
