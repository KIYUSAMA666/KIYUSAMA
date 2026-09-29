"""Human-assisted refresh for Browserless profile kira-external.

Starts a Browserless profile creation session, emits a LiveURL, waits for the
fixed Claude conversation to expose its composer, then saves the authenticated
state back under the same profile name. It never sends a Claude message.
"""
import os
import time
import requests
from playwright.sync_api import sync_playwright

ORIGIN = "https://production-sfo.browserless.io"
PROFILE = "kira-external"
TARGET = "https://claude.ai/chat/b2ed0bb2-82f9-4d4e-8fe8-5626023086dc"


def main():
    token = os.environ["BROWSERLESS_API_KEY"]
    response = requests.post(
        f"{ORIGIN}/profile",
        params={"token": token, "timeout": 300000},
        json={"name": PROFILE},
        timeout=30,
    )
    response.raise_for_status()
    session = response.json()
    connect = session["connect"]

    with sync_playwright() as p:
        browser = p.chromium.connect_over_cdp(connect)
        context = browser.contexts()[0]
        page = context.pages[0] if context.pages else context.new_page()
        cdp = context.new_cdp_session(page)
        live = cdp.send("Browserless.liveURL", {"timeout": 240000})
        print(f"LIVE_URL={live['liveURL']}", flush=True)
        print("WAITING_FOR_HUMAN_AUTH=true", flush=True)

        page.goto(TARGET, wait_until="domcontentloaded", timeout=90000)
        deadline = time.time() + 220
        while time.time() < deadline:
            if page.url == TARGET:
                composer = page.locator('[data-testid="chat-input"]')
                if composer.count() == 1 and composer.is_visible():
                    result = cdp.send("Browserless.saveProfile", {"name": PROFILE})
                    print(f"PROFILE_SAVED={bool(result.get('ok'))}", flush=True)
                    print(f"COOKIE_COUNT={result.get('cookieCount')}", flush=True)
                    print(f"ORIGIN_COUNT={result.get('originCount')}", flush=True)
                    print("SEND_COUNT=0", flush=True)
                    browser.close()
                    return
            page.wait_for_timeout(1000)
        print(f"FINAL_URL={page.url}", flush=True)
        print(f"TITLE={page.title()!r}", flush=True)
        print("PROFILE_SAVED=false", flush=True)
        print("SEND_COUNT=0", flush=True)
        browser.close()
        raise SystemExit("AUTH_REFRESH_TIMEOUT")


if __name__ == "__main__":
    main()
