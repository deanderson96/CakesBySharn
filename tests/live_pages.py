"""Read-only production availability checks; never submit forms or access private records."""
from urllib.request import Request, urlopen
from urllib.parse import urlparse

for path, required in (
    ('/', ('Cakes by Sharn', 'id="enquiry-form"', 'id="submit-online-enquiry"')),
    ('/admin.html', ('Cakes by Sharn', 'id="admin-login"', 'id="admin-dashboard"')),
):
    target = 'https://www.cakesbysharn.co.uk' + path
    req = Request(target, headers={'User-Agent': 'CakesBySharn-Production-Readiness/1.0'})
    with urlopen(req, timeout=25) as response:
        final = urlparse(response.geturl())
        assert response.status == 200, (target, response.status)
        assert final.scheme == 'https' and final.netloc == 'www.cakesbysharn.co.uk', (target, response.geturl())
        html = response.read(200000).decode('utf-8')
        for phrase in required:
            assert phrase in html, (target, 'missing', phrase)
        if path.endswith('admin.html'):
            assert 'noindex,nofollow' in html, 'admin page must be marked noindex'
        print('PASS read-only live page:', target)

print('Live production pages respond and show the intended public/login shells.')
