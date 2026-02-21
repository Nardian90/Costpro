export interface ParsedTransaction {
    id: string;
    fecha: string;
    pagador: string;
    cuentaTarjeta: string;
    esImpuesto: boolean;
    monto: number;
    moneda: string;
    tipo: 'Cr' | 'Db';
    comision: number;
    tieneComision: boolean;
    observaciones: string;
}

/**
 * Procesa un array de transacciones y extrae información vital del campo observaciones
 * utilizando expresiones regulares robustas.
 */
export function parseTransactions(data: any[]): ParsedTransaction[] {
    if (!data) return [];

    return data.map(tx => {
        const obs = tx.observaciones || '';

        // 1. Nombre del Pagador
        // Extraer el valor que sigue a ORDENADA POR: o ORDENANTE NOMBRE: hasta el siguiente delimitador (PAN, |, o salto de línea).
        let pagador = 'DESCONOCIDO';
        const pagadorRegex = /(?:ORDENADA POR:|ORDENANTE NOMBRE:)\s*(.*?)(?=\s*(?:PAN:|\||\n|$))/i;
        const pagadorMatch = obs.match(pagadorRegex);
        if (pagadorMatch && pagadorMatch[1]) {
            pagador = pagadorMatch[1].trim();
        }

        // 2. Cuenta/Tarjeta
        // Extraer el valor numérico después de PAN: o Tarjeta RED:.
        let cuentaTarjeta = 'N/A';
        const cuentaRegex = /(?:PAN:|Tarjeta RED:)\s*([\d*]+)/i;
        const cuentaMatch = obs.match(cuentaRegex);
        if (cuentaMatch && cuentaMatch[1]) {
            cuentaTarjeta = cuentaMatch[1].trim();
        }

        // 3. Indicador de Impuestos
        // Si la observación contiene la subcadena NIT:, marcar como "Pago de Impuesto" (Booleano: true).
        const esImpuesto = obs.toUpperCase().includes('NIT:');

        // 4. Monto y Moneda
        // Extraer del XML <MON_TRANSA... IMPORTE="X"/> o del texto numérico principal de la tabla.
        // Priorizamos el XML si está presente.
        let monto = (tx.importe_cents || 0) / 100;
        let moneda = 'CUP'; // Moneda por defecto

        const xmlMontoRegex = /IMPORTE="([^"]+)"/i;
        const xmlMatch = obs.match(xmlMontoRegex);
        if (xmlMatch && xmlMatch[1]) {
            const parsedMonto = parseFloat(xmlMatch[1]);
            if (!isNaN(parsedMonto)) {
                monto = parsedMonto;
            }
        }

        const xmlMonedaRegex = /MONEDA="([^"]+)"/i;
        const xmlMonedaMatch = obs.match(xmlMonedaRegex);
        if (xmlMonedaMatch && xmlMonedaMatch[1]) {
            moneda = xmlMonedaMatch[1].trim();
        }

        // 5. Tipo de Transacción
        // Clasificar como Crédito (Cr) o Débito (Db).
        const tipo = tx.tipo || 'Cr';

        // 6. Comisión
        // Evaluar si es mayor a 0 para clasificar "Con Comisión" vs "Sin Comisión".
        const comision = (tx.comision_cents || 0) / 100;
        const tieneComision = comision > 0;

        return {
            id: tx.id,
            fecha: tx.fecha,
            pagador,
            cuentaTarjeta,
            esImpuesto,
            monto,
            moneda,
            tipo,
            comision,
            tieneComision,
            observaciones: obs
        };
    });
}
