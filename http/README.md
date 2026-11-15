# HTTP request collections

Ready-made requests for the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client)
extension in VS Code (or any editor that understands `.http` files). Start the
stack with `npm run dev`, open a file and click **Send Request** above a request.
Requests named with `# @name` feed tokens into the requests below them.

| File | Covers |
|---|---|
| `customer.http` | Sign-in, profile, accounts, statement (JSON, XML, XSLT), payees, transfer quote, cards, forex |
| `staff.http` | Staff sign-in, overview, approvals, customers, audit verification, ledger, risk engine status |
| `card-network.http` | Card network simulator: echo test, balance and withdrawal through the ISO 8583 switch |
| `soap.http` | SOAP service: WSDL and operations with a WS-Security UsernameToken |
| `risk-engine.http` | The Java risk engine called directly |

The demo passwords are listed in the main README. Secrets generated per
installation (the SOAP partner password and the risk engine API key) are in
`backend/.env`; paste them where a request says so.
