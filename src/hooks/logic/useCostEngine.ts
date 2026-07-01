import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FichaJSON, CalculationResult } from '@/lib/cost-engine/types';
import { useAuthStore } from '@/store';

export const useCalculateFicha = () => {
  const queryClient = useQueryClient();
  const { token } = useAuthStore();

  return useMutation({
    mutationFn: async (ficha: FichaJSON): Promise<CalculationResult> => {
      const response = await fetch('/api/cost-sheets/calculate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(ficha),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errors?.join(', ') || 'Calculation failed');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['ficha', data.fichaId], data);
    },
  });
};

export const useImportJson = () => {
  const { token } = useAuthStore();

  return useMutation({
    mutationFn: async (file: File): Promise<FichaJSON> => {
      const text = await file.text();
      const json = JSON.parse(text);

      const response = await fetch('/api/cost-sheets/import-json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(json),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errors?.join(', ') || 'Import failed');
      }

      const result = await response.json();
      return result.ficha;
    },
  });
};

export const useImportAnexo = () => {
  const { token } = useAuthStore();

  return useMutation({
    mutationFn: async ({ file, anexoId }: { file: File; anexoId: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('anexoId', anexoId);

      const response = await fetch('/api/cost-sheets/import-anexo', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Annex import failed');
      }

      return response.json();
    },
  });
};
