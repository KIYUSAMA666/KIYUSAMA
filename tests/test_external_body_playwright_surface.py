import hashlib, unittest
from external_body_playwright_surface import PlaywrightClaudeSurface

class Locator:
    def __init__(self, items): self.items=items
    def count(self): return len(self.items)
    def is_visible(self): return True
    def nth(self,i): return Locator([self.items[i]])
    def inner_text(self): return self.items[0] if self.items else ""
    def fill(self,v): self.items[:] = [v]
    def click(self): pass

class Page:
    def __init__(self):
        self.url="https://claude.ai/chat/cid"; self.draft=[""]; self.users=[]; self.assist=["a0"]
    def locator(self,s):
        if s=='[data-testid="chat-input"]': return Locator(self.draft)
        if s=='[data-testid="user-message"]': return Locator(self.users)
        return Locator(self.assist)
    def get_by_role(self,*a,**k): return Locator([])
    def wait_for_function(self,*a,**k): pass

class TestSurface(unittest.TestCase):
    def test_read_only_state_and_compose_digest(self):
        p=Page(); s=PlaywrightClaudeSurface(p)
        self.assertEqual(s.page_state(),(p.url,True,True))
        payload="CANARY OP-1"; d=hashlib.sha256(payload.encode()).hexdigest()
        s.compose_exact(payload,d); self.assertEqual(p.draft[0],payload)
    def test_no_auth_secret_api(self):
        s=PlaywrightClaudeSurface(Page())
        self.assertFalse(any(x in dir(s) for x in ("cookies","storage_state","token","credentials")))

if __name__=="__main__": unittest.main()
