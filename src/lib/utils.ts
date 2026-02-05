import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase } from './supabaseClient';
import { type Product } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const getSupabaseUrl = (bucket: string, path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
};

/**
 * Utility to get the public URL for a product image.
 * Centralizing this logic avoids redundant calculations and SDK overhead in render loops.
 */
export const getProductImageUrl = (path: string | null | undefined): string | null => {
  return getSupabaseUrl('product-images', path);
};

/**
 * Utility to get the public URL for a store logo.
 */
export const getStoreLogoUrl = (path: string | null | undefined): string | null => {
  return getSupabaseUrl('store-logos', path);
};

/**
 * Resolves the image URL for a product based on priority:
 * 1. image_url (External URL)
 * 2. public_image_url (Internal upload)
 * 3. null (Fallback to placeholder)
 */
export const resolveProductImage = (product: Product | null | undefined): string | null => {
  if (!product) return null;
  return product.image_url || product.public_image_url || null;
};

/**
 * Utility to format currency in Spanish (Argentina).
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(amount);
};

/**
 * Utility to format numbers with accounting format (US style):
 * Thousands: comma (,)
 * Decimal: dot (.)
 * Precision: 2 decimal places
 * Example: 2100 -> 2,100.00
 */
export const formatAccounting = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Utility to format dates in Spanish (Argentina) format DD/MM/YYYY.
 */
export const formatDate = (date: string | Date | null | undefined): string => {
  try {
    if (!date) return '—';
    const d = typeof date === 'string' && date.includes('-')
      ? new Date(date + 'T12:00:00') // Force mid-day to avoid TZ shifts
      : new Date(date);

    if (isNaN(d.getTime())) return '—';

    return new Intl.DateTimeFormat('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch (e) {
    console.error('Error formatting date:', e);
    return '—';
  }
};

/**
 * Utility to format time in Spanish (Argentina) format HH:MM:SS.
 */
export const formatTime = (date: string | Date | null | undefined): string => {
  try {
    if (!date) return '—';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';

    return new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  } catch (e) {
    console.error('Error formatting time:', e);
    return '—';
  }
};

/**
 * Safely formats a date, preventing runtime crashes on invalid values.
 * Standard implementation as per team requirements.
 */
export function safeFormatDate(
  value: string | number | Date | null | undefined,
  locale = "es-ES"
): string {
  if (value === null || value === undefined || value === "") return "—";

  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  } catch (error) {
    console.error("safeFormatDate error:", error);
    return "—";
  }
}
