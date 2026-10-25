#!/usr/bin/env python3
"""
BitBlox Multi-Account Farm - mail.tm edition (no Gmail needed)
Usage:
  python3 farm.py register N      # register N new accounts
  python3 farm.py farm            # run daily farm for all accounts
  python3 farm.py status          # show accounts + last results
"""
import requests, json, time, random, re, os, sys, string
from datetime import datetime

SUPABASE_URL = 'https://bexejpwfeyifyspzccvr.supabase.co'
SUPABASE_KEY = 'sb_publishable_xceMyCefRZ6PplCL6ZYB4g_F4stZNMX'
AUTH_URL     = f'{SUPABASE_URL}/functions/v1/bitblox-auth'
PRIVY_APP_ID = 'cmuui43ri01j90bkz41hc0v8y'
ACCOUNTS_FILE = '/root/bitblox-bot/accounts.json'
MAILTM_BASE  = 'https://api.mail.tm'

PRIVY_H = {
    'privy-app-id': PRIVY_APP_ID,
    'privy-client': 'react-auth:2.0.0',
    'origin': 'https://bitblox.co',
    'referer': 'https://bitblox.co/',
    'content-type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
}
SB_H = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json'
}

NAMES = [
    'BloxFarmer','SuiGrinder','CrateLord','ZombieSlayer','RingMaster',
    'OreDigger','FuelRunner','LootGoblin','PexHunter','BoardClimber',
    'DailyGrind','SpinKing','MetalTamer','WorldWalker','BlockBreaker',
    'XPMachine','CoinHunter','SuiNinja','BloxWizard','FarmBot',
]

# ─────────────────────────────────────────
# UTILS
# ─────────────────────────────────────────
def log(msg):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)

def jitter(a=2.0, b=6.0):
    time.sleep(random.uniform(a, b))

def rand_str(n=10):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=n))

# ─────────────────────────────────────────
# MAIL.TM
# ─────────────────────────────────────────
def mailtm_domains():
    r = requests.get(f'{MAILTM_BASE}/domains', timeout=10)
    members = r.json().get('hydra:member') or r.json().get('@member') or []
    return [d['domain'] for d in members if d.get('isActive', True)]

def mailtm_create():
    """Buat akun mail.tm baru, return (email, password, token)"""
    domains = mailtm_domains()
    if not domains:
        raise RuntimeError('mail.tm: no active domains')
    domain = random.choice(domains)
    addr   = f"{rand_str(10)}@{domain}"
    pw     = rand_str(16)
    r = requests.post(f'{MAILTM_BASE}/accounts',
        json={'address': addr, 'password': pw}, timeout=15)
    if r.status_code not in (200, 201):
        log(f'mailtm create fail: {r.status_code} {r.text[:150]}')
        return None, None, None
    # login
    r2 = requests.post(f'{MAILTM_BASE}/token',
        json={'address': addr, 'password': pw}, timeout=15)
    if r2.status_code != 200:
        log(f'mailtm token fail: {r2.status_code}')
        return None, None, None
    token = r2.json().get('token')
    log(f'mailtm: {addr}')
    return addr, pw, token

def mailtm_read_otp(token, max_wait=120):
    """Poll inbox sampai dapat OTP 6 digit dari Privy"""
    headers = {'Authorization': f'Bearer {token}'}
    deadline = time.time() + max_wait
    seen = set()
    while time.time() < deadline:
        try:
            r = requests.get(f'{MAILTM_BASE}/messages', headers=headers, timeout=10)
            if r.status_code == 200:
                msgs = r.json().get('hydra:member') or r.json().get('@member') or []
                for msg in msgs:
                    mid = msg['id']
                    if mid in seen:
                        continue
                    seen.add(mid)
                    # fetch full message
                    r2 = requests.get(f'{MAILTM_BASE}/messages/{mid}', headers=headers, timeout=10)
                    if r2.status_code != 200:
                        continue
                    d2   = r2.json()
                    html = d2.get('html','')
                    if isinstance(html, list): html = ' '.join(html)
                    body = d2.get('text','') + html
                    codes = re.findall(r'\b(\d{6})\b', body)
                    if codes:
                        log(f'OTP found: {codes[-1]}')
                        return codes[-1]
        except Exception as e:
            log(f'mailtm poll err: {e}')
        time.sleep(6)
    return None

# ─────────────────────────────────────────
# PRIVY
# ─────────────────────────────────────────
def privy_init(addr):
    r = requests.post('https://auth.privy.io/api/v1/passwordless/init',
        headers=PRIVY_H, json={'email': addr}, timeout=15)
    log(f'privy init: {r.status_code}')
    return r.status_code == 200

def privy_auth(addr, code):
    r = requests.post('https://auth.privy.io/api/v1/passwordless/authenticate',
        headers=PRIVY_H,
        json={'email': addr, 'code': code, 'mode': 'login-or-sign-up'},
        timeout=20)
    if r.status_code != 200:
        log(f'privy auth fail: {r.status_code} {r.text[:200]}')
        return None
    return r.json()

# ─────────────────────────────────────────
# BITBLOX AUTH
# ─────────────────────────────────────────
def bitblox_auth(privy, name):
    tok = privy['token']
    h = dict(PRIVY_H)
    h['Authorization'] = f'Bearer {tok}'

    # get wallets
    r = requests.get('https://auth.privy.io/api/v1/wallets', headers=h, timeout=20)
    log(f'wallets: {r.status_code} {r.text[:200]}')
    if r.status_code != 200:
        return None

    wallets = r.json().get('data', [])
    sui = next((w for w in wallets if w.get('chain_type') == 'sui'), None)

    if not sui:
        log('creating sui wallet')
        r2 = requests.post('https://auth.privy.io/api/v1/wallets',
            headers=h,
            json={'chain_type': 'sui', 'create_policy': 'create_if_missing'},
            timeout=20)
        log(f'wallet create: {r2.status_code} {r2.text[:200]}')
        if r2.status_code not in (200, 201):
            return None
        sui = r2.json()

    addr    = (sui.get('address') or '').lower()
    user_id = privy['user']['id']
    at      = int(time.time() * 1000)
    msg     = f"BitBlox sign-in\nWallet: {addr}\nAccount: {user_id}\nTime: {at}"

    # sign
    r3 = requests.post('https://auth.privy.io/api/v1/wallets/rpc',
        headers=h,
        json={'method': 'signPersonalMessage', 'params': {'address': addr, 'message': msg}},
        timeout=30)
    log(f'sign: {r3.status_code} {r3.text[:150]}')
    if r3.status_code != 200:
        return None
    sig = r3.json().get('data', {}).get('signature')

    # bitblox-auth
    r4 = requests.post(AUTH_URL, headers=SB_H, json={
        'privy_token':    tok,
        'privy_id_token': privy.get('identity_token'),
        'address': addr, 'at': at, 'signature': sig,
        'name': name, 'code': 'open'
    }, timeout=20)
    log(f'bitblox-auth: {r4.status_code} {r4.text[:200]}')
    if r4.status_code != 200:
        return None
    j = r4.json()
    if 'token' not in j:
        return None
    return {'token': j['token'], 'address': addr}

# ─────────────────────────────────────────
# SUPABASE RPC
# ─────────────────────────────────────────
def sb_rpc(fn, args):
    r = requests.post(f'{SUPABASE_URL}/rest/v1/rpc/{fn}',
        headers=SB_H, json=args, timeout=20)
    return r.status_code, (r.json() if r.text else None)

# ─────────────────────────────────────────
# REGISTER
# ─────────────────────────────────────────
def register_one():
    name = f"{random.choice(NAMES)}{random.randint(10,999)}"

    # 1. buat temp email
    addr, pw, mt_token = mailtm_create()
    if not addr:
        log('mailtm create failed')
        return None

    # 2. privy OTP
    if not privy_init(addr):
        log('privy init failed')
        return None
    jitter(3, 7)

    # 3. baca OTP
    code = mailtm_read_otp(mt_token, max_wait=120)
    if not code:
        log('OTP timeout')
        return None

    # 4. privy authenticate
    privy = privy_auth(addr, code)
    if not privy:
        return None
    jitter(2, 5)

    # 5. bitblox auth + wallet
    ses = bitblox_auth(privy, name)
    if not ses:
        return None
    tok = ses['token']
    jitter(2, 5)

    # 6. join game
    c, r = sb_rpc('bb_join', {
        'p_token': tok, 'p_name': name,
        'p_wallet': ses['address'], 'p_skin': 'tone3'
    })
    log(f'join: {c} {json.dumps(r)[:150] if r else r}')
    if c != 200:
        return None
    jitter(2, 4)

    # 7. starter species
    species = random.choice(['smoltle', 'aquapup', 'embercub'])
    c, s = sb_rpc('bb_starter', {'p_token': tok, 'p_species': species})
    log(f'starter: {c} {json.dumps(s)[:150] if s else s}')

    return {
        'email':   addr,
        'mailtm_password': pw,
        'name':    name,
        'token':   tok,
        'wallet':  ses['address'],
        'created': datetime.now().isoformat()
    }

def cmd_register(n):
    accs = json.load(open(ACCOUNTS_FILE)) if os.path.exists(ACCOUNTS_FILE) else []
    ok = 0
    for i in range(n):
        log(f'\n=== Register {i+1}/{n} ===')
        acc = register_one()
        if acc:
            accs.append(acc)
            json.dump(accs, open(ACCOUNTS_FILE, 'w'), indent=1)
            log(f'SAVED {acc["email"]} ({len(accs)} total)')
            ok += 1
        else:
            log(f'FAILED slot {i+1}')
        if i < n - 1:
            jitter(10, 25)
    log(f'\nDone: {ok}/{n} berhasil')

# ─────────────────────────────────────────
# FARM
# ─────────────────────────────────────────
def cmd_farm():
    if not os.path.exists(ACCOUNTS_FILE):
        print('no accounts.json'); return
    accs = json.load(open(ACCOUNTS_FILE))

    for a in accs:
        tok = a['token']
        log(f"\n=== {a['name']} ({a['email']}) ===")

        # state
        c, st = sb_rpc('bb_state', {'p_token': tok})
        if c != 200:
            log('state failed, skip'); continue
        me = st.get('me', {}); pl = st.get('player', {})
        log(f"coins={pl.get('coins')} pxp={me.get('pxp')} lvl={me.get('level')}")
        jitter(2, 5)

        # spin
        if not me.get('spun', True):
            c, r = sb_rpc('bb_spin', {'p_token': tok})
            log(f'spin: {c}')
            jitter(3, 6)

        # tasks
        c, t = sb_rpc('bb_tasks', {'p_token': tok})
        if c == 200:
            for task in (t.get('tasks') or []):
                if task.get('claimed'): continue
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

        # 2x battle
        for b in range(2):
            jitter(2, 6)
            c, enc = sb_rpc('bb_encounter', {'p_token': tok, 'p_biome': None})
            if c != 200 or not (enc or {}).get('foe'): continue
            eid = enc['id']
            for rd in range(15):
                jitter(1.5, 3.5)
                c2, r2 = sb_rpc('bb_act', {'p_token': tok, 'p_enc': eid, 'p_kind': 'move', 'p_arg': 'tackle'})
                if c2 != 200: break
                if (r2 or {}).get('status') in ('win','lose','run','caught'):
                    log(f"battle {(r2 or {}).get('status')} xp={(r2 or {}).get('xp')}")
                    break

        # bloxshot game sim
        jitter(3, 7)
        c, g = sb_rpc('bb_game_start', {'p_token': tok, 'p_game': 'bloxshot'})
        if c == 200 and (g or {}).get('run'):
            run  = g['run']
            wait = random.randint(180, 420)
            log(f'game sim {wait}s...')
            time.sleep(wait)
            stats = {'kills': random.randint(4,12), 'won': random.choice([True,False,False])}
            c2, r2 = sb_rpc('bb_game_finish', {'p_token': tok, 'p_run': run, 'p_stats': stats})
            if c2 == 200:
                log(f"game xp +{(r2 or {}).get('xp')} today={(r2 or {}).get('today')}/{(r2 or {}).get('day_cap')}")

        # update local state
        c, st = sb_rpc('bb_state', {'p_token': tok})
        if c == 200:
            a['last_pxp']   = st.get('me', {}).get('pxp')
            a['last_coins'] = st.get('player', {}).get('coins')
            a['last_farm']  = datetime.now().isoformat()

        jitter(5, 15)

    json.dump(accs, open(ACCOUNTS_FILE, 'w'), indent=1)

    # WA report
    lines = [f"*BitBlox Farm - {datetime.now().strftime('%d %b %H:%M')}*", ""]
    for a in accs:
        lines.append(f"- {a['name']}: pxp={a.get('last_pxp')} coins={a.get('last_coins')}")
    lines.append(f"\nTotal: {len(accs)} akun | pxp total: {sum(a.get('last_pxp',0) or 0 for a in accs)}")
    report = '\n'.join(lines)
    print(report)
    try:
        import subprocess
        subprocess.run(['hermes', 'send', '--to', 'whatsapp', report], timeout=30)
    except Exception as e:
        log(f'wa err: {e}')

# ─────────────────────────────────────────
# STATUS
# ─────────────────────────────────────────
def cmd_status():
    if not os.path.exists(ACCOUNTS_FILE):
        print('no accounts.json'); return
    accs = json.load(open(ACCOUNTS_FILE))
    print(f"{'Name':20} {'Email':35} {'pxp':>8} {'coins':>8}")
    print('-' * 75)
    for a in accs:
        print(f"{a['name']:20} {a['email']:35} {str(a.get('last_pxp','-')):>8} {str(a.get('last_coins','-')):>8}")
    print(f"\nTotal: {len(accs)} akun")

# ─────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────
if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if cmd == 'register':
        cmd_register(int(sys.argv[2]) if len(sys.argv) > 2 else 5)
    elif cmd == 'farm':
        cmd_farm()
    else:
        cmd_status()
