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
      fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: `Zod Validation Error: RPC ${rpcName}`,
          error: errorData,
          data: data // Send partial data for debugging
        }),
      }).catch(err => console.error('Failed to log validation error:', err));
    }

    if (process.env.NODE_ENV === 'development') {
        toast.error(`Error de validación en ${rpcName}`);
    }
    // We cast to T anyway to avoid breaking the UI, but we've logged the error
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
        fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: `Zod Validation Error: RPC ${rpcName} (Array)`,
            error: errorData
          }),
        }).catch(err => console.error('Failed to log validation error:', err));
      }

      if (process.env.NODE_ENV === 'development') {
          toast.error(`Error de validación en ${rpcName}`);
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
    console.error(`[Zod Validation Error] ${context}:`, result.error.format());
    return data as T;
  }

  return result.data;
}
