import { Metadata } from 'next';
import { Shield, Lock, Eye, FileText, Cookie, Server, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Política de Privacidad — CostPro',
  description: 'Política de privacidad y protección de datos personales de CostPro Enterprise.',
  robots: { index: true },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
            <Shield className="w-6 h-6 text-green-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Política de Privacidad</h1>
            {/* FIX-BUG-LOG-010: Hardcoded date instead of dynamic new Date() */}
            <p className="text-sm text-muted-foreground">Última actualización: {new Date('2025-01-15').toLocaleDateString('es-CU', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <Section icon={<Lock className="w-5 h-5" />} title="1. Datos que Recopilamos">
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li><strong>Datos de cuenta:</strong> Nombre, correo electrónico y rol asignado por el administrador.</li>
              <li><strong>Datos de uso:</strong> Actividad dentro de la aplicación (operaciones de inventario, ventas, fichas de costo) para mejorar el servicio.</li>
              <li><strong>Datos técnicos:</strong> Dirección IP, tipo de navegador y sistema operativo para fines de seguridad.</li>
              <li><strong>Cookies:</strong> Utilizamos cookies esenciales para autenticación y preferencias. Consulta nuestra herramienta de gestión de cookies para más detalles.</li>
            </ul>
          </Section>

          <Section icon={<Eye className="w-5 h-5" />} title="2. Finalidad del Tratamiento">
            <ul className="list-disc pl-6 space-y-1 text-sm text-muted-foreground">
              <li>Prestar el servicio de gestión empresarial (inventario, ventas, costos).</li>
              <li>Mejorar la experiencia de usuario y la funcionalidad de la aplicación.</li>
              <li>Garantizar la seguridad de la plataforma y prevenir fraudes.</li>
              <li>Cumplir obligaciones legales y regulatorias aplicables.</li>
            </ul>
          </Section>

          <Section icon={<Server className="w-5 h-5" />} title="3. Base Legal (RGPD Art. 6)">
            <p className="text-sm text-muted-foreground">
              El tratamiento de datos se basa en: (a) consentimiento del usuario para cookies no esenciales,
              (b) ejecución de un contrato para la prestación del servicio,
              (c) interés legítimo para la seguridad de la plataforma.
            </p>
          </Section>

          <Section icon={<Clock className="w-5 h-5" />} title="4. Periodo de Conservación">
            <p className="text-sm text-muted-foreground">
              Los datos de cuenta se conservan mientras la cuenta esté activa. Los datos de uso se anonimizan
              después de 24 meses. Las cookies tienen un periodo máximo de 1 año renovable.
            </p>
          </Section>

          <Section icon={<Cookie className="w-5 h-5" />} title="5. Derechos del Titular (RGPD Art. 15-22)">
            <p className="text-sm text-muted-foreground mb-3">
              Puedes ejercer los siguientes derechos en cualquier momento:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                'Acceso a tus datos personales',
                'Rectificación de datos inexactos',
                'Supresión de datos (derecho al olvido)',
                'Limitación del tratamiento',
                'Portabilidad de datos',
                'Oposición al tratamiento',
                'Retirar el consentimiento',
              ].map(right => (
                <div key={right} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                  {right}
                </div>
              ))}
            </div>
          </Section>

          <Section icon={<FileText className="w-5 h-5" />} title="6. Contacto">
            <p className="text-sm text-muted-foreground">
              Para ejercer tus derechos o consultas sobre esta política, contacta al responsable
              de protección de datos a través de la aplicación o en{' '}
              <a href="mailto:privacidad@costpro.app" className="text-green-500 hover:underline">
                privacidad@costpro.app
              </a>.
            </p>
          </Section>
        </div>

        <div className="mt-12 pt-8 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            Esta política se rige por las leyes de protección de datos vigentes,
            incluyendo el Reglamento General de Protección de Datos (UE) 2016/679.
          </p>
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
