import sys

filepath = 'src/app/api/users/toggle-status/route.ts'
with open(filepath, 'r') as f:
    content = f.read()

search_text = """    // Verify Admin/Encargado role
    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', session.user.id)
      .single();

    if (!requesterProfile || !requesterProfile.roles) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const requesterRole = (requesterProfile.roles as any).name;
    if (requesterRole !== 'Admin' && requesterRole !== 'Encargado') {
      return NextResponse.json({ error: 'No tienes permisos' }, { status: 403 });
    }"""

replace_text = """    // Verify Admin/Encargado role
    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', session.user.id)
      .single();

    if (!requesterProfile) {
      return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
    }

    // Robust role check (supports object, array, and direct role column)
    const rawRoles = requesterProfile.roles;
    const roleNames: string[] = [];

    // Add roles from joined table
    if (Array.isArray(rawRoles)) {
      rawRoles.forEach(r => { if (r.name) roleNames.push(r.name.toLowerCase()); });
    } else if (rawRoles && typeof rawRoles === 'object' && (rawRoles as any).name) {
      roleNames.push((rawRoles as any).name.toLowerCase());
    }

    // Add role from text column as fallback
    if (requesterProfile.role) {
      roleNames.push(requesterProfile.role.toLowerCase());
    }

    const hasPermission = roleNames.some(name =>
      name === 'admin' ||
      name === 'encargado' ||
      name === 'superadmin' ||
      name === 'manager'
    );

    if (!hasPermission) {
      return NextResponse.json({
        error: 'No tienes permisos suficientes',
        debug_roles: roleNames
      }, { status: 403 });
    }"""

new_content = content.replace(search_text, replace_text)
with open(filepath, 'w') as f:
    f.write(new_content)
