# Ardoise: 3-minute demo

**One line:** the corner shop's credit book, settled by family abroad over Bitcoin Lightning.

## 0:00 The problem (30 s)

> "In every street in Dakar there is a boutique, and in every boutique there is a notebook.
> Rice, oil, bread, taken on credit, written in pen. The shopkeeper waits weeks to be paid.
> Meanwhile, money sent home from Paris or New York costs 8.5 % in fees on average, the most
> expensive corridor in the world, and it goes to a person, not to the debt.
> Remittances are 11 % of Senegal's GDP. We connect them to the notebook."

Show the landing page; let the notebook page settle itself.

## 0:30 The shop (50 s)

1. **Essayer la démo**: a private copy of Boutique Diallo, Médina, with real-looking tabs.
2. Open **Awa Ndiaye**: 12 250 F owed, lines in a ruled notebook, cash payment already applied to the
   oldest lines.
3. **Achat à crédit** → tap **Pain** twice → _Noter 300 F_. Two taps. Works offline.
4. **Envoyer l'ardoise** → the WhatsApp message with the balance and a link. Also QR, copy, share.

## 1:20 Paris (50 s)

1. Open the link as Moussa, Awa's son: the shop, what was bought, 12 550 F ≈ €19.13.
2. Tap **Tout**, type "Moussa", **Payer en Lightning**.
3. The invoice comes from the **shop's own wallet** over Nostr Wallet Connect (a real NWC wallet on
   public relays in the demo). QR, open-in-wallet, one-tap **WebLN** for browser wallets.
4. Pay (test wallet button in the demo). _Payé. Merci !_

## 2:10 Back at the shop, and the proof (35 s)

1. The shop app shows **"Moussa a payé 12 550 F"** and the lines cross themselves out.
2. Open the receipt → **Vérifier la preuve**: the browser computes SHA-256(preimage) and it matches
   the payment hash read from the original invoice, decoded in the browser. "Nobody has to take
   our word that it was paid."

## 2:45 Why it is safe and real (15 s)

> "Ardoise never touches the money: it refuses any wallet connection that can spend. Names and
> phones are encrypted, every invoice is checked before a payer sees it, a tab is credited only with
> cryptographic proof. It runs with one Docker command, it's open source, and the old paper notebook
> comes in with a photo."

(Optional, if time: **Importer** → _Essayer avec une page d'exemple_ → Gemini reads the page.)

## Backup answers

- **Does the shop need to understand bitcoin?** No, it works in francs. Sats are what travels.
- **What if the price moves?** The amount is fixed in sats for 15 minutes; the shop chooses when to
  convert.
- **Custody?** None. Funds go wallet to wallet. Ardoise holds a receive-only permission.
- **What if the network drops?** The shop keeps writing; lines sync later, without duplicates.
