"""Browserless retained-profile connector for ASTRA7 external KIRA BODY.

Connection/materialization only. The API token is supplied by the runtime
secret store and is never returned, logged, persisted, or exposed. The saved
profile is loaded into Browserless default context. This module never sends.
"""
from urllib.parse import urlencode

from external_body_profile_launcher import bind_existing_context

DEFAULT_ORIGIN = "production-sfo.browserless.io"


def browserless_profile_ws(token, *, profile="kira-external", origin=DEFAULT_ORIGIN):
    if not token:
        raise ValueError("BROWSERLESS_TOKEN_REQUIRED")
    if not profile:
        raise ValueError("BROWSERLESS_PROFILE_REQUIRED")
    query = urlencode({"token": token, "profile": profile})
    return f"wss://{origin}/chromium?{query}"


def connect_saved_profile(playwright, token, *, profile="kira-external", origin=DEFAULT_ORIGIN):
    """Connect to a fresh Browserless browser with an existing saved profile."""
    ws = browserless_profile_ws(token, profile=profile, origin=origin)
    browser = playwright.chromium.connect_over_cdp(ws)
    context, page = bind_existing_context(browser)
    return browser, context, page
