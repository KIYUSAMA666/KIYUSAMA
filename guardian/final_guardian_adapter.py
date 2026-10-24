"""Final public Guardian adapter assembly.

SEND and RETURN are injected only as Guardian-owned capabilities. No raw SEND
or RESULT_COMMIT authority is accepted or exposed by this assembly.
"""
class FinalGuardianAssemblyError(RuntimeError): pass

_FORBIDDEN={
 "driver","surface","page","raw_send","click_send_once","send_once_evidence",
 "rawResultCommit","commitReturnResult","effectfulResultCommit","ledger",
 "guardianReturn","captureReturn",
}

class FinalGuardianAdapter:
 __slots__=("_observe","_compose","_guardian_send","_guardian_capture")
 def __init__(self,*,observe,compose,guardian_send,guardian_capture):
  if not callable(guardian_send): raise FinalGuardianAssemblyError("GUARDIAN_SEND_REQUIRED")
  if not callable(guardian_capture): raise FinalGuardianAssemblyError("GUARDIAN_RETURN_REQUIRED")
  self._observe=observe; self._compose=compose
  self._guardian_send=guardian_send; self._guardian_capture=guardian_capture
 def observe(self,*a,**k): return self._observe(*a,**k)
 def compose(self,*a,**k): return self._compose(*a,**k)
 def send(self,*a,**k): return self._guardian_send(*a,**k)
 def capture(self,*a,**k): return self._guardian_capture(*a,**k)

def assemble_final_guardian_adapter(*,observe,compose,guardian_send,guardian_capture,**kwargs):
 bad=sorted(_FORBIDDEN & set(kwargs))
 if bad: raise FinalGuardianAssemblyError("RAW_AUTHORITY_FORBIDDEN:"+",".join(bad))
 return FinalGuardianAdapter(observe=observe,compose=compose,guardian_send=guardian_send,guardian_capture=guardian_capture)

def assert_final_public_surface(adapter):
 bad=sorted(k for k in _FORBIDDEN if hasattr(adapter,k))
 if bad: raise FinalGuardianAssemblyError("RAW_AUTHORITY_EXPOSED:"+",".join(bad))
 return True
