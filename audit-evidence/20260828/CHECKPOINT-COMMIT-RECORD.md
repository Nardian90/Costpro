# CHECKPOINT-COMMIT-RECORD — W6 Harness Parity Recovery

Registro post-commit del checkpoint de auditoría (los valores de SHA del propio
commit no pueden residir dentro del commit — imposibilidad auto-referencial;
este registro se materializa en el commit de resultados A–F y en el tar.gz).

## Valores congelados

```text
checkpoint_commit: f628e5e7d1908f401d1eee7d663b1f3acc0e9d74
checkpoint_tree:   03853527694c5d7d0a3fc99146aaee06ef06b703
base_commit:       522a519e8d12499121df8e232731c7674ed1c002 (main)
branch:            audit/w6-harness-parity-checkpoint-20260828
tag:               audit-w6-harness-parity-20260828 (annotated, obj 025b73437a853c4951519b3905bab94527519269)
tag → commit:      f628e5e7d1908f401d1eee7d663b1f3acc0e9d74  (verificado, tag inamovible)
remote:            https://github.com/Nardian90/Costpro
```

## Verificación remota §8

```text
LOCAL  CHECKPOINT SHA = f628e5e7d1908f401d1eee7d663b1f3acc0e9d74
REMOTE CHECKPOINT SHA = f628e5e7d1908f401d1eee7d663b1f3acc0e9d74
→ LOCAL CHECKPOINT SHA == REMOTE CHECKPOINT SHA : PASS
Remote tag object == local tag object : PASS (025b7343…9269)
```

## Segunda copia §10

```text
archivo:    W6-HARNESS-CHECKPOINT-20260828.tar.gz
ubicación:  download/W6-HARNESS-CHECKPOINT-20260828.tar.gz (fuera del sandbox-efímero-del-repo)
contenido:  audit-evidence/20260828/ (evidencia + inventario + manifiesto + SHA256SUMS + este registro)
exclusiones: .env · node_modules/ · credenciales · logs con secretos · datos de negocio
sha256:     (registrado en worklog.md y en el informe al dueño — el hash no puede residir dentro del propio tar)
```

## Íntegridad del árbol de evidencia

```text
sha256sum -c audit-evidence/20260828/SHA256SUMS  → 237 entradas
```

Cualquier divergencia entre este registro y el remoto → STOP e investigación
antes de continuar la cadena.
