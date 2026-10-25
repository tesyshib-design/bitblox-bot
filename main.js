/* -------------------------------------------------------------
   Start-up: wallet, profile, starter, world.
   ------------------------------------------------------------- */
import * as SUI from './sui.js';
import * as ACCOUNT from './account.js';
import { showGate } from './panels/gate.js';
import { bgVideo } from './ui.js';
import * as DB from './db.js';
import * as SFX from './game/sound.js';
import { setState } from './store.js';
import { askProfile, askStarter } from './panels/onboard.js';
import { esc, toast, $ } from './ui.js';

const bar = k => { const el = $('#splashBar'); if (el) el.style.width = Math.round(k * 100) + '%'; };

function fail(title, detail){
  const s = $('#splash');
  s.classList.add('stopped');
  s.innerHTML = `
    ${bgVideo()}
    <img class="splash-mark" src="assets/logo.png" alt="">
    <div class="splash-name">BitBlox</div>
    <div class="splash-err">${esc(title)}</div>
    ${detail ? `<div class="splash-detail">${esc(detail)}</div>` : ''}
    <button class="btn" onclick="location.reload()">Try again</button>`;
}

async function boot(){
  SFX.arm();
  bar(0.1);
  try { await document.fonts?.load?.('64px "Lilita One"'); } catch {}

  // coming back from Google or X: turn that into a session
  if (ACCOUNT.hasCallback()) {
    try { await ACCOUNT.finish(); }
    catch (e) {
      return showGate({ error: e.message });
    }
  }
  if (!SUI.session()) return showGate();
  DB.setToken(SUI.gameToken());
  bar(0.25);

  let state = null;
  try {
    state = await DB.state();
  } catch (e) {
    if (e.message === 'SETUP') return fail('Server not set up', 'Run the supabase migrations');
    if (e.code === 'NO_PLAYER' || e.code === 'BANNED') {
      await ACCOUNT.signOut();
      return showGate({ error: e.code === 'BANNED' ? 'This account is banned' : 'Sign in again' });
    }
    return fail(e.message);
  }

  $('#splash').classList.add('behind');
  // a brand new account picks a name and a look, then a starter
  if (!state.party.length && !state.box.length) {
    const p = await askProfile(state.player.name === 'Player' ? '' : state.player.name);
    try { state = await DB.join(p.name, null, p.skin); }
    catch (e) { toast(e.message, 'err'); return fail(e.message); }
  }
  if (!state.party.length && !state.box.length) {
    const sp = await askStarter();
    try { state = await DB.starter(sp); }
    catch (e) { return fail(e.message); }
  }
  $('#splash').classList.remove('behind');
  setState(state);
  bar(0.4);

  // the Mystic Yetis' traits, for players (and agents) who are a Yeti
  try { await (await import('./game/yeti3d.js')).loadYetis(); } catch {}
  try {
    const { start } = await import('./play.js');
    await start({ playerId: state.player.id, onProgress: k => bar(0.4 + k * 0.6) });
  } catch (e) {
    console.error(e);
    return fail(e.message || 'Could not load the world');
  }

  const s = $('#splash');
  s.classList.add('gone');
  setTimeout(() => s.remove(), 500);
}

boot();
