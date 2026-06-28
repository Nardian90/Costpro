'use client';

import React, { useState } from 'react';
import { slugify } from '@/lib/slugify';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Store } from '@/types';
import { storeApiClient } from '@/services/store-api-client';
import { useStoreEdit } from '@/hooks/views/useStoreEdit';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  Rocket, Building, FileText, Users as UsersIcon,
  Loader2, Check, ChevronRight, ChevronLeft, CheckCircle2, Search, Mail
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUsers } from '@/hooks/api/useUsers';
import { useAuthStore } from '@/store';
import { useTranslations } from 'next-intl';

/**
 * F4-T04: Onboarding wizard de 3 pasos para crear una tienda completa.
 *
 * FIX-DEUDA: Paso 3 ahora implementa asignación REAL de usuarios existentes
 * (no solo placeholder informativo). Tras crear la tienda, asigna los usuarios
 * seleccionados con el rol elegido vía fetch al endpoint de memberships.
 */

interface StoreOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: (storeId: string) => void;
}

type Step = 1 | 2 | 3;

interface WizardData {
  // Paso 1
  name: string;
  slug: string;
  address: string;
  phone: string;
  // Paso 2
  reeup: string;
  nit: string;
  bankAccount: string;
  fcModalidad: 'produccion' | 'servicios' | 'comercializacion';
  fcPdfFormat: 'res148' | 'res190';
  fcTemplateId: string;
  fcActive: boolean;
  // Paso 3 — asignación real de usuarios existentes
  selectedUserIds: Set<string>;
  defaultRole: 'admin' | 'encargado' | 'manager' | 'clerk' | 'warehouse' | 'usuario' | 'costo';
  userSearch: string;
}

const INITIAL_DATA: WizardData = {
  name: '', slug: '', address: '', phone: '',
  reeup: '', nit: '', bankAccount: '',
  fcModalidad: 'produccion', fcPdfFormat: 'res148', fcTemplateId: 'costpro-reinicio', fcActive: true,
  selectedUserIds: new Set(),
  defaultRole: 'clerk',
  userSearch: '',
};

// FIX-AUDIT-NEW-1: slugify is now imported from /lib/slugify.ts (single source of truth)

const STEPS = [
  { num: 1 as Step, label: 'Datos Básicos', icon: Building },
  { num: 2 as Step, label: 'Fiscal + FC', icon: FileText },
  { num: 3 as Step, label: 'Equipo', icon: UsersIcon },
];

export function StoreOnboardingWizard({ isOpen, onClose, onCompleted }: StoreOnboardingWizardProps) {
  const queryClient = useQueryClient();
  const storeEdit = useStoreEdit();
  const t = useTranslations('stores');
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const isEncargado = user?.role === 'encargado' || user?.role === 'manager';
  // FIX-DEUDA: cargar usuarios existentes para el Paso 3 (asignación real)
  const { data: existingUsers = [] } = useUsers(user?.id || '', isAdmin, isEncargado);

  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);

  // Reset al abrir
  React.useEffect(() => {
    if (isOpen) {
      setStep(1);
      setData({ ...INITIAL_DATA, selectedUserIds: new Set() });
      setSlugEdited(false);
    }
  }, [isOpen]);

  // Autogenerar slug
  React.useEffect(() => {
    if (!slugEdited) {
      setData(prev => ({ ...prev, slug: slugify(prev.name) }));
    }
  }, [data.name, slugEdited]);

  const update = <K extends keyof WizardData>(field: K, value: WizardData[K]) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  // FIX-DEUDA: helpers para manejar el Set de usuarios seleccionados
  const toggleUser = (userId: string) => {
    setData(prev => {
      const next = new Set(prev.selectedUserIds);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return { ...prev, selectedUserIds: next };
    });
  };

  // Usuarios filtrados por búsqueda
  const filteredUsers = existingUsers.filter(u => {
    if (!data.userSearch.trim()) return true;
    const q = data.userSearch.toLowerCase().trim();
    return (u.full_name || '').toLowerCase().includes(q) ||
           (u.email || '').toLowerCase().includes(q);
  });

  // Validación por paso
  const isStep1Valid = data.name.trim().length >= 2 && data.slug.length >= 2;
  const isStep2Valid = !data.reeup || /^\d{11}$/.test(data.reeup); // REEUP opcional pero validado
  const isCurrentStepValid = step === 1 ? isStep1Valid : step === 2 ? isStep2Valid : true;

  const handleNext = () => {
    if (!isCurrentStepValid) {
      toast.error(step === 1 ? 'Completa nombre y slug' : 'REEUP debe tener 11 dígitos');
      return;
    }
    if (step < 3) setStep((step + 1) as Step);
  };
  const handleBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const handleFinish = async () => {
    setSubmitting(true);
    try {
      // 1. Crear la tienda con datos básicos + fiscales
      const newStore = await storeApiClient.createStore({
        name: data.name.trim(),
        address: data.address.trim() || '',
        phone: data.phone.trim() || null,
        reeup: data.reeup.trim() || null,
        nit: data.nit.trim() || null,
        bank_account: data.bankAccount.trim() || null,
        slug: data.slug,
      });

      // 2. Guardar plantilla FC si está activa
      if (data.fcActive && newStore?.id) {
        await storeEdit.saveFCTemplate(newStore.id, {
          template_id: data.fcTemplateId,
          modalidad: data.fcModalidad,
          pdf_format: data.fcPdfFormat,
          is_active: true,
        });
      }

      // 3. FIX-DEUDA: asignar usuarios seleccionados a la nueva tienda
      let assignedUsers = 0;
      if (data.selectedUserIds.size > 0 && newStore?.id) {
        const token = useAuthStore.getState().token;
        const assignments = Array.from(data.selectedUserIds).map(userId => ({
          store_id: newStore.id,
          role: data.defaultRole,
          status: 'active' as const,
        }));

        // Asignar cada usuario individualmente vía el endpoint bulk
        // (un solo fetch por usuario sería ineficiente, pero el endpoint bulk
        // requiere el userId en la URL — hacemos un fetch por usuario)
        const results = await Promise.allSettled(
          Array.from(data.selectedUserIds).map(async (userId) => {
            const res = await fetch(`/api/users/${userId}/memberships/bulk`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ assignments }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return userId;
          })
        );
        assignedUsers = results.filter(r => r.status === 'fulfilled').length;
        const failedUsers = results.filter(r => r.status === 'rejected').length;
        if (failedUsers > 0) {
          logger.warn('UI', 'WIZARD_USER_ASSIGN_PARTIAL', {
            storeId: newStore.id, assigned: assignedUsers, failed: failedUsers,
          });
        }
      }

      // 4. Invalidar caches
      queryClient.invalidateQueries({ queryKey: ['stores'] });
      queryClient.invalidateQueries({ queryKey: ['store-user-counts'] });
      queryClient.invalidateQueries({ queryKey: ['store-health'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });

      toast.success(`Tienda "${data.name}" creada y configurada`, {
        description: `Health score inicial: 60% (config + fiscal + FC).${assignedUsers > 0 ? ` ${assignedUsers} usuario(s) asignado(s).` : ''} Completa productos y ventas para llegar al 100%.`,
        duration: 10000,
      });

      onCompleted?.(newStore.id);
      onClose();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Error al crear tienda');
    } finally {
      setSubmitting(false);
    }
  };

  // Health score estimado en tiempo real
  const estimatedHealth = (() => {
    let score = 0;
    if (data.address && data.phone) score += 20; // config
    if (data.reeup && data.nit && data.bankAccount) score += 20; // fiscal
    if (data.fcActive) score += 20; // FC
    // products (20) y sales (20) no se cubren en onboarding — quedan para después
    return score;
  })();

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && !submitting && onClose()}
      aria-label={t('onboarding.ariaLabel')}
      title={
        <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary flex items-center gap-2">
          <Rocket className="w-5 h-5" />
          Nueva Tienda con Asistente
        </span>
      }
      description={
        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/70">
          3 pasos · tienda operativa al {estimatedHealth}% al finalizar
        </span>
      }
      footer={
        <div className="flex gap-2 w-full">
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={submitting}
              className="flex-1 sm:flex-none h-11"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Atrás
            </Button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={!isCurrentStepValid || submitting}
              className="flex-1 sm:flex-none h-11 font-bold uppercase tracking-widest text-sm"
            >
              Siguiente
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleFinish}
              disabled={submitting}
              className="flex-1 sm:flex-none h-11 font-bold uppercase tracking-widest text-sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Crear Tienda
                </>
              )}
            </Button>
          )}
        </div>
      }
    >
      <div className="py-4 space-y-5">
        {/* Indicador de progreso */}
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.num;
            const isCompleted = step > s.num;
            return (
              <React.Fragment key={s.num}>
                <div className="flex flex-col items-center gap-1 flex-1">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                    isCompleted ? "bg-success border-success text-white" :
                    isActive ? "border-primary text-primary" : "border-border text-muted-foreground"
                  )}>
                    {isCompleted ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                  </div>
                  <span className={cn(
                    "text-xs font-black uppercase tracking-widest text-center",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    "h-0.5 flex-1 mx-1 mb-4 transition-all",
                    step > s.num ? "bg-success" : "bg-border"
                  )} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Paso 1: Datos básicos */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wiz-name" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                Nombre de la tienda *
              </Label>
              <Input
                id="wiz-name"
                value={data.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="Ej: Sucursal Centro Habana"
                className="h-11"
                autoFocus
                maxLength={100}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz-slug" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                URL pública (slug)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-muted-foreground pointer-events-none">/tienda/</span>
                <Input
                  id="wiz-slug"
                  value={data.slug}
                  onChange={(e) => { update('slug', slugify(e.target.value)); setSlugEdited(true); }}
                  className="pl-[68px] font-mono"
                  maxLength={100}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz-address" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                Dirección
              </Label>
              <Input
                id="wiz-address"
                value={data.address}
                onChange={(e) => update('address', e.target.value)}
                placeholder="Calle, número, ciudad"
                className="h-11"
                maxLength={200}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz-phone" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                Teléfono
              </Label>
              <Input
                id="wiz-phone"
                value={data.phone}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="+53 5XXX XXXX"
                className="h-11"
                maxLength={20}
              />
            </div>
          </div>
        )}

        {/* Paso 2: Fiscal + FC */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="wiz-reeup" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  REEUP (11 dígitos)
                </Label>
                <Input
                  id="wiz-reeup"
                  value={data.reeup}
                  onChange={(e) => update('reeup', e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="12345678901"
                  className="h-11"
                  maxLength={11}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wiz-nit" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                  NIT
                </Label>
                <Input
                  id="wiz-nit"
                  value={data.nit}
                  onChange={(e) => update('nit', e.target.value)}
                  placeholder="N° identificación tributaria"
                  className="h-11"
                  maxLength={20}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wiz-bank" className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                Cuenta bancaria
              </Label>
              <Input
                id="wiz-bank"
                value={data.bankAccount}
                onChange={(e) => update('bankAccount', e.target.value)}
                placeholder="Banco y n° de cuenta"
                className="h-11"
                maxLength={30}
              />
            </div>

            <div className="pt-3 border-t border-border">
              <h4 className="text-sm font-black uppercase tracking-widest text-primary/70 mb-3">
                Plantilla de Ficha de Costo
              </h4>
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={data.fcActive}
                  onChange={(e) => update('fcActive', e.target.checked)}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                  Activar plantilla FC para esta tienda
                </span>
              </label>
              {data.fcActive && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground">{t('modalidadLabel')}</Label>
                    <select
                      value={data.fcModalidad}
                      onChange={(e) => update('fcModalidad', e.target.value as WizardData['fcModalidad'])}
                      className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="produccion">{t('modalidadProduccion')}</option>
                      <option value="servicios">{t('modalidadServicios')}</option>
                      <option value="comercializacion">{t('modalidadComercializacion')}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground">{t('formatoPdfLabel')}</Label>
                    <select
                      value={data.fcPdfFormat}
                      onChange={(e) => update('fcPdfFormat', e.target.value as WizardData['fcPdfFormat'])}
                      className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="res148">Res. 148/2023</option>
                      <option value="res190">Res. 190/2021</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Paso 3: Equipo — asignación REAL de usuarios existentes */}
        {step === 3 && (
          <div className="space-y-4">
            {/* Selector de rol por defecto */}
            <div className="space-y-1.5">
              <Label className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                Rol para los usuarios asignados
              </Label>
              <select
                value={data.defaultRole}
                onChange={(e) => update('defaultRole', e.target.value as WizardData['defaultRole'])}
                className="w-full h-11 px-3 rounded-lg border border-border bg-background text-sm font-bold outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="admin">Admin</option>
                <option value="encargado">Encargado</option>
                <option value="manager">Gestor</option>
                <option value="clerk">Cajero</option>
                <option value="warehouse">Almacén</option>
                <option value="usuario">Usuario</option>
                <option value="costo">Costo</option>
              </select>
              <p className="text-sm text-muted-foreground/70">
                Todos los usuarios seleccionados se asignarán con este rol. Puedes cambiarlo individualmente después.
              </p>
            </div>

            {/* Buscador de usuarios */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={data.userSearch}
                onChange={(e) => update('userSearch', e.target.value)}
                placeholder="Buscar usuario por nombre o email..."
                className="pl-10 h-11"
              />
            </div>

            {/* Lista de usuarios con checkboxes */}
            <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
              {filteredUsers.length === 0 ? (
                <div className="py-8 text-center">
                  <UsersIcon className="w-8 h-8 text-muted-foreground/70 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground font-bold uppercase tracking-widest">
                    {existingUsers.length === 0 ? 'No hay usuarios disponibles' : 'Sin coincidencias'}
                  </p>
                </div>
              ) : (
                filteredUsers.map((u) => (
                  <label
                    key={u.id}
                    className={cn(
                      "flex items-center gap-3 p-2.5 cursor-pointer transition-colors hover:bg-muted/30",
                      data.selectedUserIds.has(u.id) && "bg-primary/5"
                    )}
                  >
                    <Checkbox
                      checked={data.selectedUserIds.has(u.id)}
                      onCheckedChange={() => toggleUser(u.id)}
                      aria-label={`Asignar ${u.full_name}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm truncate">{u.full_name || 'Sin nombre'}</span>
                        {u.role && (
                          <span className="text-sm font-black uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {u.role}
                          </span>
                        )}
                      </div>
                      {u.email && (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground truncate">
                          <Mail className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{u.email}</span>
                        </div>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Resumen + health score */}
            <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-black uppercase tracking-widest text-primary">
                  Resumen de la nueva tienda
                </span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Nombre:</span> <strong>{data.name}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">URL:</span> <span className="font-mono">/tienda/{data.slug}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Plantilla FC:</span> <span>{data.fcActive ? `${data.fcModalidad} · ${data.fcPdfFormat}` : 'No activa'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Usuarios a asignar:</span> <strong>{data.selectedUserIds.size}</strong></div>
              </div>
              <div className="mt-3 pt-3 border-t border-primary/20">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-black uppercase tracking-widest text-primary">Health score estimado</span>
                  <span className="font-bold text-primary">{estimatedHealth}/100</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
                  <div className="h-full bg-primary transition-all" style={{ width: `${estimatedHealth}%` }} />
                </div>
                <p className="text-sm text-muted-foreground/70 mt-1.5">
                  Los 40% restantes se completan agregando productos y registrando ventas.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
