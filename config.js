/* -------------------------------------------------------------
   Every switch the app reads. Nothing here is a secret: the Supabase
   publishable key is meant to be in a browser, and the prize wallet's key
   is not in this site at all (it lives in the payout function's secrets).
   ------------------------------------------------------------- */

export const SUPABASE_URL = 'https://bexejpwfeyifyspzccvr.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_xceMyCefRZ6PplCL6ZYB4g_F4stZNMX';

// Sign-in: Privy does Google and X; the bitblox-auth function does the rest.
export const PRIVY_APP_ID = 'cmuui43ri01j90bkz41hc0v8y';
export const AUTH_URL = `${SUPABASE_URL}/functions/v1/bitblox-auth`;
// Counts the Mystic Yetis in a player's wallet on chain (the bitblox-yeti function).
export const YETI_URL = `${SUPABASE_URL}/functions/v1/bitblox-yeti`;
// The Mystic Yeti (Lofi) NFT: holders get an extra daily spin and +10% on the leaderboard.
export const YETI_TYPE = '0xb07b09b016d28f989b6adda8069096da0c0a0ff6490f6e0866858c023b061bee::mystic_yeti::MysticYeti';
export const SUI_GRAPHQL = 'https://graphql.mainnet.sui.io/graphql';
// BitLands / BitItems: their pictures (bitblox-nft) and the Walrus backups of land blocks (bitblox-walrus)
export const NFT_URL = `${SUPABASE_URL}/functions/v1/bitblox-nft`;
export const WALRUS_URL = `${SUPABASE_URL}/functions/v1/bitblox-walrus`;
// where lands and items are listed for sale
export const TRADEPORT = 'https://www.tradeport.xyz/sui/collection/';

// Everyone in the same world shares this Realtime channel.
export const WORLD_CHANNEL = 'bitblox-world';

/* ---------------- Sui mainnet ---------------- */
export const SUI_GRPC = 'https://fullnode.mainnet.sui.io:443';
export const MIST = 1_000_000_000n;            // 1 SUI
export const EXPLORER = 'https://suiscan.xyz/mainnet';
export const txUrl = d => `${EXPLORER}/tx/${d}`;
export const accountUrl = a => `${EXPLORER}/account/${a}`;

// The address the daily prizes are paid from. Shown on the leaderboard so
// anyone can check it is funded. Set it once you have made it.
export const PRIZE_ADDRESS = '0x2b91b3dbb3a6eccf91260bc4eceba508d554afbda67bc6bfe169ae30d78d1dc8';
// every send, tip and swap from the in-game wallet pays a small fee (0.5%) to the BitBlox treasury
export const TREASURY = '0x8c7278f24e63bb35d6bc82cf6155ad1a0e8d42b6fe31b7fd44e0a18d5e4cca29';
export const FEE_BPS = 50n;   // 50 basis points = 0.5%

// The $BITBLOX token on Sui: its full coin type, e.g. 0xabc...::bitblox::BITBLOX.
// Empty until the token is live; the wallet shows the row either way.
export const BITBLOX_COIN = '';
export const BITBLOX_DECIMALS = 9;

// Keep this much SUI back when sending everything, so the send can pay its own gas.
export const GAS_RESERVE = 10_000_000n;        // 0.01 SUI

// Voice relay for players whose network blocks direct connections (mostly
// phones on mobile data). From a free TURN account, e.g. expressturn.com:
//   { urls: ['turn:relay1.expressturn.com:3478'], username: '...', credential: '...' }
export const TURN = null;
