# STEP6 exact-return outer canary

Deliberately attacks only the replaceable outer shell.

Tests:
1. exact conversation URL binding;
2. stale-tab rejection and URL-based re-resolution;
3. duplicate/missing exact tab = FAIL, never guess;
4. assistant receipt must bind to expected actor;
5. actor mismatch = FAIL.

This canary performs no network request, login, credential handling, private endpoint call, or SEND. It does not modify STEP1-5 or the fixed KIRA target. It exists to make failure coordinates reproducible before any effectful canary.
