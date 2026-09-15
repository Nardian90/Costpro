#!/usr/bin/env node
/**
 * rem-inv-6r-coverage.cjs — REM-INV-6R Gate E: real repo coverage metrics
 *
 * Runs the FIXED parser over supabase/migrations/*.sql and reports:
 *   total_functions_seen, dollar_quote_$$, dollar_quote_tagged (named+arbitrary),
 *   single_quote_bodies, sql_functions, plpgsql_functions, functions_with_alter,
 *   functions_with_security_definer, functions_with_sensitive_dml,
 *   multi_function_files, files_total.
 * Also lists sensitive known functions (restore_store_backup, reset_store_data
 * (all overloads), soft_delete_store, managed_delete_user, confirm_transfer,
 * create_transfer, reverse_transfer) with their Layer-B visibility, SECDEF,
 * DML ops found (INSERT/UPDATE/DELETE/TRUNCATE), args and trailer presence.
 *
 * Output: JSON to stdout (redirect to evidence file).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.join(__dirname, '..');
const PARSER = path.join(REPO, 'scripts', 'security-contract-test-static.cjs');
const MIG = path.join(REPO, 'supabase', 'migrations');

let src = fs.readFileSync(PARSER, 'utf8');
src = src.slice(0, src.indexOf('(async () => {'));
const sb = { module: { exports: {} }, console, require, Buffer, __dirname: path.join(REPO, 'scripts') };
vm.createContext(sb);
vm.runInContext(src + ';module.exports.__i={stripComments,stripCommentsDeep,extractFunctions,extractAlterStmts,extractAclStmts,countArgs,WRITE_RE,nonBodyOf};', sb);
const P = sb.module.exports.__i;

const files = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
const metrics = {
  generated_at: new Date().toISOString(), commit: require('child_process').execSync('git rev-parse HEAD').toString().trim(),
  files_total: files.length,
  total_functions_seen: 0, dollar_quote_$$: 0, dollar_quote_named_tag: 0, dollar_quote_arbitrary_tag: 0,
  single_quote_bodies: 0, sql_functions: 0, plpgsql_functions: 0, other_language: 0,
  functions_with_alter: 0, functions_with_security_definer: 0, functions_with_sensitive_dml: 0,
  multi_function_files: 0, distinct_tags: {},
  sensitive: {}, dml_op_counts: { INSERT: 0, UPDATE: 0, DELETE: 0, TRUNCATE: 0, MERGE: 0 },
};
const alterNames = new Set();

for (const f of files) {
  const raw = fs.readFileSync(path.join(MIG, f), 'utf8');
  const clean = P.stripComments(raw);
  for (const a of P.extractAlterStmts(clean)) alterNames.add(a.fname);
  const defs = P.extractFunctions(clean, f);
  if (defs.length > 1) metrics.multi_function_files++;
  for (const d of defs) {
    metrics.total_functions_seen++;
    const nonBody = P.nonBodyOf(d);
    const detect = P.stripCommentsDeep(d.text);
    const tagM2 = /\bas\s+(\$[A-Za-z0-9_]*\$)/i.exec(nonBody);
    const tag = tagM2 ? tagM2[1] : null;
    if (tag === '$$') metrics['dollar_quote_$$']++;
    else if (tag) {
      metrics.dollar_quote_named_tag++;
      const core = tag.replace(/^\$/, '').replace(/\$$/, '');
      if (/^[A-Za-z0-9_]+$/.test(core) && core.length > 2 && !['function', 'fn'].includes(core.toLowerCase())) metrics.dollar_quote_arbitrary_tag++;
      metrics.distinct_tags[tag] = (metrics.distinct_tags[tag] || 0) + 1;
    } else metrics.single_quote_bodies++;
    const langM = /LANGUAGE\s+['"]?([a-zA-Z_]+)['"]?/i.exec(nonBody);
    const lang = langM ? langM[1].toLowerCase() : 'unknown';
    if (lang === 'sql') metrics.sql_functions++;
    else if (lang === 'plpgsql') metrics.plpgsql_functions++;
    else metrics.other_language++;
    if (/security\s+definer/i.test(nonBody)) metrics.functions_with_security_definer++;
    const ops = [];
    if (/\bINSERT\s+INTO\b/i.test(detect)) { ops.push('INSERT'); metrics.dml_op_counts.INSERT++; }
    if (/\bUPDATE\s+(?:public\.)?[A-Za-z_"']/i.test(detect)) { ops.push('UPDATE'); metrics.dml_op_counts.UPDATE++; }
    if (/\bDELETE\s+FROM\b/i.test(detect)) { ops.push('DELETE'); metrics.dml_op_counts.DELETE++; }
    if (/\bTRUNCATE(?:\s+TABLE)?\b/i.test(detect)) { ops.push('TRUNCATE'); metrics.dml_op_counts.TRUNCATE++; }
    if (/\bMERGE\s+INTO\b/i.test(detect)) { ops.push('MERGE'); metrics.dml_op_counts.MERGE++; }
    if (ops.length > 0) metrics.functions_with_sensitive_dml++;
    for (const name of ['restore_store_backup', 'reset_store_data', 'soft_delete_store', 'managed_delete_user', 'confirm_transfer', 'create_transfer', 'reverse_transfer']) {
      if (d.name === name) {
        const k = `${name}/${P.countArgs(d.argsRaw)}`;
        metrics.sensitive[k] = metrics.sensitive[k] || { file: f, ops: [], secdef: false, trailer_secdef: false };
        metrics.sensitive[k].ops = [...new Set([...metrics.sensitive[k].ops, ...ops])];
        metrics.sensitive[k].secdef = /security\s+definer/i.test(nonBody) || metrics.sensitive[k].secdef;
        // trailer = text after body end
        const trailer = d.text.slice(d.bodyEndAbs - d.pos);
        if (/security\s+definer/i.test(trailer)) metrics.sensitive[k].trailer_secdef = true;
      }
    }
  }
}
metrics.functions_with_alter = alterNames.size;
metrics.alter_function_names = [...alterNames].sort();
console.log(JSON.stringify(metrics, null, 2));
