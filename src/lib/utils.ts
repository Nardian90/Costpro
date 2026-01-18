import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase } from "./supabaseClient"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generates a public URL for a product image stored in Supabase Storage.
 * This is a synchronous operation as it just constructs the URL string.
 * @param imageUrl The image path or URL from the database
 * @returns The public URL or null
 */
export function getProductImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http')) return imageUrl;

  // Clean the path if it has the bucket prefix repeated
  const path = imageUrl.startsWith('products/')
    ? imageUrl.replace('products/', '')
    : imageUrl;

  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}
