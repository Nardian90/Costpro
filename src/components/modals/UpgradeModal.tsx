import React from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { MessageCircle, Zap, ShieldCheck, BarChart3 } from 'lucide-react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  action?: string;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({ isOpen, onClose, action = "esta acción" }) => {
  const whatsappNumber = "+53 53183215";
  const message = encodeURIComponent("Hola, me interesa obtener el Plan Pro de CostoPro para tener acceso ilimitado.");
  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${message}`;

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Plan Pro Requerido"
      showCloseButton
    >
      <div className="space-y-6 py-4">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Zap className="w-8 h-8 text-primary animate-pulse" />
          </div>
          <h3 className="text-xl font-black uppercase tracking-tight">¡Has alcanzado tu límite!</h3>
          <p className="text-sm text-muted-foreground font-medium">
            En el Plan Gratuito solo puedes realizar 3 exportaciones, creaciones o importaciones de Fichas de Costo al día.
            Pásate a <span className="text-primary font-bold">PRO</span> para disfrutar de acceso ilimitado y funciones avanzadas.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-xs font-bold uppercase">Exportaciones Ilimitadas</p>
              <p className="text-[10px] text-muted-foreground">Genera todos los PDF y Excel que necesites sin restricciones.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border">
            <BarChart3 className="w-5 h-5 text-primary shrink-0" />
            <div>
              <p className="text-xs font-bold uppercase">Análisis Avanzado</p>
              <p className="text-[10px] text-muted-foreground">Acceso a reportes detallados y KPIs inteligentes.</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            className="w-full h-12 text-sm font-black uppercase tracking-widest bg-green-600 hover:bg-green-700 text-foreground"
            onClick={() => window.open(whatsappUrl, '_blank')}
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            Contactar por WhatsApp
          </Button>
          <Button
            variant="ghost"
            className="w-full text-[10px] font-black uppercase tracking-widest opacity-50"
            onClick={onClose}
          >
            Continuar con Plan Gratis
          </Button>
        </div>
      </div>
    </BaseModal>
  );
};
