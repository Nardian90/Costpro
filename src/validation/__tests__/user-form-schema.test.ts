import { z } from 'zod';
import { describe, it, expect } from 'vitest';

const userFormSchema = z.object({
  fullName: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse', 'costo'] as const),
  isActive: z.boolean(),
  maxStoresLimit: z.number().min(0).catch(0),
  maxUsersLimit: z.number().min(0).catch(0),
  memberships: z.array(z.object({
    store_id: z.string().min(1, 'Seleccione una tienda'),
    role: z.enum(['admin', 'encargado', 'usuario', 'manager', 'clerk', 'warehouse', 'costo'] as const),
    status: z.enum(['active', 'revoked'] as const),
  })),
}).refine(data => {
  if (data.role === 'encargado' && data.maxStoresLimit > 0) {
    return data.memberships.length <= data.maxStoresLimit;
  }
  return true;
}, {
  message: "El número de tiendas asignadas excede el límite permitido para este encargado",
  path: ["memberships"]
}).refine(data => {
  const rolesQueRequierenTienda = ['encargado', 'clerk', 'warehouse'];
  if (rolesQueRequierenTienda.includes(data.role)) {
    return data.memberships.length > 0;
  }
  return true;
}, {
  message: "Este rol requiere al menos una tienda asignada",
  path: ["memberships"]
});

describe('userFormSchema', () => {
  const validData = {
    fullName: 'Juan Perez',
    email: 'juan@example.com',
    role: 'encargado' as const,
    isActive: true,
    maxStoresLimit: 2,
    maxUsersLimit: 5,
    memberships: [
      { store_id: '550e8400-e29b-41d4-a716-446655440000', role: 'encargado' as const, status: 'active' as const }
    ]
  };

  it('should validate valid data', () => {
    const result = userFormSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should fail if memberships exceed maxStoresLimit for encargado', () => {
    const invalidData = {
      ...validData,
      maxStoresLimit: 1,
      memberships: [
        { store_id: '550e8400-e29b-41d4-a716-446655440000', role: 'encargado' as const, status: 'active' as const },
        { store_id: '550e8400-e29b-41d4-a716-446655440001', role: 'clerk' as const, status: 'active' as const }
      ]
    };
    const result = userFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("El número de tiendas asignadas excede el límite permitido para este encargado");
    }
  });

  it('should fail if memberships is empty for encargado', () => {
    const invalidData = {
      ...validData,
      role: 'encargado' as const,
      memberships: []
    };
    const result = userFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Este rol requiere al menos una tienda asignada");
    }
  });

  it('should fail if memberships is empty for clerk', () => {
    const invalidData = {
      ...validData,
      role: 'clerk' as const,
      memberships: []
    };
    const result = userFormSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it('should succeed if memberships is empty for costo', () => {
    const data = {
      ...validData,
      role: 'costo' as const,
      memberships: []
    };
    const result = userFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should succeed if memberships is empty for admin', () => {
    const data = {
      ...validData,
      role: 'admin' as const,
      memberships: []
    };
    const result = userFormSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
