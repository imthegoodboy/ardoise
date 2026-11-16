/**
 * The NWC faucet (faucet.nwc.dev) hands out throwaway Lightning wallets that
 * speak Nostr Wallet Connect over real public relays. In `ARDOISE_DEMO=faucet`
 * mode every demo shop gets one, so the hosted demo runs the production NWC
 * driver end to end. The sats are not real: faucet invoices can only be paid
 * by the faucet itself, which is what `payWithFaucet` asks it to do.
 */
import { describeError, log } from '../log.ts';

const FAUCET = 'https://faucet.nwc.dev';

export async function createFaucetWallet(balanceSats = 10_000): Promise<string> {
	const response = await fetch(`${FAUCET}?balance=${balanceSats}`, {
		method: 'POST',
		signal: AbortSignal.timeout(15_000)
	});
	const body = (await response.text()).trim();
	if (!response.ok || !body.startsWith('nostr+walletconnect://')) {
		throw new Error('The NWC faucet did not return a wallet (HTTP ' + response.status + ').');
	}
	return body;
}

/** Ask the faucet to pay one of its own invoices, standing in for a relative's wallet. */
export async function payWithFaucet(bolt11: string): Promise<boolean> {
	try {
		const response = await fetch(`${FAUCET}/pay-invoice?invoice=${encodeURIComponent(bolt11)}`, {
			method: 'POST',
			signal: AbortSignal.timeout(20_000)
		});
		if (!response.ok) {
			log.warn('faucet.pay_failed', { status: response.status });
			return false;
		}
		return true;
	} catch (err) {
		log.warn('faucet.pay_failed', { reason: describeError(err) });
		return false;
	}
}
