# BitBlox Multi-Account Farmer

Auto-farm bot untuk game **BitBlox** (Sui blockchain) — register akun via Gmail dot-trick + Privy OTP, auto daily farm: spin, tasks, battle, bloxshot XP.

---

## Features

- **Gmail Dot-Trick** — 1 Gmail akun bisa jadi puluhan akun unik (`y.udomkegas@gmail.com`, `yu.domkegas@gmail.com`, dst)
- **Privy OTP via IMAP** — baca OTP langsung dari Gmail, no manual intervention
- **Auto Register** — Privy auth → Sui wallet creation → BitBlox join + starter pick
- **Daily Farm** — spin harian, inject task progress (drive/fly/rings), 2x battle per akun, bloxshot game sim
- **Multi-account** — semua akun di `accounts.json`, jalan sekuensial dengan jitter anti-ban
- **WA Report** — kirim laporan farm harian ke WhatsApp via Hermes gateway

---

## Requirements

```
pip install requests
```

Gmail:
- Aktifkan 2FA di Google Account
- Buat App Password: [myaccount.google.com](https://myaccount.google.com) → Security → 2-Step Verification → App passwords
- IMAP harus aktif di Gmail settings

---

## Setup

```bash
git clone https://github.com/YOURUSER/bitblox-bot
cd bitblox-bot
pip install requests
```

Set env var:

```bash
export GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx"   # 16-char app password, no spaces required
```

Edit `farm.py` line 14:

```python
BASE_EMAIL = 'youremail@gmail.com'   # ganti dengan Gmail lo
```

---

## Usage

### Register akun baru

```bash
python3 farm.py register 10
```

Register 10 akun baru menggunakan dot-trick variant dari `BASE_EMAIL`.
Flow per akun:
1. Generate email variant
2. Privy `passwordless/init` → kirim OTP ke Gmail
3. IMAP read OTP (max wait 120s)
4. Privy `authenticate` → dapat token + user ID
5. Get/create Sui embedded wallet via Privy RPC
6. Sign proof → `bitblox-auth` Supabase function
7. `bb_join` → `bb_starter` (pilih species smoltle)
8. Simpan ke `accounts.json`

### Daily farm semua akun

```bash
python3 farm.py farm
```

Per akun:
- Cek state (coins, pxp, level)
- Spin harian (kalau belum)
- Inject task progress: `drive_m`, `fly_m`, `rings` → auto claim
- 2x battle via `bb_encounter` + `bb_act` (tackle loop)
- Bloxshot game sim (3-7 menit playtime simulasi) → `bb_game_finish`
- Update `accounts.json` dengan last stats
- Kirim report ke WhatsApp

### Lihat status akun

```bash
python3 farm.py status
```

---

## File Structure

```
bitblox-bot/
  farm.py          # main script (register + farm + status)
  accounts.json    # saved accounts (auto-generated, gitignored)
  bot.log          # log file
  bot.py           # legacy helper
  privy.js         # JS reference (Privy flow analysis)
  privy-bridge.js  # JS bridge helper
  sui.js           # Sui wallet helpers
  account.js       # account management helpers
  config.js        # config reference
  db.js            # DB helpers
```

---

## Config (dalam farm.py)

| Variable | Default | Keterangan |
|---|---|---|
| `BASE_EMAIL` | `yudomkegas@gmail.com` | Gmail utama untuk dot-trick |
| `SUPABASE_URL` | `https://bexejpwfeyifyspzccvr.supabase.co` | BitBlox Supabase endpoint |
| `SUPABASE_KEY` | `sb_publishable_...` | Public anon key |
| `PRIVY_APP_ID` | `cmuui43ri01j90bkz41hc0v8y` | Privy app ID BitBlox |
| `ACCOUNTS_FILE` | `/root/bitblox-bot/accounts.json` | Path penyimpanan akun |

---

## Anti-Detection

- Jitter random 2-20 detik antar aksi
- User-Agent Chrome Linux standard
- Sequential account processing (bukan paralel) buat hindari burst
- Token per akun disimpan lokal, tidak re-login setiap farm (sampai expire)

---

## Cron (Optional)

Farm otomatis tiap hari jam 08:00:

```bash
crontab -e
# tambahkan:
0 8 * * * GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx" /usr/bin/python3 /root/bitblox-bot/farm.py farm >> /root/bitblox-bot/bot.log 2>&1
```

---

## Notes

- Dot-trick Gmail: `y.udomkegas@gmail.com` dan `yudomkegas@gmail.com` adalah inbox yang sama di Google, tapi dianggap beda akun oleh Privy
- Max variant dari 1 base email: tergantung panjang username (N huruf = 2^(N-1) kombinasi)
- `accounts.json` di-gitignore buat keamanan token

---

## Disclaimer

For educational and research purposes. Bot ini mengeksplorasi auth flow Privy + Supabase RPC pattern pada game BitBlox.
