'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { Package } from 'lucide-react';
import { getProductImageUrl, cn, isPerformanceTheme } from '@/lib/utils';

interface ProductImageProps {
  src?: string | null;
  alt?: string;
  name: string;
  width?: number;
  height?: number;
  className?: string;
  forceShow?: boolean;
}

/**
 * ProductImage Atom
 *
 * A resilient image component that handles:
 * - Next.js Image optimization
 * - Supabase public URL resolution
 * - Theme-based performance rules (hiding images in performance themes unless forced)
 * - Initials-based placeholder fallback when image is missing, broken, or hidden
 * - Stable aspect-ratio via parent or explicit dimensions
 */
export default function ProductImage({
  src,
  alt,
  name,
  width,
  height,
  className,
  forceShow = false
}: ProductImageProps) {
  const { theme } = useTheme();
  const [error, setError] = useState(false);

  const initials = useMemo(() => {
    if (!name) return '';
    return name
      .split(' ')
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }, [name]);

  const backgroundColor = useMemo(() => {
    const colors = [
      'bg-green-600/10',
      'bg-green-500/10',
      'bg-purple-500/10',
      'bg-orange-500/10',
      'bg-pink-500/10',
      'bg-green-600/10',
      'bg-teal-500/10',
      'bg-cyan-500/10',
    ];
    let hash = 0;
    const str = name || 'product';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }, [name]);

  const textColor = backgroundColor.replace('/10', '').replace('bg-', 'text-').replace('-500', '-600');

  // Logic: Show placeholder if we are in performance themes (and not forced),
  // if there's an error loading, or if no source is provided.
  const showPlaceholder = (isPerformanceTheme(theme) && !forceShow) || error || !src;

  const imageUrl = src ? getProductImageUrl(src) : null;

  if (showPlaceholder || !imageUrl) {
    return (
      <div
        className={cn(
          'flex items-center justify-center font-black uppercase transition-all duration-300',
          backgroundColor,
          textColor,
          className
        )}
        style={{ width, height }}
        title={alt || name}
      >
        <span className="select-none" style={{ fontSize: width ? Math.max(12, width * 0.25) : 'inherit' }}>
            {initials || <Package className="opacity-40" />}
        </span>
      </div>
    );
  }

  // If width/height are provided, use them for the container and next/image
  // Otherwise, use fill mode (requires parent to be relative)
  const isFluid = !width && !height;

  return (
    <div
      className={cn('relative overflow-hidden', !isFluid && 'shrink-0', className)}
      style={{ width, height }}
    >
      <Image
        src={imageUrl}
        alt={alt || name}
        fill={isFluid}
        width={!isFluid ? width : undefined}
        height={!isFluid ? height : undefined}
        className="object-cover w-full h-full"
        loading="lazy"
        onError={() => setError(true)}
      />
    </div>
  );
}
