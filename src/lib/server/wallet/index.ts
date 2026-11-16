import type { Shop } from '../shops.ts';
import { walletSecret } from '../shops.ts';
import { demoWallet } from './demo.ts';
import { nwcWallet } from './nwc.ts';
import type { Wallet } from './types.ts';

export { WalletError, type Wallet, type PaymentState, type WalletErrorCode } from './types.ts';

/** The wallet that receives this shop's payments, or null if none is connected. */
export async function walletForShop(shop: Pick<Shop, 'id' | 'walletKind'>): Promise<Wallet | null> {
	if (shop.walletKind === 'demo') return demoWallet();
	if (shop.walletKind !== 'nwc') return null;
	const secret = await walletSecret(shop.id);
	return secret ? nwcWallet(secret) : null;
}
