import unittest
from guardian.guardian_python_assembly import assemble_guardian_python_adapter,reject_raw_driver_assembly,GuardianAssemblyError

class AssemblyTests(unittest.TestCase):
 def test_single_public_shape(self):
  a=assemble_guardian_python_adapter(observe=lambda:"o",compose=lambda x:x,capture=lambda:"c",guardian_send=lambda x:"g:"+x)
  self.assertEqual(a.send("x"),"g:x")
  for n in ("driver","surface","page","raw_send","click_send_once","send_once_evidence"): self.assertFalse(hasattr(a,n))
 def test_raw_driver_assembly_is_rejected(self):
  with self.assertRaises(GuardianAssemblyError):
   reject_raw_driver_assembly(observe=lambda:1,compose=lambda x:x,capture=lambda:2,guardian_send=lambda x:x,driver=object())
 def test_guardian_send_is_mandatory(self):
  with self.assertRaises(GuardianAssemblyError):
   assemble_guardian_python_adapter(observe=lambda:1,compose=lambda x:x,capture=lambda:2,guardian_send=None)
 def test_slots_block_second_assembly_port_injection(self):
  a=assemble_guardian_python_adapter(observe=lambda:1,compose=lambda x:x,capture=lambda:2,guardian_send=lambda x:x)
  with self.assertRaises(AttributeError): a.driver=object()

if __name__=="__main__": unittest.main()
