"""Playwright-page adapter for the existing external KIRA guarded body.

The caller owns browser authentication/profile materialization. This adapter
never reads/exports cookies, tokens, storage state, or credentials. It binds an
already-authenticated existing Playwright Page to ClaudeBrowserSurface.

World requirement for retained cloud profiles: callers must reuse the browser's
existing/default context (browser.contexts[0]); do not create a fresh context.
"""
import hashlib
from external_body_transport import SendEvidence, ResponseObservation
from external_body_claude_provider import (
    CLAUDE_COMPOSER_SELECTOR,
    CLAUDE_USER_MESSAGE_SELECTOR,
    CLAUDE_ASSISTANT_MESSAGE_SELECTOR,
)

class PlaywrightClaudeSurface:
    def __init__(self, page):
        self.page = page
        self._payload_digest = None

    def page_state(self):
        url = self.page.url
        composer = self.page.locator(CLAUDE_COMPOSER_SELECTOR)
        composer_visible = composer.count() == 1 and composer.is_visible()
        # No credential/session extraction: authenticated is inferred only from
        # the effectful UI surface required by the existing provider contract.
        logged_in = url.startswith("https://claude.ai/chat/") and composer_visible
        return url, logged_in, composer_visible

    def _messages(self):
        users = self.page.locator(CLAUDE_USER_MESSAGE_SELECTOR)
        assistants = self.page.locator(CLAUDE_ASSISTANT_MESSAGE_SELECTOR)
        return users, assistants

    def head_fingerprint(self):
        users, assistants = self._messages()
        tail = []
        for loc in (users, assistants):
            n = loc.count()
            if n:
                tail.append(loc.nth(n - 1).inner_text())
        return hashlib.sha256("\n".join(tail).encode()).hexdigest()

    def draft_empty(self):
        return not self.page.locator(CLAUDE_COMPOSER_SELECTOR).inner_text().strip()

    def generation_idle(self):
        # Fail closed when Claude exposes an active stop-generation control.
        return self.page.get_by_role("button", name="Stop response").count() == 0

    def compose_exact(self, payload, payload_digest):
        if hashlib.sha256(payload.encode()).hexdigest() != payload_digest:
            raise RuntimeError("PAYLOAD_DIGEST_MISMATCH")
        composer = self.page.locator(CLAUDE_COMPOSER_SELECTOR)
        composer.fill(payload)
        if composer.inner_text() != payload:
            raise RuntimeError("COMPOSE_VERIFY_FAIL")
        self._payload_digest = payload_digest

    def send_once_evidence(self, marker):
        before = self.page.locator(CLAUDE_USER_MESSAGE_SELECTOR).count()
        composer = self.page.locator(CLAUDE_COMPOSER_SELECTOR)
        self.page.get_by_role("button", name="Send message").click()
        self.page.wait_for_function(
            "(n)=>document.querySelectorAll('[data-testid=\"user-message\"]').length===n+1",
            before,
        )
        users = self.page.locator(CLAUDE_USER_MESSAGE_SELECTOR)
        committed = [users.nth(i).inner_text() for i in range(users.count())]
        draft = composer.inner_text()
        return SendEvidence(
            True, self.page.url,
            sum(marker in x for x in committed) + (1 if marker in draft else 0),
            sum(marker in x for x in committed),
            1 if marker in draft else 0,
        )

    def response_evidence(self, marker):
        users, assistants = self._messages()
        user_texts = [users.nth(i).inner_text() for i in range(users.count())]
        assistant_texts = [assistants.nth(i).inner_text() for i in range(assistants.count())]
        prompt_hits = [i for i,x in enumerate(user_texts) if marker in x]
        rendered_hits = [i for i,x in enumerate(assistant_texts) if marker in x]
        stable = bool(prompt_hits and rendered_hits)
        prior = hashlib.sha256("\n".join(user_texts[:-1] + assistant_texts[:-1]).encode()).hexdigest()
        new = self.head_fingerprint()
        return ResponseObservation(
            prior,new,bool(rendered_hits),stable,self.page.url,
            2 if stable else 0,"user" if prompt_hits else None,
            "assistant" if rendered_hits else None,
            len(prompt_hits),len(rendered_hits),
            f"user:{prompt_hits[-1]}" if prompt_hits else None,
            f"assistant:{rendered_hits[-1]}" if rendered_hits else None,
        )
