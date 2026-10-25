#!/usr/bin/env python3
"""
BitBlox Multi-Account Farm - gmail dot trick edition
Usage:
  python3 farm.py register N      # register N new accounts (needs APP_PASSWORD in env)
  python3 farm.py farm            # run daily farm for all accounts
  python3 farm.py status          # show accounts + last results
Env: GMAIL_APP_PASSWORD=xxxx
"""
import requests, json, time, random, re, imaplib, email as emailmod
import os, sys, hashlib
from datetime import datetime

BASE_EMAIL = 'yudomkegas@gmail.com'
SUPABASE_URL = 'https://bexejpwfeyifyspzccvr.supabase.co'
SUPABASE_KEY = 'sb_publishable_xceMyCefRZ6PplCL6ZYB4g_F4stZNMX'
AUTH_URL = f'{SUPABASE_URL}/functions/v1/bitblox-auth'
PRIVY_APP_ID = 'cmuui43ri01j90bkz41hc0v8y'
ACCOUNTS_FILE = '/root/bitblox-bot/accounts.json'

PRIVY_H = {
  'privy-app-id': PRIVY_APP_ID,
  'privy-client': 'react-auth',
  'origin': 'https://bitblox.co',
  'referer': 'https://bitblox.co/',
  'content-type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
}
SB_H = {'apikey': SUPABASE_KEY, 'Authorization': f'Bearer {SUPABASE_KEY}', 'Content-Type': 'application/json'}

def log(msg):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)

def jitter(a=2.0, b=6.0):
    time.sleep(random.uniform(a, b))

# ---------- email variants ----------
def variants(n=50, skip_used=True):
    user, domain = BASE_EMAIL.split('@')
    letters = list(user)
    pos = len(letters) - 1
    out, used = [], set()
    if os.path.exists(ACCOUNTS_FILE):
        used = {a['email'] for a in json.load(open(ACCOUNTS_FILE))}
    mask = 1
    while len(out) < n and mask < (1 << pos):
        s = letters[0]
        for i in range(1, len(letters)):
            if mask & (1 << (i-1)): s += '.'
            s += letters[i]
        mask += 1
        full = f"{s}@{domain}"
        if skip_used and full in used: continue
        out.append(full)
    return out

# ---------- OTP reader ----------
def read_otp(target_email, max_wait=120):
    app_pw = os.environ.get('GMAIL_APP_PASSWORD')
    if not app_pw:
        raise SystemExit('Set GMAIL_APP_PASSWORD env var')
    # search ALL mail addressed to the dotted variant (gmail delivers all to same inbox)
    to_match = target_email.replace('.', '')
    deadline = time.time() + max_wait
    while time.time() < deadline:
        try:
            m = imaplib.IMAP4_SSL('imap.gmail.com')
            m.login(BASE_EMAIL, app_pw)
            m.select('INBOX')
            _, data = m.search(None, '(FROM "privy" UNSEEN)')
            ids = data[0].split()
            if not ids:
                _, data = m.search(None, '(UNSEEN)')
                ids = data[0].split()
            for eid in reversed(ids[-8:]):
                _, md = m.fetch(eid, '(RFC822)')
                for part in md:
                    if isinstance(part, tuple):
                        msg = emailmod.message_from_bytes(part[1])
                        to_hdr = (msg.get('To') or '').replace('.', '').lower()
                        if to_match not in to_hdr: continue
                        body = ''
                        if msg.is_multipart():
                            for p in msg.walk():
                                if p.get_content_type() in ('text/plain','text/html'):
                                    try: body += p.get_payload(decode=True).decode(errors='ignore')
                                    except: pass
                        else:
                            body = msg.get_payload(decode=True).decode(errors='ignore')
                        codes = re.findall(r'\b(\d{6})\b', body)
                        if codes:
                            m.store(eid, '+FLAGS', '\Seen')
                            m.logout()
                            return codes[-1]
            m.logout()
        except Exception as e:
            log(f'imap err: {e}')
        time.sleep(6)
    return None

# ---------- privy ----------
def privy_init(addr):
    r = requests.post('https://auth.privy.io/api/v1/passwordless/init',
                      headers=PRIVY_H, json={'email': addr}, timeout=15)
    return r.status_code == 200

def privy_auth(addr, code):
    r = requests.post('https://auth.privy.io/api/v1/passwordless/authenticate',
        headers=PRIVY_H, json={'email': addr, 'code': code, 'mode': 'login-or-sign-up'}, timeout=20)
    if r.status_code != 200:
        log(f'privy auth fail: {r.status_code} {r.text[:200]}')
        return None
    d = r.json()
    return d  # contains token, identity_token, user.id

# ---------- bitblox ----------
def sb_rpc(fn, args, token=None):
    h = dict(SB_H)
    r = requests.post(f'{SUPABASE_URL}/rest/v1/rpc/{fn}', headers=h, json=args, timeout=20)
    return r.status_code, (r.json() if r.text else None)

def bitblox_auth(privy, name):
    # build proof: server checks signature of proofText with wallet address.
    # privy user gets embedded wallet on first login? config says create_on_login:off,
    # but game requires sui wallet. Try wallets endpoint.
    tok = privy['token']
    h = dict(PRIVY_H); h['Authorization'] = f'Bearer {tok}'
    # get or create embedded wallet(s)
    r = requests.get('https://auth.privy.io/api/v1/wallets', headers=h, timeout=20)
    log(f'wallets: {r.status_code} {r.text[:300]}')
    if r.status_code != 200: return None
    wallets = r.json().get('data', [])
    sui = next((w for w in wallets if w.get('chain_type') == 'sui' or 'sui' in json.dumps(w).lower()), None)
    if not sui:
        log('no sui wallet on privy account - creating')
        r2 = requests.post('https://auth.privy.io/api/v1/wallets',
            headers=h, json={'chain_type': 'sui', 'create_policy': 'create_if_missing'}, timeout=20)
        log(f'wallet create: {r2.status_code} {r2.text[:300]}')
        if r2.status_code not in (200, 201): return None
        sui = r2.json()
    addr = (sui.get('address') or '').lower()
    # sign proof via privy rpc
    user_id = privy['user']['id']
    at = int(time.time() * 1000)
    msg = f"BitBlox sign-in\nWallet: {addr}\nAccount: {user_id}\nTime: {at}"
    r3 = requests.post('https://auth.privy.io/api/v1/wallets/rpc',
        headers=h, json={'method': 'signPersonalMessage', 'params': {'address': addr, 'message': msg}}, timeout=30)
    log(f'sign: {r3.status_code} {r3.text[:200]}')
    if r3.status_code != 200: return None
    sig = r3.json().get('data', {}).get('signature')
    r4 = requests.post(AUTH_URL, headers=SB_H, json={
        'privy_token': tok, 'privy_id_token': privy.get('identity_token'),
        'address': addr, 'at': at, 'signature': sig, 'name': name, 'code': 'open'}, timeout=20)
    log(f'bitblox-auth: {r4.status_code} {r4.text[:200]}')
    if r4.status_code != 200 or 'token' not in r4.json(): return None
    j = r4.json()
    return {'token': j['token'], 'address': addr}

NAMES = ['BloxFarmer','SuiGrinder','CrateLord','ZombieSlayer','RingMaster','OreDigger','FuelRunner','LootGoblin',
         'PexHunter','BoardClimber','DailyGrind','SpinKing','MemalTamer','WorldWalker','BlockBreaker','XPMachine']

def register_one(addr, idx):
    name = f"{random.choice(NAMES)}{random.randint(10,999)}"
    log(f'--- {addr} as {name}')
    if not privy_init(addr):
        log('init failed'); return None
    jitter(3, 8)
    code = read_otp(addr, max_wait=120)
    if not code:
        log('no OTP'); return None
    log(f'OTP ok: {code}')
    privy = privy_auth(addr, code)
    if not privy: return None
    jitter(2, 5)
    ses = bitblox_auth(privy, name)
    if not ses: return None
    tok = ses['token']
    jitter(2, 5)
    c, r = sb_rpc('bb_join', {'p_token': tok, 'p_name': name, 'p_wallet': ses['address'], 'p_skin': 'tone3'})
    log(f'join: {c} {json.dumps(r)[:150] if r else r}')
    if c != 200: return None
    jitter(2, 4)
    c, s = sb_rpc('bb_starter', {'p_token': tok, 'p_species': 'smoltle'})
    log(f'starter: {c} {json.dumps(s)[:150] if s else s}')
    return {'email': addr, 'name': name, 'token': tok, 'wallet': ses['address'],
            'created': datetime.now().isoformat()}

def cmd_register(n):
    accs = json.load(open(ACCOUNTS_FILE)) if os.path.exists(ACCOUNTS_FILE) else []
    for i, addr in enumerate(variants(n)):
        acc = register_one(addr, i)
        if acc:
            accs.append(acc)
            json.dump(accs, open(ACCOUNTS_FILE, 'w'), indent=1)
            log(f'SAVED {addr} ({len(accs)} total)')
        else:
            log(f'FAILED {addr}')
        jitter(8, 20)

def cmd_farm():
    accs = json.load(open(ACCOUNTS_FILE))
    for a in accs:
        tok = a['token']
        log(f"=== {a['name']} ({a['email']})")
        c, st = sb_rpc('bb_state', {'p_token': tok})
        if c != 200:
            log('state failed, skipping'); continue
        me = st.get('me', {}); pl = st.get('player', {})
        log(f"coins={pl.get('coins')} pxp={me.get('pxp')} lvl={me.get('level')}")
        jitter(2, 5)
        # spin
        if not me.get('spun', True):
            c, r = sb_rpc('bb_spin', {'p_token': tok})
            log(f'spin: {c}')
            jitter(3, 6)
        # tasks inject
        c, t = sb_rpc('bb_tasks', {'p_token': tok})
        if c == 200:
            for task in t.get('tasks', []):
                if task['claimed']: continue
                if task['key'] in ('drive_m','fly_m','rings') and task['have'] < task['goal']:
                    need = task['goal'] - task['have'] + 10
                    sb_rpc('bb_event', {'p_token': tok, 'p_kind': task['key'], 'p_n': need})
                    jitter(1.5, 3)
                    c2, t2 = sb_rpc('bb_tasks', {'p_token': tok})
                    if c2 == 200:
                        up = next((x for x in t2['tasks'] if x['i'] == task['i']), None)
                        if up and up['have'] >= up['goal'] and not up['claimed']:
                            sb_rpc('bb_task_claim', {'p_token': tok, 'p_i': task['i']})
                            log(f"claimed {task['key']}")
                            jitter(1.5, 3)
        # battle
        for b in range(2):
            jitter(2, 6)
            c, enc = sb_rpc('bb_encounter', {'p_token': tok, 'p_biome': None})
            if c != 200 or not enc.get('foe'): continue
            eid = enc['id']
            for rd in range(15):
                jitter(1.5, 3.5)
                c2, r2 = sb_rpc('bb_act', {'p_token': tok, 'p_enc': eid, 'p_kind': 'move', 'p_arg': 'tackle'})
                if c2 != 200: break
                if r2.get('status') in ('win','lose','run','caught'):
                    log(f"battle {r2['status']} xp={r2.get('xp')}")
                    break
        # game xp
        jitter(3, 7)
        c, g = sb_rpc('bb_game_start', {'p_token': tok, 'p_game': 'bloxshot'})
        if c == 200 and g.get('run'):
            run = g['run']
            wait = random.randint(180, 420)
            log(f'game sim {wait}s')
            time.sleep(wait)
            stats = {'kills': random.randint(4, 12), 'won': random.choice([True, False, False])}
            c2, r2 = sb_rpc('bb_game_finish', {'p_token': tok, 'p_run': run, 'p_stats': stats})
            if c2 == 200:
                log(f"game xp +{r2.get('xp')} today={r2.get('today')}/{r2.get('day_cap')}")
        # final
        c, st = sb_rpc('bb_state', {'p_token': tok})
        if c == 200:
            a['last_pxp'] = st.get('me', {}).get('pxp')
            a['last_coins'] = st.get('player', {}).get('coins')
            a['last_farm'] = datetime.now().isoformat()
    json.dump(accs, open(ACCOUNTS_FILE, 'w'), indent=1)
    # report
    lines = [f"*BitBlox Farm Report - {datetime.now().strftime('%d %b %H:%M')}*", ""]
    total_pxp = sum(a.get('last_pxp', 0) or 0 for a in accs)
    for a in accs:
        lines.append(f"- {a['name']}: pxp={a.get('last_pxp')} coins={a.get('last_coins')}")
    lines.append(f"\nTotal akun: {len(accs)} | total pxp: {total_pxp}")
    report = '\n'.join(lines)
    print(report)
    try:
        import subprocess
        subprocess.run(['hermes', 'send', '--to', 'whatsapp', report], timeout=30)
    except Exception as e:
        log(f'wa err {e}')

def cmd_status():
    if not os.path.exists(ACCOUNTS_FILE):
        print('no accounts.json'); return
    accs = json.load(open(ACCOUNTS_FILE))
    for a in accs:
        print(f"{a['name']:20} {a['email']:30} pxp={a.get('last_pxp')} coins={a.get('last_coins')}")
    print(f'total: {len(accs)}')

if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if cmd == 'register': cmd_register(int(sys.argv[2]) if len(sys.argv) > 2 else 5)
    elif cmd == 'farm': cmd_farm()
    else: cmd_status()
