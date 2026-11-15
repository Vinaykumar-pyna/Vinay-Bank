# ArthaBank

A digital banking and card payment platform built with **MongoDB, NestJS (Node.js), React and TypeScript**.

> ArthaBank is a demonstration project, not a real bank. It was built to show a complete,
> production-style full stack application for the Officer-Developer (Full Stack MERN) role.

[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-332-brightgreen)
![Stack](https://img.shields.io/badge/stack-MongoDB%20%7C%20NestJS%20%7C%20React%20%7C%20TypeScript-4f46e5)

## What it does

**Customers** open accounts, send money (own accounts, ArthaBank, IMPS, NEFT,
RTGS) with OTP step-up, manage payees, download statements (CSV, XML, printable
via XSLT), get live alerts, manage RuPay debit cards (PIN, controls, limits,
block, report lost), pay salaries from ISO 20022 bulk files and use the ATM
simulator. **Staff** (teller, manager, admin) get a KPI dashboard, a
maker-checker approval queue, customer search with KYC review, a cash counter,
a transaction monitor with fraud scores, the general ledger and a
tamper-evident audit trail.

Under the hood: an **ISO 8583 card switch** over mutual TLS, a **Java Spring
Boot fraud engine** behind a circuit breaker, a **SOAP/WSDL** partner service,
a **double-entry SQL ledger** (Oracle scripts included), AES-GCM field
encryption, RS256 JWT with refresh-token rotation, TOTP MFA and 332 automated
tests in CI.

## Documentation

| Document | Contents |
|---|---|
| [Interview guide](docs/INTERVIEW_GUIDE.md) | Pitch, 15-minute demo script, job notification mapped to the code, questions and answers |
| [Architecture](docs/ARCHITECTURE.md) | Components, module map, request pipeline, sequence diagrams, data model, design patterns |
| [Setup](docs/SETUP.md) | Installation, configuration, troubleshooting |
| [API](docs/API.md) | Conventions, all 77 REST endpoints, SOAP, ISO 8583, RPC and WebSocket interfaces |
| [Security](docs/SECURITY.md) | OWASP Top 10 mapping, authentication, money movement, encryption, card security |
| [ISO 8583](docs/ISO8583.md) | Message formats, bitmaps, PIN blocks, MACs, response codes, how to try it |
| [Testing](docs/TESTING.md) | Test suites, coverage, what each end-to-end suite proves |
| [Deployment](docs/DEPLOYMENT.md) | Docker Compose, nginx, systemd, PM2, production settings |
| [Risk engine](services/risk-engine/README.md) | The Java service: design, API, running and testing |
| [Oracle ledger](database/oracle/README.md) | DDL, PL/SQL package and reports |
| [HTTP requests](http/README.md) | Ready-to-send requests for REST Client |

## Tech stack

| Layer | Technologies |
|---|---|
| Web app | React 19, TypeScript, Vite, Redux Toolkit + RTK Query, Axios, React Router 7, React Hook Form + Zod, Bootstrap 5 + SCSS, Recharts, Socket.IO client |
| Core banking API | Node.js, NestJS 11, MongoDB (Mongoose, replica set transactions), Socket.IO, jose (RS256), Joi, class-validator, pino, Swagger |
| Card network | NestJS microservices (TCP + TLS), Node `tls`, own ISO 8583 codec, triple DES, HMAC |
| Integrations | node-soap (SOAP/WSDL), xmlbuilder2, xslt-processor, @xmldom/xmldom + xpath, Frankfurter (ECB), Razorpay IFSC |
| General ledger | TypeORM, SQLite (sql.js), Oracle DDL and PL/SQL |
| Risk engine | Java 21, Spring Boot 4.1, Bean Validation, Actuator, JUnit 5, Maven Wrapper |
| Quality and delivery | Jest, React Testing Library, Supertest, mongodb-memory-server, ESLint, Prettier, GitHub Actions, Docker, nginx, systemd, PM2 |

## Quick start

Prerequisites: **Node.js 22 or newer** and Git. You don't need to install MongoDB.
Optional: **Java 21 or newer** for the fraud risk engine (without it, the API uses
its built-in fallback rules and everything else works the same).

```bash
npm install      # installs root, backend and frontend dependencies and generates local secrets
npm run dev      # starts MongoDB, the API, the card switch, the Java risk engine and the web app
```

Then open:

| What | URL |
|---|---|
| Web app | http://localhost:5173 |
| REST API | http://localhost:4000/api/v1 |
| API docs (Swagger) | http://localhost:4000/api/docs |
| ATM and POS simulator | http://localhost:5173/simulator |
| SOAP service (WSDL) | http://localhost:4000/soap/banking?wsdl |
| Risk engine (Spring Boot) | http://localhost:8085/actuator/health |
| Card switch (ISO 8583, mutual TLS) | `127.0.0.1:5800` |

The first `npm run dev` downloads the official MongoDB server binary once
(about 780 MB on Windows, less on Linux/macOS). Data is kept in `backend/.data/mongo`.

## Demo sign-in

The local database is seeded with demo data on first start. These are test
credentials for a local, non-production database only (see
`backend/apps/api/src/modules/seed/demo-data.ts`); the sign-in page also has a
"Demo accounts" panel that fills them in.

| Role | Email | Password |
|---|---|---|
| Administrator | admin@arthabank.test | `Demo@1234` |
| Branch manager (checker) | manager@arthabank.test | `Demo@1234` |
| Teller (maker) | teller@arthabank.test | `Demo@1234` |
| Customer | priya@example.com | `Demo@1234` |
| Customer | rahul@example.com | `Demo@1234` |
| Customer, KYC pending | ananya@example.com | `Demo@1234` |

Priya and Rahul each have a virtual RuPay debit card with PIN **4826**. In the
simulator, "Use demo card" fills in Priya's card number and expiry.

## Card network (ISO 8583)

```
ATM / POS simulator ──ISO 8583 over mTLS──▶ Card switch ──NestJS RPC over mTLS──▶ Core banking (issuer)
  (or the ATM CLI)        port 5800          (apps/card-switch)      port 4001         (apps/api)
```

- Messages: 0200/0210 (balance, cash, purchase), 0420/0430 (reversal), 0800/0810 (echo)
- PIN blocks: ISO 9564 format 0 under triple DES zone PIN keys, translated by the switch
- Every message carries a MAC (HMAC-SHA256, field 64 or 128); TLS 1.2+ with client certificates

Try it from a terminal while `npm run dev` is running:

```bash
npm run atm -- echo
npm run atm -- balance --demo --pin 4826
npm run atm -- withdraw --demo --pin 4826 --amount 500
```

## Integrations: SOAP, XML, ISO 20022 and SQL

| Feature | Where | What it shows |
|---|---|---|
| SOAP 1.1 partner service | `/soap/banking?wsdl` | WSDL with XSD types; WS-Security UsernameToken (PasswordDigest, nonce replay protection); the partner (`SOAP_USERNAME` / `SOAP_PASSWORD` in `backend/.env`) sees only Priya's accounts |
| XML statement + XSLT | Account page, Download menu | Statement generated as XML, then rendered to a printable HTML page by an XSLT 1.0 transform |
| ISO 20022 bulk payments | Customer menu, Bulk payments | pain.001.001.03/09 parsed with XPath, control totals checked, XXE refused, paid atomically after one OTP; a sample file can be downloaded |
| Exchange rates | Customer dashboard | Live ECB rates via the Frankfurter API, cached, with an offline fallback |
| General ledger (SQL) | Staff menu, General ledger | Double-entry ledger in SQLite (TypeORM + sql.js) projected from MongoDB, trial balance and reconciliation; Oracle DDL, PL/SQL and reports in `database/oracle` |

## Project layout

```
arthabank/
├── backend/            NestJS monorepo
│   ├── apps/api/       Core banking REST API (issuer, hybrid HTTP + microservice)
│   ├── apps/card-switch/  ISO 8583 card switch (separate NestJS application)
│   ├── libs/shared/    Shared code (money, masking, crypto, ISO 8583 codec)
│   └── scripts/        Dev tooling (local MongoDB, secrets, TLS certificates, ATM CLI)
├── frontend/           React 19 + TypeScript + Vite + Redux Toolkit + Bootstrap 5
├── services/risk-engine/  Fraud risk microservice: Java 21, Spring Boot 4, Maven Wrapper
├── database/oracle/    General ledger for Oracle: DDL, PL/SQL package, reports
├── deploy/             nginx, systemd and PM2 configuration
├── http/               REST Client request collections
├── docs/               Architecture, setup, API, security, testing, deployment, interview guide
├── .github/workflows/  CI: lint, type-check, all tests, builds (Node and Java jobs)
└── docker-compose.yml  The whole platform in containers
```

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start MongoDB, API, card switch, risk engine and web app together |
| `npm run atm -- <echo\|balance\|withdraw>` | Command-line ATM talking ISO 8583 to the switch |
| `npm run soap -- <balance\|statement\|ifsc\|security>` | SOAP partner client built from the WSDL (node-soap, WS-Security PasswordDigest) |
| `npm run demo:tamper` | Edit one audit record directly in MongoDB (then use "Verify integrity") |
| `npm test` | Run backend and frontend unit tests |
| `npm run test:e2e` | Run API end-to-end tests against an in-memory MongoDB |
| `npm run test:java` | Run the risk engine's JUnit tests (Maven Wrapper) |
| `npm run lint` | ESLint for both apps |
| `npm run typecheck` | TypeScript for both apps |
| `npm run build` | Production builds |
| `npm run db:reset` | Drop the local database and ledger (re-seeded on the next start) |
