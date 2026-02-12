import sys

filepath = 'src/hooks/api/useUsers.ts'
with open(filepath, 'r') as f:
    content = f.read()

search_text = """    mutationFn: async ({ id, ...rawUpdates }: { id: string } & Partial<z.input<typeof profileSchema>>) => {
      // Validate partial profile updates
      const updates = profileSchema.partial().parse(rawUpdates);

      // Omit virtual/related fields before update to prevent "column not found" errors
      const { memberships, ...cleanUpdates } = updates as any;

      return await withTableLogging('update', 'profiles', () => supabase
        .from('profiles')
        .update(cleanUpdates)
        .eq('id', id));
    },"""

replace_text = """    mutationFn: async ({ id, ...rawUpdates }: { id: string } & Partial<z.input<typeof profileSchema>>) => {
      // Validate partial profile updates - this also converts "" to null for UUIDs via resilientUuid
      const updates = profileSchema.partial().parse(rawUpdates);

      // Omit virtual/related fields and sanitize payload
      const cleanUpdates: any = {};
      Object.entries(updates).forEach(([key, val]) => {
        // Skip virtual fields that don't exist in the 'profiles' table
        if (['memberships', 'roles'].includes(key)) return;

        // Hardening: Ensure empty strings are treated as null for UUID compatibility
        // and to avoid 22P02 errors in PostgREST
        if (val === '') {
          cleanUpdates[key] = null;
        } else {
          cleanUpdates[key] = val;
        }
      });

      return await withTableLogging('update', 'profiles', () => supabase
        .from('profiles')
        .update(cleanUpdates)
        .eq('id', id));
    },"""

new_content = content.replace(search_text, replace_text)
with open(filepath, 'w') as f:
    f.write(new_content)
