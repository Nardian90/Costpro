import { profileSchema, transactionSchema } from './src/validation/schemas';

const invalidProfile = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  full_name: '',
  email: 'invalid-email',
  memberships: 'not-an-array'
};

const profileResult = profileSchema.safeParse(invalidProfile);
if (!profileResult.success) {
  console.log('Profile Error:', JSON.stringify(profileResult.error.format(), null, 2));
} else {
  console.log('Profile Success');
}

const emptyTransaction = {
  id: '550e8400-e29b-41d4-a716-446655440001'
};
const transResult = transactionSchema.safeParse(emptyTransaction);
if (!transResult.success) {
  console.log('Transaction Error:', JSON.stringify(transResult.error.format(), null, 2));
} else {
  console.log('Transaction Success');
}
