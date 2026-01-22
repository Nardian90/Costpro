import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase } from './supabaseClient';

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
