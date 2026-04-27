import { useAuthStore } from '@/store';
import { z } from 'zod';
import { toast } from 'sonner';

export async function validateRPCResponse<T>(
  data: any,
  schema: z.ZodType<T>,
  rpcName: string
): Promise<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errorData = result.error.format();
    console.error(`[Zod Validation Error] RPC: ${rpcName}`, errorData);

    // Log to external service in production
    if (process.env.NODE_ENV === 'production') {
      fetch('/api/logs', { method: 'POST', headers: { Authorization: `Bearer ${useAuthStore.getState().token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: `Zod Validation Error: RPC ${rpcName}`,
          error: errorData,
          data: data, // Send data for debugging
          timestamp: new Date().toISOString()
        }),
      }).catch(err => console.error('Failed to log validation error:', err));
    }

    if (process.env.NODE_ENV !== 'production') {
        const message = `Error de validación en RPC: ${rpcName}. Revisa la consola para más detalles.`;
        toast.error(message);
        throw new Error(message);
    }
    // We cast to T anyway to avoid breaking the UI in production, but we've logged the error
    return data as T;
  }

  return result.data;
}

export async function validateRPCArrayResponse<T>(
    data: any,
    schema: z.ZodType<T>,
    rpcName: string
  ): Promise<T[]> {
    const arraySchema = z.array(schema);
    const result = arraySchema.safeParse(data);

    if (!result.success) {
      const errorData = result.error.format();
      console.error(`[Zod Validation Error] RPC: ${rpcName} (Array)`, errorData);

      if (process.env.NODE_ENV === 'production') {
      fetch('/api/logs', { method: 'POST', headers: { Authorization: `Bearer ${useAuthStore.getState().token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: `Zod Validation Error: RPC ${rpcName} (Array)`,
            error: errorData,
            data: Array.isArray(data) ? data.slice(0, 5) : data, // Send sample for debugging
            timestamp: new Date().toISOString()
          }),
        }).catch(err => console.error('Failed to log validation error:', err));
      }

      if (process.env.NODE_ENV !== 'production') {
          const message = `Error de validación en RPC (Array): ${rpcName}. Revisa la consola para más detalles.`;
          toast.error(message);
          throw new Error(message);
      }
      return (data || []) as T[];
    }

    return result.data;
  }

export async function validateResponse<T>(
  data: any,
  schema: z.ZodType<T>,
  context: string
): Promise<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errorData = result.error.format();
    console.error(`[Zod Validation Error] ${context}:`, errorData);

    if (process.env.NODE_ENV === 'production') {
      fetch('/api/logs', { method: 'POST', headers: { Authorization: `Bearer ${useAuthStore.getState().token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: `Zod Validation Error: ${context}`,
            error: errorData,
            data: data,
            timestamp: new Date().toISOString()
          }),
        }).catch(err => console.error('Failed to log validation error:', err));
      }

    return data as T;
  }

  return result.data;
}
