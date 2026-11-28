# HTTP request collections

Ready-made API requests as plain-text `.http` files. Many editors and IDEs can
send them directly (some through an extension), and so can command-line
runners; any request can also be copied into `curl` or another HTTP client.
To try the REST endpoints in a browser instead, use the interactive API docs at
http://localhost:4000/api/docs.

Start the stack with `npm run dev`, or with `docker compose up -d --build`,
which publishes the API and the risk engine on the same ports (see
[Deployment](../docs/DEPLOYMENT.md#calling-the-apis-directly)). Then work
through a file from top to bottom.
Requests named with `# @name` capture values, such as the access token, for the
requests below them; if your tool does not support that, paste the token into
the `@token` variable by hand.

| File | Covers |
|---|---|
| `customer.http` | Sign-in, profile, accounts, statement (JSON, XML, XSLT), payees, bank list and IFSC lookup, transfer quote, cards, forex |
| `staff.http` | Staff sign-in, overview, approvals, customers, audit verification, ledger, risk engine status |
| `card-network.http` | Card network simulator: echo test, balance and withdrawal through the ISO 8583 switch |
| `soap.http` | SOAP service: WSDL and operations with a WS-Security UsernameToken |
| `risk-engine.http` | The Java risk engine called directly |

The demo passwords are listed in the main README. Secrets generated per
installation (the SOAP partner password and the risk engine API key) are in
`backend/.env`; paste them where a request says so.
