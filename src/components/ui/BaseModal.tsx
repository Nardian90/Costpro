'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/ui/useFocusTrap';

interface BaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  maxWidth?: string; // e.g., 'sm:max-w-lg', 'sm:max-w-2xl'
  showCloseButton?: boolean;
  'aria-label'?: string;
}

/**
 * BaseModal
 * A standardized, mobile-first modal component that ensures:
 * - Proper positioning (always visible in viewport)
 * - Vertical-only scrolling for long content
 * - Sticky header and footer
 * - Accessibility (ARIA, focus management)
 */
export const BaseModal: React.FC<BaseModalProps> = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  maxWidth = 'sm:max-w-lg',
  showCloseButton = true,
  'aria-label': ariaLabel,
}) => {
  const trapRef = useFocusTrap(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={trapRef}
        aria-label={ariaLabel}
        className={cn(
          // Layout: Use flexbox instead of grid to manage internal scroll
          "flex flex-col p-0 gap-0 overflow-hidden",
          // Position & Size: Mobile-first
          "fixed left-1/2 top-4 -translate-x-1/2 translate-y-0 sm:top-1/2 sm:-translate-y-1/2",
          "w-[calc(100vw-1rem)] max-h-[90vh]",
          // Desktop adjustments
          maxWidth,
          "sm:w-full",
          className
        )}
        showCloseButton={showCloseButton}
      >
        {/* Sticky Header */}
        {(title || description) && (
          <DialogHeader className="p-6 pb-4 border-b flex-shrink-0 text-left sm:text-left">
            {title && <DialogTitle className="text-xl font-bold">{title}</DialogTitle>}
            {description && (
              <DialogDescription className="text-muted-foreground mt-1">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
        )}

        {/* Scrollable Content */}
        <div
          className={cn(
            "flex-1 overflow-y-auto overflow-x-hidden p-6 min-h-0",
            // Ensure touch scrolling is smooth
            "touch-pan-y",
            contentClassName
          )}
        >
          {children}
        </div>

        {/* Sticky Footer */}
        {footer && (
          <DialogFooter className="p-6 pt-4 border-t flex-shrink-0 sm:justify-end gap-2 bg-muted/5">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
