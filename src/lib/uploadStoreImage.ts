import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';

/**
 * F2.5-4: Helper reutilizable para subir imágenes de tienda (logo, firma, sello)
 * a Supabase Storage. Extraído de StoreModals.tsx para que StoreConfigModal
 * pueda usarlo sin duplicar la lógica.
 *
 * Buckets y folders convencionales:
 * - logo     → bucket 'stores', folder 'store-logos'
 * - firma    → bucket 'stores', folder 'store-signatures'
 * - sello    → bucket 'stores', folder 'store-stamps'
 *
 * Validaciones (igual que StoreModals original):
 * - Solo imágenes (no SVG por seguridad)
 * - Max 1MB
 * - Extensiones: jpg, jpeg, png, webp, gif
 *
 * Retorna la URL pública si éxito, o null si falla (muestra toast de error).
 */
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
const MAX_SIZE_BYTES = 1024 * 1024; // 1MB

export async function uploadStoreImage(
  file: File,
  bucket: string,
  folder: string,
  options?: {
    onSuccess?: (publicUrl: string) => void;
    onError?: (message: string) => void;
  }
): Promise<string | null> {
  // Validaciones
  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    const msg = 'Formato SVG no permitido por seguridad';
    toast.error(msg);
    options?.onError?.(msg);
    return null;
  }
  if (!file.type.startsWith('image/')) {
    const msg = 'Solo se permiten archivos de imagen';
    toast.error(msg);
    options?.onError?.(msg);
    return null;
  }
  if (file.size > MAX_SIZE_BYTES) {
    const msg = 'El archivo supera el tamaño máximo de 1MB';
    toast.error(msg);
    options?.onError?.(msg);
    return null;
  }

  const fileExt = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
    const msg = `Formato no permitido. Use: ${ALLOWED_EXTENSIONS.join(', ')}`;
    toast.error(msg);
    options?.onError?.(msg);
    return null;
  }

  // Upload a Supabase Storage
  try {
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, { contentType: file.type, upsert: false });

    if (uploadError) throw uploadError;

    const result = supabase.storage.from(bucket).getPublicUrl(filePath);
    const publicUrl = result.data?.publicUrl ?? '';

    if (!publicUrl) {
      throw new Error('No se pudo obtener la URL pública del archivo subido');
    }

    toast.success('Archivo subido correctamente');
    options?.onSuccess?.(publicUrl);
    return publicUrl;
  } catch (err: unknown) {
    let msg = 'Error al subir archivo';
    if (err instanceof Error) {
      msg = err.message;
    } else if (err != null && typeof err === 'object' && 'error_description' in err && typeof (err as { error_description: unknown }).error_description === 'string') {
      msg = (err as { error_description: string }).error_description;
    }
    toast.error(msg);
    console.error('[uploadStoreImage] Error:', err);
    options?.onError?.(msg);
    return null;
  }
}
