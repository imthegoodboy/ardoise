# Threat model

Ardoise handles two valuable things: a small shop's record of who owes what, and the connection to
the shop's Lightning wallet. It never holds money. This document lists what we protect, from whom,
how, and what we knowingly leave open.

## Assets

| Asset                          | Where                                                    | Why it matters                                           |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| Wallet connection (NWC string) | `shops.wallet_secret`, `invoices.wallet_secret` (sealed) | Lets the holder create and look up invoices for the shop |
| Customers' names and phones    | `customers.*_sealed`                                     | Personal data of people in debt                          |
| Ledger lines                   | `entries`                                                | The shop's money; disputes                               |
| Shopkeeper credentials         | phone HMAC, scrypt PIN hash, session hashes              | Access to the book                                       |
| Pay links                      | `customers.pay_token` (128-bit)                          | Shows one tab's open lines, lets anyone pay it           |
| Receipts                       | `invoices.public_id`                                     | Amount, rate, hash, preimage; no names                   |

## Actors

1. **Strangers on the internet**: scanning, guessing PINs, abusing public endpoints.
2. **Someone holding a forwarded pay link**: a relative, or the wrong person.
3. **A curious customer** at the counter, or a shop employee with the phone.
4. **A malicious or broken wallet service / relay**.
5. **Someone who steals the database or a backup**.
6. **Someone with the shopkeeper's unlocked phone**.

## Controls

### Money: least privilege by construction

- Ardoise asks the wallet for two things only: `make_invoice` and `lookup_invoice`. At connection it
  calls `get_info` and **refuses** any connection that also offers `pay_invoice`, `pay_keysend`,
  `multi_pay_invoice`, `multi_pay_keysend` or `create_connection`. A stolen database yields keys that
  cannot spend. The override flag for tests is ignored in production.
- The connection is tested before it is saved: a 1-sat invoice is created, decoded, and looked up.
- Every invoice a wallet returns is **decoded and checked** (amount in msat, payment hash, network,
  at least one minute of validity) before a payer sees it.
- A tab is credited **only** when the wallet reports a preimage whose SHA-256 equals the payment
  hash. "Settled" without proof is ignored and logged.
- Settlement is a single transaction guarded by `status <> 'paid'` and a unique `invoice_id` on the
  ledger line: concurrent checkers cannot double-credit.
- Each invoice keeps a sealed copy of the receive-only connection that issued it, so replacing the
  wallet cannot orphan a payment already made. The copy is erased once the invoice can no longer be
  paid.
- Prices: median of Kraken, Coinbase, Bitstamp and CoinGecko, used only when a majority of the feeds
  that answered agree pairwise within 3 %. With no fresh price, real wallets get no invoice. The fixed
  fallback price exists for the simulated demo wallet only.

### Network: the wallet relay is user input (SSRF)

- Relays must be `wss://`, without credentials, not `localhost` or internal names, and every DNS
  answer must be a public address. IPv4-mapped, IPv4-compatible and NAT64 IPv6 forms are decoded and
  judged as the IPv4 they carry.
- The check runs when the wallet is connected **and again before every new socket**, so a hostname
  re-pointed to a private address later is refused (DNS rebinding).
- _Residual:_ a hostname that flips between our lookup and the socket's own lookup (milliseconds
  apart) is not pinned. The payload would be a WebSocket handshake speaking NIP-47; we accept this
  risk and document it. Deployments in sensitive networks should run behind an egress proxy.

### Accounts and sessions

- PIN: 6 digits, obvious ones refused (`123456`, `111111`, `121212`, `123123`, `987654`…), scrypt with per-hash
  salt and a server pepper. Five tries per phone per 15 minutes, **counted before verification** so
  parallel guesses cannot exceed it (tested with 12 concurrent attempts); 30 attempts per client.
- Errors do not reveal whether a phone number has an account; unknown numbers cost the same scrypt.
- Sessions: 256-bit random tokens, stored as SHA-256, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS,
  60-day sliding expiry. Changing the PIN signs out every other device.
- Sensitive changes (wallet, delete) ask for the PIN again.

### Data at rest

- Customer names, phones, payer first names and wallet strings are sealed with AES-256-GCM. Each
  value is bound to its record (`customers.name:<id>`), so a sealed value copied to another row does
  not decrypt.
- The shopkeeper's phone is stored only as an HMAC (lookup), never in clear.
- Keys derive from `ARDOISE_SECRET` (or a generated key file on a persistent volume). The server
  refuses to start in production with an external database and no stable key.

### Web surface

- Server-rendered forms with SvelteKit's origin check (CSRF); JSON endpoints also check `Origin`.
- `Referrer-Policy: same-origin` so pay tokens in URLs never leak to other sites.
- Content-Security-Policy: scripts, styles, fonts and connections from the app's own origin only;
  `frame-ancestors 'none'`, `object-src 'none'`.
- `Cache-Control: private, no-store` on the book, pay links, receipts and APIs; `X-Robots-Tag: noindex`
  on pay links and receipts.
- Open-redirect guard on `next=`: same-site paths only, no backslashes, no control characters.
- Rate limits: invoices per link and per client, polling, imports, demo shops, wallet tests.

### Logs and third parties

- Logs are structured JSON with route ids, never URLs or bodies. A scrubber masks NWC strings,
  invoices, 64-hex values, phone-like numbers and API keys as a second line of defence.
- Notebook photos go to Google Gemini only when the shopkeeper asks, are not stored by Ardoise, and
  the model's output is validated against a schema; the shopkeeper confirms every line. The API key is
  sent in a header, never in a URL, and lives only in the environment.
- Exchange-rate feeds receive no user data.

### The shopkeeper's phone

- The offline copy of the book lives in the service worker cache; it is deleted on sign-out
  (`Clear-Site-Data`), when the server signals a revoked session (redirect to sign-in), and on a new
  sign-in. Unsent lines are wiped only after a sign-out actually succeeds.

## Known limits

- Anyone holding a pay link sees that tab's open lines and the customer's first name. That is the
  feature (family sees what they pay for). Links are 128-bit, never indexed, and the shopkeeper can
  replace one at any time.
- A compromised wallet service can lie about invoices it issues. It already controls the shop's
  funds; Ardoise limits what it accepts (amount, hash, network, expiry, preimage) but does not verify
  the BOLT11 payee key against the node.
- A 6-digit PIN on a stolen, unlocked phone with an active session gives access to the book, like the
  paper notebook it replaces. Sessions can be revoked from another device.
- Demo shops use play-money sats and are deleted after 24 hours.

## Reporting

Please open a private security advisory on the GitHub repository.
