/**
 * zod-to-openapi.ts — Converts Zod v4 schemas to OpenAPI 3.0.3 JSON Schema format.
 *
 * Handles: z.string(), z.number(), z.boolean(), z.object(), z.array(),
 *          z.enum(), z.optional(), z.nullable(), z.union(), z.literal(),
 *          z.record(), z.any(), z.unknown(), z.null(), z.default(),
 *          z.int(), z.min(), z.max(), z.email(), z.uuid()
 */
import { z } from 'zod';

type JsonSchema = Record<string, unknown>;

/**
 * Helper to safely extract the internal _def from a Zod schema.
 * Zod v4 uses `schema.def` internally but exposes via `.def` getter.
 */
function getDef(schema: z.ZodType): Record<string, unknown> {
  return (schema as unknown as { def: Record<string, unknown> }).def ||
    (schema as unknown as { _def: Record<string, unknown> })._def ||
    {};
}

export function zodToOpenApi(schema: z.ZodType): JsonSchema {
  const def = getDef(schema);
  const type = def.type as string | undefined;

  switch (type) {
    case 'string': {
      const result: JsonSchema = { type: 'string' };
      const s = schema as z.ZodString;
      if ((s as any).format) result.format = (s as any).format;
      if (s.minLength != null) result.minLength = s.minLength;
      if (s.maxLength != null) result.maxLength = s.maxLength;
      return result;
    }

    case 'number': {
      const result: JsonSchema = { type: 'number' };
      const n = schema as z.ZodNumber;
      if (n.isInt) result.type = 'integer';
      if (n.minValue != null) result.minimum = n.minValue;
      if (n.maxValue != null) result.maximum = n.maxValue;
      return result;
    }

    case 'boolean':
      return { type: 'boolean' };

    case 'null':
      return { type: 'null' };

    case 'undefined':
      return { type: 'null', description: 'undefined' };

    case 'literal': {
      const lit = schema as unknown as { _def: { values: unknown[] } };
      const values = lit._def?.values;
      if (values && values.length === 1) {
        return { const: values[0] };
      }
      return { enum: values };
    }

    case 'enum': {
      const e = schema as unknown as { options: string[] };
      return { type: 'string', enum: e.options };
    }

    case 'array': {
      const a = schema as unknown as { element: z.ZodType; _def: Record<string, unknown> };
      const result: JsonSchema = {
        type: 'array',
        items: zodToOpenApi(a.element),
      };
      // Check for min/max in checks
      const checks = (a._def?.checks || []) as Array<{ type?: string; value?: number }>;
      for (const check of checks) {
        if (check.value != null) {
          if (check.type === 'min' || (result.minItems === undefined)) {
            result.minItems = check.value;
          } else if (check.type === 'max') {
            result.maxItems = check.value;
          }
        }
      }
      return result;
    }

    case 'object': {
      const obj = schema as z.ZodObject<Record<string, z.ZodType>>;
      const shape = obj.shape;
      const properties: JsonSchema = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        properties[key] = zodToOpenApi(value);
        if (!(value as unknown as { isOptional: () => boolean }).isOptional?.()) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }

    case 'record': {
      const r = schema as unknown as { valueType: z.ZodType };
      return {
        type: 'object',
        additionalProperties: zodToOpenApi(r.valueType),
      };
    }

    case 'union': {
      const u = schema as unknown as { options: z.ZodType[] };
      return {
        anyOf: u.options.map((o) => zodToOpenApi(o)),
      };
    }

    case 'discriminated_union':
    case 'discriminatedUnion': {
      const du = schema as unknown as { options: z.ZodType[] };
      return {
        oneOf: du.options.map((o) => zodToOpenApi(o)),
      };
    }

    case 'optional': {
      const opt = schema as unknown as { _def: { innerType: z.ZodType } };
      return zodToOpenApi(opt._def.innerType);
    }

    case 'nullable': {
      const nl = schema as unknown as { _def: { innerType: z.ZodType } };
      const inner = zodToOpenApi(nl._def.innerType);
      if (Array.isArray((inner as { anyOf?: unknown[] }).anyOf)) {
        return { anyOf: [...(inner as { anyOf: unknown[] }).anyOf, { type: 'null' }] };
      }
      return { anyOf: [inner, { type: 'null' }] };
    }

    case 'default': {
      const d = schema as unknown as { _def: { innerType: z.ZodType; defaultValue: unknown } };
      const inner = zodToOpenApi(d._def.innerType);
      return { ...inner, default: d._def.defaultValue };
    }

    case 'catch': {
      const c = schema as unknown as { _def: { innerType: z.ZodType } };
      return zodToOpenApi(c._def.innerType);
    }

    case 'transform':
    case 'pipe': {
      // For transform/pipe, try to use the input schema
      const p = schema as unknown as { _def: { in?: z.ZodType; out?: z.ZodType } };
      if (p._def?.in) return zodToOpenApi(p._def.in);
      if (p._def?.out) return zodToOpenApi(p._def.out);
      return {};
    }

    case 'lazy':
      return {};

    case 'any':
    case 'unknown':
    case 'never':
      return {};

    case 'void':
      return {};

    case 'map':
    case 'set':
    case 'promise':
      // Non-JSON serializable types
      return {};

    default: {
      // Fallback: try to extract useful info from the def
      if (def.innerType) {
        return zodToOpenApi(def.innerType as z.ZodType);
      }
      return {};
    }
  }
}
