#!/usr/bin/env python3
"""
BitBlox Auto-Farm Bot - Yaelahyuds
Jalanin di background, kirim hasil ke WA via Hermes
"""
import requests, json, time, random, subprocess
from datetime import datetime

SUPABASE_URL = 'https://bexejpwfeyifyspzccvr.supabase.co'
SUPABASE_KEY = 'sb_publishable_xceMyCefRZ6PplCL6ZYB4g_F4stZNMX'
TOKEN = '339de19fd74c556e8ccbed3edb4d581c1c8b104a1f00ac0bbb43a76e733a06da'
ADDRESS = '0x35e9dbe5f15d50f287f28cb5567bb1346c7bdab9580d4fdaae5c05a1cbcfc2fd'

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
}

LOG = []

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    LOG.append(line)
    print(line, flush=True)

def rpc(fn, args={}):
    try:
        r = requests.post(
            f'{SUPABASE_URL}/rest/v1/rpc/{fn}',
            headers=HEADERS, json=args, timeout=15
        )
        return r.status_code, r.json()
    except Exception as e:
        return 0, {'error': str(e)}

def jitter(a=2.0, b=6.0):
    """Human-like random delay"""
    t = random.uniform(a, b)
    time.sleep(t)
    return t

def get_state():
    c, d = rpc('bb_state', {'p_token': TOKEN})
    if c == 200:
        return d
    return None

def do_spin():
    """Daily spin wheel"""
    log("--- DAILY SPIN ---")
    state = get_state()
    if not state:
        log("ERROR: Cannot get state")
        return False
    
    spun = state.get('me', {}).get('spun', True)
    if spun:
        log("Already spun today, skip")
        return False
    
    jitter(3, 8)
    c, r = rpc('bb_spin', {'p_token': TOKEN})
    if c == 200 and not r.get('error'):
        reward = r
        log(f"SPIN OK! reward={json.dumps(reward)}")
        return True
    else:
        log(f"SPIN FAILED: {r}")
        return False

def do_tasks():
    """Check & progress tasks via bb_event for eligible types"""
    log("--- TASKS ---")
    c, tasks_data = rpc('bb_tasks', {'p_token': TOKEN})
    if c != 200:
        log(f"Tasks fetch failed: {tasks_data}")
        return
    
    tasks = tasks_data.get('tasks', [])
    total_reward = 0
    
    for task in tasks:
        i = task['i']
        key = task['key']
        goal = task['goal']
        have = task['have']
        claimed = task['claimed']
        coins_reward = task.get('cash', 0)
        xp_reward = task.get('xp', 0)
        
        log(f"  Task[{i}] {key}: {have}/{goal} claimed={claimed} reward={coins_reward}c +{xp_reward}xp")
        
        if claimed:
            continue
        
        # bb_event works for: drive_m, fly_m, rings
        # Server-side actions needed for: ore, zombies, fished, blocks
        if key in ['drive_m', 'fly_m', 'rings'] and have < goal:
            needed = goal - have + 10
            jitter(1, 3)
            c2, r2 = rpc('bb_event', {'p_token': TOKEN, 'p_kind': key, 'p_n': needed})
            log(f"    Injected {key} +{needed}: {c2} -> {r2}")
            jitter(2, 5)
        
        # Re-check if completed, then claim
        jitter(2, 4)
        c3, t2 = rpc('bb_tasks', {'p_token': TOKEN})
        if c3 == 200:
            updated = next((t for t in t2.get('tasks', []) if t['i'] == i), None)
            if updated and updated['have'] >= updated['goal'] and not updated['claimed']:
                jitter(1, 3)
                c4, r4 = rpc('bb_task_claim', {'p_token': TOKEN, 'p_i': i})
                if c4 == 200 and not r4.get('error'):
                    log(f"    CLAIMED task[{i}] {key}! +{coins_reward} coins +{xp_reward} xp")
                    total_reward += coins_reward
                else:
                    log(f"    Claim failed: {r4}")
    
    log(f"Tasks done. Total coin rewards: {total_reward}")
    return total_reward

def do_loot():
    """Open any loot boxes"""
    log("--- LOOT BOXES ---")
    state = get_state()
    if not state:
        return
    
    boxes = state.get('box', [])
    if not boxes:
        log("No loot boxes")
        return
    
    for box in boxes:
        box_id = box.get('id') or box.get('box_id') or box
        jitter(2, 5)
        c, r = rpc('bb_loot', {'p_token': TOKEN, 'p_box': box_id})
        if c == 200 and not r.get('error'):
            log(f"LOOTED box {box_id}! result={json.dumps(r)[:100]}")
        else:
            log(f"Loot failed box {box_id}: {r}")

def do_games():
    """Farm XP via games - with proper human timing to avoid BOT flag"""
    log("--- GAME XP FARMING ---")
    
    # Cek BOT status dulu dengan satu call ringan
    jitter(5, 12)
    c, r = rpc('bb_game_start', {'p_token': TOKEN, 'p_game': 'bloxshot'})
    if c != 200:
        log(f"game_start failed: {r}")
        return
    
    run_id = r.get('run')
    if not run_id:
        log("No run ID returned")
        return
    
    log(f"Game started, run={run_id}")
    
    # Simulate realistic game play time (3-8 minutes for bloxshot)
    game_time = random.randint(180, 480)
    log(f"Simulating {game_time}s game play...")
    time.sleep(game_time)
    
    # Submit score
    stats = {'kills': random.randint(4, 12), 'won': random.choice([True, False, False])}
    c2, r2 = rpc('bb_game_finish', {'p_token': TOKEN, 'p_run': run_id, 'p_stats': stats})
    
    if c2 == 200 and not r2.get('error'):
        xp = r2.get('xp', 0)
        capped = r2.get('capped', False)
        today = r2.get('today', 0)
        day_cap = r2.get('day_cap', 0)
        log(f"Game finished! +{xp} XP | today={today}/{day_cap} | capped={capped}")
        return xp
    else:
        log(f"game_finish result: {c2} -> {r2}")
        if r2.get('error') == 'BOT':
            log("BOT detected - need longer cooldown between actions")
        return 0

def do_encounter_farm():
    """Battle wild Memals for XP - checks for BOT first"""
    log("--- BATTLE FARMING ---")
    
    jitter(3, 8)
    # Start encounter
    c, enc = rpc('bb_encounter', {'p_token': TOKEN, 'p_biome': None})
    if c != 200 or enc.get('error'):
        log(f"Encounter failed: {enc}")
        return
    
    if not enc.get('foe'):
        log(f"No encounter: {enc}")
        return
    
    enc_id = enc.get('id')
    foe = enc.get('foe', {})
    log(f"Battle! vs {foe.get('species','?')} lvl{foe.get('level','?')} enc_id={enc_id}")
    
    # Auto-battle: use first move (tackle) until win
    max_rounds = 15
    for round_n in range(max_rounds):
        jitter(1.5, 3.5)
        c2, r2 = rpc('bb_act', {'p_token': TOKEN, 'p_enc': enc_id, 'p_kind': 'move', 'p_arg': 'tackle'})
        
        if c2 != 200 or r2.get('error'):
            log(f"  Round {round_n+1} failed: {r2}")
            break
        
        status = r2.get('status')
        log(f"  Round {round_n+1}: status={status}")
        
        if status in ['win', 'lose', 'run', 'caught']:
            xp = r2.get('xp', 0)
            events = r2.get('events', [])
            log(f"  Battle {status}! +{xp} xp events={events}")
            break

def send_wa_report(summary):
    """Kirim laporan ke WA via Hermes"""
    try:
        msg = summary
        result = subprocess.run(
            ['hermes', 'send', '--to', 'whatsapp', msg],
            capture_output=True, text=True, timeout=30
        )
        print(f"WA send result: {result.returncode} {result.stdout[:200]}")
    except Exception as e:
        print(f"WA send error: {e}")

def main():
    log("=== BitBlox Bot START ===")
    log(f"Account: Yaelahyuds | Address: {ADDRESS[:20]}...")
    
    # Get initial state
    state = get_state()
    if not state:
        log("FATAL: Cannot connect to server")
        send_wa_report("BitBlox Bot: GAGAL - cannot connect to server")
        return
    
    player = state.get('player', {})
    me = state.get('me', {})
    log(f"Initial: coins={player.get('coins',0)} pxp={me.get('pxp',0)} level={me.get('level',1)}")
    
    coins_before = player.get('coins', 0)
    pxp_before = me.get('pxp', 0)
    
    results = {
        'spin': False,
        'tasks_coins': 0,
        'game_xp': 0,
        'battles': 0,
    }
    
    # 1. Daily Spin
    results['spin'] = do_spin()
    jitter(5, 15)
    
    # 2. Tasks (inject eligible ones)
    results['tasks_coins'] = do_tasks()
    jitter(5, 10)
    
    # 3. Open loot boxes
    do_loot()
    jitter(3, 8)
    
    # 4. Battle farming (2 battles)
    for b in range(2):
        log(f"Battle {b+1}/2")
        do_encounter_farm()
        jitter(8, 20)
    
    # 5. Game XP (1 game session)
    results['game_xp'] = do_games()
    jitter(5, 10)
    
    # Final state
    state2 = get_state()
    coins_after = state2['player']['coins'] if state2 else coins_before
    pxp_after = state2['me']['pxp'] if state2 else pxp_before
    
    # Build report
    log("=== DONE ===")
    report = f"""*BitBlox Bot Report - {datetime.now().strftime('%d %b %Y %H:%M')}*

Akun: Yaelahyuds
Wallet: {ADDRESS[:20]}...

*Hasil:*
- Spin harian: {'✅ Done' if results['spin'] else '⏭ Sudah spin/skip'}
- Task inject: {results['tasks_coins']} coins claimed
- Game XP: +{results['game_xp'] or 0} XP
- Battle: 2x auto-battle selesai

*Stats:*
- Coins: {coins_before} → {coins_after} (+{coins_after - coins_before})
- PXP: {pxp_before} → {pxp_after} (+{pxp_after - pxp_before})

Log: /root/bitblox-bot/bot.log"""

    print("\n" + report)
    
    # Simpan log
    with open('/root/bitblox-bot/bot.log', 'w') as f:
        f.write("\n".join(LOG))
    
    # Kirim ke WA
    send_wa_report(report)

if __name__ == '__main__':
    main()
