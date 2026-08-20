/**
 * @file Image crop utility — Canvas-based, no external dependencies.
 * @description Crops a region from an image File and returns a new File.
 *
 * Reuses the Canvas + WebP/JPEG pattern from image-compress.ts.
 * Aspect ratio is enforced via the crop area shape (square for catalog thumbnails).
 */

export interface CropArea {
  /** X coordinate (in pixels) of the crop area, relative to the natural image. */
  x: number;
  /** Y coordinate (in pixels) of the crop area, relative to the natural image. */
  y: number;
  /** Width in pixels of the crop area. */
  width: number;
  /** Height in pixels of the crop area. */
  height: number;
}

export interface CropOptions {
  /** Output width in pixels (default: 1024 — matches catalog compression standard). */
  outputWidth?: number;
  /** Output height in pixels (default: 1024 — square catalog thumbnail). */
  outputHeight?: number;
  /** Output format: 'image/webp' (default) or 'image/jpeg'. */
  mimeType?: 'image/webp' | 'image/jpeg';
  /** JPEG/WebP quality 0.0–1.0 (default: 0.85). */
  quality?: number;
}

/**
 * Load a File into an HTMLImageElement (for Canvas drawing).
 */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('El archivo no es una imagen válida.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen.'));
    };
    img.src = url;
  });
}

/**
 * Load a URL (http/https/blob) into an HTMLImageElement.
 * Sets crossOrigin = 'anonymous' so we can read pixel data via Canvas
 * (requires the remote server to send CORS headers; Supabase storage does).
 */
export function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen desde la URL.'));
    img.src = url;
  });
}

/**
 * Crop an image File to the specified CropArea and return a new File.
 *
 * The crop area is specified in coordinates relative to the natural image dimensions
 * (i.e. `image.naturalWidth` × `image.naturalHeight`).
 *
 * Output is resized to `outputWidth` × `outputHeight` (default 1024×1024, square).
 *
 * @throws if the crop area is invalid (zero size or outside image bounds).
 */
export async function cropImage(
  file: File,
  area: CropArea,
  options: CropOptions = {},
): Promise<File> {
  const img = await loadImageFromFile(file);
  return cropImageElement(img, area, options, file.name);
}

/**
 * Crop an HTMLImageElement (already loaded) to the specified CropArea.
 * Useful when the source is a remote URL fetched via `loadImageFromUrl()`.
 */
export async function cropImageElement(
  img: HTMLImageElement,
  area: CropArea,
  options: CropOptions = {},
  originalName = 'image',
): Promise<File> {
  const {
    outputWidth = 1024,
    outputHeight = 1024,
    mimeType = 'image/webp',
    quality = 0.85,
  } = options;

  // Validate crop area
  if (area.width <= 0 || area.height <= 0) {
    throw new Error('El área de recorte es inválida (tamaño cero).');
  }
  if (area.x < 0 || area.y < 0) {
    throw new Error('El área de recorte está fuera de la imagen.');
  }
  if (area.x + area.width > img.naturalWidth || area.y + area.height > img.naturalHeight) {
    throw new Error('El área de recorte excede los límites de la imagen.');
  }

  // Use Canvas to draw the cropped region at the target output size
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas no soportado en este navegador.');

  // Use the best available image smoothing quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw the cropped area scaled to the output dimensions
  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height, // source crop
    0, 0, outputWidth, outputHeight, // destination
  );

  // Convert to Blob → File
  const ext = mimeType === 'image/webp' ? 'webp' : 'jpg';
  const baseName = originalName.replace(/\.[^.]+$/, '');
  return new Promise<File>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo generar la imagen recortada.'));
          return;
        }
        const file = new File([blob], `${baseName}-crop.${ext}`, { type: mimeType });
        resolve(file);
      },
      mimeType,
      quality,
    );
  });
}

/**
 * Constrain a crop area so it stays within the image bounds.
 * Useful when the user drags the crop rectangle past the image edges.
 */
export function constrainCropArea(area: CropArea, naturalWidth: number, naturalHeight: number): CropArea {
  const width = Math.max(1, Math.min(area.width, naturalWidth));
  const height = Math.max(1, Math.min(area.height, naturalHeight));
  const x = Math.max(0, Math.min(area.x, naturalWidth - width));
  const y = Math.max(0, Math.min(area.y, naturalHeight - height));
  return { x, y, width, height };
}

/**
 * Default crop area: centered square covering 80% of the smaller dimension.
 * Matches the catalog aspect-ratio convention (square thumbnails).
 */
export function defaultCropArea(naturalWidth: number, naturalHeight: number): CropArea {
  const side = Math.min(naturalWidth, naturalHeight) * 0.8;
  const x = (naturalWidth - side) / 2;
  const y = (naturalHeight - side) / 2;
  return { x, y, width: side, height: side };
}
