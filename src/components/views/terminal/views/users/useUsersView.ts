
'use client'

import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store';
import { useUsersAdmin, useCreateUser, useUpdateUser, useManageUserMemberships } from '@/hooks/api/useUsers';
import { useStores } from '@/hooks/api/useStores';
import { UserFormData } from './UserForm';
import { toast } from 'sonner';
import { UserContract, mapProfileToContract, UserContractFactory } from '@/contracts/user';
import { Profile, UserRole } from '@/types';
import { getAllowedRoles, isAdminLevel } from '@/lib/roles';
import { supabase } from '@/lib/supabaseClient';

export function useUsersView() {
    const { user } = useAuthStore();
    const [searchTerm, setSearchTerm] = useState('');
    // MISIÓN ORGANIZACIONES (2026-10-26): filtros de empresa/rol/estado
    // (misión FASE 2 §2: búsqueda, empresa — «Todas» solo SuperAdmin —,
    // «Sin asignar», rol y estado con conteos coherentes).
    const [orgFilter, setOrgFilter] = useState<string>('all');
    const [roleFilter, setRoleFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    // F1-T02: queryClient para invalidar cache tras toggle/delete (en lugar de window.location.reload)
    const queryClient = useQueryClient();

    // Modal/Form State
    const [userFormMode, setUserFormMode] = useState<'create' | 'edit' | null>(null);
    const [selectedUserContract, setSelectedUserContract] = useState<UserContract | null>(null);

    // MISIÓN ORGANIZACIONES: objetivo del modal de asignación de empresa.
    const [assignTarget, setAssignTarget] = useState<Profile | null>(null);

    const isSuperAdmin = user?.role === 'superadmin';
    const isManager = user?.role === 'admin' || isSuperAdmin;

    // REMEDIACIÓN (fix/users-multistore-admin-password): modal de seteo directo
    // de contraseña por Super Admin. Solo se guarda el usuario objetivo
    // (identificación) — la contraseña vive únicamente en el estado local del
    // modal y viaja por POST al endpoint server-side.
    const [setPasswordTarget, setSetPasswordTarget] = useState<Profile | null>(null);

    // Data Fetching
    const isEncargado = user?.role === 'encargado' || user?.role === 'manager' || user?.memberships?.some(m => m.role === 'encargado');

    // CP-ORG-001: búsqueda con debounce (300 ms) para no disparar una
    // consulta por tecla, y filtros APLICADOS EN SERVIDOR vía useUsersAdmin
    // (los usuarios más allá de los primeros «limit» ya no son invisibles:
    // search/rol/estado/empresa se resuelven en la base, no en el cliente).
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const {
        data: usersPage,
        isLoading: isLoadingUsers,
        isError: isUsersError,
        error: usersError,
        refetch: refetchUsers,
    } = useUsersAdmin(user?.id || '', {
        search: debouncedSearch || undefined,
        role: roleFilter,
        is_active: statusFilter,
        // 'unassigned' y empresa concreta solo son seleccionables por
        // SuperAdmin; la API ya acota el alcance de un admin ordinario.
        unassigned: orgFilter === 'unassigned' && isSuperAdmin,
        tenant_id: orgFilter !== 'all' && orgFilter !== 'unassigned' ? orgFilter : undefined,
    }, { enabled: !!user?.id });

    const usersData = useMemo(() => usersPage?.users ?? [], [usersPage]);
    const usersTotal = usersPage?.total ?? 0;
    const shownCount = usersData.length;
    const { data: stores = [] } = useStores(
        user?.id || '',
        user?.role === 'admin' || isSuperAdmin,
        isEncargado || false
    );

    // Catálogo de empresas para el filtro, derivado de los datos cargados
    // (nombres reales, sin tenant_id crudo en pantalla). La API ya acota el
    // alcance (superadmin = todas, admin = la suya). «Todas las empresas» y
    // «Sin asignar» solo se ofrecen al SuperAdmin.
    const orgOptions: Array<{ id: string; name: string }> = Object.values(
        usersData.reduce<Record<string, { id: string; name: string }>>((acc, u) => {
            if (u.tenant_id && u.tenant_name && !acc[u.tenant_id]) {
                acc[u.tenant_id] = { id: u.tenant_id, name: u.tenant_name };
            }
            return acc;
        }, {})
    ).sort((a, b) => a.name.localeCompare(b.name));

    // Filtros de REFUERZO en cliente (idempotentes con los del servidor):
    // el término de búsqueda se re-aplica como literal fallback defensivo y el
    // guard RBAC oculta admins de encargados (la API añade su propio alcance).
    const filteredUsers = usersData
        .filter(u => !debouncedSearch || (u.full_name || '').toLowerCase().includes(debouncedSearch.toLowerCase())
            || (u.email || '').toLowerCase().includes(debouncedSearch.toLowerCase()))
        .filter(u => {
            // RBAC Guard: Only admins can see other admins.
            // CP-ORG-001 ciclo 4: superadmin también (gestiona cuentas de plataforma).
            if (isManager || isSuperAdmin) return true;
            // CP-ORG-001 ciclo 5: las cuentas de plataforma (superadmin) quedan
            // ocultas igual que las admin para visores no privilegiados.
            return u.role !== 'admin' && u.role !== 'superadmin';
        });

    const canCreateMoreUsers = user?.role === 'admin' || isSuperAdmin ||
      (typeof user?.maxUsersLimit === 'number' && user.maxUsersLimit > 0
        ? usersTotal < user.maxUsersLimit
        : true);

    const limitReachedMessage = !canCreateMoreUsers && !isAdminLevel(user?.role)
      ? `Has alcanzado el límite de usuarios (${user?.maxUsersLimit}). Contacta a un administrador para aumentar tu capacidad.`
      : undefined;

    // Mutations
    const createUserMutation = useCreateUser();
    // COSTPRO 4: en el flujo de EDICIÓN las dos mutaciones son silenciosas y el
    // resultado combinado emite UN solo toast (ver handleUserFormSubmit).
    const updateUserMutation = useUpdateUser({ silentSuccess: true });
    const manageMembershipsMutation = useManageUserMemberships({ silentSuccess: true });

    // COSTPRO 4 (fix/usuarios-en-desarrollo-admin) — REGLA DE ORO: una operación,
    // un mensaje. El éxito/fracaso real lo emite la mutación correspondiente
    // (useCreateUser: verde/rojo únicos). Este handler NUNCA re-emite: el
    // catch anterior añadía un segundo/tercer toast rojo sobre el ya mostrado
    // por el hook («Error al crear usuario: Error al crear usuario: …»), que es
    // exactamente la secuencia contradictoria reportada.
    const handleUserFormSubmit = async (mode: 'create' | 'edit' | null, data: UserFormData, selectedUserContractId?: string): Promise<boolean> => {
        if (!user) return false;
        try {
          if (mode === 'create') {
            // Creación = UNA operación atómica server-side (auth + perfil +
            // memberships + auditoría en /api/users/managed-create). Si una
            // operación secundaria posterior fallara, la mutación ya avisó y el
            // usuario quedó creado — aquí no se repite ni se reenvía.
            await createUserMutation.mutateAsync({
              p_email: data.email,
              p_full_name: data.fullName,
              p_role: data.role,
              p_plan: data.plan || 'free',
              p_store_id: data.memberships?.[0]?.store_id || (data.role !== 'costo' ? user.activeStoreId : null),
              p_memberships: data.memberships,
              p_max_stores: data.role === 'encargado' ? data.maxStoresLimit : 0,
              p_max_users: data.role === 'encargado' ? data.maxUsersLimit : 0,
              p_password: data.password || undefined
            });
          } else if (mode === 'edit' && selectedUserContractId) {
            // First update memberships to ensure references exist for active_store_id validation
            await manageMembershipsMutation.mutateAsync({
              userId: selectedUserContractId,
              memberships: data.memberships
            });

            // CP-ORG-001: el rol de la cuenta objetivo es el REAL del contrato
            // (mapProfileToContract), no el que muestra el formulario. Si la
            // cuenta es de plataforma (superadmin/tenant_admin), el payload NO
            // incluye «role»: el servidor conserva el rol real y la guardas de
            // 20261026130000 lo verifican. Antes se enviaba el rol degradado
            // del formulario (downgrade silencioso de la cuenta de plataforma).
            const targetIsPlatform = selectedUserContract?.role === 'superadmin' || selectedUserContract?.role === 'tenant_admin';

            await updateUserMutation.mutateAsync({
              id: selectedUserContractId,
              full_name: data.fullName,
              ...(targetIsPlatform ? {} : { role: data.role }),
              is_active: data.isActive,
              plan: data.plan || 'free',
              max_stores_limit: data.role === 'encargado' ? data.maxStoresLimit : 0,
              max_users_limit: data.role === 'encargado' ? data.maxUsersLimit : 0
            });
            // ÚNICO verde de la edición (ambas mutaciones son silentSuccess).
            toast.success('Usuario actualizado correctamente');
          }
          setUserFormMode(null);
          setSelectedUserContract(null);
          return true;
        } catch (error: unknown) {
          // La mutación que falló ya mostró UN toast rojo con la causa real.
          // Solo registramos en consola para diagnóstico (sin PII).
          console.error('[useUsersView] Error submitting form:', error);
          return false;
        }
    };

    const handleEditUser = (u: Profile) => {
        setSelectedUserContract(mapProfileToContract(u));
        setUserFormMode('edit');
    };

    const handleCreateUser = () => {
        setSelectedUserContract(UserContractFactory.createEmpty());
        setUserFormMode('create');
    };

    const handleCloseModal = () => {
        setUserFormMode(null);
        setSelectedUserContract(null);
    }

    const handleToggleUserStatus = async (userId: string, isActive: boolean) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                throw new Error('No hay sesión activa.');
            }

            const response = await fetch('/api/users/toggle-status', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ user_id: userId, is_active: isActive })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al cambiar estado');
            }

            toast.success(isActive ? 'Usuario activado' : 'Usuario desactivado');
            // F1-T02: invalidar cache de React Query en lugar de window.location.reload().
            // Esto preserva el estado de la UI (formularios abiertos, scroll, filtros) y
            // es consistente con el patrón que usan handleUserFormSubmit y handleUpdatePlan.
            await queryClient.invalidateQueries({ queryKey: ['users'] });
            await queryClient.invalidateQueries({ queryKey: ['user-store-access'] });
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('¿Estás seguro de que deseas eliminar este usuario? Esta acción es irreversible y solo se permitirá si el usuario no tiene registros operativos.')) {
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                throw new Error('No hay sesión activa.');
            }

            const response = await fetch('/api/users/delete', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ user_id: userId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al eliminar usuario');
            }

            toast.success('Usuario eliminado correctamente');
            // F1-T02: invalidar cache de React Query en lugar de window.location.reload().
            await queryClient.invalidateQueries({ queryKey: ['users'] });
            await queryClient.invalidateQueries({ queryKey: ['user-store-access'] });
            await queryClient.invalidateQueries({ queryKey: ['memberships'] });
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    // REMEDIACIÓN (fix/users-multistore-admin-password): abrir el modal de
    // cambio administrativo de contraseña para un usuario concreto.
    const openSetPassword = (u: Profile) => {
        setSetPasswordTarget(u);
    };

    const closeSetPassword = () => {
        setSetPasswordTarget(null);
    };

    // Seteo directo: el Super Admin entrega una contraseña nueva. El POST va
    // al endpoint server-side (/api/users/reset-password, withRole('admin'))
    // que ejecuta auth.admin.updateUserById con service_role. La contraseña
    // jamás se persiste aquí, ni se loguea, ni se incluye en la auditoría.
    const submitSetPassword = async (userId: string, newPassword: string): Promise<boolean> => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                throw new Error('No hay sesión activa.');
            }

            const response = await fetch('/api/users/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ user_id: userId, new_password: newPassword })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al actualizar la contraseña');
            }

            toast.success(data.message || 'Contraseña actualizada correctamente');
            // La auditoría (user_audit_log) cambia: refrescar el historial del usuario.
            await queryClient.invalidateQueries({ queryKey: ['user-audit-history', userId] });
            return true;
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : String(error));
            return false;
        }
    };

    const handleResetPassword = async (userId: string) => {
        if (!confirm('¿Estás seguro de que deseas reiniciar la contraseña de este usuario? Se enviará un correo de recuperación.')) {
            return;
        }

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;

            if (!token) {
                throw new Error('No hay sesión activa.');
            }

            const response = await fetch('/api/users/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ user_id: userId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al reiniciar contraseña');
            }

            toast.success(data.message || 'Correo de recuperación enviado');
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };


    const handleUpdatePlan = async (userId: string, plan: string) => {
        try {
            await updateUserMutation.mutateAsync({
                id: userId,
                plan: plan
            });
            toast.success(`Plan actualizado a ${plan.toUpperCase()}`);
        } catch (error: unknown) {
            toast.error((error instanceof Error ? error.message : String(error)) || 'Error al actualizar el plan');
        }
    };

    return {
        // State
        searchTerm,
        setSearchTerm,
        orgFilter,
        setOrgFilter,
        roleFilter,
        setRoleFilter,
        statusFilter,
        setStatusFilter,
        userFormMode,
        selectedUserContract,
        assignTarget,
        setAssignTarget,

        // Data
        user,
        users: filteredUsers,
        stores,
        orgOptions,
        isLoadingUsers,
        // CP-ORG-001: estados honestos de la consulta — el error es visible y
        // reintentable; el total real evita el «vacío fingido».
        isUsersError,
        usersErrorMessage: usersError instanceof Error ? usersError.message : (usersError ? String(usersError) : null),
        refetchUsers,
        usersTotal,
        shownCount,
        isAdmin: isManager,
        isSuperAdmin,
        canCreateMoreUsers,
        limitReachedMessage,

        // Mutations & handlers
        handleEditUser,
        handleCreateUser,
        handleCloseModal,
        handleUserFormSubmit,
        handleToggleUserStatus,
        handleDeleteUser,
        handleResetPassword,
        openSetPassword,
        closeSetPassword,
        submitSetPassword,
        setPasswordTarget,
        handleUpdatePlan,
        isSubmittingUser: createUserMutation.isPending || updateUserMutation.isPending || manageMembershipsMutation.isPending,
        allowedRoles: getAllowedRoles(user?.role as UserRole)
    };
}
