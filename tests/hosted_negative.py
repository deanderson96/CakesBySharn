"""Non-destructive checks against the deployed public API.

Only invalid submissions are sent. No customer or test enquiry is inserted.
"""
import json
import re
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parents[1]
config = (root / 'order-config.js').read_text()
url_match = re.search(r"supabaseUrl:\s*'([^']+)'", config)
key_match = re.search(r"supabaseAnonKey:\s*'([^']+)'", config)
assert url_match and key_match, 'Missing public Supabase configuration'
base = url_match.group(1)
key = key_match.group(1)
origin = 'https://deanderson96.github.io'

def post(endpoint: str, payload: bytes, headers=None):
    request = Request(base + '/functions/v1/' + endpoint, data=payload, method='POST', headers={
        'apikey': key, 'Content-Type': 'application/json', 'Origin': origin,
        **(headers or {})
    })
    try:
        with urlopen(request, timeout=30) as response:
            return response.status, response.read()
    except HTTPError as exc:
        return exc.code, exc.read()

def reject(label, payload, expected=400):
    status, body = post('submit-enquiry', payload)
    assert status == expected, f'{label}: expected {expected}, got {status} ({body[:250]!r})'
    print(f'PASS {label}: {status}', flush=True)

reject('invalid JSON', b'{broken')
reject('non-object JSON', b'[]')
reject('oversized request', b'x' * 16001, 413)

base_payload = {
    'name': 'Non-destructive validation test',
    'email': 'never-insert@example.invalid',
    'contactMethod': 'email',
    'preferredDate': '2099-02-30',
    'fulfilment': 'collection',
    'notes': 'Only invalid inputs are tested',
    'items': [{'key': 'loaves:0', 'quantity': 1}],
}
reject('invalid calendar date', json.dumps(base_payload).encode())
base_payload['preferredDate'] = '2099-02-28'
base_payload['items'] = [None]
reject('malformed item structure', json.dumps(base_payload).encode())

status, body = post('manage-enquiries', b'{"action":"list"}', {'Authorization': 'Bearer invalid'})
assert status in (401, 403), f'Unverified admin JWT accepted or unexpected error: {status} {body[:250]!r}'
print(f'PASS rejected unverified admin JWT: {status}', flush=True)

# CORS must match the public custom domain, even on error responses.
# Browser preflight failures appear as "Failed to fetch" and prevent any POST.
for site_origin in ('https://www.cakesbysharn.co.uk', 'https://cakesbysharn.co.uk'):
    for endpoint in ('submit-enquiry', 'manage-enquiries'):
        request = Request(base + '/functions/v1/' + endpoint, method='OPTIONS', headers={
            'Origin': site_origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'apikey,content-type',
        })
        with urlopen(request, timeout=30) as response:
            assert response.status in (200, 204), (endpoint, site_origin, response.status)
            assert response.headers.get('Access-Control-Allow-Origin') == site_origin, (
                endpoint, site_origin, response.headers.get('Access-Control-Allow-Origin'))
            assert 'POST' in response.headers.get('Access-Control-Allow-Methods', '')
            assert 'apikey' in response.headers.get('Access-Control-Allow-Headers', '').lower()
        print(f'PASS {endpoint} preflight allows {site_origin}', flush=True)
    request = Request(base + '/functions/v1/submit-enquiry', data=b'{broken', method='POST', headers={
        'Origin': site_origin, 'apikey': key, 'Content-Type': 'application/json',
    })
    try:
        urlopen(request, timeout=30)
        raise AssertionError('Invalid JSON unexpectedly accepted')
    except HTTPError as exc:
        assert exc.code == 400
        assert exc.headers.get('Access-Control-Allow-Origin') == site_origin, (
            site_origin, exc.headers.get('Access-Control-Allow-Origin'))
    print(f'PASS error response allows {site_origin}', flush=True)

request = Request(base + '/functions/v1/submit-enquiry', method='OPTIONS', headers={
    'Origin': 'https://untrusted.example', 'Access-Control-Request-Method': 'POST'
})
with urlopen(request, timeout=30) as response:
    assert response.headers.get('Access-Control-Allow-Origin') is None, (
        'Untrusted origin incorrectly allowed', response.headers.get('Access-Control-Allow-Origin'))
print('PASS unrelated origin rejected by CORS', flush=True)

