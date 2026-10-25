/* -------------------------------------------------------------
   The player's Sui wallet.

   Self-custodial and tied to the player's Google or X login through Privy:
   the key lives in Privy's secure frame, never on this page, in the game's
   database, or with BitBlox. Signing is asked of Privy one transaction at a
   time. Reads and transactions go to Sui mainnet over gRPC-web (public
   fullnodes no longer serve JSON-RPC).
   ------------------------------------------------------------- */
import { Ed25519PublicKey } from '@mysten/sui/keypairs/ed25519';
import { Signer } from '@mysten/sui/cryptography';
import { fromBase58, fromBase64, fromHex, toBase64 } from '@mysten/sui/utils';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { SUI_GRPC, MIST, TREASURY, FEE_BPS } from './config.js';
import * as PRIVY from './privy.js';

// The session: the game token and the wallet's address (never a key).
const SESSION = 'bb.session';
// FROZEN: wallets and game keys from before sign-in existed. They are only
// read to bring an old player's progress (and wallet) into their new account.
const OLD_SUI = 'bb.sui';
const OLD_NEAR = 'bb.wallet';

let client = null;

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const read = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

function sui(){
  return client || (client = new SuiGrpcClient({ network: 'mainnet', baseUrl: SUI_GRPC }));
}

export const session = () => read(SESSION);
export const address = () => session()?.address || null;
export const gameToken = () => session()?.token || null;

export function setSession(s){
  localStorage.setItem(SESSION, JSON.stringify(s));
}
export function clearSession(){
  localStorage.removeItem(SESSION);
}

/** Privy's wallet as a Sui signer: Sui hashes each transaction, Privy signs the hash. */
class PrivySigner extends Signer {
  constructor(privy, address, publicKey){ super(); this.privy = privy; this.address = address; this.pub = publicKey; }
  async sign(digest){
    const { signature } = await this.privy.sign(this.address, '0x' + hex(digest));
    return fromHex(signature.replace(/^0x/, ''));
  }
  getKeyScheme(){ return 'ED25519'; }
  getPublicKey(){ return this.pub; }
  toSuiAddress(){ return this.address; }
}

// Privy hands back the public key as text; which encoding is not promised,
// so each is tried and the one that matches the address wins.
function publicKeyFor(text, address){
  const tries = [];
  const t = String(text || '').trim();
  if (/^(0x)?[0-9a-fA-F]{64,66}$/.test(t)) tries.push(() => fromHex(t.replace(/^0x/, '')));
  tries.push(() => fromBase58(t), () => fromBase64(t));
  for (const f of tries) {
    try {
      let b = f();
      if (b.length === 33) b = b.slice(1);           // flagged form
      if (b.length !== 32) continue;
      const pk = new Ed25519PublicKey(b);
      if (pk.toSuiAddress() === address.toLowerCase()) return pk;
    } catch {}
  }
  throw new Error('Could not read your wallet');
}

export async function privySigner(privy, w){
  return new PrivySigner(privy, w.address.toLowerCase(), publicKeyFor(w.publicKey, w.address));
}

/** The signed-in player's signer. Privy must still be signed in on this device. */
async function signer(){
  const s = session();
  if (!s) throw new Error('Sign in first');
  const p = await PRIVY.load();
  if (!p.authenticated) throw Object.assign(new Error('Sign in again to use your wallet'), { code: 'RELOGIN' });
  const w = await p.suiWallet();
  if (w.address.toLowerCase() !== s.address.toLowerCase()) throw new Error('This is not the wallet on your account');
  return privySigner(p, w);
}

/** Opens Privy's window where the player can copy their own private key.
    The key is shown inside Privy's frame; this page never sees it. */
export async function exportKey(){
  const s = session();
  if (!s) return;
  const p = await PRIVY.load();
  if (!p.authenticated) throw Object.assign(new Error('Sign in again to use your wallet'), { code: 'RELOGIN' });
  await p.exportKey(s.address);
}

/** An old pre-accounts player on this device: the token their progress is
    filed under, and their old wallet key, to carry both over. */
export async function legacy(){
  const oldSui = read(OLD_SUI), oldNear = read(OLD_NEAR);
  const seed = oldNear?.key || oldSui?.key;
  if (!seed) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('bitblox:' + seed));
  return { token: hex(new Uint8Array(buf)) };
}
export function retireLegacy(){
  for (const k of [OLD_SUI, OLD_NEAR]) {
    const v = localStorage.getItem(k);
    if (v) { localStorage.setItem(k + '.retired', v); localStorage.removeItem(k); }
  }
}

/** A wallet this device made before sign-in existed: downloaded as a
    file so anything in it can be moved. Never shown on screen. */
export function oldWallet(){
  try { return JSON.parse(localStorage.getItem(OLD_SUI + '.retired') || 'null'); } catch { return null; }
}
export function backupOld(){
  const w = oldWallet();
  if (!w?.key) return;
  const blob = new Blob([JSON.stringify({ app: 'BitBlox', network: 'sui:mainnet', address: w.address, secret_key: w.key }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bitblox-old-wallet-${String(w.address || '').slice(2, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export const isAddress = a => typeof a === 'string' && /^0x[0-9a-fA-F]{64}$/.test(a);

/** Balance in MIST (1 SUI = 1e9 MIST). */
export async function balance(owner = address(), coinType){
  const r = await sui().getBalance(coinType ? { owner, coinType } : { owner });
  return BigInt(r.balance.balance);
}

let _price = 0, _priceAt = 0;
/** SUI in US dollars. */
export async function price(){
  if (_price && Date.now() - _priceAt < 60000) return _price;
  try {
    const j = await (await fetch('https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd')).json();
    if (j?.sui?.usd > 0) { _price = j.sui.usd; _priceAt = Date.now(); }
  } catch {}
  return _price;
}

/** The fee on a payment (0.5%, rounded down), paid to the BitBlox treasury. */
export const feeOf = raw => BigInt(raw) * FEE_BPS / 10000n;

/**
 * Sends SUI: `mist` reaches `to`, and the fee goes to the treasury on top.
 * Gas is paid from the same balance (coins or the address's own balance).
 */
export async function send(to, mist){
  if (!isAddress(to)) throw new Error('That Sui address is not valid');
  const amt = BigInt(mist), fee = feeOf(amt);
  if (amt <= 0n) throw new Error('Enter an amount');
  const tx = new Transaction();
  tx.setSender(address());
  const [coin, f] = tx.splitCoins(tx.gas, [amt, fee]);
  tx.transferObjects([coin], to);
  tx.transferObjects([f], TREASURY);
  return run(tx, ch => expectOnly(ch, { [SUI_T]: -(amt + fee) }, true));
}

/** Every coin the address holds: [{ type, raw (BigInt) }], biggest first by count of digits. */
export async function balances(owner = address()){
  const out = [];
  let cursor = null;
  for (let i = 0; i < 5; i++) {
    const r = await sui().listBalances({ owner, cursor, limit: 50 });
    for (const b of r.balances || []) if (BigInt(b.balance) > 0n) out.push({ type: normType(b.coinType), raw: BigInt(b.balance) });
    if (!r.hasNextPage) break;
    cursor = r.cursor;
  }
  return out;
}
/** 0x000...02::sui::SUI and 0x2::sui::SUI are the same coin: one spelling for both. */
export function normType(t){
  const m = /^0x0*([0-9a-fA-F]+)(::.*)$/.exec(String(t || ''));
  if (!m) return t;
  const a = m[1].toLowerCase();
  return (a.length <= 2 ? '0x' + a : '0x' + a.padStart(64, '0')) + m[2];
}
const metaCache = new Map();
/** A coin's name, symbol, decimals and picture, from the chain. */
export async function coinMeta(type){
  if (metaCache.has(type)) return metaCache.get(type);
  const p = sui().getCoinMetadata({ coinType: type }).then(r => {
    const m = r?.coinMetadata || r;
    return m ? { symbol: m.symbol, name: m.name, decimals: Number(m.decimals), logo: m.iconUrl || m.icon_url || '' } : null;
  }).catch(() => null);
  metaCache.set(type, p);
  return p;
}
const SUI_T = '0x2::sui::SUI';
const addrEq = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

/**
 * Check a simulated transaction's balance changes for the player: nothing
 * leaves except what `limits` allows (type -> most it may go down by, as a
 * negative number), SUI may also pay gas when `gas` is set, and `must` lists
 * what has to arrive (type -> least). Throws if anything else would happen.
 */
function expectOnly(changes, limits, gas, must = {}, cap = GAS_CAP){
  const mine = {};
  for (const c of changes || []) if (addrEq(c.address, address())) mine[normType(c.coinType)] = (mine[normType(c.coinType)] || 0n) + BigInt(c.amount);
  for (const [t, d] of Object.entries(mine)) {
    if (d >= 0n) continue;
    const allowed = BigInt(limits[t] ?? 0n) - (gas && t === SUI_T ? cap : 0n);
    if (d < allowed) throw new Error('This would take more from your wallet than it should. Nothing was sent');
  }
  for (const [t, least] of Object.entries(must)) if ((mine[t] || 0n) < BigInt(least) - (gas && t === SUI_T ? GAS_CAP : 0n)) throw new Error('This would give back less than it should. Nothing was sent');
}
const GAS_CAP = 100_000_000n;   // 0.1 SUI: the most gas any of these may use

/**
 * Nothing the player owns other than coins (NFTs such as Yetis, kiosk caps,
 * anything) may leave their wallet or be destroyed: coins are covered by the
 * balance check, everything else must still be theirs afterwards.
 */
function keepsObjects(t){
  const types = t.objectTypes || {};
  for (const o of t.effects?.changedObjects || []) {
    const was = o.inputOwner?.AddressOwner;
    if (!was || !addrEq(was, address())) continue;
    const type = String(types[o.objectId] || '');
    if (/^0x0*2::coin::Coin</.test(type)) continue;
    if (!addrEq(o.outputOwner?.AddressOwner, address())) throw new Error('This would move something you own out of your wallet. Nothing was sent');
  }
}

/**
 * Build the transaction once, simulate it, let `check` look at what would
 * move, then sign exactly those bytes. Gas is set to twice the estimate
 * (only what is used is paid).
 */
async function run(transaction, check, cap = GAS_CAP){
  const kp = await signer();
  let bytes;
  try {
    transaction.setSenderIfNotSet(kp.toSuiAddress());
    await transaction.build({ client: sui() });
    const est = BigInt(transaction.getData().gasData.budget || 0);
    transaction.setGasBudget(est > 0n ? (est * 2n < cap ? est * 2n : cap) : 30_000_000n);
    bytes = await transaction.build({ client: sui() });
  } catch (e) {
    const m = String(e?.message || e);
    if (/insufficient|balance|gas selection|InsufficientGas/i.test(m)) throw new Error('Not enough to cover this and gas');
    throw new Error(m.slice(0, 160));
  }
  const sim = await sui().simulateTransaction({ transaction: bytes, include: { balanceChanges: true, effects: true, objectTypes: true } });
  const t = sim.Transaction || sim.FailedTransaction;
  if (!sim.Transaction || !t?.status?.success) {
    const why = String(t?.status?.error?.message || 'it would fail');
    throw new Error(/Insufficient/i.test(why) ? 'Not enough to cover this and gas' : `This would fail on Sui (${why.slice(0, 80)})`);
  }
  check?.(t.balanceChanges);
  keepsObjects(t);
  let r;
  try {
    r = await sui().signAndExecuteTransaction({ signer: kp, transaction: bytes });
  } catch (e) {
    throw new Error(String(e?.message || e).slice(0, 160));
  }
  if (r.$kind === 'FailedTransaction') throw new Error('The transaction failed');
  return r.Transaction.digest;
}
/** Sends any coin (raw units): `raw` reaches `to`, the fee goes to the treasury on top. */
export async function sendCoin(to, type, raw){
  if (normType(type) === SUI_T) return send(to, raw);
  if (!isAddress(to)) throw new Error('That Sui address is not valid');
  const amt = BigInt(raw), fee = feeOf(amt);
  const tx = new Transaction();
  tx.setSender(address());
  const all = coinWithBalance({ type, balance: amt + fee });
  const [f] = tx.splitCoins(all, [fee]);
  tx.transferObjects([all], to);
  tx.transferObjects([f], TREASURY);
  return run(tx, ch => expectOnly(ch, { [normType(type)]: -(amt + fee) }, true));
}

/**
 * A swap: `amount` of `fromType` goes in (0.5% of it to the treasury, the
 * rest to the route), `addTrade(kindBase64, coinInArg)` asks the router to
 * add its steps and hands back { txKind, coinOutId }, and whatever comes out
 * is sent back to the player. It is only signed if the simulation shows the
 * player losing no more than `amount` (plus gas) and getting at least `minOut`.
 */
export async function swapWith({ fromType, toType, amount, minOut, addTrade }){
  const from = normType(fromType), to = normType(toType), amt = BigInt(amount), fee = feeOf(amt), net = amt - fee;
  const tx = new Transaction();
  tx.setSender(address());
  let coinIn;
  if (from === SUI_T) { const [f, i] = tx.splitCoins(tx.gas, [fee, net]); tx.transferObjects([f], TREASURY); coinIn = i; }
  else { const all = coinWithBalance({ type: from, balance: amt }); const [f] = tx.splitCoins(all, [fee]); tx.transferObjects([f], TREASURY); coinIn = all; }
  const kind = toBase64(await tx.build({ client: sui(), onlyTransactionKind: true }));
  const r = await addTrade(kind, coinIn, net);
  if (!r?.txKind) throw new Error('The swap could not be prepared');
  const full = Transaction.fromKind(r.txKind);
  full.setSender(address());
  if (r.coinOutId) full.transferObjects([r.coinOutId], address());
  return run(full, ch => expectOnly(ch, { [from]: -amt }, true, { [to]: BigInt(minOut) }));
}

/** Pay the treasury `mist` SUI (advertising): no fee on top, nothing else moves. */
export async function payTreasury(mist){
  const amt = BigInt(mist);
  if (amt <= 0n) throw new Error('Nothing to pay');
  const tx = new Transaction();
  tx.setSender(address());
  const [coin] = tx.splitCoins(tx.gas, [amt]);
  tx.transferObjects([coin], TREASURY);
  return run(tx, ch => expectOnly(ch, { [SUI_T]: -amt }, true));
}

/* ---------------- BitLands and BitItems ---------------- */
/** Buy parcel `n` (`land` is the contract's ids and price, from bb_lands_state). */
export async function mintLand(n, land){
  const price = BigInt(land.land_price);
  const tx = new Transaction();
  tx.setSender(address());
  const [pay] = tx.splitCoins(tx.gas, [price]);
  const l = tx.moveCall({ target: `${land.pkg}::land::mint`, arguments: [tx.object(land.land_shop), tx.pure.u64(n), pay] });
  tx.transferObjects([l], address());
  return run(tx, ch => expectOnly(ch, { [SUI_T]: -price }, true));
}
/** Buy one random item (tier 0) or a chest (1-3); they arrive in the wallet. */
export async function buyItems(tier, land){
  const price = BigInt(land.item_prices[tier]);
  const tx = new Transaction();
  tx.setSender(address());
  const [pay] = tx.splitCoins(tx.gas, [price]);
  tx.moveCall({ target: `${land.pkg}::item::buy`, arguments: [tx.object(land.item_shop), tx.pure.u8(tier), pay, tx.object('0x8')] });
  return run(tx, ch => expectOnly(ch, { [SUI_T]: -price }, true));
}
/** Admin, once: publish the BitBlox package (site/assets/bitblox-package.json). Gas up to 1 SUI. */
export async function publishPackage(pkg){
  const tx = new Transaction();
  tx.setSender(address());
  const [up] = tx.publish({ modules: pkg.modules, dependencies: pkg.dependencies });
  tx.transferObjects([up], address());
  const cap = 1_000_000_000n;
  return run(tx, ch => expectOnly(ch, {}, true, {}, cap), cap);
}
/** Admin, once: how lands and items look, the treasury, and open both shops. */
export async function setupPackage(ids, imageBase, site){
  const tx = new Transaction();
  tx.setSender(address());
  tx.moveCall({ target: `${ids.pkg}::setup::displays`, arguments: [tx.object(ids.publisher), tx.pure.string(imageBase), tx.pure.string(site)] });
  for (const [mod, shop] of [['land', ids.land_shop], ['item', ids.item_shop]]) {
    tx.moveCall({ target: `${ids.pkg}::${mod}::set_treasury`, arguments: [tx.object(ids.admin), tx.object(shop), tx.pure.address(TREASURY)] });
    tx.moveCall({ target: `${ids.pkg}::${mod}::set_open`, arguments: [tx.object(ids.admin), tx.object(shop), tx.pure.bool(true)] });
  }
  return run(tx, ch => expectOnly(ch, {}, true));
}

export const fmt = mist => {
  const n = Number(mist) / Number(MIST);
  if (n === 0) return '0';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 4 : 2 });
};
