'use client';

import React from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { Package } from 'lucide-react';
import { getProductImageUrl } from '@/lib/utils';

interface ProductImageProps {
  src: string | null | undefined;
  name: string;
  width?: number;
  height?: number;
  className?: string;
  forceShow?: boolean; // For detail views where we want the image even in neumo
}

export default function ProductImage({
  src,
  name,
  width = 32,
  height = 32,
  className,
  forceShow = false
}: ProductImageProps) {
  const { theme } = useTheme();

  // Rule: No images in neumo theme for general performance, unless forced (detail views)
  if (theme === 'neumo' && !forceShow) return null;

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/20 rounded-lg border border-border/50 ${className}`}
        style={{ width, height }}
      >
        <Package className="text-muted-foreground/40" style={{ width: width * 0.5, height: height * 0.5 }} />
      </div>
    );
  }

  const imageUrl = getProductImageUrl(src);

  if (!imageUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/20 rounded-lg border border-border/50 ${className}`}
        style={{ width, height }}
      >
        <Package className="text-muted-foreground/40" style={{ width: width * 0.5, height: height * 0.5 }} />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-border/50 ${className}`}
      style={{ width, height }}
    >
      <Image
        src={imageUrl}
        alt={name}
        width={width}
        height={height}
        className="object-cover w-full h-full"
        loading="lazy"
      />
    </div>
  );
}
