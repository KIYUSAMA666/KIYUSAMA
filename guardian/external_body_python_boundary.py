"""Guardian-owned legacy external-body assembly.

The legacy Python adapter is deliberately non-effectful here: it may observe,
compose and capture evidence, but receives no click_send_once/raw Send method.
The only effectful hook is a private closure handed to Guardian wiring.
"""

class RawSendAuthorityError(RuntimeError):
    pass

FORBIDDEN_PUBLIC_SEND_NAMES = frozenset({
    "click_send_once", "send_once_evidence", "raw_send", "rawSend",
    "page", "driver", "surface",
})

def assert_non_effectful_adapter(adapter) -> None:
    exposed = set(dir(adapter))
    bad = sorted(FORBIDDEN_PUBLIC_SEND_NAMES & exposed)
    if bad:
        raise RawSendAuthorityError("RAW_SEND_AUTHORITY_EXPOSED:" + ",".join(bad))

class NonEffectfulLegacyAdapter:
    __slots__ = ("_observe", "_compose", "_capture")

    def __init__(self, *, observe, compose, capture):
        self._observe = observe
        self._compose = compose
        self._capture = capture
        assert_non_effectful_adapter(self)

    def observe(self, *args, **kwargs):
        return self._observe(*args, **kwargs)

    def compose(self, *args, **kwargs):
        return self._compose(*args, **kwargs)

    def capture(self, *args, **kwargs):
        return self._capture(*args, **kwargs)

def guardian_effectful_click_factory(legacy_click):
    """Capture the old effectful click privately; never attach it to adapter."""
    if not callable(legacy_click):
        raise TypeError("legacy_click required")
    def guardian_owned_effectful_click(*args, **kwargs):
        return legacy_click(*args, **kwargs)
    return guardian_owned_effectful_click
