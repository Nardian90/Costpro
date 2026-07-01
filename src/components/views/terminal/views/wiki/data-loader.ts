import { AsientosData, CuentasData, ClasificadorData } from './types';

export async function loadAsientos(): Promise<AsientosData> {
  const res = await fetch('/manuals/wiki/asientos.json');
  if (!res.ok) throw new Error('Failed to load asientos.json');
  return res.json();
}

export async function loadCuentas(): Promise<CuentasData> {
  const res = await fetch('/manuals/wiki/cuentas_hierarchical.json');
  if (!res.ok) throw new Error('Failed to load cuentas_hierarchical.json');
  return res.json();
}

export async function loadClasificador(): Promise<ClasificadorData> {
  const res = await fetch('/manuals/wiki/clasificador.json');
  if (!res.ok) throw new Error('Failed to load clasificador.json');
  return res.json();
}
