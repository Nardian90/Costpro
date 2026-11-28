#!/usr/bin/env node
/**
 * ADN-011 · Publicación de la edición del 2026-11-27 (reparación del hueco
 * detectado por el watchdog en su guardia fundacional).
 *
 * INSERT idempotente en public.gaceta_posts (service_role), formato del
 * contrato ADN-011 (bloques {t, v}). Dos notas: 1 gaceta + 1 costpro.
 * Re-ejecutable: slug repetido → HTTP 409 tratado como YA-PUBLICADA.
 *
 * Uso: set -a; source .env; set +a; node scripts/gaceta/insert-edicion-20261127.mjs
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://wthkddeleylijmonclxg.supabase.co';
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SR) { console.error('[insert-edicion] Falta SUPABASE_SERVICE_ROLE_KEY en el entorno'); process.exit(3); }

const notas = [
  {
    fecha: '2026-11-27',
    slug: 'gaceta-2026-11-27-seguridad-social-en-vigor',
    tipo: 'gaceta',
    titular: 'Ya corren las nuevas reglas de seguridad social: la reforma de pensiones entra en vigor y tu nómina la siente primero',
    bajada: 'El Decreto-Ley 140 y el Decreto 186, publicados en la Gaceta Oficial No. 97, están vigentes desde el 25 de noviembre: esto es lo que cambia para los regímenes de contribución de cuentapropistas y socios de MIPyme.',
    cuerpo: [
      { t: 'p', v: 'La Gaceta Oficial de la República publicó el 18 de noviembre, en su número 97 ordinario, el paquete normativo que reforma la seguridad social cubana: el Decreto-Ley 140 —que modifica la Ley 105 y siete decretos-leyes— y su complementario Decreto 186. Desde el 25 de noviembre esas reglas ya están en vigor, y para quien lleva la contabilidad de una MIPyme la transición empieza en la propia nómina.' },
      { t: 'h2', v: 'Lo que cambia en las contribuciones' },
      { t: 'li', v: 'Los sujetos comprendidos en el Decreto-Ley 92 —trabajadores por cuenta propia y socios de entidades no estatales— pasan a una tasa del 20 % sobre la base de contribución.' },
      { t: 'li', v: 'Se elimina el límite de la escala de contribución para los regímenes especiales: cuentapropistas, socios de MIPyme, artistas y gente de mar.' },
      { t: 'li', v: 'El Consejo de Ministros fijará anualmente las cuantías mínimas de pensiones y prestaciones por invalidez, sin que puedan quedar por debajo del salario mínimo.' },
      { t: 'quote', v: 'La reforma no establece un aumento general inmediato de las pensiones ni un mecanismo automático de indexación, pero faculta al Consejo de Ministros a actualizarlas cada año.' },
      { t: 'h2', v: 'Qué hacer con tu contabilidad' },
      { t: 'p', v: 'Si tu negocio liquida contribuciones de seguridad social, revisa la base y la tasa aplicables a cada socio desde el cierre de noviembre: el cambio de escala toca directamente el cálculo de las obligaciones del mes, y el margen de error nuevo ya no está en el tope sino en la base declarada.' },
      { t: 'dato', v: 'Vigencia: 25 de noviembre de 2026 · Norma: Decreto-Ley 140 y Decreto 186 · Publicación: Gaceta Oficial No. 97 Ordinaria, 18/11/2026' },
    ],
    etiquetas: ['seguridad-social', 'pensiones', 'mipymes', 'onat'],
    fuente: 'https://www.directoriocubano.com/wp-content/uploads/dc-gaceta/archive/pdf/2026/11/ordinaria/097/gaceta.pdf',
    destacado: true,
    estado: 'publicada',
  },
  {
    fecha: '2026-11-27',
    slug: 'costpro-2026-11-27-pagos-por-linea-y-cadena-de-vigilancia',
    tipo: 'costpro',
    titular: 'ADNegocio ya reparte cada pago a su línea de venta — y su propio periódico se vigila solo',
    bajada: 'El punto de venta registra la mezcla de efectivo y transferencia de cada producto de la factura; y una nueva cadena de vigilancia automática cuida que El Diario Contable salga a diario, sin huecos.',
    cuerpo: [
      { t: 'p', v: 'Dos novedades de la plataforma llegaron esta semana. La primera salió del horno del desarrollo y ya está en producción: el punto de venta de ADNegocio registra ahora el pago por línea de venta. Si en una misma factura un producto se cobró en efectivo y otro por transferencia, cada línea guarda su propia distribución real de pago, en lugar de un único desglose global de la operación.' },
      { t: 'li', v: 'La caja sigue cuadrando igual: los importes por método se conservan y los históricos no cambian; la novedad es el detalle por producto.' },
      { t: 'li', v: 'Para el contador, la ventaja es el concilio: saber qué se vendió y con qué método, producto a producto, sin reconstruirlo a mano desde los tickets.' },
      { t: 'h2', v: 'Un periódico que no puede fallar' },
      { t: 'p', v: 'La segunda novedad es la que hace posible que estés leyendo esta edición. La publicación de El Diario Contable pasó a operar con una cadena de vigilancia de tres niveles: el editor que publica a diario, un guardián que comprueba una hora después que la edición exista —y la publica si faltó—, y un auditor que vigila al guardián. Con ella, un hueco como el de esta semana, en que el diario no salió durante tres días, queda detectado y reparado el mismo día.' },
      { t: 'dato', v: 'En producción desde: 25 de noviembre de 2026 (pagos por línea de venta) · Cadena de vigilancia del Diario Contable: instalada el 27 de noviembre de 2026' },
      { t: 'p', v: 'Las notas de Novedades de ADNegocio describen funcionalidad real de la plataforma, con base en el repositorio del producto y su expediente de auditoría.' },
    ],
    etiquetas: ['adnegocio', 'pos', 'novedades', 'diario-contable'],
    fuente: null,
    destacado: false,
    estado: 'publicada',
  },
];

async function main() {
  for (const n of notas) {
    const res = await fetch(`${URL_BASE}/rest/v1/gaceta_posts`, {
      method: 'POST',
      headers: {
        apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(n),
    });
    if (res.status === 201) {
      console.log(`[insert-edicion] PUBLICADA ${n.slug} (${n.tipo}) HTTP 201`);
    } else if (res.status === 409) {
      console.log(`[insert-edicion] YA-PUBLICADA ${n.slug} HTTP 409 (idempotente, sin cambio)`);
    } else {
      const body = (await res.text()).slice(0, 200);
      console.error(`[insert-edicion] ERROR ${n.slug} HTTP ${res.status}: ${body}`);
      process.exit(1);
    }
  }
}
main().catch((e) => { console.error('[insert-edicion] Error:', e.message); process.exit(3); });
