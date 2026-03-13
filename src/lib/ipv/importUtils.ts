import { db, type Product, type ProductMovement } from '@/lib/dexie';
import { v4 as uuidv4 } from 'uuid';

export async function importProducts(jsonData: any[], provenance: string = 'IMPORT'): Promise<number> {
    const validProducts: Product[] = [];
    const movements: ProductMovement[] = [];
    const now = new Date().toISOString();

    for (const row of jsonData) {
        const cod = row['Código'] || row['cod'] || row['CODIGO'] || row['COD'];
        const id_grupo = row['id_grupo'] || row['ID_GRUPO'] || row['Grupo'] || '';
        const cod_hijo = row['cod_hijo'] || row['COD_HIJO'] || row['Hijo'] || '';
        const descripcion = row['Descripción'] || row['descripcion'] || row['DESCRIPCION'] || row['desc'];
        const um = row['UM'] || row['um'] || 'UNIDADES';
        const precio = row['Precio ($)'] || row['precio_cents'] || row['PRECIO'] || row['precio'] || 0;
        const prioridad = row['Prioridad'] || row['prioridad_alg'] || row['prioridad_algoritmo'] || row['prioridad'] || 3;
        const stock = row['Stock Inicial'] || row['stock_inicial_manual'] || row['stock'] || 0;
        const es_pqt_val = row['Es Paquete (S/N)'] || row['es_paquete'] || '';
        const cont_pqt = row['Contenido Paquete'] || row['contenido_paquete'] || 1;
        const variacion = row['variacion_permisible_percent'] || row['VARIACION_PERMISIBLE_PERCENT'] || row['Variacion %'] || 0;

        if (!cod || !descripcion) continue;

        const finalCod = String(cod).toUpperCase().trim();
        const es_paquete = String(es_pqt_val).toUpperCase() === 'S' ||
                          String(es_pqt_val).toUpperCase() === 'VERDADERO' ||
                          es_pqt_val === true ||
                          es_pqt_val === 'true';

        validProducts.push({
            cod: finalCod,
            id_grupo: id_grupo ? String(id_grupo).toUpperCase().trim() : '',
            cod_hijo: cod_hijo ? String(cod_hijo).toUpperCase().trim() : '',
            descripcion: String(descripcion),
            um: String(um).toUpperCase().trim(),
            precio_cents: typeof precio === 'number' ? precio : parseFloat(String(precio).replace(',', '.')),
            prioridad_algoritmo: parseInt(String(prioridad)),
            stock_inicial_manual: typeof stock === 'number' ? stock : parseFloat(String(stock).replace(',', '.')),
            es_paquete,
            contenido_paquete: parseInt(String(cont_pqt)),
            variacion_permisible_percent: typeof variacion === 'number' ? variacion : parseFloat(String(variacion).replace(',', '.')),
            activo: true,
            created_at: now,
            updated_at: now,
            priorityMode: 'manual',
            isWildcardCandidate: false
        });

        movements.push({
            id: crypto.randomUUID(),
            fecha: now,
            producto_origen_cod: 'SYSTEM',
            producto_destino_cod: finalCod,
            cantidad_origen: 0,
            cantidad_destino: typeof stock === 'number' ? stock : parseFloat(String(stock).replace(',', '.')),
            tipo: 'IMPORT',
            provenance: provenance,
            created_at: now
        });
    }

    if (validProducts.length > 0) {
        await db.products.bulkPut(validProducts);
        await db.product_movements.bulkAdd(movements);
        return validProducts.length;
    }
    return 0;
}
