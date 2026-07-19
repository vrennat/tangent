/**
 * Import this FIRST in every sim entrypoint that reaches Wikipedia.
 *
 * wikipedia/client.ts reads TANGENT_UA once at module evaluation; ES import
 * order guarantees this file runs before it. Without the stamp, a heavy sim
 * run wears production's User-Agent — and Wikimedia throttles per-UA, so a
 * bare 660-journey run took prod's /api/links down on 2026-07-19. Never again.
 */
process.env.TANGENT_UA ??= 'Tangent-sim/0.1 (tannervass@gmail.com)';
