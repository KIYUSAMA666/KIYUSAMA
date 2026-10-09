"""Single Python assembly entrance for Guardian external-body integration.

No raw driver/surface is accepted. The caller supplies only non-effectful
observe/compose/capture functions plus a Guardian-owned send capability.
"""
from .external_body_python_boundary import NonEffectfulLegacyAdapter, assert_non_effectful_adapter

class GuardianAssemblyError(RuntimeError):
    pass

class GuardianPythonAdapter:
    __slots__=("_legacy","_guardian_send")
    def __init__(self, *, legacy, guardian_send):
        assert_non_effectful_adapter(legacy)
        if not callable(guardian_send):
            raise GuardianAssemblyError("GUARDIAN_SEND_CAPABILITY_REQUIRED")
        self._legacy=legacy
        self._guardian_send=guardian_send
    def observe(self,*a,**k): return self._legacy.observe(*a,**k)
    def compose(self,*a,**k): return self._legacy.compose(*a,**k)
    def capture(self,*a,**k): return self._legacy.capture(*a,**k)
    def send(self,payload): return self._guardian_send(payload)

def assemble_guardian_python_adapter(*, observe, compose, capture, guardian_send):
    legacy=NonEffectfulLegacyAdapter(observe=observe,compose=compose,capture=capture)
    return GuardianPythonAdapter(legacy=legacy,guardian_send=guardian_send)

def reject_raw_driver_assembly(**kwargs):
    forbidden={"driver","surface","page","raw_send","click_send_once","send_once_evidence"}
    bad=sorted(forbidden & set(kwargs))
    if bad: raise GuardianAssemblyError("RAW_DRIVER_ASSEMBLY_FORBIDDEN:"+",".join(bad))
    return assemble_guardian_python_adapter(**kwargs)
