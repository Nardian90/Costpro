import { db, type Customer } from "@/lib/dexie";
import { normalizeName, similarity, normalizeCliente } from "./normalization";
import { v4 as uuidv4 } from 'uuid';

export type ResolutionSource = 'CATALOG' | 'NEW' | 'PARTIAL' | 'CONFLICT' | 'FUZZY';

export interface IdentityResult {
  ci?: string;
  nombre?: string;
  phone?: string;
  card_number?: string;
  source: ResolutionSource;
}

export interface CustomerStats {
  totalTransactions: number;
  totalAmountCents: number;
}

/**
 * Hybrid Catalog logic: Merges persisted customers with data detected in transactions.
 * Ensures that any client visible in reports is also visible in the catalog.
 */
export async function getHybridCustomers(): Promise<Customer[]> {
  const [customers, transactions] = await Promise.all([
    db.customers.toArray(),
    db.bank_statements.toArray()
  ]);

  const map = new Map<string, Customer>();

  // 1. Base persistida (Catálogo Maestro)
  customers.forEach(c => {
    map.set(c.ci || c.nombre, c);
  });

  // 2. Enriquecimiento desde transacciones (Clientes Virtuales)
  transactions.forEach(tx => {
    const norm = normalizeCliente(tx);
    const key = norm.ci || norm.nombre;

    if (key && !map.has(key)) {
      // Crear un registro virtual compatible con la interfaz Customer
      map.set(key, {
        ci: norm.ci,
        nombre: norm.nombre_display,
        normalized_name: norm.nombre,
        raw_names: [norm.nombre_display],
        phone: norm.telefono,
        card_number: norm.tarjeta,
        status: (norm.ci && norm.nombre) ? "COMPLETO" : "PARCIAL",
        source: "AUTOMATICO",
        created_at: tx.created_at || new Date().toISOString(),
        updated_at: tx.updated_at || new Date().toISOString()
      } as Customer);
    }
  });

  return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/**
 * Resolves a customer identity from raw input data.
 */
export async function resolveIdentity(
  transactionRef: string,
  ci?: string,
  rawNombre?: string,
  inputPhone?: string,
  inputCard?: string
): Promise<IdentityResult> {
  const normalizedInputName = normalizeName(rawNombre || "");
  const phone = inputPhone?.trim();
  const card = inputCard?.trim();

  // Helper to check if data is generic placeholder
  const isPlaceholder = (val?: string) => {
    if (!val) return true;
    const upper = val.toUpperCase();
    return upper === 'CI' || upper === 'NOMBRE' || upper === 'TELÉFONO' || upper === 'TARJETA' || upper === 'TELEFONO' || upper === 'N/A';
  };

  const cleanCi = isPlaceholder(ci) ? undefined : ci;
  const cleanNombre = isPlaceholder(rawNombre) ? undefined : rawNombre;

  // 1. Priority 1: CI exact match
  if (cleanCi) {
    const fromCatalog = await db.customers.get(cleanCi);
    if (fromCatalog) {
      const isNameConflict = normalizedInputName && fromCatalog.normalized_name !== normalizedInputName && !isPlaceholder(rawNombre);
      if (isNameConflict) {
          await logAudit(transactionRef, 'CONFLICT',
            `Conflicto de nombre para CI ${cleanCi}: Importado '${rawNombre}' vs Catálogo '${fromCatalog.nombre}'`);
      }

      // Update missing fields in catalog if found in transaction
      const updates: Partial<Customer> = {};
      if (!fromCatalog.phone && phone && !isPlaceholder(phone)) updates.phone = phone;
      if (!fromCatalog.card_number && card && !isPlaceholder(card)) updates.card_number = card;
      if (cleanNombre && !fromCatalog.raw_names.includes(cleanNombre)) {
          updates.raw_names = [...fromCatalog.raw_names, cleanNombre];
      }

      if (Object.keys(updates).length > 0) {
          await db.customers.update(cleanCi, { ...updates, updated_at: new Date().toISOString() });
      }

      return {
        ci: cleanCi,
        nombre: fromCatalog.nombre,
        phone: fromCatalog.phone || (isPlaceholder(phone) ? undefined : phone),
        card_number: fromCatalog.card_number || (isPlaceholder(card) ? undefined : card),
        source: isNameConflict ? 'CONFLICT' : 'CATALOG'
      };
    } else if (cleanNombre) {
      // New valid record
      const newCustomer: Customer = {
        ci: cleanCi,
        nombre: cleanNombre.toUpperCase(),
        normalized_name: normalizedInputName,
        raw_names: [cleanNombre],
        phone: isPlaceholder(phone) ? undefined : phone,
        card_number: isPlaceholder(card) ? undefined : card,
        status: (cleanCi && cleanNombre) ? "COMPLETO" : "PARCIAL",
        source: "AUTOMATICO",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      await db.customers.put(newCustomer);
      await logAudit(transactionRef, 'NEW_RECORD', `Nuevo cliente registrado: ${cleanNombre} (${cleanCi})`);
      return { ci: cleanCi, nombre: newCustomer.nombre, phone: newCustomer.phone, card_number: newCustomer.card_number, source: 'NEW' };
    }
  }

  // 2. Priority 2: Exact Normalized Name Match
  if (normalizedInputName && !isPlaceholder(rawNombre)) {
    const matches = await db.customers.where('normalized_name').equals(normalizedInputName).toArray();
    if (matches.length === 1) {
      const found = matches[0];
      await logAudit(transactionRef, 'AUTO_CORRECTION',
        `Enriquecimiento automático para ${rawNombre}: Encontrado CI ${found.ci}`);
      return {
          ci: found.ci,
          nombre: found.nombre,
          phone: found.phone || (isPlaceholder(phone) ? undefined : phone),
          card_number: found.card_number || (isPlaceholder(card) ? undefined : card),
          source: 'CATALOG'
      };
    } else if (matches.length > 1) {
       await logAudit(transactionRef, 'CONFLICT',
          `Ambigüedad: Múltiples CIs encontrados para el nombre '${rawNombre}'`);
       return { nombre: cleanNombre?.toUpperCase(), phone: isPlaceholder(phone) ? undefined : phone, card_number: isPlaceholder(card) ? undefined : card, source: 'CONFLICT' };
    }
  }

  // 3. Priority 3: Fuzzy Matching (> 0.85 similarity)
  if (normalizedInputName && !isPlaceholder(rawNombre)) {
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
              phone: bestMatch.phone || (isPlaceholder(phone) ? undefined : phone),
              card_number: bestMatch.card_number || (isPlaceholder(card) ? undefined : card),
              source: 'FUZZY'
          };
      }
  }

  return { nombre: cleanNombre?.toUpperCase(), phone: isPlaceholder(phone) ? undefined : phone, card_number: isPlaceholder(card) ? undefined : card, source: 'PARTIAL' };
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
        affectedTxs += await propagateCustomerIdentity(customer.ci);
    }
    return affectedTxs;
}

/**
 * Propagates a specific customer identity to bank statements.
 */
export async function propagateCustomerIdentity(ci: string): Promise<number> {
    const customer = await db.customers.get(ci);
    if (!customer) return 0;

    let affected = 0;

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
            affected++;
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
        affected++;
    }

    // 3. Match by Heuristic Similarity (> 85% - only if no CI and no Name match)
    const pendingTxs = await db.bank_statements
        .filter(t => !!(!t.carnet && t.nombre_cliente && t.nombre_cliente !== customer.nombre))
        .toArray();

    for (const tx of pendingTxs) {
        const sim = similarity(normalizeName(tx.nombre_cliente!), customer.normalized_name);
        if (sim > 0.85) {
            await db.bank_statements.update(tx.referencia_origen, {
                carnet: customer.ci,
                nombre_cliente: customer.nombre,
                telefono_cliente: customer.phone,
                tarjeta_cliente: customer.card_number
            });
            affected++;
        }
    }

    return affected;
}

/**
 * Calculates statistics for a specific customer based on bank statements.
 */
export async function getCustomerStats(ci: string): Promise<CustomerStats> {
    const txs = await db.bank_statements.where('carnet').equals(ci).toArray();
    const totalAmountCents = txs.reduce((sum, tx) => sum + (tx.importe_venta_cents || tx.importe_cents || 0), 0);

    return {
        totalTransactions: txs.length,
        totalAmountCents
    };
}

/**
 * Gets stats for all customers.
 */
export async function getAllCustomerStats(): Promise<Record<string, CustomerStats>> {
    const allTxs = await db.bank_statements.toArray();
    const stats: Record<string, CustomerStats> = {};

    for (const tx of allTxs) {
        if (tx.carnet) {
            if (!stats[tx.carnet]) {
                stats[tx.carnet] = { totalTransactions: 0, totalAmountCents: 0 };
            }
            stats[tx.carnet].totalTransactions += 1;
            stats[tx.carnet].totalAmountCents += (tx.importe_venta_cents || tx.importe_cents || 0);
        }
    }

    return stats;
}

/**
 * Adds or updates a customer manually.
 */
export async function saveCustomerManually(customerData: Partial<Customer> & { ci: string }): Promise<void> {
    const ci = customerData.ci.trim();
    if (!ci) throw new Error("CI es requerido");

    const existing = await db.customers.get(ci);
    const nombre = customerData.nombre || existing?.nombre || "";
    const normalized_name = normalizeName(nombre);

    const status = (ci && nombre && customerData.phone && customerData.card_number) ? "COMPLETO" : "PARCIAL";

    const customer: Customer = {
        ci,
        nombre: nombre.toUpperCase(),
        normalized_name,
        raw_names: existing?.raw_names || (nombre ? [nombre] : []),
        phone: customerData.phone || existing?.phone,
        card_number: customerData.card_number || existing?.card_number,
        status,
        source: "MANUAL",
        created_at: existing?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    await db.customers.put(customer);
    // Auto-propagate to reports
    await propagateCustomerIdentity(ci);
}

/**
 * Deletes a customer from the catalog.
 */
export async function deleteCustomer(ci: string): Promise<void> {
    await db.customers.delete(ci);
}

/**
 * Resolves a specific identity conflict.
 */
export async function resolveConflict(
    auditId: string,
    resolution: 'KEEP_CATALOG' | 'UPDATE_CATALOG' | 'MERGE'
): Promise<void> {
    const audit = await db.identity_audit.get(auditId);
    if (!audit) throw new Error("Conflicto no encontrado");

    // Implementation of resolution logic can be expanded here
    // For now, we just remove the audit entry to mark it as "handled"
    await db.identity_audit.delete(auditId);
}
