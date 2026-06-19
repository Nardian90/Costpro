'use client';

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Share2,
  Mail,
  Copy,
  ExternalLink,
  CheckCircle2,
  Table,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

interface ReportShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportName: string;
}

export const ReportShareModal = ({
  isOpen,
  onClose,
  reportName,
}: ReportShareModalProps) => {
  const [emailTo, setEmailTo] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = useCallback(() => {
    const link = `${window.location.origin}/reportes`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedLink(true);
      toast.success('Enlace copiado al portapapeles');
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch(() => {
      toast.error('No se pudo copiar el enlace');
    });
  }, []);

  const handleSendEmail = useCallback(() => {
    if (!emailTo.trim() || !emailTo.includes('@')) {
      toast.error('Ingrese un correo electrónico válido');
      return;
    }
    // Build mailto link as a client-side fallback
    const subject = encodeURIComponent(`Reporte CostPro: ${reportName}`);
    const body = encodeURIComponent(
      `Se ha generado el reporte "${reportName}" en CostPro Enterprise.\n\nAccede al sistema para ver el documento.`
    );
    window.open(`mailto:${emailTo}?subject=${subject}&body=${body}`, '_blank');
    toast.success(`Abriendo cliente de correo para ${emailTo}`);
  }, [emailTo, reportName]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-lg p-0 border-primary/20 bg-background/95 backdrop-blur-xl rounded-3xl"
        aria-describedby="share-description"
      >
        <DialogHeader className="p-6 border-b border-primary/10">
          <DialogTitle className="text-xl font-black uppercase tracking-tight text-primary flex items-center gap-3">
            <Share2 className="w-6 h-6" />
            Compartir Reporte
          </DialogTitle>
          <p id="share-description" className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Envía o comparte el reporte mediante diferentes canales.
          </p>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {/* Copy Link */}
          <Card className="p-4 rounded-2xl border-primary/10 bg-card/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Copy className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-tight text-foreground">Copiar Enlace</p>
                <p className="text-[10px] font-medium text-muted-foreground">
                  Copia el enlace directo a la sección de reportes
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={handleCopyLink}
              className="w-full rounded-xl text-[10px] font-bold uppercase tracking-widest"
              variant="outline"
            >
              {copiedLink ? (
                <><CheckCircle2 className="w-3.5 h-3.5 mr-2 text-success" />Enlace Copiado</>
              ) : (
                <><Copy className="w-3.5 h-3.5 mr-2" />Copiar Enlace</>
              )}
            </Button>
          </Card>

          {/* Send Email */}
          <Card className="p-4 rounded-2xl border-primary/10 bg-card/50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Mail className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-tight text-foreground">Enviar por Email</p>
                <p className="text-[10px] font-medium text-muted-foreground">
                  Abre tu cliente de correo con un enlace al reporte
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <Input
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="correo@ejemplo.com"
                type="email"
                className="rounded-xl border-primary/10 bg-background/50 text-xs font-bold"
                aria-label="Correo electrónico del destinatario"
              />
              <Button
                type="button"
                onClick={handleSendEmail}
                className="w-full rounded-xl text-[10px] font-bold uppercase tracking-widest"
                variant="outline"
              >
                <Mail className="w-3.5 h-3.5 mr-2" />
                Enviar por Email
              </Button>
            </div>
          </Card>

          {/* Google Sheets - Coming Soon */}
          <Card className="p-4 rounded-2xl border-muted/10 bg-muted/5 opacity-60">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-muted/10 flex items-center justify-center">
                <Table className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-black uppercase tracking-tight text-muted-foreground flex items-center gap-2">
                  Google Sheets
                  <Badge className="bg-warning/10 text-warning border-warning/20 text-[9px] font-black uppercase px-1.5 py-0">
                    Proximamente
                  </Badge>
                </p>
                <p className="text-[10px] font-medium text-muted-foreground">
                  Exporta directamente a una hoja de cálculo de Google
                </p>
              </div>
              <Lock className="w-4 h-4 text-muted-foreground" />
            </div>
            <Button
              type="button"
              disabled
              className="w-full rounded-xl text-[10px] font-bold uppercase tracking-widest cursor-not-allowed"
              variant="outline"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-2" />
              Exportar a Google Sheets
            </Button>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
