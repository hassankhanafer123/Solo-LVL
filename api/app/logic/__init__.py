"""Pure game logic, ported 1:1 from the TypeScript `lib/` modules.

Every function here is pure (no DB, no I/O) and mirrors a function in the
original Next.js app so behaviour stays identical. The pytest suite in
`api/tests/` mirrors the original vitest tests to prove parity.
"""
