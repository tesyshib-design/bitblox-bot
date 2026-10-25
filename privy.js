/* -------------------------------------------------------------
   Privy: Google or X sign-in, and the player's self-custodial Sui wallet.

   Privy's kit is large, so it is only loaded when it is needed: on the
   sign-in screen, when coming back from Google or X, and when the player
   sends from their wallet. The wallet's key never reaches this page;
   Privy signs inside its own secure frame.
   ------------------------------------------------------------- */
import { PRIVY_APP_ID } from './config.js';

let loading = null;
export const load = () => loading || (loading = import('./vendor/privy-bridge.js').then(m => m.start(PRIVY_APP_ID)));

/** True on the page load that comes back from Google or X. */
export const hasCallback = () => /[?&]privy_oauth_(code|state)=/.test(location.search);

/** Takes Privy's return values out of the address bar once they are used. */
export function cleanUrl(){
  const u = new URL(location.href);
  for (const k of [...u.searchParams.keys()]) if (k.startsWith('privy_')) u.searchParams.delete(k);
  history.replaceState(null, '', u.pathname + (u.search === '?' ? '' : u.search) + u.hash);
}
