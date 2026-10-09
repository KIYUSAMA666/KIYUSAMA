import unittest
from guardian.final_guardian_adapter import assemble_final_guardian_adapter,assert_final_public_surface,FinalGuardianAssemblyError
class FinalTests(unittest.TestCase):
 def make(self):
  return assemble_final_guardian_adapter(observe=lambda:"o",compose=lambda x:x,guardian_send=lambda x:"s:"+x,guardian_capture=lambda:"r")
 def test_public_surface_has_guarded_send_and_return_only(self):
  a=self.make(); self.assertEqual(a.send("x"),"s:x"); self.assertEqual(a.capture(),"r"); self.assertTrue(assert_final_public_surface(a))
  for n in ("raw_send","click_send_once","rawResultCommit","commitReturnResult","ledger","driver","surface","page"): self.assertFalse(hasattr(a,n))
 def test_raw_send_assembly_is_rejected(self):
  with self.assertRaises(FinalGuardianAssemblyError):
   assemble_final_guardian_adapter(observe=lambda:1,compose=lambda x:x,guardian_send=lambda x:x,guardian_capture=lambda:1,raw_send=lambda:None)
 def test_raw_result_commit_assembly_is_rejected(self):
  with self.assertRaises(FinalGuardianAssemblyError):
   assemble_final_guardian_adapter(observe=lambda:1,compose=lambda x:x,guardian_send=lambda x:x,guardian_capture=lambda:1,rawResultCommit=lambda:None)
 def test_both_guardian_capabilities_are_mandatory(self):
  with self.assertRaises(FinalGuardianAssemblyError): assemble_final_guardian_adapter(observe=lambda:1,compose=lambda x:x,guardian_send=None,guardian_capture=lambda:1)
  with self.assertRaises(FinalGuardianAssemblyError): assemble_final_guardian_adapter(observe=lambda:1,compose=lambda x:x,guardian_send=lambda x:x,guardian_capture=None)
 def test_slots_block_late_raw_authority_injection(self):
  a=self.make()
  with self.assertRaises(AttributeError): a.rawResultCommit=lambda:None
  with self.assertRaises(AttributeError): a.driver=object()
if __name__=="__main__": unittest.main()
