/**
 * REM-INV-2R — F-01 DDL FINALIZATION — PERMANENT RETIREMENT PIN (absence test)
 *
 * receive_purchase(uuid) was DROPPED from the database by gate REM-INV-2R
 * (REVOKE EXECUTE + DROP FUNCTION, no CASCADE). The canonical reception path is:
 *
 *   receive_against_po → register_reception → receipts / stock / WAC / audit
 *
 * This test must FAIL if anyone accidentally reintroduces the V1 function:
 *   - a call site in live application code (src/), or
 *   - a migration recreating the function (supabase/).
 *
 * Allowed occurrences are ONLY the permanent retirement pins themselves.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const FORBIDDEN = 'receive_purchase';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'supabase'];

/** Files that document/enforce the retirement itself (allowed to mention it). */
const ALLOWED_PINS = [
  join('src', '__tests__', 'integration', 'rem-inv-2-dynamic-reachability.test.ts'),
  join('src', '__tests__', 'integration', 'rem-inv-2r-receive-purchase-retirement.test.ts'),
];

const TEXT_EXT = /\.(ts|tsx|js|jsx|cjs|mjs|sql|json|md|txt)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === '.next') continue;
      walk(full, out);
    } else if (st.isFile() && TEXT_EXT.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function scanLiveReferences(): string[] {
  const offenders: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    let files: string[] = [];
    try { files = walk(abs); } catch { continue; /* dir absent in some envs */ }
    for (const f of files) {
      const rel = f.slice(ROOT.length + 1);
      if (ALLOWED_PINS.some((p) => rel === p || rel === p.split(sep).join(sep))) continue;
      let text: string;
      try { text = readFileSync(f, 'utf8'); } catch { continue; }
      if (text.includes(FORBIDDEN)) offenders.push(rel);
    }
  }
  return offenders;
}

describe('REM-INV-2R — receive_purchase(uuid) retirement pin', () => {
  it('no live source or migration references receive_purchase (V1 reception retired)', () => {
    const offenders = scanLiveReferences();
    expect(
      offenders,
      `receive_purchase reintroduced in: ${offenders.join(', ')}. ` +
        'The V1 reception RPC was retired by REM-INV-2R (DROP, no CASCADE). ' +
        'Use the canonical path: receive_against_po → register_reception.',
    ).toEqual([]);
  });

  it('retirement pins remain in place (protection not removed)', () => {
    for (const pin of ALLOWED_PINS) {
      let text: string | null = null;
      try { text = readFileSync(join(ROOT, pin), 'utf8'); } catch { /* missing */ }
      expect(text, `retirement pin missing: ${pin}`).not.toBeNull();
      expect(text!.includes(FORBIDDEN) || pin.includes('2r'), `pin does not reference the retired RPC: ${pin}`).toBe(true);
    }
  });
});
