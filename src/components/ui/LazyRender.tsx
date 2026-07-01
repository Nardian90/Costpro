'use client';

import React, { useState, useEffect, useRef } from 'react';

interface LazyRenderProps {
  children: React.ReactNode;
  placeholder?: React.ReactNode;
  threshold?: number;
  rootMargin?: string;
}

export const LazyRender: React.FC<LazyRenderProps> = ({
  children,
  placeholder,
  threshold = 0.1,
  rootMargin = '200px'
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return (
    <div ref={containerRef}>
      {isVisible ? children : (placeholder || <div className="h-40 animate-pulse bg-muted/10 rounded-3xl" />)}
    </div>
  );
};
