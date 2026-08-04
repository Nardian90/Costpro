'use client';

import { useState, useEffect } from 'react';
import { Building2, CreditCard, Palette, BarChart3, ExternalLink, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PrimaryButton } from '@/components/ui/atomic';
import { logger } from '@/lib/logger';

interface TenantData {
  id: string;
  name: string;
  owner_id: string;
  plan: string;
  subscription_status: string;
  stripe_customer_id: string | null;
  custom_domain: string | null;
  branding: { logo_url?: string; primary_color?: string; secondary_color?: string; font_family?: string };
  is_active: boolean;
  trial_ends_at: string | null;
  created_at: string;
}

export default function TenantConfigView() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0ea5e9');
  const [secondaryColor, setSecondaryColor] = useState('#64748b');
  const [isSaving, setIsSaving] = useState(false);

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant-config'],
    queryFn: async (): Promise<TenantData> => {
      const res = await fetch('/api/tenants/current');
      if (!res.ok) throw new Error('Failed to fetch tenant');
      const data = await res.json();
      return data.tenant;
    },
  });

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || '');
      setCustomDomain(tenant.custom_domain || '');
      setPrimaryColor(tenant.branding?.primary_color || '#0ea5e9');
      setSecondaryColor(tenant.branding?.secondary_color || '#64748b');
    }
  }, [tenant]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/tenants/current', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          custom_domain: customDomain || null,
          branding: { primary_color: primaryColor, secondary_color: secondaryColor },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to update');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-config'] });
      toast.success('Configuración guardada');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Error al guardar');
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async (plan: 'pro' | 'enterprise') => {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to create checkout');
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Error al iniciar checkout');
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: () => toast.error('No se pudo abrir el portal de facturación'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  if (!tenant) {
    return <div className="text-center py-12 text-muted-foreground">No se encontró información del tenant</div>;
  }

  const planLabel = { free: 'Free', pro: 'Pro', enterprise: 'Enterprise' }[tenant.plan as string] || tenant.plan;
  const statusLabel = { trial: 'Trial', active: 'Activo', past_due: 'Pago vencido', cancelled: 'Cancelado', free: 'Free' }[tenant.subscription_status as string] || tenant.subscription_status;
  const trialEnded = tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date();

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Company Info */}
      <section className="border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Building2 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Información de la Empresa</h2>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">Nombre de la empresa</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-sm font-medium">Dominio personalizado</Label>
            <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="miempresa.com" className="mt-1" />
          </div>
        </div>
      </section>

      {/* Branding */}
      <section className="border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Palette className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Branding</h2>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-sm font-medium">Color primario</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-12 h-10 rounded border" />
              <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Color secundario</Label>
            <div className="flex items-center gap-2 mt-1">
              <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="w-12 h-10 rounded border" />
              <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="flex-1" />
            </div>
          </div>
        </div>
        <PrimaryButton
          onClick={() => saveMutation.mutate()}
          label={saveMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
          disabled={saveMutation.isPending}
          icon={saveMutation.isPending ? Loader2 : undefined}
        />
      </section>

      {/* Billing */}
      <section className="border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Plan y Facturación</h2>
        </div>
        <div className="flex items-center justify-between bg-muted/30 rounded-lg p-4">
          <div>
            <div className="text-2xl font-black">{planLabel}</div>
            <div className="text-sm text-muted-foreground">
              Estado: <span className="font-bold">{statusLabel}</span>
              {tenant.trial_ends_at && (
                <span className="ml-2 text-xs">
                  {trialEnded ? 'Trial expirado' : `Trial hasta ${new Date(tenant.trial_ends_at).toLocaleDateString()}`}
                </span>
              )}
            </div>
          </div>
          {tenant.stripe_customer_id && (
            <Button variant="outline" size="sm" onClick={() => portalMutation.mutate()} disabled={portalMutation.isPending}>
              <ExternalLink className="w-4 h-4 mr-1" /> Gestionar facturación
            </Button>
          )}
        </div>
        {tenant.plan !== 'pro' && (
          <div className="flex items-center justify-between border rounded-lg p-4">
            <div>
              <div className="font-bold">Pro — $29/mes</div>
              <div className="text-sm text-muted-foreground">Hasta 3 tiendas, reportes consolidados</div>
            </div>
            <PrimaryButton onClick={() => upgradeMutation.mutate('pro')} label="Upgrade" disabled={upgradeMutation.isPending} />
          </div>
        )}
        {tenant.plan !== 'enterprise' && (
          <div className="flex items-center justify-between border rounded-lg p-4">
            <div>
              <div className="font-bold">Enterprise — $99/mes</div>
              <div className="text-sm text-muted-foreground">Hasta 10 tiendas, soporte prioritario</div>
            </div>
            <PrimaryButton onClick={() => upgradeMutation.mutate('enterprise')} label="Upgrade" disabled={upgradeMutation.isPending} />
          </div>
        )}
      </section>

      {/* Consolidated Reports */}
      <section className="border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold">Reportes Consolidados</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Ve reportes consolidados de todas tus tiendas en un solo lugar.
        </p>
        <div className="flex gap-2">
          <a href="/api/tenants/current/reports/cash" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">Reporte de Caja</Button>
          </a>
          <a href="/api/tenants/current/reports/sales" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">Resumen de Ventas</Button>
          </a>
        </div>
      </section>
    </div>
  );
}
