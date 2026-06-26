'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { BaseModal } from '@/components/ui/BaseModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Store } from '@/types';
import { Rocket, Loader2, Check, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';

/**
 * F2-T01: Modal de creación rápida de tienda (2 campos: nombre + slug auto-generado).
 *
 * Reemplaza el formulario de 15+ campos para la creación inicial. El patrón moderno
 * (Shopify, Stripe, Odoo) es: crear con mínimo friction en 1 paso, luego configurar
 * detalles en una página dedicada (F2-T02 página de Configuración de Tienda).
 *
 * Flujo:
 * 1. Usuario escribe nombre → slug se autogenera slugify(nombre) editable
 * 2. Validación de slug único con debounce 300ms (muestra ✓ disponible / ✗ tomado)
 * 3. Confirmar → crea tienda vía onSubmit('create', { name, slug })
 * 4. Tras crear, el caller (useStoresView) abre automáticamente la página de
 *    configuración con checklist de completitud
 *
 * El formulario avanzado de 15+ campos sigue accesible desde la página de
 * Configuración de Tienda para edición posterior.
 */
interface CreateStoreQuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  // F2.5-1: el modo es 'create-quick' (no 'create') para que handleStoreFormSubmit
  // sepa que solo vienen name + slug y no intente leer 12 campos undefined.
  onSubmit: (mode: 'create-quick', data: Partial<Store>) => Promise<void>;
  isSubmitting: boolean;
}

// Slugify simple: lowercase, guiones en lugar de espacios, sin acentos ni caracteres especiales
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^a-z0-9\s-]/g, '')     // solo alfanuméricos, espacios y guiones
    .trim()
    .replace(/[\s-]+/g, '-')          // espacios y guiones múltiples → un guion
    .replace(/^-+|-+$/g, '');         // sin guiones al inicio/final
}

export function CreateStoreQuickModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
}: CreateStoreQuickModalProps) {
  const t = useTranslations('stores');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false); // true si el usuario editó el slug manualmente
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  // Reset al abrir
  useEffect(() => {
    if (isOpen) {
      setName('');
      setSlug('');
      setSlugEdited(false);
      setSlugChecking(false);
      setSlugAvailable(null);
    }
  }, [isOpen]);

  // Autogenerar slug desde el nombre (solo si el usuario no lo editó manualmente)
  useEffect(() => {
    if (!slugEdited) {
      setSlug(slugify(name));
    }
  }, [name, slugEdited]);

  // Validación de slug único con debounce 300ms
  useEffect(() => {
    if (!slug || slug.length < 2) {
      setSlugAvailable(null);
      return;
    }
    setSlugChecking(true);
    const debounceTimer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from('stores')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (error) {
          setSlugAvailable(null);
        } else {
          setSlugAvailable(!data); // true si no existe (disponible)
        }
      } catch {
        setSlugAvailable(null);
      } finally {
        setSlugChecking(false);
      }
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [slug]);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && slug.length >= 2 && slugAvailable === true && !isSubmitting;
  }, [name, slug, slugAvailable, isSubmitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      if (name.trim().length < 2) {
        toast.error('El nombre debe tener al menos 2 caracteres');
      } else if (slugAvailable === false) {
        toast.error('El slug ya está en uso. Elige otro.');
      }
      return;
    }
    await onSubmit('create-quick', { name: name.trim(), slug });
  };

  return (
    <BaseModal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      aria-label={t('createQuick.ariaLabel')}
      title={
        <span className="text-[clamp(1.25rem,4vw,1.5rem)] font-black uppercase tracking-tighter text-primary flex items-center gap-2">
          <Rocket className="w-5 h-5" />
          Nueva Tienda
        </span>
      }
      description={
        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/70">
          Crea tu tienda en segundos · configura los detalles después
        </span>
      }
      footer={
        <div className="flex gap-2 w-full sm:w-auto">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting} className="flex-1 sm:flex-none h-11">
            Cancelar
          </Button>
          <Button
            type="submit"
            form="create-store-quick-form"
            disabled={!canSubmit}
            className="flex-1 sm:flex-none h-11 font-bold uppercase tracking-widest text-sm"
          >
            {isSubmitting ? (
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
        </div>
      }
    >
      <form id="create-store-quick-form" onSubmit={handleSubmit} className="space-y-5 py-4">
        {/* Mensaje explicativo */}
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Solo necesitas un <strong className="text-primary">nombre</strong> para empezar.
            Los datos fiscales (REEUP, NIT, cuenta bancaria), logo y configuración de FC
            los completas después desde la página de Configuración de Tienda.
          </p>
        </div>

        {/* Campo: Nombre */}
        <div className="space-y-2">
          <Label htmlFor="quick-name" className="text-sm font-black uppercase tracking-widest text-primary/70">
            Nombre de la Tienda <span className="text-destructive">*</span>
          </Label>
          <Input
            id="quick-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Sucursal Centro Habana"
            className="h-12 bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-bold text-base"
            autoFocus
            maxLength={100}
            required
            disabled={isSubmitting}
          />
          <p className="text-sm text-muted-foreground/60 font-medium">
            Cómo se mostrará la tienda en el sistema y en facturas.
          </p>
        </div>

        {/* Campo: Slug auto-generado */}
        <div className="space-y-2">
          <Label htmlFor="quick-slug" className="text-sm font-black uppercase tracking-widest text-primary/70">
            URL pública (slug)
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono text-muted-foreground pointer-events-none">
              /tienda/
            </span>
            <Input
              id="quick-slug"
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value));
                setSlugEdited(true);
              }}
              placeholder="sucursal-centro-habana"
              className="h-12 pl-[68px] bg-muted/20 border-primary/10 focus:border-primary/30 transition-all font-mono text-sm"
              maxLength={100}
              disabled={isSubmitting}
            />
            {/* Indicador de disponibilidad */}
            {slug.length >= 2 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {slugChecking ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : slugAvailable === true ? (
                  <span className="flex items-center gap-1 text-sm font-black uppercase tracking-widest text-success">
                    <Check className="w-3.5 h-3.5" />
                    Disponible
                  </span>
                ) : slugAvailable === false ? (
                  <span className="flex items-center gap-1 text-sm font-black uppercase tracking-widest text-destructive">
                    <X className="w-3.5 h-3.5" />
                    Tomado
                  </span>
                ) : null}
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground/60 font-medium">
            Se autogenera desde el nombre. Edítalo si quieres una URL personalizada.
          </p>
        </div>

        {/* Preview de URL completa */}
        {slug.length >= 2 && (
          <div className="p-3 rounded-xl bg-muted/30 border border-border">
            <p className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-1">
              Vista previa de URL pública
            </p>
            <p className="text-sm font-mono text-foreground break-all">
              {typeof window !== 'undefined' ? window.location.origin : 'https://tu-dominio.com'}/tienda/{slug}
            </p>
          </div>
        )}

        {/* Advertencia si el slug no está disponible */}
        {slugAvailable === false && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">
              Este slug ya está en uso por otra tienda. Prueba con una variante
              (ej: agrega un número o tu ciudad).
            </p>
          </div>
        )}
      </form>
    </BaseModal>
  );
}
