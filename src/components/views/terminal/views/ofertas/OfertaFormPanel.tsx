'use client';

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  FileText,
  Plus,
  Download,
  Loader2,
  X,
  Upload,
  Building,
  User,
  Package,
  Stamp,
  Eye,
  Calculator,
  MessageSquare,
  Clock,
  CreditCard,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateOferta,
  useUpdateOferta,
  useExportOfertaPdf,
} from '@/hooks/api/useOfertas';
import {
  OfertaFactory,
  OfertaItemFactory,
  calculateSubtotal,
  calculateTotal,
  calculateItbis,
  type OfertaContract,
  type OfertaItemContract,
} from '@/contracts/oferta';
import type { OfertaStatus } from '@/types/oferta';
import CollapsibleSection from './CollapsibleSection';
import ProductRow from './ProductRow';
import FinancialSummary from './FinancialSummary';
import { CURRENCY_OPTIONS } from './constants';
import { supabase } from '@/lib/supabaseClient';

// ─── Inline Validation Hook ────────────────────────────────────────────────────

function useFormValidation() {
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const validate = useCallback((formData: OfertaContract): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.numero.trim()) {
      newErrors.numero = 'Número de oferta es requerido';
    }
    if (!formData.objeto.trim()) {
      newErrors.objeto = 'Objeto es requerido';
    }
    if (!formData.suministrador.empresa.trim()) {
      newErrors['suministrador.empresa'] = 'Empresa del suministrador es requerida';
    }
    if (!formData.cliente.empresa.trim()) {
      newErrors['cliente.empresa'] = 'Empresa del cliente es requerida';
    }
    if (formData.productos.length === 0) {
      newErrors.productos = 'Al menos un producto es requerido';
    }
    formData.productos.forEach((p, i) => {
      if (!p.descripcion.trim()) {
        newErrors[`productos.${i}.descripcion`] = 'Descripción requerida';
      }
      if (p.cantidad <= 0) {
        newErrors[`productos.${i}.cantidad`] = 'Cantidad debe ser > 0';
      }
      if (p.precio_unitario <= 0) {
        newErrors[`productos.${i}.precio_unitario`] = 'Precio debe ser > 0';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, []);

  const clearFieldError = useCallback((field: string) => {
    setErrors(prev => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  const clearErrors = useCallback(() => setErrors({}), []);

  return { errors, validate, clearFieldError, clearErrors };
}

// ─── Storage Upload Helper ─────────────────────────────────────────────────────

async function uploadImageToStorage(file: File, bucket: string, folder: string): Promise<string> {
  const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${folder}/${fileName}`;

  // Compress image via canvas before upload
  const compressedFile = await compressImage(file);

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, compressedFile, { contentType: file.type, upsert: false });

  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data?.publicUrl || '';
}

function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const MAX_DIM = 800;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        0.75
      );
    };
    img.onerror = () => resolve(file);
    img.src = objectUrl;
  });
}

// ─── Form Panel Component ──────────────────────────────────────────────────────

interface OfertaFormPanelProps {
  formData: OfertaContract;
  setFormData: React.Dispatch<React.SetStateAction<OfertaContract>>;
  isCreating: boolean;
  selectedOfertaId: string | null;
  detailLoading: boolean;
  isDirty: boolean;
  setIsDirty: (dirty: boolean) => void;
  onReset: () => void;
  onConfirmIfDirty: (action: () => void) => void;
  storeId: string;
}

export default function OfertaFormPanel({
  formData,
  setFormData,
  isCreating,
  selectedOfertaId,
  detailLoading,
  isDirty,
  setIsDirty,
  onReset,
  onConfirmIfDirty,
  storeId,
}: OfertaFormPanelProps) {
  const { errors, validate, clearFieldError, clearErrors } = useFormValidation();
  const [isExportingPreview, setIsExportingPreview] = useState(false);
  const [isUploading, setIsUploading] = useState<'stamp' | 'sign' | null>(null);

  const stampInputRef = useRef<HTMLInputElement>(null);
  const signInputRef = useRef<HTMLInputElement>(null);

  // Mutations
  const createMutation = useCreateOferta();
  const updateMutation = useUpdateOferta();
  const exportPdfMutation = useExportOfertaPdf();

  // Auto-calculate financials
  const subtotal = useMemo(() => calculateSubtotal(formData.productos), [formData.productos]);
  const itbisAmount = useMemo(() => calculateItbis(subtotal, formData.descuento, formData.impuesto_rate), [subtotal, formData.descuento, formData.impuesto_rate]);
  const total = useMemo(() => calculateTotal(subtotal, formData.descuento, formData.impuesto_rate), [subtotal, formData.descuento, formData.impuesto_rate]);

  // ─── Form Handlers ────────────────────────────────────────────────────────────

  const markDirty = useCallback(() => setIsDirty(true), [setIsDirty]);

  const updateField = useCallback(<K extends keyof OfertaContract>(key: K, value: OfertaContract[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    clearFieldError(key as string);
    markDirty();
  }, [setFormData, clearFieldError, markDirty]);

  const updateSuministrador = useCallback((field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      suministrador: { ...prev.suministrador, [field]: value },
    }));
    clearFieldError(`suministrador.${field}`);
    markDirty();
  }, [setFormData, clearFieldError, markDirty]);

  const updateCliente = useCallback((field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      cliente: { ...prev.cliente, [field]: value },
    }));
    clearFieldError(`cliente.${field}`);
    markDirty();
  }, [setFormData, clearFieldError, markDirty]);

  const updateProduct = useCallback(
    (index: number, field: keyof OfertaItemContract, value: string | number) => {
      setFormData(prev => {
        const productos = [...prev.productos];
        productos[index] = { ...productos[index], [field]: value };
        return { ...prev, productos };
      });
      clearFieldError(`productos.${index}.${field}`);
      markDirty();
    },
    [setFormData, clearFieldError, markDirty]
  );

  const addProduct = useCallback(() => {
    setFormData(prev => ({
      ...prev,
      productos: [...prev.productos, OfertaItemFactory.create()],
    }));
    markDirty();
  }, [setFormData, markDirty]);

  const removeProduct = useCallback((index: number) => {
    setFormData(prev => ({
      ...prev,
      productos: prev.productos.filter((_, i) => i !== index),
    }));
    markDirty();
  }, [setFormData, markDirty]);

  // ─── Image Upload Handler (Storage) ────────────────────────────────────────────

  const handleImageUpload = useCallback(
    (type: 'stamp_url' | 'sign_url') => async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        toast.error('La imagen no debe superar 2MB');
        return;
      }
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        toast.error('No se permiten archivos SVG por seguridad');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Solo se permiten archivos de imagen');
        return;
      }

      setIsUploading(type === 'stamp_url' ? 'stamp' : 'sign');
      try {
        const publicUrl = await uploadImageToStorage(file, 'stores', type === 'stamp_url' ? 'oferta-stamps' : 'oferta-signatures');
        updateField(type, publicUrl);
        toast.success('Imagen subida correctamente');
      } catch (err: any) {
        toast.error(`Error al subir imagen: ${err.message || 'Error desconocido'}`);
      } finally {
        setIsUploading(null);
      }
    },
    [updateField]
  );

  const handleRemoveImage = useCallback(
    (type: 'stamp_url' | 'sign_url') => {
      updateField(type, null);
    },
    [updateField]
  );

  // ─── Submit Handler ────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    clearErrors();
    if (!validate(formData)) {
      toast.error('Por favor, corrija los errores en el formulario');
      return;
    }

    const payload = {
      ...formData,
      subtotal,
      total,
      itbis: formData.impuesto_rate,
      productos: formData.productos.map(({ _uid, ...item }) => item) as any,
    };
    delete (payload as any).impuesto_rate;

    try {
      if (selectedOfertaId) {
        const { id: _id, ...updatePayload } = payload;
        await updateMutation.mutateAsync({ id: selectedOfertaId, ...updatePayload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onReset();
    } catch {
      // Error handled by mutation onError
    }
  }, [formData, subtotal, total, selectedOfertaId, createMutation, updateMutation, onReset, validate, clearErrors]);

  // ─── PDF Export Handler ────────────────────────────────────────────────────────

  const handleExportPdf = useCallback(async () => {
    setIsExportingPreview(true);
    try {
      const token = useAuthStore.getState().token;
      const payload: Record<string, unknown> = {
        oferta: {
          ...formData,
          subtotal,
          total,
          status: formData.status || 'draft',
        },
      };
      if (storeId) payload.store_id = storeId;

      const res = await fetch('/api/ofertas/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Error de red' }));
        throw new Error(body.error || `Error ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oferta-${formData.numero || 'comercial'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF exportado exitosamente');
    } catch (error: any) {
      toast.error(`Error al exportar PDF: ${error.message}`);
    } finally {
      setIsExportingPreview(false);
    }
  }, [formData, subtotal, total, storeId]);

  // ─── Render ────────────────────────────────────────────────────────────────────

  if (!isCreating) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4 border-2 border-dashed border-border rounded-xl bg-muted/5">
        <FileText className="w-16 h-16 opacity-10" />
        <div className="space-y-1">
          <h3 className="font-black text-sm uppercase tracking-widest text-muted-foreground">
            Selecciona o Crea una Oferta
          </h3>
          <p className="text-xs text-muted-foreground/50">
            Usa el panel izquierdo para seleccionar una oferta existente o crea una nueva
          </p>
        </div>
        <Button onClick={() => onConfirmIfDirty(() => onReset())} variant="outline" size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          Nueva Oferta
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
      {/* Loading state while detail data is being fetched */}
      {selectedOfertaId && detailLoading && (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
          <span className="text-sm text-muted-foreground">Cargando datos de la oferta...</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-black text-base uppercase tracking-tight">
          {selectedOfertaId ? 'Editar Oferta' : 'Nueva Oferta Comercial'}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => onConfirmIfDirty(onReset)} className="text-xs">
          <X className="w-3.5 h-3.5 mr-1" />
          Cerrar
        </Button>
      </div>

      {/* Show form sections only when not loading detail data */}
      {!(selectedOfertaId && detailLoading) && (
      <>
        {/* 1. Datos de la Oferta */}
        <CollapsibleSection title="Datos de la Oferta" icon={FileText}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Número de Oferta *</Label>
              <Input
                value={formData.numero}
                onChange={e => updateField('numero', e.target.value)}
                placeholder="OF-2026-001"
                className={cn('h-9 text-sm', errors.numero && 'border-destructive focus-visible:ring-destructive')}
                aria-invalid={!!errors.numero}
              />
              {errors.numero && <p className="text-[9px] text-destructive mt-0.5">{errors.numero}</p>}
            </div>
            <div>
              <Label className="text-xs">Fecha *</Label>
              <Input
                type="date"
                value={formData.fecha}
                onChange={e => updateField('fecha', e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Moneda</Label>
              <Select
                value={formData.moneda}
                onValueChange={v => updateField('moneda', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-3">
              <Label className="text-xs">Objeto / Descripción *</Label>
              <Input
                value={formData.objeto}
                onChange={e => updateField('objeto', e.target.value)}
                placeholder="Descripción del objeto de la oferta"
                className={cn('h-9 text-sm', errors.objeto && 'border-destructive focus-visible:ring-destructive')}
                aria-invalid={!!errors.objeto}
              />
              {errors.objeto && <p className="text-[9px] text-destructive mt-0.5">{errors.objeto}</p>}
            </div>
            {selectedOfertaId && (
              <div className="sm:col-span-3">
                <Label className="text-xs">Estado</Label>
                <Select
                  value={formData.status}
                  onValueChange={v => updateField('status', v as OfertaStatus)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="sent">Enviada</SelectItem>
                    <SelectItem value="accepted">Aceptada</SelectItem>
                    <SelectItem value="rejected">Rechazada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* 2. Suministrador */}
        <CollapsibleSection title="Suministrador" icon={Building} error={errors['suministrador.empresa']}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Empresa *</Label>
              <Input
                value={formData.suministrador.empresa}
                onChange={e => updateSuministrador('empresa', e.target.value)}
                placeholder="Nombre de la empresa suministradora"
                className={cn('h-9 text-sm', errors['suministrador.empresa'] && 'border-destructive focus-visible:ring-destructive')}
                aria-invalid={!!errors['suministrador.empresa']}
              />
              {errors['suministrador.empresa'] && <p className="text-[9px] text-destructive mt-0.5">{errors['suministrador.empresa']}</p>}
            </div>
            <div>
              <Label className="text-xs">Código REUP</Label>
              <Input
                value={formData.suministrador.codigo_reup}
                onChange={e => updateSuministrador('codigo_reup', e.target.value)}
                placeholder="00000000000"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Código NIT</Label>
              <Input
                value={formData.suministrador.codigo_nit}
                onChange={e => updateSuministrador('codigo_nit', e.target.value)}
                placeholder="00000000000"
                className="h-9 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Dirección</Label>
              <Input
                value={formData.suministrador.direccion}
                onChange={e => updateSuministrador('direccion', e.target.value)}
                placeholder="Dirección completa"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Teléfono</Label>
              <Input
                value={formData.suministrador.telefono}
                onChange={e => updateSuministrador('telefono', e.target.value)}
                placeholder="+53 5 000 0000"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                value={formData.suministrador.email}
                onChange={e => updateSuministrador('email', e.target.value)}
                placeholder="empresa@ejemplo.cu"
                className="h-9 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Cuenta Bancaria</Label>
              <Input
                value={formData.suministrador.cuenta_bancaria}
                onChange={e => updateSuministrador('cuenta_bancaria', e.target.value)}
                placeholder="0000-0000-00-00000000"
                className="h-9 text-sm"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* 3. Cliente */}
        <CollapsibleSection title="Cliente" icon={User} error={errors['cliente.empresa']}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">Empresa *</Label>
              <Input
                value={formData.cliente.empresa}
                onChange={e => updateCliente('empresa', e.target.value)}
                placeholder="Nombre de la empresa cliente"
                className={cn('h-9 text-sm', errors['cliente.empresa'] && 'border-destructive focus-visible:ring-destructive')}
                aria-invalid={!!errors['cliente.empresa']}
              />
              {errors['cliente.empresa'] && <p className="text-[9px] text-destructive mt-0.5">{errors['cliente.empresa']}</p>}
            </div>
            <div>
              <Label className="text-xs">Contacto</Label>
              <Input
                value={formData.cliente.contacto}
                onChange={e => updateCliente('contacto', e.target.value)}
                placeholder="Nombre del contacto"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Código REUP</Label>
              <Input
                value={formData.cliente.codigo_reup}
                onChange={e => updateCliente('codigo_reup', e.target.value)}
                placeholder="00000000000"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Código NIT</Label>
              <Input
                value={formData.cliente.codigo_nit}
                onChange={e => updateCliente('codigo_nit', e.target.value)}
                placeholder="00000000000"
                className="h-9 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Dirección</Label>
              <Input
                value={formData.cliente.direccion}
                onChange={e => updateCliente('direccion', e.target.value)}
                placeholder="Dirección completa"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Teléfono</Label>
              <Input
                value={formData.cliente.telefono}
                onChange={e => updateCliente('telefono', e.target.value)}
                placeholder="+53 5 000 0000"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                value={formData.cliente.email}
                onChange={e => updateCliente('email', e.target.value)}
                placeholder="cliente@ejemplo.cu"
                className="h-9 text-sm"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* 4. Productos */}
        <CollapsibleSection
          title="Productos"
          icon={Package}
          badge={`${formData.productos.length} ítem${formData.productos.length !== 1 ? 's' : ''}`}
          error={errors.productos}
        >
          <div className="space-y-2">
            {formData.productos.map((item, idx) => (
              <ProductRow
                key={item._uid || idx}
                item={item}
                index={idx}
                onChange={updateProduct}
                onRemove={removeProduct}
                currency={formData.moneda}
                errors={errors}
              />
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addProduct}
              className="w-full gap-1.5 mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar Producto
            </Button>
          </div>

          {/* Financial Summary */}
          <Separator className="my-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Descuento ({formData.moneda})</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={formData.descuento || ''}
                  onChange={e => updateField('descuento', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="h-9 text-sm text-right"
                />
              </div>
              <div>
                <Label className="text-xs">Impuesto (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={formData.impuesto_rate || ''}
                  onChange={e => updateField('impuesto_rate', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="h-9 text-sm text-right"
                />
              </div>
            </div>
            <FinancialSummary
              subtotal={subtotal}
              descuento={formData.descuento}
              itbisRate={formData.impuesto_rate}
              total={total}
              currency={formData.moneda}
            />
          </div>
        </CollapsibleSection>

        {/* 5. Condiciones */}
        <CollapsibleSection title="Condiciones Comerciales" icon={Calculator} defaultOpen={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Validez
              </Label>
              <Input
                value={formData.validez}
                onChange={e => updateField('validez', e.target.value)}
                placeholder="30 días"
                className="h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1.5">
                <CreditCard className="w-3 h-3" /> Condiciones de Pago
              </Label>
              <Input
                value={formData.condiciones_pago}
                onChange={e => updateField('condiciones_pago', e.target.value)}
                placeholder="Pago en la fecha de entrega"
                className="h-9 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Truck className="w-3 h-3" /> Condiciones de Entrega
              </Label>
              <Input
                value={formData.condiciones_entrega}
                onChange={e => updateField('condiciones_entrega', e.target.value)}
                placeholder="Según acuerdo entre las partes"
                className="h-9 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" /> Observaciones
              </Label>
              <Textarea
                value={formData.notas}
                onChange={e => updateField('notas', e.target.value)}
                placeholder="Notas adicionales para la oferta..."
                className="min-h-[60px] text-sm"
                rows={3}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* 6. Cuño y Firma */}
        <CollapsibleSection title="Cuño y Firma" icon={Stamp} defaultOpen={false}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Stamp */}
            <div className="space-y-2">
              <Label className="text-xs">Cuño (Sello)</Label>
              <div
                className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => !isUploading && stampInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Subir imagen de cuño"
              >
                {isUploading === 'stamp' ? (
                  <div className="space-y-1">
                    <Loader2 className="w-6 h-6 mx-auto text-primary animate-spin" />
                    <p className="text-[10px] text-muted-foreground">Subiendo...</p>
                  </div>
                ) : formData.stamp_url ? (
                  <div className="space-y-2">
                    <img
                      src={formData.stamp_url}
                      alt="Cuño"
                      className="max-h-20 mx-auto object-contain"
                    />
                    <p className="text-[10px] text-muted-foreground">Click para cambiar</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="w-6 h-6 mx-auto text-muted-foreground/40" />
                    <p className="text-[10px] text-muted-foreground">Subir cuño</p>
                  </div>
                )}
              </div>
              <input
                ref={stampInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleImageUpload('stamp_url')}
              />
              {formData.stamp_url && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Escala: {formData.stamp_scale}%
                    </Label>
                    <Slider
                      value={[formData.stamp_scale || 100]}
                      onValueChange={([v]) => updateField('stamp_scale', v)}
                      min={50}
                      max={200}
                      step={10}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveImage('stamp_url')}
                    aria-label="Eliminar cuño"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Sign */}
            <div className="space-y-2">
              <Label className="text-xs">Firma</Label>
              <div
                className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => !isUploading && signInputRef.current?.click()}
                role="button"
                tabIndex={0}
                aria-label="Subir imagen de firma"
              >
                {isUploading === 'sign' ? (
                  <div className="space-y-1">
                    <Loader2 className="w-6 h-6 mx-auto text-primary animate-spin" />
                    <p className="text-[10px] text-muted-foreground">Subiendo...</p>
                  </div>
                ) : formData.sign_url ? (
                  <div className="space-y-2">
                    <img
                      src={formData.sign_url}
                      alt="Firma"
                      className="max-h-20 mx-auto object-contain"
                    />
                    <p className="text-[10px] text-muted-foreground">Click para cambiar</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Upload className="w-6 h-6 mx-auto text-muted-foreground/40" />
                    <p className="text-[10px] text-muted-foreground">Subir firma</p>
                  </div>
                )}
              </div>
              <input
                ref={signInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleImageUpload('sign_url')}
              />
              {formData.sign_url && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      Escala: {formData.sign_scale}%
                    </Label>
                    <Slider
                      value={[formData.sign_scale || 100]}
                      onValueChange={([v]) => updateField('sign_scale', v)}
                      min={50}
                      max={200}
                      step={10}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveImage('sign_url')}
                    aria-label="Eliminar firma"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CollapsibleSection>

        {/* Actions */}
      </>)}
      <div className="flex flex-col sm:flex-row gap-2 pt-2 pb-4 sticky bottom-0 bg-background/95 backdrop-blur-sm">
        <Button
          onClick={handleSubmit}
          disabled={createMutation.isPending || updateMutation.isPending}
          className="flex-1 gap-1.5"
        >
          {(createMutation.isPending || updateMutation.isPending) && (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          )}
          {selectedOfertaId ? 'Actualizar Oferta' : 'Crear Oferta'}
        </Button>

        {/* PDF Preview — works even WITHOUT saving */}
        <Button
          variant="outline"
          onClick={handleExportPdf}
          disabled={isExportingPreview || exportPdfMutation.isPending}
          className="gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
        >
          {isExportingPreview ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
          Vista PDF
        </Button>

        {selectedOfertaId && (
          <Button
            variant="outline"
            onClick={() => exportPdfMutation.mutate({ id: selectedOfertaId, numero: formData.numero })}
            disabled={exportPdfMutation.isPending || isExportingPreview}
            className="gap-1.5"
          >
            {exportPdfMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Descargar PDF
          </Button>
        )}
      </div>
    </div>
  );
}
