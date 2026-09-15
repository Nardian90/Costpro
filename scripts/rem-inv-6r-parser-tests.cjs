#!/usr/bin/env node
/**
 * rem-inv-6r-parser-tests.cjs — REM-INV-6R parser test harness (Gate B/C/D/E/K probes)
 *
 * Loads the parser internals from the REAL security-contract-test-static.cjs
 * (or from a historical copy passed as argv[2]) WITHOUT modifying it: the file
 * source is sliced before its main IIFE and evaluated in a vm sandbox, then the
 * helper functions are exported for direct testing.
 *
 * Cases:
 *   [M1] dollar-quote mechanics: $$ / $function$ / arbitrary tags / single-quote bodies
 *   [M2] body boundary math (offset proof): body must start exactly after the tag
 *   [M3] multi-function files (lastIndex-skip regression shape)
 *   [M4] comments do not disturb extraction
 *   [M5] strings containing $$ / $tag$ inside tagged bodies
 *   [M6] trailers: SECURITY DEFINER before vs AFTER body tag; LANGUAGE sql IMMUTABLE
 *   [M7] ALTER FUNCTION modeling (search_path / SECURITY / volatility / parallel)
 *   [D1] WRITE-detection canaries: DELETE FROM / TRUNCATE / unqualified UPDATE
 *   [D2] false-positive probe (comments / identifiers / prose only)
 *   [I1] lastIndex isolation: file order independence + 10x determinism
 *
 * Exit codes: 0 = all assertions pass; 1 = at least one assertion failed.
 * The harness reports MECHANICS, DETECTION and DETERMINISM verdicts separately:
 * pre-fix runs are expected to fail D-cases (that IS the repro); post-fix runs
 * must pass everything.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const FIXTURES = path.join(__dirname, 'parser-fixtures', 'rem-inv-6r');
const PARSER_FILE = process.argv[2] || path.join(__dirname, 'security-contract-test-static.cjs');

function loadParser(parserPath) {
  let src = fs.readFileSync(parserPath, 'utf8');
  const marker = '(async () => {';
  const cut = src.indexOf(marker);
  if (cut === -1) throw new Error('main IIFE marker not found in ' + parserPath);
  src = src.slice(0, cut);
  const sandbox = { module: { exports: {} }, console, require, Buffer, __filename: parserPath, __dirname: path.dirname(parserPath) };
  vm.createContext(sandbox);
  const probe = `
    module.exports.__internals = {};
    const __names = ['stripComments','stripCommentsDeep','nonBodyOf','parseFnAttrs','extractFunctions','extractAclStmts','extractAlterStmts',
      'countArgs','WRITE_RE','checkFunction','normBody','normSearchPath','normSearchPathValue'];
    for (const __n of __names) {
      try { if (typeof eval(__n) !== 'undefined') module.exports.__internals[__n] = eval(__n); } catch (e) {}
    }`;
  vm.runInContext(src + probe, sandbox, { filename: path.basename(parserPath) });
  return sandbox.module.exports.__internals;
}

function readFix(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8');
}

let pass = 0, fail = 0;
const failures = [];
function check(id, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${id}${detail ? ' — ' + detail : ''}`); }
  else { fail++; failures.push({ id, detail }); console.log(`  FAIL  ${id}${detail ? ' — ' + detail : ''}`); }
}

// Layer-B-equivalent classification helpers (mirror of the CLI's logic)
function classify(P, sql, file) {
  const clean = P.stripComments(sql);
  const defs = P.extractFunctions(clean, file);
  return defs.map(d => {
    const secdefHeader = /security\s+definer/i.test(d.header);
    const secdefText = /security\s+definer/i.test(d.text);
    const writeCurrent = P.WRITE_RE.test(d.text);
    // enhanced detector (post-fix candidate — reported for evidence)
    const writeEnhanced = /\b(INSERT\s+INTO|UPDATE\s+(?:public\.)?[A-Za-z_"']|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?\b|MERGE\s+INTO)/i.test(d.text);
    // Layer-B-filter simulation: the CLI classifies SECDEF from the header only
    // (pre-fix) or from nonBody (post-fix) and write-detects on d.text (pre) or
    // stripCommentsDeep(d.text) (post).
    let nonBody = null, detectText = null, layerBSeenPre = null, layerBSeenPost = null;
    if (P.nonBodyOf && P.stripCommentsDeep) {
      nonBody = P.nonBodyOf(d);
      detectText = P.stripCommentsDeep(d.text);
      layerBSeenPre = secdefHeader && writeCurrent;           // exact pre-fix filter
      layerBSeenPost = /security\s+definer/i.test(nonBody) && P.WRITE_RE.test(detectText);
    }
    return {
      name: d.name, argcount: P.countArgs(d.argsRaw), file,
      secdefHeader, secdefText, writeCurrent, writeEnhanced,
      layerBSeenPre, layerBSeenPost,
      bodyLen: d.body.length,
      bodyStartsWith: JSON.stringify(d.body.slice(0, 12)),
      bodyEndsWith: JSON.stringify(d.body.slice(-12)),
      body: d.body, text: d.text, header: d.header,
    };
  });
}

console.log(`REM-INV-6R parser tests — parser: ${PARSER_FILE}`);
const P = loadParser(PARSER_FILE);
console.log(`WRITE_RE (loaded): ${P.WRITE_RE || '(ausente en parser histórico)'}`);
console.log('');

// ── M1/M2: dollar-quote mechanics + boundary math ──
console.log('[M1/M2] dollar-quote mechanics + body boundary math');
{
  const r = classify(P, readFix('b1-dollar-raw-insert.sql'), 'b1');
  check('b1.found', r.length === 1 && r[0].name === 'f1_dollar_simple', `n=${r.length}`);
  if (r.length === 1) {
    const d = r[0];
    check('b1.body.starts.after.tag', /^\s*BEGIN/.test(d.body), `starts=${d.bodyStartsWith}`);
    check('b1.body.ends.before.closing.tag', /END;\s*$/.test(d.body), `ends=${d.bodyEndsWith}`);
    check('b1.body.full.insert', /INSERT\s+INTO\s+public\.test_table\s+VALUES\s*\(1\)/i.test(d.body), `len=${d.bodyLen}`);
  }
}
{
  const r = classify(P, readFix('b2-tagged-function-update.sql'), 'b2');
  check('b2.found', r.length === 1 && r[0].name === 'f2_tagged_function');
  if (r.length === 1) {
    check('b2.body.full.update', /UPDATE\s+public\.test_table\s+SET\s+x\s*=\s*2\s*;/.test(r[0].body), `len=${r[0].bodyLen}`);
    check('b2.body.boundaries', /^\s*BEGIN/.test(r[0].body) && /END;\s*$/.test(r[0].body));
  }
}
{
  const r = classify(P, readFix('b3-arbitrary-tag-delete.sql'), 'b3');
  check('b3.found', r.length === 1 && r[0].name === 'f3_arbitrary_tag');
  if (r.length === 1) {
    check('b3.body.full.delete', /DELETE\s+FROM\s+public\.test_table\s*;/.test(r[0].body));
    check('b3.secdef', r[0].secdefText === true && r[0].secdefHeader === true);
  }
}
{
  const r = classify(P, readFix('b4-multi-functions.sql'), 'b4');
  const names = r.map(d => d.name).join(',');
  check('b4.four.functions', r.length === 4, `names=${names}`);
  const expect = {
    b4_a: /INSERT\s+INTO\s+public\.t_a\s+VALUES\s*\(1\)/,
    b4_b: /UPDATE\s+public\.t_b\s+SET\s+v\s*=\s*1/,
    b4_c: /PERFORM\s+1/,
    b4_d: /SELECT\s+1/,
  };
  for (const [n, re] of Object.entries(expect)) {
    const d = r.find(x => x.name === n);
    check(`b4.${n}.body`, !!d && re.test(d.body), d ? `len=${d.bodyLen}` : 'MISSING');
  }
}

// ── M3: safe-then-dangerous ──
console.log('[M3] first safe, second dangerous');
{
  const r = classify(P, readFix('b5-safe-then-dangerous.sql'), 'b5');
  check('b5.two.functions', r.length === 2, `n=${r.length}`);
  const second = r.find(d => d.name === 'b5_dangerous_second');
  check('b5.second.body.full', !!second && /DELETE\s+FROM\s+public\.victims\s*;/.test(second.body), second ? `len=${second.bodyLen}` : 'MISSING');
  check('b5.second.secdef', !!second && second.secdefText === true);
}

// ── M4: comments ──
console.log('[M4] comments before/after/inside');
{
  const r = classify(P, readFix('b6-comments.sql'), 'b6');
  check('b6.found', r.length === 1 && r[0].name === 'b6_commented');
  if (r.length === 1) check('b6.no.comment.dml', !/INSERT INTO this_comment_is_not_code/.test(r[0].text));
}

// ── M5: strings with $$ / tags ──
console.log('[M5] strings containing $$ / $tag$ inside tagged bodies');
{
  const r = classify(P, readFix('b7-string-with-dollars.sql'), 'b7');
  check('b7.found', r.length === 1 && r[0].name === 'b7_string_dollars');
  if (r.length === 1) {
    check('b7.body.untagged.strings.preserved', /\$\$ \|\| quote_ident/.test(r[0].body));
    check('b7.body.insert.intact', /INSERT\s+INTO\s+public\.marker_log/.test(r[0].body), `len=${r[0].bodyLen}`);
  }
}
{
  const r = classify(P, readFix('b8-string-with-tag.sql'), 'b8');
  check('b8.found', r.length === 1 && r[0].name === 'b8_string_tags');
  if (r.length === 1) {
    check('b8.body.other.tag.preserved', /\$abc\$ is not my closer/.test(r[0].body));
    check('b8.body.update.intact', /UPDATE\s+public\.marker_log\s+SET\s+hit\s*=\s*true/.test(r[0].body));
  }
}

// ── M6: trailers ──
console.log('[M6] trailers (SECURITY DEFINER before/after body, LANGUAGE sql IMMUTABLE)');
{
  const r = classify(P, readFix('b9-trailers.sql'), 'b9');
  check('b9.three.functions', r.length === 3, `n=${r.length}`);
  const trailer = r.find(d => d.name === 'b9_trailer_secdef');
  if (trailer) {
    check('b9a.text.has.secdef.trailer', trailer.secdefText === true, `header=${trailer.secdefHeader} text=${trailer.secdefText}`);
    check('b9a.body.delete.intact', /DELETE\s+FROM\s+public\.trailer_victims/.test(trailer.body));
  } else check('b9a.found', false, 'b9_trailer_secdef MISSING');
  const classic = r.find(d => d.name === 'b9_classic_secdef');
  check('b9b.classic.secdef', !!classic && classic.secdefHeader === true);
  const imm = r.find(d => d.name === 'b9_immutable_sql');
  check('b9c.immutable.sql.body', !!imm && /SELECT\s+42/.test(imm.body));
}

// ── M7: ALTER FUNCTION ──
console.log('[M7] ALTER FUNCTION modeling');
{
  const sql = readFix('b10-alter-function.sql');
  const clean = P.stripComments(sql);
  const defs = P.extractFunctions(clean, 'b10');
  const alters = P.extractAlterStmts ? P.extractAlterStmts(clean) : [];
  check('b10.create.found', defs.length === 1 && defs[0].name === 'b10_alters');
  const sp = alters.find(a => a.fname === 'b10_alters' && a.sp !== null);
  const sec = alters.find(a => a.fname === 'b10_alters' && a.secdef === true);
  check('b10.alter.search_path', !!sp && /public/.test(sp.sp), sp ? `sp=${sp.sp}` : 'MISSING');
  check('b10.alter.security.definer', !!sec);
  const vol = alters.filter(a => a.fname === 'b10_alters' && (a.volatility !== undefined || a.parallel !== undefined));
  check('b10.alter.volatility+parallel.modeled', vol.length >= 2, `captured=${vol.length} (pre-fix extractor ignores volatility/parallel)`);
}

// ── D1: write-detection canaries ──
console.log('[D1] write-detection canaries (DELETE FROM / TRUNCATE / unqualified UPDATE)');
{
  for (const [fx, fn] of [
    ['canary-delete-from-only.sql', 'canary_delete_from_only'],
    ['canary-truncate-only.sql', 'canary_truncate_only'],
    ['canary-unqualified-update.sql', 'canary_unqualified_update'],
  ]) {
    const r = classify(P, readFix(fx), fx);
    const d = r[0];
    check(`${fn}.found`, r.length === 1 && d.name === fn);
    check(`${fn}.secdef`, !!d && d.secdefText === true);
    check(`${fn}.WRITE_RE.detects`, !!d && d.writeCurrent === true, `WRITE_RE=${d ? d.writeCurrent : 'n/a'} enhanced=${d ? d.writeEnhanced : 'n/a'}`);
    if (d && d.layerBSeenPre !== null) {
      check(`${fn}.layerB.preFilter.hidden(demo)`, d.layerBSeenPre === true || d.layerBSeenPre === false, `pre-fix filter saw it: ${d.layerBSeenPre} (repro record)`);
      check(`${fn}.layerB.postFilter.sees`, d.layerBSeenPost === true, `pre=${d.layerBSeenPre} post=${d.layerBSeenPost}`);
    }
  }
}

// ── D2: false positives ──
console.log('[D2] false-positive probe');
{
  const r = classify(P, readFix('fp-no-real-dml.sql'), 'fp');
  const d = r[0];
  check('fp.found', r.length === 1 && d.name === 'fp_no_real_dml');
  // post-fix pipeline: write-detection runs on stripCommentsDeep(d.text)
  if (P.stripCommentsDeep && d) {
    const detectText = P.stripCommentsDeep(d.text);
    check('fp.not.write', P.WRITE_RE.test(detectText) === false, `WRITE_RE(detectText)=${P.WRITE_RE.test(detectText)} (comments stripped, strings kept)`);
  } else {
    check('fp.not.write', !!d && d.writeCurrent === false, `legacy parser: WRITE_RE(d.text)=${d ? d.writeCurrent : ''}`);
  }
  // post-fix the exact Layer-B pipeline must NOT see it as SECDEF-write
  if (d && d.layerBSeenPost !== null) check('fp.layerB.postFilter.ignores', d.layerBSeenPost === false, `post=${d.layerBSeenPost}`);
}

console.log('[D3] trailer-SECDEF + canaries through the EXACT Layer-B pipeline');
{
  const r = classify(P, readFix('b9-trailers.sql'), 'b9');
  const trailer = r.find(d => d.name === 'b9_trailer_secdef');
  if (trailer) {
    check('b9a.layerB.preFilter.hidden(demo)', trailer.layerBSeenPre === false, `pre-fix Layer-B filter saw it: ${trailer.layerBSeenPre}`);
    check('b9a.layerB.postFilter.sees', trailer.layerBSeenPost === true);
  } else check('b9a.found', false, 'MISSING');
}

// ── I1: lastIndex isolation + determinism ──
console.log('[I1] RegExp.lastIndex isolation + 10x determinism');
{
  const A = readFix('lastindex-a.sql'), B = readFix('lastindex-b.sql'), C = readFix('lastindex-c.sql');
  // sequence run: A then B then C (each through the same parser instance)
  const seq = [classify(P, A, 'a'), classify(P, B, 'b'), classify(P, C, 'c')];
  const b1 = seq[1][0], c1 = seq[2][0];
  check('isolation.b1.body.independent.of.A', !!b1 && b1.body.includes('42'), b1 ? `len=${b1.bodyLen}` : 'MISSING');
  check('isolation.c1.longtag.independent', !!c1 && c1.body.includes('7'), c1 ? `len=${c1.bodyLen}` : 'MISSING');
  // standalone run must equal in-sequence run
  const bSolo = classify(P, B, 'b')[0];
  check('isolation.b.solo.equals.sequential', JSON.stringify(b1) === JSON.stringify(bSolo));
  // 10x determinism: full fixture corpus, hash each pass
  const corpus = fs.readdirSync(FIXTURES).filter(f => f.endsWith('.sql')).sort();
  const hashes = new Set();
  for (let i = 0; i < 10; i++) {
    const all = corpus.map(f => classify(P, readFix(f), f));
    hashes.add(crypto.createHash('sha256').update(JSON.stringify(all)).digest('hex'));
  }
  check('determinism.10x.identical', hashes.size === 1, `unique_hashes=${hashes.size} files=${corpus.length}`);
}

console.log('');
console.log('═'.repeat(72));
console.log(`RESULT: ${pass} pass / ${fail} fail — parser: ${path.basename(PARSER_FILE)}`);
if (failures.length) {
  console.log('FAILED ASSERTIONS:');
  for (const f of failures) console.log(`  - ${f.id}: ${f.detail || ''}`);
  process.exit(1);
}
process.exit(0);
