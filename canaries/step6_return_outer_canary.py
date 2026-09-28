#!/usr/bin/env python3
"""STEP6 outer-shell canary. No login, network, SEND, cookies or credentials."""
from dataclasses import dataclass

@dataclass(frozen=True)
class ActorBinding:
    actor_id: str
    conversation_id: str

def exact_url(binding):
    return f"https://chatgpt.com/c/{binding.conversation_id}"

def resolve_tab(open_urls, binding):
    target = exact_url(binding)
    matches = [u for u in open_urls if u == target]
    if len(matches) != 1:
        raise RuntimeError(f"EXACT_TAB_RESOLUTION_FAIL matches={len(matches)}")
    return matches[0]

def verify_receipt(before_turns, after_turns, expected_actor):
    new = [t for t in after_turns if t not in before_turns]
    ok = len(new) == 1 and new[0].get("actor_id") == expected_actor and new[0].get("role") == "assistant"
    if not ok:
        raise RuntimeError("DELIVERY_READBACK_FAIL")
    return new[0]

if __name__ == "__main__":
    b=ActorBinding("SORA_03","CANARY-CONVERSATION-ID")
    stale="https://chatgpt.com/c/STALE-ID"
    live=exact_url(b)
    assert resolve_tab([stale,live],b)==live
    receipt=verify_receipt([], [{"turn_id":"T1","actor_id":"SORA_03","role":"assistant"}], "SORA_03")
    print("OUTER_CANARY_PASS=true")
    print("STALE_TAB_REJECTED=true")
    print("EXACT_URL_REBOUND=true")
    print("READBACK_RECEIPT_PASS=true")
    print("NETWORK_USED=false")
    print("AUTH_USED=false")
    print("SEND_USED=false")
