'use client';

import React, { useState, useMemo } from 'react';
import { Package } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageWithFallbackProps {
  src?: string | null;
  alt: string;
  name: string;
  className?: string;
  forcePlaceholder?: boolean;
}

const ImageWithFallback: React.FC<ImageWithFallbackProps> = ({
  src,
  alt,
  name,
  className,
  forcePlaceholder = false,
}) => {
  const [error, setError] = useState(false);

  const initials = useMemo(() => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }, [name]);

  const backgroundColor = useMemo(() => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-orange-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500',
      'bg-cyan-500',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }, [name]);

  if (forcePlaceholder || error || !src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center text-white font-bold uppercase',
          backgroundColor,
          className
        )}
        title={alt}
      >
        {initials || <Package className="w-1/2 h-1/2 opacity-50" />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setError(true)}
      loading="lazy"
    />
  );
};

export default ImageWithFallback;
