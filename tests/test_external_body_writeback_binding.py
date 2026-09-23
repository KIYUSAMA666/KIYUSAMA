import unittest
from hashlib import sha256
from external_body_adapter import Binding, Operation, State, GuardViolation
from external_body_writeback_binding import CapturedResponseReceipt, bind_capture_to_writeback

class WriteBackBindingTests(unittest.TestCase):
    def setUp(self):
        self.b=Binding("chatgpt","c-1","https://chatgpt.com/c/c-1","space-1","h0",7)
        self.op=Operation("evt-1","sha256:x","OP-1",self.b,state=State.CAPTURED)
        text="external SORA result"
        self.r=CapturedResponseReceipt("wf-1","OP-1","evt-1",self.b.canonical_url,"OP-1","u1","a1","sha256:"+sha256(text.encode()).hexdigest(),text)
    def test_exact_receipt_binds_deterministically(self):
        a=bind_capture_to_writeback(self.op,self.r,parent_subject_key="open-room.task.1")
        b=bind_capture_to_writeback(self.op,self.r,parent_subject_key="open-room.task.1")
        self.assertEqual(a,b); self.assertEqual(a.operation_key,b.operation_key)
    def test_same_receipt_changed_parent_is_distinct_operation(self):
        a=bind_capture_to_writeback(self.op,self.r,parent_subject_key="open-room.task.1")
        b=bind_capture_to_writeback(self.op,self.r,parent_subject_key="open-room.task.2")
        self.assertNotEqual(a.operation_key,b.operation_key)
    def test_not_captured_cannot_write_back(self):
        with self.assertRaises(GuardViolation): bind_capture_to_writeback(Operation("evt-1","sha256:x","OP-1",self.b,state=State.SEND_CONFIRMED),self.r,parent_subject_key="open-room.task.1")
    def test_wrong_conversation_fails_closed(self):
        r=CapturedResponseReceipt(**{**self.r.__dict__,"canonical_url":"https://chatgpt.com/c/other"})
        with self.assertRaises(GuardViolation): bind_capture_to_writeback(self.op,r,parent_subject_key="open-room.task.1")
    def test_wrong_operation_identity_fails_closed(self):
        r=CapturedResponseReceipt(**{**self.r.__dict__,"operation_id":"OP-X"})
        with self.assertRaises(GuardViolation): bind_capture_to_writeback(self.op,r,parent_subject_key="open-room.task.1")
    def test_tampered_response_fails_digest_check(self):
        r=CapturedResponseReceipt(**{**self.r.__dict__,"response_text":"tampered"})
        with self.assertRaises(GuardViolation): bind_capture_to_writeback(self.op,r,parent_subject_key="open-room.task.1")
    def test_prompt_response_identity_collision_fails(self):
        r=CapturedResponseReceipt(**{**self.r.__dict__,"response_message_id":"u1"})
        with self.assertRaises(GuardViolation): bind_capture_to_writeback(self.op,r,parent_subject_key="open-room.task.1")

if __name__=="__main__": unittest.main()
