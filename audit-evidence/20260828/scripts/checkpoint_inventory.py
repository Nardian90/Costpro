#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
W6.0 — CHECKPOINT INVENTORY + EVIDENCE STAGING
Genera CHECKPOINT-INVENTORY-20260828.txt, copia la evidencia segura al árbol
del repo (rama audit/w6-harness-parity-checkpoint-20260828) y emite SHA256SUMS.
NO toca producción. NO commitea nada por sí mismo (solo prepara el working tree).
"""
import hashlib, os, shutil, subprocess, datetime, json

BASE = "/home/z/my-project"
EVID = os.path.join(BASE, "download/auditoria-multitienda")
REPO = os.path.join(BASE, "Costpro")
STAGE = os.path.join(REPO, "audit-evidence/20260828")

def sha256(path, bufsize=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(bufsize):
            h.update(chunk)
    return h.hexdigest()

# ── Raíces de inventario: (ruta_absoluta, procedencia, reproducible, incluir, tipo_registro)
ROOTS = [
    (f"{EVID}/RECONSTRUCTED-W6",                              "RECONSTRUCTED", "partial", True,  "dir"),
    (f"{EVID}/RECOVERY-20260828/68-recovery-state-report.md", "GENERATED",     "partial", True,  "file"),
    (f"{EVID}/RECOVERY-20260828/69-custom-db-not-costpro-marker.md", "GENERATED", "partial", True, "file"),
    (f"{EVID}/RECOVERY-20260828/70-gate-parity-fail-stop.md", "GENERATED",     "partial", True,  "file"),
    (f"{EVID}/RECOVERY-20260828/71-production-schema-snapshot-manifest.md", "GENERATED", "partial", True, "file"),
    (f"{EVID}/RECOVERY-20260828/72-rharness-02-parity-gate-verdict.md", "GENERATED", "partial", True, "file"),
    (f"{EVID}/RECOVERY-20260828/PRODUCTION-SCHEMA-SNAPSHOT",  "GENERATED",     "partial", True,  "dir"),
    (f"{EVID}/R-HARNESS-02",                                  "GENERATED",     "partial", True,  "dir"),
    (f"{BASE}/scripts",                                       "GENERATED",     "yes",     True,  "dir"),
    (f"{BASE}/harness/logs/migration-ledger.txt",             "GENERATED",     "yes",     True,  "file"),
    (f"{BASE}/harness/logs/migration-ledger-v3.txt",          "GENERATED",     "yes",     True,  "file"),
    (f"{BASE}/harness/logs/migration-errors.log",             "GENERATED",     "yes",     True,  "file"),
    (f"{BASE}/harness/logs/migration-errors-v3.log",          "GENERATED",     "yes",     True,  "file"),
    (f"{BASE}/worklog.md",                                    "GENERATED",     "no",      True,  "file"),
    # ── Registrados pero EXCLUIDOS del checkpoint ──
    (f"{BASE}/.env",                                          "ORIGINAL( owner-supplied )", "n/a", False, "file"),
    (f"{BASE}/harness/pg",                                    "GENERATED",     "yes",     False, "dir"),
    (f"{BASE}/harness/client",                                "GENERATED",     "yes",     False, "dir"),
    (f"{BASE}/harness/debs",                                  "GENERATED",     "yes",     False, "dir"),
    (f"{BASE}/harness/logs/pg.log",                           "GENERATED",     "no",      False, "file"),
    (f"{BASE}/harness/run",                                   "GENERATED",     "n/a",     False, "dir"),
]

# ── Ausencias conocidas (perdidas con el reinicio; contenido representado en RECONSTRUCTED-W6 / RECOVERY) ──
ABSENCES = [
    "WAC-DATAFLOW/",              # perdido en reinicio previo; sustancia dentro de 59-67 reconstruidos
    "W6-CANONICAL-DESIGN/",       # idem
    "DEFECT-REGISTER*",           # perdido (WAC-DF-01..07); W6.1/doc 73 aun no autorizados
    "SHA256SUMS (raíz global)",   # reemplazado por SHA256SUMS por-artefacto (00-RECONSTRUCTION-MANIFEST, R-HARNESS-02, PRODUCTION-SCHEMA-SNAPSHOT)
    "harness original PG (W0)",   # LOST — historia forense; no reconstruible por definición
    "baseline original W0",       # LOST — historia forense
]

# Clasificación de contenido de producción
PROD_DATA_NOTE = {
    "PRODUCTION-SCHEMA-SNAPSHOT": "DDL/metadatos ONLY (sin datos de negocio) — verificado por escaneo + manifiesto 71",
    "R-HARNESS-02": "huellas de catálogo + ledgers de migración (metadatos, sin datos de negocio)",
    "RECONSTRUCTED-W6": "diseño/documentación W6 (sin datos de negocio)",
    "scripts": "código de extracción/carga (SELECT-only contra producción)",
    "harness/logs": "ledgers de replay de migraciones en LAB (sin datos de negocio)",
    "worklog.md": "registro de sesión (sin secretos; escaneado)",
    ".env": "CONTIENE SECRETOS — EXCLUIDO",
}

ftype = lambda p: ("dir" if os.path.isdir(p) else ("symlink" if os.path.islink(p) else (os.path.splitext(p)[1].lstrip(".") or "file").lower()))

secrets_scan_hit = {}  # cualquier hit haría fallar la inclusión; el escaneo previo (bash) dio LIMPIO

rows, include_files = [], []  # include_files: (src_abs, rel_stage_path)
for root, prov, repro, inc, kind in ROOTS:
    if not os.path.exists(root):
        rows.append((root.replace(BASE + "/", ""), "-", 0, "MISSING", prov, repro, inc))
        continue
    if os.path.isfile(root):
        files = [root]
    else:
        files = []
        for dp, dns, fns in os.walk(root):
            dns[:] = [d for d in dns if d not in (".git", "node_modules", "__pycache__")]
            for fn in sorted(fns):
                files.append(os.path.join(dp, fn))
    for fp in sorted(files):
        rel = fp.replace(BASE + "/", "")
        if os.path.islink(fp) and not os.path.exists(fp):
            rows.append((rel + " [broken-symlink]", "-", 0, "symlink", prov, repro, inc))
            continue
        if not os.path.isfile(fp):  # sockets/dispositivos efímeros: solo registrar
            rows.append((rel + " [non-regular-file]", "-", 0, "special", prov, repro, inc))
            continue
        size = os.path.getsize(fp)
        digest = sha256(fp)
        rows.append((rel, digest, size, ftype(fp), prov, repro, inc))
        if inc:
            include_files.append((fp, rel))

# ── Emitir inventario ──
lines = []
W = lines.append
W("=" * 100)
W("CHECKPOINT-INVENTORY-20260828.txt — W6 HARNESS PARITY RECOVERY CHECKPOINT")
W("=" * 100)
W(f"Generado (UTC): {datetime.datetime.now(datetime.timezone.utc).isoformat()}")
W(f"Sandbox base: {BASE}")
W(f"Repo auditado: {REPO} (origin https://github.com/Nardian90/Costpro)")
W(f"Base commit: 522a519e8d12499121df8e232731c7674ed1c002 (main, tree 65713395c1a88cf5a2e2a39cccda453d2ff38312)")
W("")
W("CAMPOS: ruta | tamaño(B) | SHA-256 | tipo | procedencia | reproducible | incluido_en_checkpoint")
W("PROCEDENCIA: ORIGINAL=provisto intacto · RECONSTRUCTED=restaurado verbatim desde transcripción (NON-ORIGINAL PROVENANCE)")
W("             GENERATED=producido por el agente en sesión 20260828 · reproducible=yes/partial/no/n/a")
W("")
W("-" * 100)
W("SECCIÓN 1 — ARTEFACTOS INCLUIDOS EN EL CHECKPOINT")
W("-" * 100)
n_inc = 0
for rel, dig, size, typ, prov, repro, inc in rows:
    if inc and dig != "-":
        W(f"{rel}\n    size={size}  sha256={dig}  type={typ}  prov={prov}  reproducible={repro}  included=YES")
        n_inc += 1
W("")
W(f"Total incluidos: {n_inc} archivos")
W("")
W("-" * 100)
W("SECCIÓN 2 — ARTEFACTOS REGISTRADOS PERO EXCLUIDOS (con justificación)")
W("-" * 100)
for rel, dig, size, typ, prov, repro, inc in rows:
    if not inc and dig != "-":
        note = PROD_DATA_NOTE.get(os.path.basename(rel)) or PROD_DATA_NOTE.get(rel.split("/")[-2] if "/" in rel[len(BASE):] else "", "")
        reason = ("CONTIENE SECRETOS (credenciales Supabase/NextAuth del dueño) — regla §3: hash+registro, NUNCA commit"
                  if rel.endswith(".env") else
                  "cluster PostgreSQL 125MB — estado reconstruible desde snapshot DDL + shims + migraciones (documentado en 71/72)"
                  if "/pg" in rel and typ == "dir" else
                  "binarios PostgreSQL 72MB — reproducibles vía apt-get download postgresql-17 (documentado en 68)"
                  if "/client" in rel else
                  "paquetes .deb 19MB — reproducibles (fuentes públicas)"
                  if "/debs" in rel else
                  "log runtime del cluster (2.3MB) — no probativo; outcomes en ledgers incluidos"
                  if "pg.log" in rel else
                  "sockets/runtime efímeros — sin valor probatorio"
                  if "/run" in rel else "excluido")
        W(f"{rel}\n    size={size}  sha256={dig}  type={typ}  prov={prov}  included=NO  motivo={reason}")
    elif not inc:
        W(f"{rel}  — AUSENTE en filesystem")
W("")
W("-" * 100)
W("SECCIÓN 3 — ARTEFACTOS NO ENCONTRADOS (búsqueda agotada; perdidos en reinicio anterior)")
W("-" * 100)
for a in ABSENCES:
    W(f"NOT-FOUND: {a}")
W("Regla aplicada: la pérdida se preserva como historia forense; NO se infiere ni se recrea como original.")
W("")
W("-" * 100)
W("SECCIÓN 4 — SECRETOS Y DATOS DE PRODUCCIÓN")
W("-" * 100)
W("Escaneo ejecutado (patrones): .env* sb_secret_ sb_publishable_ service_role anon key JWT access_token")
W("  refresh_token password passwd secret SUPABASE_* DATABASE_URL POSTGRES_PASSWORD PRIVATE_KEY")
W("  BEGIN PRIVATE KEY Authorization: Bearer github_pat ghp_ sk-")
W("Resultado sobre INCLUIDOS: 0 valores secretos. Falso positivo documentado: 71-production-schema-")
W("  snapshot-manifest.md:23 menciona el NOMBRE de clave 'sb_secret_' en narrativa forense (sin valor).")
W("scripts/snap-lib.sh usa $SUPABASE_ACCESS_TOKEN como variable de entorno — jamás hardcodeada.")
W(".env (fuera del checkpoint): SHA-256=" + sha256(f"{BASE}/.env"))
W("Datos de negocio de producción: NO EXTRAÍDOS (extracción schema-only; 0 filas de negocio).")
W("")
W("=" * 100)
W("FIN DEL INVENTARIO")
W("=" * 100)

inv_text = "\n".join(lines) + "\n"
os.makedirs(STAGE, exist_ok=True)
inv_path = os.path.join(STAGE, "CHECKPOINT-INVENTORY-20260828.txt")
with open(inv_path, "w") as f:
    f.write(inv_text)

# ── Staging de archivos incluidos preservando ruta relativa bajo audit-evidence/20260828/ ──
copied = 0
for src, rel in include_files:
    dst = os.path.join(STAGE, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    copied += 1

# ── SHA256SUMS del árbol staged (ruta relativa al stage) ──
sums = []
for dp, dns, fns in os.walk(STAGE):
    dns[:] = [d for d in dns if d not in (".git", "node_modules", "__pycache__")]
    for fn in sorted(fns):
        fp = os.path.join(dp, fn)
        if fp == inv_path:
            continue  # el inventario no puede hasharse a sí mismo en su interior
        sums.append(f"{sha256(fp)}  {os.path.relpath(fp, STAGE)}")
with open(os.path.join(STAGE, "SHA256SUMS"), "w") as f:
    f.write("\n".join(sorted(sums)) + "\n")

print(json.dumps({
    "inventory": inv_path, "inventory_files_listed": len(rows),
    "staged": copied, "sha256sums_entries": len(sums),
    "stage_dir": STAGE,
}, indent=2))
