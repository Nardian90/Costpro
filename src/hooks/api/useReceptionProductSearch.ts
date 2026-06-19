"use client";

import { useState, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useDebounce } from "@/hooks/ui/useDebounce";
import type { Product } from "@/types";

interface ReceptionProductPage {
  products: Product[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  hasMore: boolean;
}

/**
 * EM-R2: Server-side search para recepción.
 * Usa la RPC `get_products_for_reception` paginada en BD.
 * Usa `useInfiniteQuery` para manejar paginación + acumulación
 * sin necesidad de estado local sincronizado con effects.
 */
export function useReceptionProductSearch(
  storeId: string | null | undefined,
  initialSearch: string = "",
  pageSize: number = 50,
) {
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const debouncedSearch = useDebounce(searchTerm, 300);

  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    error,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["reception-products", storeId, debouncedSearch],
    queryFn: async ({ pageParam = 1 }): Promise<ReceptionProductPage> => {
      if (!storeId) return { products: [], totalCount: 0, currentPage: 1, totalPages: 0, hasMore: false };

      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_products_for_reception",
        {
          p_store_id: storeId,
          p_search_term: debouncedSearch,
          p_page: pageParam,
          p_page_size: pageSize,
        }
      );

      if (rpcError) throw rpcError;
      if (!rpcData || rpcData.length === 0) {
        return { products: [], totalCount: 0, currentPage: pageParam, totalPages: 0, hasMore: false };
      }

      const totalCount = Number((rpcData[0] as any).total_count) || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      const products: Product[] = rpcData.map((row: any) => ({
        id: row.id,
        name: row.name,
        sku: row.sku || "",
        barcode: row.barcode || "",
        cost_price: Number(row.cost_price) || 0,
        price: Number(row.price) || 0,
        unit_of_measure: row.unit_of_measure || "unidad",
        stock_current: Number(row.stock_current) || 0,
        min_stock: Number(row.min_stock) || 0,
        is_active: row.is_active,
        store_id: storeId,
      }) as Product);

      return {
        products,
        totalCount,
        currentPage: pageParam,
        totalPages,
        hasMore: pageParam < totalPages,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.currentPage + 1 : undefined),
    enabled: !!storeId,
    staleTime: 30_000,
  });

  // Acumular productos de todas las páginas
  const products = data?.pages.flatMap((p) => p.products) ?? [];
  const totalCount = data?.pages[0]?.totalCount ?? 0;
  const hasMore = hasNextPage ?? false;

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    searchTerm,
    setSearchTerm,
    products,
    totalCount,
    hasMore,
    loadMore,
    isLoading,
    isFetchingMore: isFetchingNextPage,
    error,
  };
}
