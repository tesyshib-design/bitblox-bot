/* -------------------------------------------------------------
   Accounts: Google or X through Privy. Privy also keeps the player's
   self-custodial Sui wallet, tied to that login. The bitblox-auth function
   checks both (the login, and a message signed by the wallet) and turns
   them into a BitBlox session.
   ------------------------------------------------------------- */
import * as PRIVY from './privy.js';
import * as SUI from './sui.js';
import { AUTH_URL, SUPABASE_KEY } from './config.js';

const CODE = 'bb.code';

export const hasCallback = () => PRIVY.hasCallback();
export const rememberCode = c => sessionStorage.setItem(CODE, c);
export const pendingCode = () => sessionStorage.getItem(CODE) || '';

const WHY = {
  NEED_CODE: 'Enter a beta code to make an account',
  BAD_CODE: 'That code is used or does not exist',
  BAD_LOGIN: 'That sign-in could not be checked. Try again',
  BAD_WALLET: 'Your wallet could not be checked. Try again',
  OTHER_WALLET: 'This account belongs to a different wallet',
  BANNED: 'This account is banned',
  SETUP: 'Sign-in is not set up on the server yet',
  TRY_AGAIN: 'Try again'
};

// must match supabase/functions/bitblox-auth
const proofText = (address, privyId, at) => `BitBlox sign-in\nWallet: ${address}\nAccount: ${privyId}\nTime: ${at}`;

// why Privy did not finish a sign-in, in words a player can act on
const PRIVY_WHY = {
  oauth_user_denied: 'Sign-in was cancelled',
  oauth_account_suspended: 'That Google or X account is suspended',
  oauth_unexpected: "Sign-in got lost on the way back. Open BitBlox in Safari or Chrome and try again",
  too_many_requests: 'Too many sign-ins right now. Wait a minute and try again',
  max_accounts_reached: 'New sign-ups are full right now. Try again soon',
  allowlist_rejected: 'This account is not allowed to sign in yet',
  disallowed_login_method: 'That sign-in method is turned off',
  captcha_failure: 'The bot check failed. Try again',
  captcha_timeout: 'The bot check timed out. Try again',
  timeout: "Sign-in took too long. Open BitBlox in Safari or Chrome and try again",
  unknown: "Sign-in did not finish. Open BitBlox in Safari or Chrome and try again"
};

/** Send the browser off to Google or X. */
export async function start(provider){
  const p = await PRIVY.load();
  // already signed in with Privy (say, a code was needed first): go straight on
  if (p.authenticated) { await finish(); location.reload(); return; }
  await p.login(provider);
}

/** Hand the server who you are and proof of your wallet; get a session back. */
async function exchange(body){
  const legacy = await SUI.legacy();
  let r;
  try {
    r = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY },
      // no beta codes any more; "open" keeps a sign-in function deployed
      // before that change happy
      body: JSON.stringify({ ...body, code: pendingCode() || 'open', legacy: legacy && { token: legacy.token } })
    });
  } catch {
    throw Object.assign(new Error('No connection'), { code: 'NET' });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) {
    const code = j.error || (r.status === 404 ? 'SETUP' : 'FAILED');
    throw Object.assign(new Error(WHY[code] || 'Sign-in failed'), { code });
  }
  SUI.setSession({ token: j.token, address: j.address, at: Date.now() });
  sessionStorage.removeItem(CODE);
  if (legacy) SUI.retireLegacy();
  return j;
}

/** Called on the page load that comes back from Google or X (or with a live Privy login). */
export async function finish(){
  const p = await PRIVY.load();
  const ok = await p.settle();
  PRIVY.cleanUrl();
  if (!ok || !p.user) {
    const code = p.loginError || 'unknown';
    throw Object.assign(new Error(PRIVY_WHY[code] || `Sign-in did not finish (${code}). Try again in your phone's own browser`), { code: 'CANCELLED', privy: code });
  }
  const w = await p.suiWallet();
  const signer = await SUI.privySigner(p, w);
  const at = Date.now();
  const proof = await signer.signPersonalMessage(new TextEncoder().encode(proofText(w.address.toLowerCase(), p.user.id, at)));
  const name = p.user.twitter?.username || p.user.google?.name?.split(' ')[0] || '';
  // coming back from linking X: give Privy a moment to add it to the login
  if (sessionStorage.getItem(LINKING)) {
    sessionStorage.removeItem(LINKING);
    for (let i = 0; i < 40 && !p.twitter; i++) await new Promise(r => setTimeout(r, 200));
  }
  const privy_id_token = await p.idToken();
  return exchange({ privy_token: await p.token(), privy_id_token, address: w.address.toLowerCase(), at, signature: proof.signature, name });
}

/**
 * Players whose login already has X (signed up with X, or linked it before
 * player cards existed): send it to the server the trusted way (the same
 * sign-in exchange, with Privy's signed identity token), no trip to X.
 * Returns 'ok', 'none' (no X on this login: link it), 'signin' (Privy is
 * not signed in on this device: sign in again first), or 'noproof' (Privy
 * gave no identity token: "Return user data in an identity token" is off).
 */
export async function syncX(){
  const p = await PRIVY.load();
  if (!p.authenticated || !p.user) return 'signin';
  await p.refresh?.();
  if (!p.twitter) return 'none';
  const w = await p.suiWallet();
  const signer = await SUI.privySigner(p, w);
  const at = Date.now();
  const proof = await signer.signPersonalMessage(new TextEncoder().encode(proofText(w.address.toLowerCase(), p.user.id, at)));
  const name = p.user.twitter?.username || p.user.google?.name?.split(' ')[0] || '';
  const privy_id_token = await p.idToken();
  // (without Privy's identity token the server cannot be shown the X account)
  if (!privy_id_token) return 'noproof';
  await exchange({ privy_token: await p.token(), privy_id_token, address: w.address.toLowerCase(), at, signature: proof.signature, name });
  return 'ok';
}

/** Link an X account to this login (Google players): off to X, back signed in with it linked. */
const LINKING = 'bb.linkx';
export async function linkX(){
  const p = await PRIVY.load();
  // (X already on this login: nothing to link, just save it)
  if (p.authenticated && p.twitter) return syncX();
  sessionStorage.setItem(LINKING, '1');
  await p.linkX();
}

/** The local test server only: an account without Google or X. */
export async function testLogin(name, x = null){
  const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
  const kp = new Ed25519Keypair();
  return exchange({ privy_token: 'test:' + name, address: kp.toSuiAddress(), name, ...(x ? { test_x: x } : {}) });
}

export async function signOut(){
  SUI.clearSession();
  try { await (await PRIVY.load()).logout(); } catch {}
}
