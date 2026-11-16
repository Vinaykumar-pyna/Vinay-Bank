/**
 * Development PKI for mutual TLS on the card network.
 *
 * Creates a private certificate authority and two certificates it signs:
 *   server  - CN=localhost (SAN localhost, 127.0.0.1), for the card switch and
 *             the issuer's RPC listener
 *   client  - for callers (the acquirer simulator, the ATM CLI, the switch
 *             when it calls the issuer)
 * Keys are ECDSA P-256. Every listener requires a client certificate from this
 * CA, so only our own components can connect.
 */
import { randomBytes, webcrypto } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as x509 from '@peculiar/x509';

x509.cryptoProvider.set(webcrypto);

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
const DAY_MS = 86_400_000;

const serial = () => `01${randomBytes(15).toString('hex')}`;
const generateKeys = () => webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);

async function privateKeyPem(key) {
  return x509.PemConverter.encode(await webcrypto.subtle.exportKey('pkcs8', key), 'PRIVATE KEY');
}

export async function createDevPki({ validDays = 825 } = {}) {
  const notBefore = new Date(Date.now() - 5 * 60_000);
  const notAfter = new Date(Date.now() + validDays * DAY_MS);

  const caKeys = await generateKeys();
  const ca = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: serial(),
    name: 'CN=Vinay Bank Development CA, O=Vinay Bank, C=IN',
    notBefore,
    notAfter,
    keys: caKeys,
    signingAlgorithm: ALGORITHM,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(caKeys.publicKey),
    ],
  });

  async function issue(commonName, usage, altNames) {
    const keys = await generateKeys();
    const extensions = [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([usage], false),
      await x509.AuthorityKeyIdentifierExtension.create(caKeys.publicKey),
    ];
    if (altNames) extensions.push(new x509.SubjectAlternativeNameExtension(altNames));
    const cert = await x509.X509CertificateGenerator.create({
      serialNumber: serial(),
      subject: `CN=${commonName}, O=Vinay Bank, C=IN`,
      issuer: ca.subject,
      notBefore,
      notAfter,
      signingAlgorithm: ALGORITHM,
      publicKey: keys.publicKey,
      signingKey: caKeys.privateKey,
      extensions,
    });
    return { cert: cert.toString('pem'), key: await privateKeyPem(keys.privateKey) };
  }

  const server = await issue('localhost', x509.ExtendedKeyUsage.serverAuth, [
    { type: 'dns', value: 'localhost' },
    { type: 'ip', value: '127.0.0.1' },
  ]);
  const client = await issue('vinaybank-card-network-client', x509.ExtendedKeyUsage.clientAuth);
  return { ca: ca.toString('pem'), server, client };
}

/** Writes ca.pem, server.pem, server-key.pem, client.pem and client-key.pem into `dir`. */
export async function writeDevPki(dir, options) {
  const pki = await createDevPki(options);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ca.pem'), pki.ca);
  writeFileSync(join(dir, 'server.pem'), pki.server.cert);
  writeFileSync(join(dir, 'server-key.pem'), pki.server.key, { mode: 0o600 });
  writeFileSync(join(dir, 'client.pem'), pki.client.cert);
  writeFileSync(join(dir, 'client-key.pem'), pki.client.key, { mode: 0o600 });
}

export const TLS_FILES = ['ca.pem', 'server.pem', 'server-key.pem', 'client.pem', 'client-key.pem'];
