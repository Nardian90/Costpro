import { z } from 'zod';
import { toast } from 'sonner';

export async function validateRPCResponse<T>(
  data: any,
  schema: z.ZodType<T>,
  rpcName: string
): Promise<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    console.error(`[Zod Validation Error] RPC: ${rpcName}`, result.error.format());
    // In production, we might want to still return the data but log the error
    // For now, let's be strict and toast if we are in development or if it's critical
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
      console.error(`[Zod Validation Error] RPC: ${rpcName} (Array)`, result.error.format());
      if (process.env.NODE_ENV === 'development') {
          toast.error(`Error de validación en ${rpcName}`);
      }
      return (data || []) as T[];
    }

    return result.data;
  }
