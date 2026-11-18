"""Verify email/password admin access requires no MFA APIs, and non-admins are denied."""
import json
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright, expect
from admin_email_draft import FAKE_LIST

ROOT = Path(__file__).resolve().parents[1]
AUTH_MOCK = """
export function createClient() {
  let loggedIn = false;
  return {auth: {
    getSession: async () => ({ data: {session:loggedIn?{access_token:'password-token'}:null} }),
    signInWithPassword: async ({email,password}) => {
      if (email !== 'owner@example.invalid' || password !== 'test-only-password')
        return {error:{message:'Invalid login credentials'}};
      loggedIn = true;
      return {error:null};
    },
    signOut: async () => {loggedIn=false;return {error:null};},
    signInWithOtp: async ({email,options}) => {
      if (options?.shouldCreateUser !== false || !options?.emailRedirectTo?.endsWith('/admin.html'))
        return {error:{message:'Invalid magic-link options'}};
      return {error:null};
    }
    // Deliberately no auth.mfa property. Calling MFA APIs must fail this test.
  }};
}
"""

def test():
    server = ThreadingHTTPServer(("127.0.0.1", 0),
        partial(SimpleHTTPRequestHandler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            for engine in os.environ.get("CAKES_TEST_BROWSERS", "chromium,webkit").split(","):
                browser = getattr(pw,engine).launch(**(
                    {"channel":"chrome"} if engine=="chromium" and os.environ.get("CAKES_USE_SYSTEM_CHROME")=="1" else {}
                ))
                try:
                    for permitted in (True,False):
                        page=browser.new_page()
                        failures=[]
                        page.on("pageerror",lambda error:failures.append(str(error)))
                        page.route("https://esm.sh/**",lambda route:route.fulfill(
                            status=200,content_type="application/javascript",
                            headers={"Access-Control-Allow-Origin":"*"},body=AUTH_MOCK))
                        def api_response(route):
                            body=json.loads(route.request.post_data or "{}")
                            if not permitted and body.get('action') == 'list':
                                route.fulfill(status=403,content_type="application/json",
                                    headers={"Access-Control-Allow-Origin":"*"},
                                    body=json.dumps({"error":"Not authorised"}))
                            else:
                                data=FAKE_LIST if body.get("action")=="list" else {
                                    "statistics":{"periods":[],"monthly":[]}}
                                route.fulfill(status=200,content_type="application/json",
                                    headers={"Access-Control-Allow-Origin":"*"},body=json.dumps(data))
                        page.route("**/functions/v1/manage-enquiries",api_response)
                        page.goto(f"http://127.0.0.1:{server.server_port}/admin.html",wait_until="load")
                        expect(page.locator("#admin-login")).to_be_visible()
                        expect(page.locator("#admin-dashboard")).to_be_hidden()
                        assert page.locator("#admin-mfa").count()==0
                        expect(page.locator("#admin-magic-link")).to_be_visible()
                        page.locator("#admin-magic-email").fill("owner@example.invalid")
                        page.get_by_role("button",name="Email me a sign-in link").click()
                        expect(page.locator("#admin-status")).to_contain_text("one-time sign-in link")
                        expect(page.locator("#admin-dashboard")).to_be_hidden()
                        page.locator("#admin-email").fill("owner@example.invalid")
                        page.locator("#admin-password").fill("test-only-password")
                        page.get_by_role("button",name="Sign in securely").click()
                        if permitted:
                            expect(page.locator("#admin-dashboard")).to_be_visible()
                            expect(page.locator("#admin-login")).to_be_hidden()
                            expect(page.locator("#admin-magic-link")).to_be_hidden()
                            expect(page.locator(".admin-record-summary")).to_have_count(1)
                            page.locator("#admin-signout").click()
                            expect(page.locator("#admin-login")).to_be_visible()
                            expect(page.locator("#admin-magic-link")).to_be_visible()
                            expect(page.locator("#admin-dashboard")).to_be_hidden()
                        else:
                            expect(page.locator("#admin-login")).to_be_visible()
                            expect(page.locator("#admin-dashboard")).to_be_hidden()
                            expect(page.locator("#admin-status")).to_contain_text("Not authorised")
                        assert not failures,(engine,permitted,failures)
                        page.close()
                    print(f"PASS {engine}: password and magic-link paths without MFA; invalid admin denied")
                finally:
                    browser.close()
    finally:
        server.shutdown()

if __name__ == "__main__":
    test()
