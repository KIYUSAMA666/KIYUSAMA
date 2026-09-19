# KIYUSAMA REMEMBER — LIVE TEST

## Claude Code phase
Use the connected mcp-memory MCP tools.
1. Call session_identify.
2. Search first for MEMORY_TEST_001.
3. Write exactly this persistent memory with memory_create:
   MEMORY_TEST_001 = 青い傘を倉庫Bへ移した
4. Read it back from mcp-memory.
5. Reply only after the tool result confirms the exact Japanese text.

Do not write this test fact to a Claude-specific memory store.
