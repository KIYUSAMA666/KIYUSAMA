import unittest
from guardian.external_body_python_boundary import (
    NonEffectfulLegacyAdapter, assert_non_effectful_adapter,
    guardian_effectful_click_factory, RawSendAuthorityError,
)

class PythonBoundaryTests(unittest.TestCase):
    def test_public_adapter_has_no_raw_send_authority(self):
        a=NonEffectfulLegacyAdapter(observe=lambda:1,compose=lambda x:x,capture=lambda:2)
        for name in ("click_send_once","send_once_evidence","raw_send","rawSend","page","driver","surface"):
            self.assertFalse(hasattr(a,name))
        assert_non_effectful_adapter(a)

    def test_effectful_click_is_not_attached_to_adapter(self):
        calls=[]
        raw=guardian_effectful_click_factory(lambda x:calls.append(x) or "ok")
        a=NonEffectfulLegacyAdapter(observe=lambda:1,compose=lambda x:x,capture=lambda:2)
        self.assertFalse(hasattr(a,"raw"))
        self.assertEqual(calls,[])
        self.assertEqual(raw("x"),"ok")
        self.assertEqual(calls,["x"])

    def test_static_guard_rejects_old_driver_shape(self):
        class Old:
            def click_send_once(self): pass
        with self.assertRaises(RawSendAuthorityError):
            assert_non_effectful_adapter(Old())

    def test_slots_prevent_reintroducing_raw_send(self):
        a=NonEffectfulLegacyAdapter(observe=lambda:1,compose=lambda x:x,capture=lambda:2)
        with self.assertRaises(AttributeError):
            a.click_send_once=lambda:None

if __name__=="__main__": unittest.main()
