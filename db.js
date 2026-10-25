/* -------------------------------------------------------------
   Supabase. Every game action is one RPC; the server decides the result.
   ------------------------------------------------------------- */
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 20 } }
});

const MESSAGES = {
  NO_PLAYER:   'Your game profile could not be found',
  BAD_NAME:    'Names are 2 to 16 letters or numbers',
  BAD_ACCOUNT: 'That Sui address is not valid',
  BANNED:      'This account is banned',
  CHAT_LINK:   'Links are not allowed in chat',
  CHAT_BAD:    'Keep it friendly',
  CHAT_RESPECT:'Please keep it respectful',
  CHAT_SLOW:   'Slow down a little',
  CHAT_SAME:   'You just said that',
  CHAT_LONG:   'That is too long',
  CHAT_EMPTY:  'Say something first',
  NO_TRADE:    'That trade is over',
  BAD_MOVE:    'That move is not available',
  OWNED:       'You already own that',
  LOOTED:      'Already opened today',
  BAD_NODE:    'Nothing there',
  NEED_SKILL:  'Learn Deep Mining first',
  TOO_FAST:    'Easy there',
  NOT_READY:   'That has not grown back yet',
  OCCUPIED:    'Something is already there',
  NO_RES:      'Not enough materials',
  BLOCK_LIMIT: 'You have placed all your blocks',
  NOT_YOURS:   'That block is not yours',
  OUT_OF_BOUNDS: 'Too far out to build',
  NO_BUILD_HERE: 'You cannot build here',
  NO_ENERGY:   'Out of energy: you can walk and jump until it comes back',
  NOT_LAND:    'You can only build on land you own. Get one in Lands',
  NOT_YOUR_LAND: 'This land is not yours',
  LAND_RECHECK: 'Checking your lands on Sui. Try again',
  NOT_YOUR_ITEM: 'That item is not in your wallet any more',
  BAD_COIN:    'That is not a Sui coin address',
  BAD_PLAN:    'Pick how long to advertise',
  AD_DUP:      'That payment was already used',
  AD_NOT_FOUND: 'That payment did not go through on Sui',
  AD_NOT_YOURS: 'That payment was not sent from your wallet',
  AD_UNDERPAID: 'That payment was less than the price',
  NO_PRICE:    'The SUI price is not available right now. Try again soon',
  SLOW_DOWN:   'Slow down a little',
  BAD_WL:      'That is not a Sui wallet address',
  NEED_X:      'Link your X first',
  NOT_YOUR_YETI: 'That Yeti is not in your wallet any more',
  NO_ADDRESS:  'Your game wallet is not on your account yet. Sign out and sign back in',
  CHAIN_DOWN:  'Sui did not answer. Try again in a moment',
  TIP_DUP:     'That tip is already counted',
  TIP_NOT_FOUND: 'That tip did not go through on Sui',
  TIP_NOT_YOURS: 'That tip was not sent from your wallet',
  NO_RUN:      'That match was not found',
  RUN_DONE:    'That match is already counted',
  BAD_GAME:    'Unknown game',
  BAD_TWEET:   'That is not a link to a post on X',
  TWEET_DUP:   'You already added that post',
  TWEET_TAKEN: 'Someone already added that post',
  TWEET_LIMIT: 'That is all the links for today',
  NO_POINTS:   'No skill points left',
  LOW_LEVEL:   'Your level is too low',
  LOCKED:      'Learn the skill before it first',
  MAXED:       'Already maxed',
  HAS_STARTER: 'You already have a starter',
  NO_COINS:    'Not enough coins',
  BAD_ITEM:    'That item cannot be used here',
  NO_ITEM:     'You are out of that item',
  NO_EFFECT:   'It would have no effect',
  IN_BATTLE:   'Finish your battle first',
  PARTY_FULL:  'Your party is full',
  LAST_ONE:    'You need at least one Memal with you',
  TOO_SOON:    'Catch your breath',
  DAY_LIMIT:   'That is enough battles for today',
  ALL_FAINTED: 'Heal your Memals at Heal in the main town',
  MUST_SWITCH: 'Choose a Memal',
  NO_PP:       'No PP left for that move',
  BAD_BLOX:    'That Memal cannot do that',
  NO_BATTLE:   'That battle is over',
  BAD_IMAGE:   'That picture cannot be used',
  BIG_IMAGE:   'That picture is too big',
  SPUN:        'Come back tomorrow for another spin',
  NOT_DONE:    'Not finished yet',
  CLAIMED:     'Already claimed',
  NOT_NIGHT:   'Zombies only come out at night',
  NO_AMMO:     'Out of ammo',
  GONE:        'Already gone'
};

/** The message for an error code a call answered with (exact, so AD_NOT_YOURS is not read as NOT_YOURS). */
export const msgOf = code => MESSAGES[code] || cleanErr(code);
export function cleanErr(raw){
  const m = String(raw?.message || raw || '');
  for (const [k, v] of Object.entries(MESSAGES)) if (m.includes(k)) return v;
  if (/Could not find the function|does not exist|schema cache/i.test(m)) return 'SETUP';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No connection';
  return m.replace(/^.*?:\s*/, '').slice(0, 160) || 'Something went wrong';
}

export async function rpc(fn, args = {}){
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    const e = new Error(cleanErr(error.message));
    e.code = Object.keys(MESSAGES).find(k => String(error.message).includes(k)) || null;
    throw e;
  }
  return data;
}

let TOKEN = null;
export const setToken = t => { TOKEN = t; };

export const health    = () => rpc('bb_health');
export const join      = (name, wallet, skin) => rpc('bb_join', { p_token: TOKEN, p_name: name, p_wallet: wallet, p_skin: skin });
export const state     = () => rpc('bb_state', { p_token: TOKEN });
export const starter   = species => rpc('bb_starter', { p_token: TOKEN, p_species: species });
export const buy       = (item, qty) => rpc('bb_buy', { p_token: TOKEN, p_item: item, p_qty: qty });
export const heal      = () => rpc('bb_heal', { p_token: TOKEN });
export const useItem   = (item, blox) => rpc('bb_use', { p_token: TOKEN, p_item: item, p_blox: blox });
export const party     = (blox, action) => rpc('bb_party', { p_token: TOKEN, p_blox: blox, p_action: action });
export const rename    = (blox, name) => rpc('bb_rename', { p_token: TOKEN, p_blox: blox, p_name: name });
/* If the database is a migration behind, an older one-argument version may
   be all there is; fall back to it rather than refusing to battle. */
export async function encounter(biome){
  try { return await rpc('bb_encounter', { p_token: TOKEN, p_biome: biome || null }); }
  catch (e) {
    if (e.message !== 'SETUP') throw e;
    return rpc('bb_encounter', { p_token: TOKEN });
  }
}
export const cash      = node => rpc('bb_cash', { p_token: TOKEN, p_node: node });
export const loot      = box => rpc('bb_loot', { p_token: TOKEN, p_box: box });
export const buyWear   = item => rpc('bb_buy_wear', { p_token: TOKEN, p_item: item });
export const wear      = (slot, item) => rpc('bb_wear', { p_token: TOKEN, p_slot: slot, p_item: item });

let _wardrobe = null;
export async function wardrobe(){
  if (_wardrobe) return _wardrobe;
  const { data, error } = await sb.from('bb_wardrobe').select('*').order('sort');
  if (error) throw new Error(cleanErr(error.message));
  return (_wardrobe = data);
}
export const act       = (enc, kind, arg = null) => rpc('bb_act', { p_token: TOKEN, p_enc: enc, p_kind: kind, p_arg: arg });
export const board     = day => rpc('bb_board', { p_day: day || null, p_token: TOKEN });
export const tasks     = () => rpc('bb_tasks', { p_token: TOKEN });
export const energy    = used => rpc('bb_energy', { p_token: TOKEN, p_used: used });
// games from the Games menu: a ticket when a match starts, handed in at the end for XP
export const gameStart  = game => rpc('bb_game_start', { p_token: TOKEN, p_game: game });
export const gameFinish = (run, stats) => rpc('bb_game_finish', { p_token: TOKEN, p_run: run, p_stats: stats });
// your player card, and the links to your posts about BitBlox on X
export const myCard      = () => rpc('bb_my_card', { p_token: TOKEN });
export const wlSet       = address => rpc('bb_wl_set', { p_token: TOKEN, p_address: address });
export const cardSeen    = () => rpc('bb_card_seen', { p_token: TOKEN });
export const tweetAdd    = url => rpc('bb_tweet_add', { p_token: TOKEN, p_url: url });
export const tweetRemove = id => rpc('bb_tweet_remove', { p_token: TOKEN, p_id: id });
export const taskClaim = i => rpc('bb_task_claim', { p_token: TOKEN, p_i: i });
export const analytics = () => rpc('bb_analytics');
/** Ask the server to look in your wallet for Mystic Yetis (it checks on chain itself). */
export async function yetiCheck(url){
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}` }, body: JSON.stringify({ token: TOKEN }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Could not check');
  return j;
}
export const myPayouts = () => rpc('bb_my_payouts', { p_token: TOKEN });
// Mystic Yeti agents: yours (and paying out what they have earned), sending one out or home, and everyone's out now
export const agentsMine = () => rpc('bb_agents_mine', { p_token: TOKEN });
export const agentSet   = (yeti, on) => rpc('bb_agent_set', { p_token: TOKEN, p_yeti: yeti, p_on: !!on });
export const agentsLive = () => rpc('bb_agents_live');
/** The database reads your wallet (and kiosks) on Sui itself and records your Yetis. */
export const yetisRefresh = () => rpc('bb_yetis_refresh', { p_token: TOKEN });
// chat: replying, reacting, tipping, the Top list
export const chatReact = (id, emoji) => rpc('bb_chat_react', { p_token: TOKEN, p_id: id, p_emoji: emoji });
export const chatMine  = ids => rpc('bb_chat_mine', { p_token: TOKEN, p_ids: ids });
export const chatTipTo = id => rpc('bb_chat_tip_to', { p_id: id });
/** The words for an error code from the server. */
export const messageOf = code => MESSAGES[code] || code;
export async function chatTip(id, tx){
  const r = await rpc('bb_chat_tip', { p_token: TOKEN, p_id: id, p_tx: tx });
  // a failed check on chain comes back as { error } (so it still counts against the rate limit)
  if (r?.error) throw Object.assign(new Error(MESSAGES[r.error] || r.error), { code: r.error });
  return r;
}
export const chatTop   = (n = 60) => rpc('bb_chat_top', { p_limit: n });
export const myTips    = () => rpc('bb_my_tips', { p_token: TOKEN });

let _items = null;
export async function items(){
  if (_items) return _items;
  const { data, error } = await sb.from('bb_items').select('*').order('sort');
  if (error) throw new Error(cleanErr(error.message));
  return (_items = data);
}

/* ---------------- gathering, building, vehicles, skills ---------------- */
export const harvest     = (node, kind) => rpc('bb_harvest', { p_token: TOKEN, p_node: node, p_kind: kind });
export const place       = (x, y, z, kind, rot = 0) => rpc('bb_place', { p_token: TOKEN, p_x: x, p_y: y, p_z: z, p_kind: kind, p_rot: rot });
export const breakBlock  = (x, y, z) => rpc('bb_break', { p_token: TOKEN, p_x: x, p_y: y, p_z: z });
export const blocksAll   = () => rpc('bb_blocks_all');
export const buyVehicle  = id => rpc('bb_buy_vehicle', { p_token: TOKEN, p_id: id });
export const customize   = (v, paint, trim, mods) => rpc('bb_customize', { p_token: TOKEN, p_vehicle: v, p_paint: paint, p_trim: trim, p_mods: mods });
export const learn       = skill => rpc('bb_learn', { p_token: TOKEN, p_skill: skill });
export const event       = (kind, n) => rpc('bb_event', { p_token: TOKEN, p_kind: kind, p_n: Math.round(n) });
export const levelBoard  = () => rpc('bb_level_board');
export const boardDays   = () => rpc('bb_board_days');
export const roundPaid   = day => rpc('bb_round_paid_get', { p_day: day });

const tables = {};
async function table(name, order = 'sort'){
  if (tables[name]) return tables[name];
  const { data, error } = await sb.from(name).select('*').order(order);
  if (error) throw new Error(cleanErr(error.message));
  return (tables[name] = data);
}
export const vehicleDefs = () => table('bb_vehicle_defs');
export const skillDefs   = () => table('bb_skill_defs');
export const achDefs     = () => table('bb_ach_defs');
export const blockDefs   = () => table('bb_block_defs');

/* ---------------- accounts, chat, people ---------------- */
export const codeOk      = code => rpc('bb_code_ok', { p_code: code });
export const signOut     = () => rpc('bb_sign_out', { p_token: TOKEN }).catch(() => {});
export const chatSend    = (text, reply = null) => rpc('bb_chat_send', reply ? { p_token: TOKEN, p_text: text, p_reply: reply } : { p_token: TOKEN, p_text: text });
export const chatRecent  = (n = 60) => rpc('bb_chat_recent', { p_limit: n });
export const profile     = id => rpc('bb_profile', { p_player: id, p_token: TOKEN });
export const follow      = (id, on) => rpc('bb_follow', { p_token: TOKEN, p_player: id, p_on: on });
export const inbox       = () => rpc('bb_inbox', { p_token: TOKEN });
export const tradeOpen   = id => rpc('bb_trade_open', { p_token: TOKEN, p_with: id });
export const tradeGet    = id => rpc('bb_trade_get', { p_token: TOKEN, p_trade: id });
export const tradeOffer  = (id, offer) => rpc('bb_trade_offer', { p_token: TOKEN, p_trade: id, p_offer: offer });
export const tradeOk     = id => rpc('bb_trade_ok', { p_token: TOKEN, p_trade: id });
export const tradeCancel = id => rpc('bb_trade_cancel', { p_token: TOKEN, p_trade: id });
export const duelInvite  = id => rpc('bb_duel_invite', { p_token: TOKEN, p_with: id });
export const duelAnswer  = (id, yes) => rpc('bb_duel_answer', { p_token: TOKEN, p_duel: id, p_yes: yes });
export const duelAct     = (id, kind, arg = null) => rpc('bb_duel_act', { p_token: TOKEN, p_duel: id, p_kind: kind, p_arg: arg });
export const duelGet     = id => rpc('bb_duel_get', { p_token: TOKEN, p_duel: id });

/* ---------------- pictures, tips, the spin, the armory, zombies ---------------- */
export const clock       = () => rpc('bb_clock');
export const setPfp      = data => rpc('bb_set_pfp', { p_token: TOKEN, p_data: data });
export const pfps        = ids => rpc('bb_pfps', { p_ids: ids });
export const tipped      = to => rpc('bb_tipped', { p_token: TOKEN, p_to: to });
export const wheel       = () => rpc('bb_wheel');
export const spin        = () => rpc('bb_spin', { p_token: TOKEN });
export const gunDefs     = () => table('bb_gun_defs');
export const ammoDefs    = () => table('bb_ammo_defs');
export const buyGun      = id => rpc('bb_buy_gun', { p_token: TOKEN, p_gun: id });
export const buyAmmo     = (id, packs) => rpc('bb_buy_ammo', { p_token: TOKEN, p_ammo: id, p_packs: packs });
export const fire        = spent => rpc('bb_fire', { p_token: TOKEN, p_spent: spent });
export const zombieKill  = kind => rpc('bb_zombie_kill', { p_token: TOKEN, p_kind: kind });
export const ring        = id => rpc('bb_ring', { p_token: TOKEN, p_ring: id });
export const dropTake    = id => rpc('bb_drop_take', { p_token: TOKEN, p_drop: id });
// lands and items
export const landsState  = () => rpc('bb_lands_state');
export const landsSync   = () => rpc('bb_lands_sync');
export const landsMine   = () => rpc('bb_lands_mine', { p_token: TOKEN });
export const landInfo    = n => rpc('bb_land_info', { p_n: n });
export const landHere    = n => rpc('bb_land_here', { p_token: TOKEN, p_n: n });
export const landCheck   = n => rpc('bb_land_check', { p_token: TOKEN, p_n: n });
export const landsTop    = (n = 50) => rpc('bb_lands_top', { p_limit: n });
export const itemSpots   = () => rpc('bb_item_spots_all');
export const itemPlace   = (id, x, y, z, rot = 0) => rpc('bb_item_place', { p_token: TOKEN, p_item: id, p_x: x, p_y: y, p_z: z, p_rot: rot });
export const itemTake    = spot => rpc('bb_item_take', { p_token: TOKEN, p_spot: spot });
export const itemUse     = spot => rpc('bb_item_use', { p_token: TOKEN, p_spot: spot });
// coin ads
export const adsActive   = () => rpc('bb_ads_active');
export const adQuote     = () => rpc('bb_ad_quote');
export const adBuy       = (coin, symbol, name, logo, plan, tx) => rpc('bb_ad_buy', { p_token: TOKEN, p_coin: coin, p_symbol: symbol, p_name: name, p_logo: logo, p_plan: plan, p_tx: tx });
