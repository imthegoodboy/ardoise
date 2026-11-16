import { sha256Hex } from '../crypto.ts';
import type { Shop } from '../shops.ts';
import { walletSecret } from '../shops.ts';
import { demoWallet } from './demo.ts';
import { nwcWallet } from './nwc.ts';
import type { Wallet } from './types.ts';

export { WalletError, type Wallet, type PaymentState, type WalletErrorCode } from './types.ts';

export interface WalletConnection {
	wallet: Wallet;
	/** Stable fingerprint of this exact connection, stored on every invoice it issues. */
	ref: string;
	/** The NWC connection string, kept (sealed) on its invoices until they settle. */
	secret: string | null;
}

export const walletRef = (secret: string) => 'nwc:' + sha256Hex(secret).slice(0, 32);

/** The wallet that receives this shop's payments right now, or null if none is connected. */
export async function connectionForShop(
	shop: Pick<Shop, 'id' | 'walletKind'>
): Promise<WalletConnection | null> {
	if (shop.walletKind === 'demo') return { wallet: demoWallet(), ref: 'demo', secret: null };
	if (shop.walletKind !== 'nwc') return null;
	const secret = await walletSecret(shop.id);
	return secret ? { wallet: nwcWallet(secret), ref: walletRef(secret), secret } : null;
}

export async function walletForShop(shop: Pick<Shop, 'id' | 'walletKind'>): Promise<Wallet | null> {
	return (await connectionForShop(shop))?.wallet ?? null;
}
