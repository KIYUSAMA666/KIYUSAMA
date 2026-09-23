"""Runtime boundary for the real external Claude body.

The browser remains on the trusted local device, already authenticated to
claude.ai. A remote worker may address it only through a loopback-bound bridge
or an authenticated private tunnel terminating at loopback. No cookies,
credentials, or public unauthenticated browser-control endpoint are accepted.
"""
from dataclasses import dataclass
from urllib.parse import urlparse
from external_body_adapter import GuardViolation

@dataclass(frozen=True)
class BrowserRuntimeEndpoint:
    bridge_url: str
    transport: str
    authenticated_tunnel: bool
    browser_local: bool
    credentials_exported: bool = False

def validate_runtime_endpoint(ep: BrowserRuntimeEndpoint) -> None:
    u=urlparse(ep.bridge_url)
    if u.scheme not in ("http","https","ws","wss"):
        raise GuardViolation("unsupported browser bridge scheme")
    if u.hostname not in ("127.0.0.1","localhost","::1"):
        raise GuardViolation("browser bridge must terminate on loopback")
    if not ep.browser_local:
        raise GuardViolation("authenticated browser must remain local")
    if ep.credentials_exported:
        raise GuardViolation("browser credentials must never be exported")
    if ep.transport not in ("local","ssh-reverse"):
        raise GuardViolation("unapproved browser bridge transport")
    if ep.transport=="ssh-reverse" and not ep.authenticated_tunnel:
        raise GuardViolation("remote browser orchestration requires authenticated tunnel")

def runtime_ready(ep: BrowserRuntimeEndpoint, *, daemon_reachable: bool, extension_connected: bool, exact_tab_bound: bool) -> bool:
    validate_runtime_endpoint(ep)
    return daemon_reachable and extension_connected and exact_tab_bound
