import { db, type Customer } from '../../dexie';
import { v4 as uuidv4 } from 'uuid';
import { normalizeName, similarity } from './normalization';

export type ResolutionSource = 'CATALOG' | 'NEW' | 'PARTIAL' | 'CONFLICT' | 'FUZZY';

export interface IdentityResult {
  ci?: string;
  nombre?: string;
  phone?: string;
  card_number?: string;
  source: ResolutionSource;
}

/**
 * Resolves identity based on input CI and/or Name.
 * Implements bidirectional enrichment and self-healing.
 */
export async function resolveIdentity(
  transactionRef: string,
  inputCi?: string,
  inputNombre?: string,
  inputPhone?: string,
  inputCard?: string
): Promise<IdentityResult> {
  const ci = inputCi?.trim();
  const rawNombre = inputNombre?.trim();
  const normalizedInputName = normalizeName(rawNombre || "");
  const phone = inputPhone?.trim();
  const card = inputCard?.trim();

  // 1. Priority 1: CI exact match
  if (ci) {
    const fromCatalog = await db.customers.get(ci);
    if (fromCatalog) {
      const isNameConflict = normalizedInputName && fromCatalog.normalized_name !== normalizedInputName;
      if (isNameConflict) {
          await logAudit(transactionRef, 'CONFLICT',
            `Conflicto de nombre para CI ${ci}: Importado '${rawNombre}' vs Catálogo '${fromCatalog.nombre}'`);
      }

      // Update missing fields in catalog if found in transaction
      const updates: Partial<Customer> = {};
      if (!fromCatalog.phone && phone) updates.phone = phone;
      if (!fromCatalog.card_number && card) updates.card_number = card;
      if (rawNombre && !fromCatalog.raw_names.includes(rawNombre)) {
          updates.raw_names = [...fromCatalog.raw_names, rawNombre];
      }

      if (Object.keys(updates).length > 0) {
          await db.customers.update(ci, { ...updates, updated_at: new Date().toISOString() });
      }

      return {
        ci,
        nombre: fromCatalog.nombre,
        phone: fromCatalog.phone || phone,
        card_number: fromCatalog.card_number || card,
        source: isNameConflict ? 'CONFLICT' : 'CATALOG'
      };
    } else if (rawNombre) {
      // New valid record
      const newCustomer: Customer = {
        ci,
        nombre: rawNombre.toUpperCase(),
        normalized_name: normalizedInputName,
        raw_names: [rawNombre],
        phone,
        card_number: card,
        status: (ci && rawNombre) ? "COMPLETO" : "PARTIAL",
        source: "AUTOMATICO",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await db.customers.put(newCustomer);
      await logAudit(transactionRef, 'NEW_RECORD', `Nuevo cliente registrado: ${rawNombre} (${ci})`);
      return { ci, nombre: newCustomer.nombre, phone, card_number: card, source: 'NEW' };
    }
  }

  // 2. Priority 2: Exact Normalized Name Match
  if (normalizedInputName) {
    const matches = await db.customers.where('normalized_name').equals(normalizedInputName).toArray();
    if (matches.length === 1) {
      const found = matches[0];
      await logAudit(transactionRef, 'AUTO_CORRECTION',
        `Enriquecimiento automático para ${rawNombre}: Encontrado CI ${found.ci}`);
      return {
          ci: found.ci,
          nombre: found.nombre,
          phone: found.phone || phone,
          card_number: found.card_number || card,
          source: 'CATALOG'
      };
    } else if (matches.length > 1) {
       await logAudit(transactionRef, 'CONFLICT',
          `Ambigüedad: Múltiples CIs encontrados para el nombre '${rawNombre}'`);
       return { nombre: rawNombre.toUpperCase(), phone, card_number: card, source: 'CONFLICT' };
    }
  }

  // 3. Priority 3: Fuzzy Matching (> 0.85 similarity)
  if (normalizedInputName) {
      const allCustomers = await db.customers.toArray();
      let bestMatch: Customer | null = null;
      let maxSim = 0;

      for (const c of allCustomers) {
          const sim = similarity(normalizedInputName, c.normalized_name);
          if (sim > maxSim) {
              maxSim = sim;
              bestMatch = c;
          }
      }

      if (bestMatch && maxSim > 0.85) {
          await logAudit(transactionRef, 'AUTO_CORRECTION',
            `Match Heurístico (${(maxSim * 100).toFixed(1)}%): ${rawNombre} -> ${bestMatch.nombre}`);
          return {
              ci: bestMatch.ci,
              nombre: bestMatch.nombre,
              phone: bestMatch.phone || phone,
              card_number: bestMatch.card_number || card,
              source: 'FUZZY'
          };
      }
  }

  return { nombre: rawNombre?.toUpperCase(), phone, card_number: card, source: 'PARTIAL' };
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

/**
 * Propagates current customer catalog data to all bank statements.
 * Useful after manual corrections or bulk updates.
 */
export async function propagateIdentity(): Promise<number> {
    const allCustomers = await db.customers.toArray();
    let affectedTxs = 0;

    for (const customer of allCustomers) {
        // 1. Match by CI (Strong match)
        const byCi = await db.bank_statements.where('carnet').equals(customer.ci).toArray();
        for (const tx of byCi) {
            const needsUpdate =
                tx.nombre_cliente !== customer.nombre ||
                tx.telefono_cliente !== customer.phone ||
                tx.tarjeta_cliente !== customer.card_number;

            if (needsUpdate) {
                await db.bank_statements.update(tx.referencia_origen, {
                    nombre_cliente: customer.nombre,
                    telefono_cliente: customer.phone,
                    tarjeta_cliente: customer.card_number
                });
                affectedTxs++;
            }
        }

        // 2. Match by Name (Weak match - only if no CI)
        const byName = await db.bank_statements
            .where('nombre_cliente').equals(customer.nombre)
            .and(t => !t.carnet)
            .toArray();

        for (const tx of byName) {
            await db.bank_statements.update(tx.referencia_origen, {
                carnet: customer.ci,
                telefono_cliente: customer.phone,
                tarjeta_cliente: customer.card_number
            });
            affectedTxs++;
        }

        // 3. Match by Heuristic Similarity (> 85% - only if no CI and no Name match)
        // This is more intensive, we only do it for pending or partially filled ones
        const pendingTxs = await db.bank_statements
            .filter(t => !t.carnet && t.nombre_cliente && t.nombre_cliente !== customer.nombre)
            .toArray();

        for (const tx of pendingTxs) {
            const sim = similarity(normalizeName(tx.nombre_cliente!), customer.normalized_name);
            if (sim > 0.85) {
                await db.bank_statements.update(tx.referencia_origen, {
                    carnet: customer.ci,
                    nombre_cliente: customer.nombre, // Normalize to catalog name
                    telefono_cliente: customer.phone,
                    tarjeta_cliente: customer.card_number
                });
                affectedTxs++;
            }
        }
    }
    return affectedTxs;
}
