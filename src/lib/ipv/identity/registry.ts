import { db, type Customer } from '../../dexie';
import { v4 as uuidv4 } from 'uuid';

export type ResolutionSource = 'CATALOG' | 'NEW' | 'PARTIAL' | 'CONFLICT';

export interface IdentityResult {
  ci?: string;
  nombre?: string;
  source: ResolutionSource;
}

/**
 * Resolves identity based on input CI and/or Name.
 * Implements bidirectional enrichment and self-healing.
 */
export async function resolveIdentity(
  transactionRef: string,
  inputCi?: string,
  inputNombre?: string
): Promise<IdentityResult> {
  // Normalize inputs
  const ci = inputCi?.trim();
  const nombre = inputNombre?.trim().toUpperCase();

  // 1. CI-based Resolution (Strong Identity)
  if (ci) {
    const fromCatalog = await db.customers.get(ci);
    if (fromCatalog) {
      if (nombre && fromCatalog.nombre !== nombre) {
        // Conflict detected: CI matches but Name differs
        await logAudit(transactionRef, 'CONFLICT',
          `Conflicto de nombre para CI ${ci}: Importado '${nombre}' vs Catálogo '${fromCatalog.nombre}'`);
        return { ci, nombre: fromCatalog.nombre, source: 'CONFLICT' };
      }
      return { ci, nombre: fromCatalog.nombre, source: 'CATALOG' };
    } else if (nombre) {
      // New valid record: CI + Name
      await db.customers.put({
        ci,
        nombre,
        ultima_actualizacion: new Date().toISOString()
      });
      await logAudit(transactionRef, 'NEW_RECORD', `Nuevo cliente registrado: ${nombre} (${ci})`);
      return { ci, nombre, source: 'NEW' };
    }
    return { ci, nombre, source: 'PARTIAL' };
  }

  // 2. Name-based Resolution (Weak Identity)
  if (nombre) {
    // Search for CI by name in catalog
    const matches = await db.customers.where('nombre').equals(nombre).toArray();
    if (matches.length === 1) {
      // Deterministic enrichment: Only 1 CI found for this name
      const found = matches[0];
      await logAudit(transactionRef, 'AUTO_CORRECTION',
        `Enriquecimiento automático para ${nombre}: Encontrado CI ${found.ci}`);
      return { ci: found.ci, nombre: found.nombre, source: 'CATALOG' };
    } else if (matches.length > 1) {
        // Ambiguous: multiple CIs for same name
        await logAudit(transactionRef, 'CONFLICT',
          `Ambigüedad: Múltiples CIs encontrados para el nombre '${nombre}'`);
    }
    return { ci, nombre, source: 'PARTIAL' };
  }

  return { source: 'PARTIAL' };
}

async function logAudit(
  transactionRef: string,
  tipo: "CONFLICT" | "AUTO_CORRECTION" | "NEW_RECORD",
  detalle: string
) {
  await db.identity_audit.add({
    id: uuidv4(),
    transaction_ref: transactionRef,
    tipo,
    detalle,
    timestamp: new Date().toISOString()
  });
}
