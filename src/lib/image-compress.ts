/**
 * @file Shared image compression utility following international best practices.
 * @description Compresses product images to optimal sizes for web/POS use.
 *
 * Standards applied:
 * - Max dimension: 1024px (WooCommerce standard; Shopify uses 2048px)
 * - Target file size: < 200 KB (e-commerce best practice)
 * - Output format: WebP with JPEG fallback (30% smaller than JPEG)
 * - Quality: Iterative reduction from 0.80 → 0.60
 * - Progressive JPEG when WebP not supported
 * - EXIF metadata stripped (via Canvas redraw)
 *
 * Reference: Google Web.dev "Optimize Images" guidelines
 */

export interface CompressOptions {
  /** Maximum width in pixels (default: 1024) */
  maxWidth: number;
  /** Maximum height in pixels (default: 1024) */
  maxHeight: number;
  /** Initial quality for WebP/JPEG (0.0 - 1.0, default: 0.80) */
  quality: number;
  /** Target file size in KB (default: 200) */
  targetSizeKB: number;
  /** Minimum quality before giving up (default: 0.55) */
  minQuality: number;
  /** Quality step per iteration (default: 0.10) */
  qualityStep: number;
  /** Skip files smaller than this (KB) (default: 200) */
  skipBelowKB: number;
}

export const DEFAULT_OPTIONS: CompressOptions = {
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 0.80,
  targetSizeKB: 200,
  minQuality: 0.55,
  qualityStep: 0.10,
  skipBelowKB: 200,
};

/**
 * Detect if the browser supports WebP encoding via Canvas.
 */
function supportsWebP(): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/**
 * Load an image from a File object.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Calculate dimensions preserving aspect ratio within max bounds.
 */
function fitDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }

  const ratio = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

/**
 * Attempt to compress the image at a specific quality and format.
 * Returns a Blob or null if the canvas is empty.
 */
function compressToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob),
      mimeType,
      quality,
    );
  });
}

/**
 * Main compression function. Compresses a File to meet target size constraints.
 *
 * @param file - Input image file (any format)
 * @param options - Compression options (uses defaults if not provided)
 * @returns Compressed File with WebP (.webp) or JPEG (.jpg) extension
 * @throws Error if image cannot be loaded or compression fails
 */
export async function compressImage(
  file: File,
  options: Partial<CompressOptions> = {},
): Promise<File> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Skip small files
  if (file.size / 1024 < opts.skipBelowKB) {
    return file;
  }

  const img = await loadImage(file);
  const { width, height } = fitDimensions(
    img.naturalWidth,
    img.naturalHeight,
    opts.maxWidth,
    opts.maxHeight,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');

  // Draw image (this strips EXIF metadata)
  ctx.drawImage(img, 0, 0, width, height);

  // Cleanup object URL
  URL.revokeObjectURL(img.src);

  const canWebP = supportsWebP();
  const primaryMime = canWebP ? 'image/webp' : 'image/jpeg';
  const fallbackMime = 'image/jpeg';
  const extension = canWebP ? 'webp' : 'jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '');

  // Iterative quality reduction to hit target size
  let quality = opts.quality;

  while (quality >= opts.minQuality) {
    const blob = await compressToBlob(canvas, primaryMime, quality);

    if (blob && blob.size / 1024 <= opts.targetSizeKB) {
      return new File([blob], `${baseName}.${extension}`, {
        type: primaryMime,
        lastModified: Date.now(),
      });
    }

    // Try JPEG fallback if WebP failed
    if (canWebP && primaryMime === 'image/webp') {
      const jpegBlob = await compressToBlob(canvas, fallbackMime, quality);
      if (jpegBlob && jpegBlob.size / 1024 <= opts.targetSizeKB) {
        return new File([jpegBlob], `${baseName}.jpg`, {
          type: fallbackMime,
          lastModified: Date.now(),
        });
      }
    }

    quality -= opts.qualityStep;
  }

  // Last resort: return at minimum quality
  const finalBlob = await compressToBlob(canvas, primaryMime, opts.minQuality)
    ?? await compressToBlob(canvas, fallbackMime, opts.minQuality);

  if (finalBlob) {
    return new File([finalBlob], `${baseName}.${extension}`, {
      type: primaryMime,
      lastModified: Date.now(),
    });
  }

  // Absolute fallback: return original (should not happen)
  return file;
}

/**
 * Quick validation for image files.
 * @returns true if the file is a valid image under the size limit.
 */
export function validateImageFile(file: File, maxMB: number = 10): string | null {
  if (!file.type.startsWith('image/')) {
    return 'Solo se permiten archivos de imagen (JPG, PNG, WebP)';
  }
  if (file.size > maxMB * 1024 * 1024) {
    return `La imagen no debe superar los ${maxMB} MB`;
  }
  return null;
}
