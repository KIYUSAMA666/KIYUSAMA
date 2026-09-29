"""Persistent-profile launcher for ASTRA7 external KIRA BODY.

This module intentionally owns only browser/profile materialization.
It never reads, exports, serializes, or logs cookies/tokens/storage state.
It never composes or sends a message. Effectful SEND remains exclusively in
the existing ClaudeGuardedDriver / PlaywrightClaudeSurface path.
"""

def launch_existing_profile(playwright, profile_path, *, headless=False, channel=None):
    if not profile_path:
        raise ValueError("PROFILE_PATH_REQUIRED")
    kwargs = {"user_data_dir": profile_path, "headless": headless}
    if channel:
        kwargs["channel"] = channel
    context = playwright.chromium.launch_persistent_context(**kwargs)
    pages = context.pages
    page = pages[0] if pages else context.new_page()
    return context, page


def bind_existing_context(browser):
    """Bind a retained cloud browser's existing/default context.

    Fail closed instead of creating a fresh context, because a fresh context
    may not inherit the retained authenticated profile.
    """
    contexts = browser.contexts
    if len(contexts) != 1:
        raise RuntimeError("EXACT_EXISTING_CONTEXT_REQUIRED")
    context = contexts[0]
    pages = context.pages
    page = pages[0] if pages else context.new_page()
    return context, page
