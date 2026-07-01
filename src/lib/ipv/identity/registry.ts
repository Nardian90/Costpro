import { db, type Customer } from "@/lib/dexie";
import { normalizeName, similarity, getCanonicalName } from "./normalization";
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
 * Gets a unified list of customers from both manual catalog and bank transactions.
 */
export async function getHybridCustomers(): Promise<Customer[]> {
  const catalog = await db.customers.toArray();
  const txCustomers = await db.bank_statements
    .filter(tx => !!(tx.carnet || tx.nombre_cliente))
    .toArray();

  const map = new Map<string, Customer>();

  // 1. Add catalog records
  catalog.forEach(c => map.set(c.ci, c));

  // 2. Add from transactions (if not already in catalog)
  txCustomers.forEach(tx => {
    if (tx.carnet && !map.has(tx.carnet)) {
      map.set(tx.carnet, {
        ci: tx.carnet,
        nombre: (tx.nombre_cliente || "DESCONOCIDO").toUpperCase(),
        normalized_name: normalizeName(tx.nombre_cliente || ""),
        raw_names: tx.nombre_cliente ? [tx.nombre_cliente] : [],
        phone: tx.telefono_cliente,
        card_number: tx.tarjeta_cliente,
        status: "PARCIAL",
        source: "AUTOMATICO",
        created_at: tx.fecha,
        updated_at: tx.fecha
      });
    }
  });

  return Array.from(map.values());
}

/**
 * Resolves a customer identity from transaction data.
 */
export async function resolveIdentity(
  transactionRef: string,
  ci?: string,
  rawNombre?: string,
  inputPhone?: string,
  inputCard?: string
): Promise<IdentityResult> {
  const normalizedInputName = normalizeName(rawNombre || "");
  const canonicalInputName = getCanonicalName(rawNombre || "");
  const phone = inputPhone?.trim();
  const card = inputCard?.trim();

  const isPlaceholder = (val?: string) => {
    if (!val) return true;
    const upper = val.toUpperCase();
    return upper === 'CI' || upper === 'NOMBRE' || upper === 'TELÉFONO' || upper === 'TARJETA' || upper === 'TELEFONO' || upper === 'N/A';
  };

  const cleanCi = isPlaceholder(ci) ? undefined : ci;
  const cleanNombre = isPlaceholder(rawNombre) ? undefined : rawNombre;

  if (cleanCi) {
    const fromCatalog = await db.customers.get(cleanCi);
    if (fromCatalog) {
      const isNameConflict = normalizedInputName && fromCatalog.normalized_name !== normalizedInputName && !isPlaceholder(rawNombre);
      if (isNameConflict) {
          // Check if it's just a spacing artifact
          const canonicalCatalog = getCanonicalName(fromCatalog.nombre);
          if (canonicalCatalog !== canonicalInputName) {
            await logAudit(transactionRef, 'CONFLICT',
              `Conflicto de nombre para CI ${cleanCi}: Importado '${rawNombre}' vs Catálogo '${fromCatalog.nombre}'`);
          }
      }

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
      // Before creating a new record by CI, check if this CI exists under a different canonical name?
      // Unlikely since CI is PK.
      // But let's check if the NAME already exists under a DIFFERENT CI to prevent duplicates.
      const allCustomers = await db.customers.toArray();
      const duplicateByName = allCustomers.find(c => getCanonicalName(c.nombre) === canonicalInputName);

      if (duplicateByName && !duplicateByName.ci.startsWith('_GEN_')) {
          // Found a duplicate by name that has a real CI.
          await logAudit(transactionRef, 'AUTO_CORRECTION',
            `Detección de duplicado por nombre: '${rawNombre}' ya existe con CI ${duplicateByName.ci}`);
          return {
            ci: duplicateByName.ci,
            nombre: duplicateByName.nombre,
            phone: duplicateByName.phone || (isPlaceholder(phone) ? undefined : phone),
            card_number: duplicateByName.card_number || (isPlaceholder(card) ? undefined : card),
            source: 'CATALOG'
          };
      }

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

  // No CI provided, try to find by canonical name
  if (canonicalInputName && !isPlaceholder(rawNombre)) {
    const allCustomers = await db.customers.toArray();
    const found = allCustomers.find(c => getCanonicalName(c.nombre) === canonicalInputName);

    if (found) {
      await logAudit(transactionRef, 'AUTO_CORRECTION',
        `Enriquecimiento automático para ${rawNombre}: Encontrado CI ${found.ci} (Match Canónico)`);
      return {
          ci: found.ci,
          nombre: found.nombre,
          phone: found.phone || (isPlaceholder(phone) ? undefined : phone),
          card_number: found.card_number || (isPlaceholder(card) ? undefined : card),
          source: 'CATALOG'
      };
    }
  }

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

export async function propagateIdentity(): Promise<number> {
    const allCustomers = await db.customers.toArray();
    let affectedTxs = 0;

    for (const customer of allCustomers) {
        affectedTxs += await propagateCustomerIdentity(customer.ci);
    }
    return affectedTxs;
}

export async function propagateCustomerIdentity(ci: string): Promise<number> {
    const customer = await db.customers.get(ci);
    if (!customer) return 0;

    let affected = 0;

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

export async function getCustomerStats(ci: string): Promise<CustomerStats> {
    const txs = await db.bank_statements.where('carnet').equals(ci).toArray();
    const totalAmountCents = txs.reduce((sum, tx) => sum + (tx.importe_venta_cents || tx.importe_cents || 0), 0);

    return {
        totalTransactions: txs.length,
        totalAmountCents
    };
}

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

export async function saveCustomerManually(customerData: Partial<Customer> & { ci: string }): Promise<void> {
    const ci = customerData.ci.trim();
    if (!ci) throw new Error("CI es requerido");

    const existing = await db.customers.get(ci);
    const nombre = customerData.nombre || existing?.nombre || "";
    const normalized_name = normalizeName(nombre);

    const status = (ci && nombre && (customerData.phone || existing?.phone) && (customerData.card_number || existing?.card_number)) ? "COMPLETO" : "PARCIAL";

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
    await propagateCustomerIdentity(ci);
}

export async function deleteCustomer(ci: string): Promise<void> {
    await db.customers.delete(ci);
    const txs = await db.bank_statements.where("carnet").equals(ci).toArray();
    for (const tx of txs) {
        await db.bank_statements.update(tx.referencia_origen, {
            carnet: undefined,
            nombre_cliente: undefined,
            telefono_cliente: undefined,
            tarjeta_cliente: undefined
        });
    }
}

export async function resolveConflict(
    auditId: string,
    resolution: 'KEEP_CATALOG' | 'UPDATE_CATALOG' | 'MERGE'
): Promise<void> {
    const audit = await db.identity_audit.get(auditId);
    if (!audit) throw new Error("Conflicto no encontrado");
    await db.identity_audit.delete(auditId);
}

/**
 * Scans all bank transactions and adds unique identities (CI + Name)
 * to the customers catalog if they don't exist yet.
 */
export async function syncCatalogFromTransactions(): Promise<number> {
  const txCustomers = await db.bank_statements
    .filter(tx => !!(tx.carnet || tx.nombre_cliente))
    .toArray();

  let importedCount = 0;
  for (const tx of txCustomers) {
    const canonicalName = getCanonicalName(tx.nombre_cliente || "");
    const allCustomers = await db.customers.toArray();

    // Check if this identity already exists under a different CI or if the name is a spacing variant
    const existingByName = allCustomers.find(c => getCanonicalName(c.nombre) === canonicalName);

    const effectiveCi = tx.carnet || (existingByName ? existingByName.ci : `_GEN_${normalizeName(tx.nombre_cliente || "").slice(0, 3)}_${tx.referencia_origen.slice(-4)}`);
    const existing = await db.customers.get(effectiveCi);

    if (!existing) {
      await db.customers.put({
        ci: effectiveCi,
        nombre: (tx.nombre_cliente || "DESCONOCIDO").toUpperCase(),
        normalized_name: normalizeName(tx.nombre_cliente || ""),
        raw_names: tx.nombre_cliente ? [tx.nombre_cliente] : [],
        phone: tx.telefono_cliente,
        card_number: tx.tarjeta_cliente,
        status: (tx.carnet && tx.nombre_cliente) ? "COMPLETO" : "PARCIAL",
        source: "AUTOMATICO",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      importedCount++;
    } else {
      const updates: Partial<Customer> = {};
      if (!existing.phone && tx.telefono_cliente) updates.phone = tx.telefono_cliente;
      if (!existing.card_number && tx.tarjeta_cliente) updates.card_number = tx.tarjeta_cliente;
      if (tx.nombre_cliente && !existing.raw_names.includes(tx.nombre_cliente)) {
        updates.raw_names = [...existing.raw_names, tx.nombre_cliente];
      }

      if (Object.keys(updates).length > 0) {
        await db.customers.update(existing.ci, {
          ...updates,
          updated_at: new Date().toISOString()
        });
      }
    }
  }
  return importedCount;
}
