import { Metadata } from 'next';
import Link from 'next/link';
import {
  Shield, FileText, AlertTriangle, Cookie, CheckCircle2,
  Lock, Scale, ExternalLink, BookOpen, Globe, Timer,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Centro Legal — CostPro',
  description: 'Documentos legales de CostPro Enterprise: política de privacidad, términos y condiciones, plan de respuesta a incidentes, RGPD y más.',
  robots: { index: true },
};

export default function LegalPage() {
  const lastUpdated = '15 de enero de 2025';

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-16 sm:py-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <Scale className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Centro Legal</h1>
            <p className="text-sm text-muted-foreground">Última actualización: {lastUpdated}</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
          En CostPro Enterprise nos comprometemos con la transparencia y el cumplimiento normativo.
          Aquí encontrará todos nuestros documentos legales y políticas de cumplimiento.
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
          {/* Privacy Policy */}
          <Section
            icon={<Shield className="w-5 h-5" />}
            title="Política de Privacidad"
            description="Cómo recopilamos, utilizamos y protegemos sus datos personales conforme al RGPD."
            href="/privacy"
            tag="RGPD Art. 13-14"
          />

          {/* Terms & Conditions */}
          <Section
            icon={<FileText className="w-5 h-5" />}
            title="Términos y Condiciones"
            description="Condiciones de uso de los servicios y plataformas de CostPro Enterprise."
            href="/terms"
            tag="Contrato de Servicio"
          />

          {/* Incident Response Plan */}
          <Section
            icon={<AlertTriangle className="w-5 h-5" />}
            title="Plan de Respuesta a Incidentes"
            description="Procedimientos de detección, respuesta y recuperación ante incidentes de seguridad (NIST SP 800-61)."
            href="/knowledge/compliance/incident-response-plan.md"
            tag="NIST SP 800-61"
            external
          />

          {/* Cookie Policy */}
          <Section
            icon={<Cookie className="w-5 h-5" />}
            title="Política de Cookies"
            description="Información sobre las cookies que utilizamos y cómo gestionar sus preferencias de consentimiento."
            href="/privacy#cookies"
            tag="RGPD Art. 6 + LSSI-CE"
          />

          {/* GDPR Compliance */}
          <Section
            icon={<Lock className="w-5 h-5" />}
            title="Cumplimiento RGPD"
            description="Resumen de nuestras obligaciones y derechos bajo el Reglamento General de Protección de Datos (UE) 2016/679."
            href="/privacy"
            tag="UE 2016/679"
          />

          {/* International Transfers */}
          <Section
            icon={<Globe className="w-5 h-5" />}
            title="Transferencias Internacionales"
            description="Marco normativo, evaluación de impacto (TIA) y salvaguardas para transferencias de datos a terceros países conforme al RGPD Art. 44-49."
            href="/knowledge/compliance/international-transfers.md"
            tag="RGPD Art. 44-49"
            external
          />

          {/* Data Retention Policy */}
          <Section
            icon={<Timer className="w-5 h-5" />}
            title="Política de Retención de Datos"
            description="Sistema automatizado de retención y eliminación/anonimización de datos. Políticas para logs técnicos (365d), sesiones (30d), IA (365d) y cuentas inactivas (2 años)."
            href="/api/legal/retention"
            tag="RGPD Art. 5.1.e + LOPDGDD"
            external
          />
        </div>

        {/* GDPR Summary Section */}
        <div className="mt-10 rounded-xl border border-border bg-muted/30 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-foreground">Resumen de Cumplimiento RGPD</h2>
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            CostPro Enterprise cumple con el Reglamento General de Protección de Datos (UE) 2016/679
            y la Ley Orgánica 3/2018 de Protección de Datos Personales y garantía de los derechos digitales (LOPDGDD).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Delegado de Protección de Datos', value: 'privacy@costpro.app' },
              { label: 'Base legal del tratamiento', value: 'Art. 6.1.b (contrato) + Art. 6.1.c (interés legítimo)' },
              { label: 'Plazo de notificación AEPD', value: '72 horas (Art. 33)' },
              { label: 'Derechos del interesado', value: 'Acceso, rectificación, supresión, portabilidad (Art. 15-22)' },
              { label: 'Periodo de conservación', value: 'Datos de cuenta: mientras esté activa. Uso: 24 meses (anonimizados)' },
              { label: 'Transferencias internacionales', value: 'Supabase/Render (USA) — DPF + SCCs + TIA (Art. 44-49)' },
              { label: 'Retención de datos', value: 'Logs: 365d · Sesiones: 30d · IA: 365d (anon.) · Inactivas: 2 años' },
            ].map((item) => (
              <div key={item.label} className="space-y-1">
                <p className="text-xs font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {[
              'Encriptación en tránsito (TLS 1.3)',
              'Encriptación en reposo (AES-256)',
              'Autenticación multifactor disponible',
              'Backups diarios verificados',
              'Logs con retención de 90 días',
            ].map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1"
              >
                <CheckCircle2 className="w-3 h-3" />
                {badge}
              </span>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="mt-10 rounded-xl border border-border bg-muted/30 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-semibold text-foreground">Contacto Legal y Privacidad</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Para ejercer sus derechos de protección de datos, reportar un incidente de seguridad
            o cualquier consulta legal, puede contactarnos a través de:
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href="mailto:privacy@costpro.app"
              className="inline-flex items-center gap-2 text-sm text-emerald-500 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              privacy@costpro.app (DPO)
            </a>
            <a
              href="mailto:soporte@costpro.app"
              className="inline-flex items-center gap-2 text-sm text-emerald-500 hover:underline"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              soporte@costpro.app (Soporte)
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            Todos los documentos legales se rigen por las leyes de protección de datos vigentes
            en la Unión Europea, incluyendo el Reglamento General de Protección de Datos (UE) 2016/679
            y la LOPDGDD (LO 3/2018).
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Section component (matches privacy page pattern) ── */
function Section({
  icon,
  title,
  description,
  href,
  tag,
  external,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
  tag: string;
  external?: boolean;
}) {
  const content = (
    <section className="group rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-emerald-500/30 transition-all duration-200 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0 mt-0.5">
            {icon}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                {tag}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</p>
          </div>
        </div>
        <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-emerald-500 shrink-0 mt-1 transition-colors" />
      </div>
    </section>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }

  return <Link href={href}>{content}</Link>;
}
