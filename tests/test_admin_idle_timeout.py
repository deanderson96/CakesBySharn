"""Regression contract: admin sessions expire after 30 minutes of inactivity."""
from pathlib import Path
root=Path(__file__).resolve().parents[1]
js=(root/"admin.js").read_text()
html=(root/"admin.html").read_text()
assert "const IDLE_LIMIT_MS=30*60*1000" in js
assert "localStorage.setItem(IDLE_KEY,String(now))" in js
assert "localStorage.getItem(IDLE_KEY)" in js
assert "Date.now()-idleTimestamp()>=IDLE_LIMIT_MS" in js
assert "await signOut();" in js
assert "document.addEventListener('visibilitychange'" in js
assert "window.addEventListener('focus'" in js
assert "event.isTrusted" in js
assert "if(!dashboard.hidden)await refresh();" in js
assert "Signed out automatically after 30 minutes of inactivity" in js
assert "admin.js?v=20261118enterprise1" in html
print("PASS admin 30-minute inactivity timeout, persistent timestamp and automatic sign-out")
