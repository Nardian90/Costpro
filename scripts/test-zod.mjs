import { z } from 'zod';

const sendSchema = z.object({
  store_id: z.string().uuid(),
  phone_number: z.string().min(5),
  message: z.string().min(1).max(4096),
  contact_id: z.string().uuid().optional(),
});

// Use real UUIDs v4
const body = {
  store_id: 'a1111111-1111-4111-8111-111111111111',
  phone_number: '5312345678',
  message: 'hola',
  contact_id: '99999999-9999-4999-9999-999999999999'
};

const result = sendSchema.safeParse(body);
console.log('success:', result.success);
if (!result.success) {
  console.log('errors:', JSON.stringify(result.error.format(), null, 2));
}
