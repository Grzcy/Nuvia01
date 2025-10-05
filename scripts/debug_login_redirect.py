#!/usr/bin/env python3
import re
from pathlib import Path

base = Path('.')
login = base / 'login.html'
index = base / 'index.html'

report = []

def check_login_redirect(html:str):
    ok_pre = bool(re.search(r"location\.replace\(\s*['\"]index\.html['\"]\s*\)", html))
    ok_authstate = ('onAuthStateChanged' in html)
    ok_session_flag = bool(re.search(r"sessionStorage\.setItem\(\s*['\"]nuvia_last_auth['\"]\s*,\s*['\"]1['\"]\s*\)", html))
    return ok_pre, ok_authstate, ok_session_flag

def check_index_gate(html:str):
    ok_gate = bool(re.search(r"location\.replace\(\s*['\"]/login\.html['\"]\s*\)", html))
    ok_reads_flag = 'nuvia_last_auth' in html
    return ok_gate, ok_reads_flag

# Read files
login_html = login.read_text(encoding='utf-8', errors='ignore') if login.exists() else ''
index_html = index.read_text(encoding='utf-8', errors='ignore') if index.exists() else ''

pre, authstate, flagset = check_login_redirect(login_html)
ig, igflag = check_index_gate(index_html)

report.append(f"login.html pre-render redirect to index.html: {'OK' if pre else 'MISSING'}")
report.append(f"login.html uses onAuthStateChanged: {'OK' if authstate else 'MISSING'}")
report.append(f"login.html sets session flag nuvia_last_auth: {'OK' if flagset else 'MISSING'}")
report.append(f"index.html gates guests to /login.html: {'OK' if ig else 'MISSING'}")
report.append(f"index.html reads nuvia_last_auth flag: {'OK' if igflag else 'MISSING'}")

print('\n'.join(report))

# Exit non-zero if any missing
if not all([pre, authstate, flagset, ig, igflag]):
    raise SystemExit(1)
