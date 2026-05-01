'use client';

/**
 * Loads xlsx only when needed for export/import.
 * Eliminates ~240KB from the initial client bundle.
 */
export async function createWorkbook() {
  const XLSX = await import('xlsx');
  return XLSX;
}
