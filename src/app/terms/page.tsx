import { Metadata } from 'next';
import Link from 'next/link';
import { Scale, User, Shield, FileText, AlertTriangle, Clock, Globe, Mail, Server, Ban, Copyright, Settings } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Términos y Condiciones — CostPro',
  description: 'Términos y condiciones de uso de la plataforma CostPro Enterprise.',
  robots: { index: true },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Scale className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Términos y Condiciones</h1>
            <p className="text-sm text-muted-foreground">Última actualización: {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">

          {/* ── 1. Aceptación de los Términos ── */}
          <Section icon={<Scale className="w-5 h-5" />} title="1. Aceptación de los Términos">
            <p className="text-sm text-muted-foreground">
              Al acceder, registrarse o utilizar la plataforma CostPro Enterprise (en adelante, &quot;el Servicio&quot;),
              usted (en adelante, &quot;el Usuario&quot; o &quot;usted&quot;) acepta quedar vinculado de manera irrevocable
              por los presentes Términos y Condiciones (en adelante, &quot;Términos&quot;), así como por nuestra
              {' '}
              <Link href="/privacy" className="text-green-500 hover:underline">
                Política de Privacidad
              </Link>.
            </p>
            <p className="text-sm text-muted-foreground">
              Si usted no está de acuerdo con alguno de los presentes Términos, deberá cesar inmediatamente
              el uso del Servicio. El uso continuado del Servicio después de la publicación de modificaciones
              constituirá su aceptación de dichos cambios.
            </p>
            <p className="text-sm text-muted-foreground">
              Estos Términos constituyen un acuerdo legal vinculante entre usted y CostPro Enterprise.
              En caso de conflicto entre la versión en español y cualquier traducción, prevalecerá la
              versión en español.
            </p>
          </Section>

          {/* ── 2. Descripción del Servicio ── */}
          <Section icon={<Server className="w-5 h-5" />} title="2. Descripción del Servicio">
            <p className="text-sm text-muted-foreground mb-3">
              CostPro Enterprise es una plataforma integral de gestión empresarial diseñada para optimizar
              la operación de negocios de cualquier escala. El Servicio incluye, entre otras funcionalidades:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { label: 'Gestión de Inventario', desc: 'Control de stock, alertas, movimientos entre almacenes' },
                { label: 'Punto de Venta (POS)', desc: 'Sistema de ventas rápido con múltiples métodos de pago' },
                { label: 'Control de Costos', desc: 'Fichas de costo, cálculo de margen y rentabilidad' },
                { label: 'Multi-Tienda', desc: 'Gestión centralizada de múltiples puntos de venta' },
                { label: 'Reportes y Analítica', desc: 'Dashboards en tiempo real, exportación a PDF/Excel' },
                { label: 'Gestión de Cartera', desc: 'Control de cuentas por cobrar y pagos' },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 mt-2" />
                  <div>
                    <strong>{item.label}:</strong> {item.desc}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              CostPro se reserva el derecho de modificar, suspender o descontinuar cualquier funcionalidad
              del Servicio en cualquier momento, con o sin aviso previo, siempre respetando las obligaciones
              contraídas con los usuarios activos.
            </p>
          </Section>

          {/* ── 3. Registro y Cuentas ── */}
          <Section icon={<User className="w-5 h-5" />} title="3. Registro y Cuentas">
            <p className="text-sm text-muted-foreground mb-3">
              Para utilizar el Servicio, usted debe crear una cuenta proporcionando información veraz,
              precisa y completa. Al registrarse, usted se compromete a:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Proporcionar información de contacto válida (nombre, correo electrónico).</li>
              <li>Mantener la información de su cuenta actualizada en todo momento.</li>
              <li>Ser responsable de toda la actividad que se realice bajo su cuenta.</li>
              <li>No compartir sus credenciales de acceso con terceros bajo ninguna circunstancia.</li>
              <li>Notificar inmediatamente a CostPro sobre cualquier uso no autorizado de su cuenta.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              CostPro asignará un rol al usuario dentro de la organización (administrador, gerente, cajero, etc.)
              con permisos específicos. El administrador de la organización es responsable de gestionar los
              accesos de su equipo y de velar por el cumplimiento de estos Términos por parte de los usuarios
              de su cuenta.
            </p>
            <p className="text-sm text-muted-foreground">
              Usted debe elegir una contraseña segura que contenga al menos 8 caracteres, incluyendo letras
              mayúsculas, minúsculas y números. CostPro emplea medidas de seguridad industry-standard para
              proteger la información de su cuenta, incluyendo cifrado de contraseñas mediante algoritmos
              de hashing modernos.
            </p>
          </Section>

          {/* ── 4. Uso Aceptable ── */}
          <Section icon={<Ban className="w-5 h-5" />} title="4. Uso Aceptable">
            <p className="text-sm text-muted-foreground mb-3">
              Usted se compromete a utilizar el Servicio de manera lícita, ética y de acuerdo con las buenas
              prácticas. Queda expresamente prohibido:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Utilizar el Servicio para fines ilegales, fraudulentos o contrarios a la moral y el orden público.</li>
              <li>Intentar obtener acceso no autorizado a sistemas, cuentas o datos de CostPro o de otros usuarios.</li>
              <li>Realizar ingeniería inversa, descompilar o desensamblar cualquier componente del Servicio.</li>
              <li>Interferir o interrumpir la operatividad del Servicio, incluyendo ataques de denegación de servicio (DoS).</li>
              <li>Utilizar robots, scrapers o cualquier means automatizado para extraer datos del Servicio sin autorización expresa.</li>
              <li>Publicar, transmitir o almacenar contenido malicioso, incluyendo virus, malware o código dañino.</li>
              <li>Vender, sublicenciar, arrendar o transferir su acceso al Servicio a terceros sin consentimiento escrito de CostPro.</li>
              <li>Suplantar la identidad de otros usuarios o de CostPro Enterprise.</li>
              <li>Violentar derechos de propiedad intelectual de terceros a través del Servicio.</li>
              <li>Utilizar el Servicio para competir directamente con CostPro Enterprise de manera desleal.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              El incumplimiento de estas normas podrá resultar en la suspensión o terminación inmediata de su
              cuenta, sin perjuicio de las acciones legales que correspondan.
            </p>
          </Section>

          {/* ── 5. Propiedad Intelectual ── */}
          <Section icon={<Copyright className="w-5 h-5" />} title="5. Propiedad Intelectual">
            <p className="text-sm text-muted-foreground mb-3">
              Todos los derechos de propiedad intelectual sobre el Servicio, incluyendo但不限于 el código fuente,
              el diseño de la interfaz, los logotipos, marcas, textos, gráficos, iconos, bases de datos y
              documentación, son propiedad exclusiva de CostPro Enterprise o de sus licenciantes.
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              El Servicio se concede bajo una licencia limitada, no exclusiva, revocable y no transferible
              para uso interno dentro de su organización. Esta licencia no otorga derecho alguno a:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Modificar, adaptar o crear obras derivadas del Servicio.</li>
              <li>Reproducir, distribuir o comercializar el Servicio o cualquier parte del mismo.</li>
              <li>Eliminar, alterar u ocultar cualquier aviso de derechos de autor o marca registrada.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              Respecto al contenido generado por el usuario (fichas de costo, datos de inventario, registros
              de ventas, etc.), usted conserva todos los derechos de propiedad intelectual. Al utilizar el
              Servicio, usted otorga a CostPro una licencia limitada para procesar, almacenar y mostrar dicho
              contenido exclusivamente para la prestación del Servicio.
            </p>
            <p className="text-sm text-muted-foreground">
              &quot;CostPro&quot;, &quot;CostPro Enterprise&quot; y el logotipo de CostPro son marcas comerciales
              registradas. Su uso sin autorización expresa queda terminantemente prohibido.
            </p>
          </Section>

          {/* ── 6. Protección de Datos ── */}
          <Section icon={<Shield className="w-5 h-5" />} title="6. Protección de Datos">
            <p className="text-sm text-muted-foreground mb-3">
              CostPro se compromete a proteger la privacidad y los datos personales de sus usuarios de
              conformidad con la legislación aplicable, incluyendo el Reglamento General de Protección de
              Datos (UE) 2016/679 (RGPD) en la medida en que resulte aplicable.
            </p>
            <p className="text-sm text-muted-foreground mb-3">
              El tratamiento de datos personales se rige íntegramente por nuestra{' '}
              <Link href="/privacy" className="text-green-500 hover:underline">
                Política de Privacidad
              </Link>, la cual forma parte integrante de estos Términos. Le recomendamos leerla atentamente.
            </p>
            <p className="text-sm text-muted-foreground">
              CostPro implementa medidas técnicas y organizativas adecuadas para proteger los datos personales
              contra acceso no autorizado, pérdida, destrucción o alteración. Esto incluye cifrado en tránsito
              (TLS 1.3), cifrado en reposo, controles de acceso basados en roles y auditorías de seguridad
              periódicas.
            </p>
          </Section>

          {/* ── 7. Limitación de Responsabilidad ── */}
          <Section icon={<AlertTriangle className="w-5 h-5" />} title="7. Limitación de Responsabilidad">
            <p className="text-sm text-muted-foreground mb-3">
              En la máxima medida permitida por la legislación aplicable:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>
                <strong>Exención de garantías:</strong> El Servicio se proporciona &quot;tal cual&quot; y &quot;según disponibilidad&quot;.
                CostPro no otorga garantías de ningún tipo, ya sean expresas o implícitas, incluyendo, sin limitación,
                garantías de comerciabilidad, idoneidad para un propósito particular o no infracción.
              </li>
              <li>
                <strong>Limitación de daños:</strong> En ningún caso CostPro será responsable por daños indirectos,
                incidentales, especiales, consecuentes o punitivos, incluyendo pero no limitado a pérdida de
                beneficios, pérdida de datos, interrupción comercial o pérdida de oportunidades comerciales,
                que surjan del uso o la imposibilidad de uso del Servicio.
              </li>
              <li>
                <strong>Límite máximo:</strong> La responsabilidad total acumulada de CostPro con respecto al
                Servicio no excederá el monto total pagado por usted a CostPro en los doce (12) meses anteriores
                al evento que dé lugar a la reclamación, o cien dólares estadounidenses (USD 100.00), el que
                resulte mayor.
              </li>
              <li>
                <strong>Exclusiones:</strong> Nada en estos Términos excluye o limita la responsabilidad de
                CostPro por dolo, negligencia grave, muerte o lesiones personales causadas por su negligencia,
                o cualquier otra responsabilidad que no pueda excluirse conforme a la legislación aplicable.
              </li>
            </ul>
          </Section>

          {/* ── 8. Disponibilidad del Servicio ── */}
          <Section icon={<Clock className="w-5 h-5" />} title="8. Disponibilidad del Servicio">
            <p className="text-sm text-muted-foreground mb-3">
              CostPro se esfuerza por mantener el Servicio disponible de manera continua, apuntando a un
              tiempo de actividad (uptime) del 99.9% medido mensualmente. Sin embargo, el Servicio puede
              experimentar interrupciones temporales por razones que incluyen, sin limitación:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                'Mantenimiento programado (con aviso previo de 48 horas)',
                'Mantenimiento de emergencia por motivos de seguridad',
                'Fallos en la infraestructura de terceros (proveedores de nube)',
                'Problemas de red o conectividad fuera de nuestro control',
                'Fuerza mayor, desastres naturales o pandemias',
                'Actualizaciones de software necesarias para la seguridad',
              ].map(item => (
                <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0 mt-2" />
                  {item}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Las ventanas de mantenimiento programado se realizarán preferentemente en horarios de baja
              actividad (fines de semana o fuera del horario laboral habitual) y se comunicarán con al menos
              48 horas de anticipación a través de notificaciones dentro de la aplicación o por correo
              electrónico.
            </p>
            <p className="text-sm text-muted-foreground">
              CostPro no garantiza que el Servicio esté libre de errores, que los defectos serán corregidos
              o que el Servicio funcionará sin interrupciones. Las estadísticas de disponibilidad pueden
              consultarse en el panel de estado de CostPro.
            </p>
          </Section>

          {/* ── 9. Suspensión y Terminación ── */}
          <Section icon={<Settings className="w-5 h-5" />} title="9. Suspensión y Terminación">
            <p className="text-sm text-muted-foreground mb-3">
              CostPro se reserva el derecho de suspender o terminar su acceso al Servicio en los siguientes casos:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Incumplimiento de cualquiera de los presentes Términos.</li>
              <li>Uso fraudulento, abusivo o no autorizado del Servicio.</li>
              <li>Solicitud de eliminación de cuenta por parte del titular.</li>
              <li>Inactividad prolongada de la cuenta (más de 12 meses sin actividad) previo aviso.</li>
              <li>Incumplimiento de obligaciones de pago, en caso de planes de suscripción.</li>
              <li>Requerimiento de autoridad competente debidamente fundamentado.</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              En caso de terminación, CostPro proporcionará al Usuario un plazo razonable (no inferior a
              30 días calendario) para exportar y descargar sus datos. Transcurrido dicho plazo, CostPro
              eliminará de manera segura toda la información asociada a la cuenta, incluyendo datos de
              inventario, registros de ventas, fichas de costo y cualquier otro contenido generado por el
              usuario.
            </p>
            <p className="text-sm text-muted-foreground">
              Las disposiciones relativas a propiedad intelectual, limitación de responsabilidad, protección
              de datos y legislación aplicable sobrevivirán a la terminación de estos Términos.
            </p>
          </Section>

          {/* ── 10. Modificaciones ── */}
          <Section icon={<FileText className="w-5 h-5" />} title="10. Modificaciones">
            <p className="text-sm text-muted-foreground mb-3">
              CostPro se reserva el derecho de modificar estos Términos en cualquier momento. Las modificaciones
              se comunicarán de la siguiente manera:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>
                <strong>Cambios materiales:</strong> Se notificarán con al menos 30 días calendario de
                anticipación mediante notificación visible dentro de la aplicación y/o por correo electrónico
                a la dirección registrada.
              </li>
              <li>
                <strong>Cambios menores:</strong> Correcciones tipográficas, actualizaciones de contacto
                o ajustes de formato pueden realizarse sin aviso previo.
              </li>
              <li>
                <strong>Registro de versiones:</strong> La fecha de &quot;Última actualización&quot; al inicio
                de estos Términos reflejará siempre la versión vigente. Las versiones anteriores se
                archivarán y estarán disponibles a solicitud del usuario.
              </li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              Si usted no está de acuerdo con las modificaciones realizadas, deberá dejar de utilizar el
              Servicio y solicitar la cancelación de su cuenta dentro del periodo de preaviso. El uso
              continuado del Servicio después del periodo de preaviso se considerará como aceptación
              expresa de los Términos modificados.
            </p>
          </Section>

          {/* ── 11. Legislación Aplicable ── */}
          <Section icon={<Globe className="w-5 h-5" />} title="11. Legislación Aplicable">
            <p className="text-sm text-muted-foreground">
              Estos Términos se rigen e interpretan de conformidad con las leyes de la República de Cuba.
              Cualquier disputa que surja en relación con estos Términos será sometida a la jurisdicción
              de los tribunales competentes de La Habana, República de Cuba.
            </p>
            <p className="text-sm text-muted-foreground mt-3">
              En la medida en que el Reglamento General de Protección de Datos (UE) 2016/679 (RGPD) u
              otras legislaciones de protección de datos de la Unión Europea resulten aplicables al
              tratamiento de datos personales, dichas normativas se aplicarán complementariamente y
              prevalecerán en caso de conflicto con las disposiciones nacionales.
            </p>
            <p className="text-sm text-muted-foreground">
              Si alguna disposición de estos Términos fuera declarada nula o inaplicable por un tribunal
              competente, las disposiciones restantes mantendrán su plena vigencia y efecto. CostPro
              reemplazará la disposición nula por una disposición válida que refleje, en la medida de lo
              posible, la intención original de la disposición declarada nula.
            </p>
          </Section>

          {/* ── 12. Contacto ── */}
          <Section icon={<Mail className="w-5 h-5" />} title="12. Contacto">
            <p className="text-sm text-muted-foreground mb-3">
              Para cualquier consulta, solicitud o reclamación relacionada con estos Términos y Condiciones,
              puede contactarnos a través de los siguientes canales:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Soporte técnico</p>
                  <a href="mailto:support@costpro.app" className="text-sm font-medium text-green-500 hover:underline">
                    support@costpro.app
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                  <Shield className="w-4 h-4 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Privacidad y protección de datos</p>
                  <a href="mailto:privacidad@costpro.app" className="text-sm font-medium text-green-500 hover:underline">
                    privacidad@costpro.app
                  </a>
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Nos esforzamos por responder a todas las consultas en un plazo máximo de 5 días hábiles.
              Para asuntos urgentes relacionados con la seguridad de su cuenta, le recomendamos utilizar
              el correo de soporte técnico.
            </p>
          </Section>

        </div>

        {/* Back link */}
        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            Estos Términos constituyen el acuerdo completo entre usted y CostPro Enterprise
            respecto al uso del Servicio.
          </p>
          <Link
            href="/"
            className="text-sm text-green-500 hover:underline flex items-center gap-1"
          >
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </section>
  );
}
