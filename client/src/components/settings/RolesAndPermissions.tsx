import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  Save,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Crown,
  User,
  ChevronDown,
} from "lucide-react";
import { RESERVED_ADMIN_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '@shared/schema';
import {
  getPermissionGroups,
  PERMISSION_GROUP_KEYS,
} from './permissionCatalog';
import { PermissionEditorPanel } from './PermissionEditorPanel';
import { cn } from '@/lib/utils';

interface RolePermission {
  id: number;
  companyId: number;
  role: 'admin' | 'agent';
  permissions: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

interface CustomRole {
  id: number;
  companyId: number;
  name: string;
  description: string | null;
  permissions: Record<string, boolean>;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

type EditingTarget =
  | { kind: 'builtin'; role: 'admin' | 'agent' }
  | { kind: 'custom'; role: CustomRole };

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

const CUSTOM_AVATAR_COLORS = [
  'bg-violet-500/20 text-violet-400',
  'bg-orange-500/20 text-orange-400',
  'bg-cyan-500/20 text-cyan-400',
  'bg-pink-500/20 text-pink-400',
  'bg-teal-500/20 text-teal-400',
  'bg-indigo-500/20 text-indigo-400',
];

export function RolesAndPermissions() {
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [editingTarget, setEditingTarget] = useState<EditingTarget | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<Record<string, boolean>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [metaRole, setMetaRole] = useState<CustomRole | null>(null);
  const [metaName, setMetaName] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [expandedCustomRoles, setExpandedCustomRoles] = useState<Record<number, boolean>>({});
  const [expandedBuiltinRoles, setExpandedBuiltinRoles] = useState<Record<'admin' | 'agent', boolean>>({
    admin: false,
    agent: false,
  });
  const { toast } = useToast();
  const { t } = useTranslation();

  const permissionGroups = getPermissionGroups(t);
  const groupEntries = PERMISSION_GROUP_KEYS.map(key => [key, permissionGroups[key]] as const);

  const { data: rolePermissions = [], isLoading, refetch } = useQuery<RolePermission[]>({
    queryKey: ['/api/role-permissions'],
    refetchOnWindowFocus: false
  });

  const {
    data: customRoles = [],
    isLoading: customRolesLoading,
    refetch: refetchCustomRoles,
  } = useQuery<CustomRole[]>({
    queryKey: ['/api/custom-roles'],
    refetchOnWindowFocus: false,
  });

  const invalidateRoleQueries = () => {
    refetch();
    refetchCustomRoles();
    queryClient.invalidateQueries({ queryKey: ['userPermissions'] });
    queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });
    queryClient.invalidateQueries({ queryKey: ['/api/custom-roles'] });
  };

  const updateRolePermissionsMutation = useMutation({
    mutationFn: async (data: { role: 'admin' | 'agent'; permissions: Record<string, boolean> }) => {
      const res = await apiRequest('PUT', `/api/role-permissions/${data.role}`, {
        permissions: data.permissions
      });
      return await res.json();
    },
    onSuccess: (_, variables) => {
      toast({
        title: t('roles.permissions_updated', 'Permissions Updated'),
        description: variables.role === 'admin'
          ? t('roles.admin_permissions_updated', 'Administrator role defaults have been updated successfully.')
          : t('roles.agent_permissions_updated', 'Agent role defaults have been updated successfully.'),
      });
      setShowEditRoleModal(false);
      invalidateRoleQueries();
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: t('roles.update_failed', 'Failed to update permissions: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const createCustomRoleMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string | null }) => {
      const res = await apiRequest('POST', '/api/custom-roles', data);
      return await res.json();
    },
    onSuccess: (created: CustomRole) => {
      toast({
        title: t('roles.custom_created', 'Custom Role Created'),
        description: t(
          'roles.custom_created_desc',
          '{{name}} was created with Agent permission defaults. You can edit permissions next.',
          { name: created.name }
        ),
      });
      setShowCreateModal(false);
      setCreateName('');
      setCreateDescription('');
      invalidateRoleQueries();
      handleEditCustomRole(created);
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: t('roles.custom_create_failed', 'Failed to create custom role: {{error}}', {
          error: error.message,
        }),
        variant: 'destructive',
      });
    },
  });

  const updateCustomRoleMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      name?: string;
      description?: string | null;
      permissions?: Record<string, boolean>;
    }) => {
      const { id, ...body } = data;
      const res = await apiRequest('PUT', `/api/custom-roles/${id}`, body);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('roles.custom_updated', 'Custom Role Updated'),
        description: t('roles.custom_updated_desc', 'Custom role has been updated successfully.'),
      });
      setShowEditRoleModal(false);
      setShowMetaModal(false);
      setMetaRole(null);
      invalidateRoleQueries();
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: t('roles.custom_update_failed', 'Failed to update custom role: {{error}}', {
          error: error.message,
        }),
        variant: 'destructive',
      });
    },
  });

  const deleteCustomRoleMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/custom-roles/${id}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('roles.custom_deleted', 'Custom Role Deleted'),
        description: t('roles.custom_deleted_desc', 'The custom role has been removed.'),
      });
      invalidateRoleQueries();
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const getRoleData = (role: 'admin' | 'agent') => {
    return rolePermissions.find(rp => rp.role === role);
  };

  const getDisplayedAdminPermissions = (): Record<string, boolean> => {
    const adminData = getRoleData('admin');
    const base = adminData?.permissions ?? {};
    const enforced = Object.fromEntries(
      RESERVED_ADMIN_PERMISSIONS.map(permission => [permission, true])
    );
    return { ...base, ...enforced };
  };

  const isAdminGroupEnforced = (groupKey: string) => groupKey === 'team' || groupKey === 'settings';

  const handleEditRole = (role: 'admin' | 'agent') => {
    const roleData = rolePermissions.find(rp => rp.role === role);
    let permissions = { ...(roleData?.permissions ?? {}) };
    if (role === 'admin') {
      for (const permission of RESERVED_ADMIN_PERMISSIONS) {
        permissions[permission] = true;
      }
    }
    setEditingTarget({ kind: 'builtin', role });
    setEditingPermissions(permissions);
    setShowEditRoleModal(true);
  };

  const handleEditCustomRole = (role: CustomRole) => {
    setEditingTarget({ kind: 'custom', role });
    setEditingPermissions({
      ...DEFAULT_ROLE_PERMISSIONS.agent,
      ...(role.permissions ?? {}),
    });
    setShowEditRoleModal(true);
  };

  const handleOpenMeta = (role: CustomRole) => {
    setMetaRole(role);
    setMetaName(role.name);
    setMetaDescription(role.description ?? '');
    setShowMetaModal(true);
  };

  const handleSavePermissions = () => {
    if (!editingTarget) return;

    if (editingTarget.kind === 'builtin') {
      let permissions = editingPermissions;
      if (editingTarget.role === 'admin') {
        permissions = { ...editingPermissions };
        for (const permission of RESERVED_ADMIN_PERMISSIONS) {
          permissions[permission] = true;
        }
      }
      updateRolePermissionsMutation.mutate({
        role: editingTarget.role,
        permissions,
      });
      return;
    }

    updateCustomRoleMutation.mutate({
      id: editingTarget.role.id,
      permissions: editingPermissions,
    });
  };

  const togglePermission = (permission: string, value: boolean) => {
    if (
      editingTarget?.kind === 'builtin' &&
      editingTarget.role === 'admin' &&
      !value &&
      (RESERVED_ADMIN_PERMISSIONS as readonly string[]).includes(permission)
    ) {
      return;
    }
    setEditingPermissions(prev => ({
      ...prev,
      [permission]: value
    }));
  };

  const renderPermissionSummary = (
    permissions: Record<string, boolean>,
    keyPrefix: string,
    options?: { enforceAdminGroups?: boolean }
  ) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {groupEntries.map(([groupKey, group]) => {
        const hasAnyPermission =
          (options?.enforceAdminGroups && isAdminGroupEnforced(groupKey)) ||
          Object.keys(group.permissions).some((permission) => permissions[permission]);
        return (
          <div
            key={`${keyPrefix}-${groupKey}`}
            className={cn(
              'flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm',
              hasAnyPermission
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
            )}
          >
            {hasAnyPermission ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 shrink-0" />
            )}
            <span className="leading-snug">
              {group.title}
              {options?.enforceAdminGroups && isAdminGroupEnforced(groupKey) && (
                <span className="ml-1 text-xs opacity-80">
                  {t('roles.enforced', '(enforced)')}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (isLoading || customRolesLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const savingPermissions =
    updateRolePermissionsMutation.isPending || updateCustomRoleMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-foreground">
          {t('roles.roles_permissions', 'Roles & Permissions')}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            'roles.role_defaults_inherited_only',
            'Role defaults apply to members who inherit permissions from their role. Members with customized permissions keep their fixed snapshot and will not receive future role-default updates.'
          )}
        </p>
      </div>

      <div className="space-y-4">
        <Card className="overflow-hidden border-border bg-card/40">
          <CardHeader className={cn('pb-4', !expandedBuiltinRoles.admin && 'pb-5')}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold text-foreground">
                      {t('roles.administrator', 'Administrator')}
                    </h4>
                    <Badge variant="secondary" className="font-normal text-xs bg-muted text-muted-foreground border-0">
                      {t('roles.default_role', 'Default Role')}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t(
                      'roles.administrator_desc',
                      'Full access to all features and settings. Team and settings access is always enforced for admin-role members regardless of role-default toggles.'
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button data-tour="components-settings-rolesandpermissions.button.roles.edit_permissions" variant="outline" onClick={() => handleEditRole('admin')}>
                  {t('roles.edit_permissions', 'Edit Permissions')}
                </Button>
                <Button data-tour="components-settings-rolesandpermissions.button.roles.collapse_permissions"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setExpandedBuiltinRoles((prev) => ({
                      ...prev,
                      admin: !prev.admin,
                    }))
                  }
                  aria-label={
                    expandedBuiltinRoles.admin
                      ? t('roles.collapse_permissions', 'Collapse permissions')
                      : t('roles.expand_permissions', 'Expand permissions')
                  }
                >
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform',
                      !expandedBuiltinRoles.admin && '-rotate-90'
                    )}
                  />
                </Button>
              </div>
            </div>
          </CardHeader>
          {expandedBuiltinRoles.admin && (
            <CardContent>
              {renderPermissionSummary(getDisplayedAdminPermissions(), 'admin', {
                enforceAdminGroups: true,
              })}
            </CardContent>
          )}
        </Card>

        <Card className="overflow-hidden border-border bg-card/40">
          <CardHeader className={cn('pb-4', !expandedBuiltinRoles.agent && 'pb-5')}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-11 w-11 rounded-full bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base font-semibold text-foreground">
                      {t('roles.agent', 'Agent')}
                    </h4>
                    <Badge variant="secondary" className="font-normal text-xs bg-muted text-muted-foreground border-0">
                      {t('roles.default_role', 'Default Role')}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t(
                      'roles.agent_desc',
                      'Limited access to core features. Changes here affect inherited agent members only.'
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button data-tour="components-settings-rolesandpermissions.button.roles.edit_permissions" variant="outline" onClick={() => handleEditRole('agent')}>
                  {t('roles.edit_permissions', 'Edit Permissions')}
                </Button>
                <Button data-tour="components-settings-rolesandpermissions.button.roles.collapse_permissions"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() =>
                    setExpandedBuiltinRoles((prev) => ({
                      ...prev,
                      agent: !prev.agent,
                    }))
                  }
                  aria-label={
                    expandedBuiltinRoles.agent
                      ? t('roles.collapse_permissions', 'Collapse permissions')
                      : t('roles.expand_permissions', 'Expand permissions')
                  }
                >
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 transition-transform',
                      !expandedBuiltinRoles.agent && '-rotate-90'
                    )}
                  />
                </Button>
              </div>
            </div>
          </CardHeader>
          {expandedBuiltinRoles.agent && (
            <CardContent>
              {renderPermissionSummary(getRoleData('agent')?.permissions ?? {}, 'agent')}
            </CardContent>
          )}
        </Card>
      </div>

      <div className="flex justify-center py-2">
        <Button data-tour="components-settings-rolesandpermissions.button.roles.create_custom_role"
          variant="outline"
          className="border-dashed px-6"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('roles.create_custom_role', 'Create Custom Role')}
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <h4 className="text-base font-semibold text-foreground">
            {t('roles.custom_roles', 'Custom roles')}
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              'roles.custom_roles_desc',
              'Create reusable permission defaults (for example Supervisor or Billing). Members on custom roles are agent-tier for privileged admin gates.'
            )}
          </p>
        </div>

        {customRoles.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            {t(
              'roles.custom_roles_empty',
              'No custom roles yet. Create one to assign it when adding or editing team members.'
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {customRoles.map((role, index) => {
              const expanded = !!expandedCustomRoles[role.id];
              return (
                <Card key={role.id} className="overflow-hidden border-border bg-card/40">
                  <CardHeader className={cn('pb-4', !expanded && 'pb-5')}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={cn(
                            'h-11 w-11 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold',
                            CUSTOM_AVATAR_COLORS[index % CUSTOM_AVATAR_COLORS.length]
                          )}
                        >
                          {getInitials(role.name)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-base font-semibold text-foreground truncate">
                            {role.name}
                          </h4>
                          {role.description ? (
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                              {role.description}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground mt-1">
                            {t(
                              'roles.custom_role_members',
                              '{{count}} member(s) assigned',
                              { count: role.memberCount }
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button data-tour="components-settings-rolesandpermissions.button.roles.edit_details" variant="outline" size="sm" onClick={() => handleOpenMeta(role)}>
                          <Pencil className="mr-2 h-3.5 w-3.5" />
                          {t('roles.edit_details', 'Edit details')}
                        </Button>
                        <Button data-tour="components-settings-rolesandpermissions.button.roles.edit_permissions" variant="outline" size="sm" onClick={() => handleEditCustomRole(role)}>
                          {t('roles.edit_permissions', 'Edit Permissions')}
                        </Button>
                        <Button data-tour="components-settings-rolesandpermissions.button.roles.custom_delete_blocked"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={role.memberCount > 0 || deleteCustomRoleMutation.isPending}
                          title={
                            role.memberCount > 0
                              ? t(
                                  'roles.custom_delete_blocked',
                                  'Reassign {{count}} member(s) before deleting this role.',
                                  { count: role.memberCount }
                                )
                              : t('common.delete', 'Delete')
                          }
                          onClick={() => deleteCustomRoleMutation.mutate(role.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button data-tour="components-settings-rolesandpermissions.button.roles.collapse_permissions"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() =>
                            setExpandedCustomRoles((prev) => ({
                              ...prev,
                              [role.id]: !prev[role.id],
                            }))
                          }
                          aria-label={
                            expanded
                              ? t('roles.collapse_permissions', 'Collapse permissions')
                              : t('roles.expand_permissions', 'Expand permissions')
                          }
                        >
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 transition-transform',
                              !expanded && '-rotate-90'
                            )}
                          />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {expanded && (
                    <CardContent>
                      {renderPermissionSummary(
                        { ...DEFAULT_ROLE_PERMISSIONS.agent, ...(role.permissions ?? {}) },
                        `custom-${role.id}`
                      )}
                      {role.memberCount > 0 && (
                        <p className="text-xs text-muted-foreground mt-3">
                          {t(
                            'roles.custom_delete_blocked',
                            'Reassign {{count}} member(s) before deleting this role.',
                            { count: role.memberCount }
                          )}
                        </p>
                      )}
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showEditRoleModal} onOpenChange={setShowEditRoleModal}>
        <DialogContent data-tour="components-settings-rolesandpermissions.dialogcontent.roles.edit_custom_permissions" className="sm:max-w-[900px] lg:max-w-[1000px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTarget?.kind === 'custom'
                ? t('roles.edit_custom_permissions', 'Edit {{name}} Permissions', {
                    name: editingTarget.role.name,
                  })
                : editingTarget?.role === 'admin'
                  ? t('roles.edit_admin_permissions', 'Edit Administrator Permissions')
                  : t('roles.edit_agent_permissions', 'Edit Agent Permissions')}
            </DialogTitle>
            <DialogDescription>
              {editingTarget?.kind === 'custom'
                ? t(
                    'roles.configure_custom_permissions',
                    'Configure default permissions for this custom role. Changes apply only to members who inherit role permissions.'
                  )
                : editingTarget?.role === 'admin'
                  ? t(
                      'roles.configure_admin_permissions',
                      'Configure default permissions for the Administrator role. Changes apply only to members who inherit role permissions. Team and settings access remains enforced for all admin-role members.'
                    )
                  : t(
                      'roles.configure_agent_permissions',
                      'Configure default permissions for the Agent role. Changes apply only to members who inherit role permissions, not those with customized permission snapshots.'
                    )}
            </DialogDescription>
          </DialogHeader>

          {editingTarget?.kind === 'builtin' && editingTarget.role === 'admin' && (
            <p className="text-xs text-muted-foreground">
              {t(
                'roles.reserved_admin_note',
                'The following capabilities are always granted to admin-role members and cannot be permanently revoked: {{permissions}}',
                { permissions: RESERVED_ADMIN_PERMISSIONS.join(', ') }
              )}
            </p>
          )}

          <div className="py-4">
            <PermissionEditorPanel
              permissions={editingPermissions}
              onToggle={togglePermission}
              idPrefix="edit-role"
              enforcedPermissions={
                editingTarget?.kind === 'builtin' && editingTarget.role === 'admin'
                  ? RESERVED_ADMIN_PERMISSIONS
                  : undefined
              }
            />
          </div>

          <DialogFooter className="mt-6">
            <Button data-tour="components-settings-rolesandpermissions.button.common.cancel" variant="outline" onClick={() => setShowEditRoleModal(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-rolesandpermissions.button.roles.save_permissions"
              onClick={handleSavePermissions}
              disabled={savingPermissions}
              className="btn-brand-primary"
            >
              {savingPermissions && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Save className="mr-2 h-4 w-4" />
              {t('roles.save_permissions', 'Save Permissions')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent data-tour="components-settings-rolesandpermissions.dialogcontent.roles.create_custom_role" className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('roles.create_custom_role', 'Create Custom Role')}</DialogTitle>
            <DialogDescription>
              {t(
                'roles.create_custom_role_desc',
                'Permissions start from your current Agent role defaults. You can adjust them after creating the role.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="custom-role-name">{t('roles.custom_role_name', 'Name')}</Label>
              <Input data-tour="components-settings-rolesandpermissions.input.roles.custom_role_name_placeholder"
                id="custom-role-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder={t('roles.custom_role_name_placeholder', 'Supervisor')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-role-description">
                {t('roles.custom_role_description', 'Description (optional)')}
              </Label>
              <Textarea data-tour="components-settings-rolesandpermissions.textarea.roles.custom_role_description_placeholder"
                id="custom-role-description"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
                placeholder={t(
                  'roles.custom_role_description_placeholder',
                  'Short note about who this role is for'
                )}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="components-settings-rolesandpermissions.button.common.cancel" variant="outline" onClick={() => setShowCreateModal(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-rolesandpermissions.button.roles.create_custom_role"
              className="btn-brand-primary"
              disabled={!createName.trim() || createCustomRoleMutation.isPending}
              onClick={() =>
                createCustomRoleMutation.mutate({
                  name: createName.trim(),
                  description: createDescription.trim() || null,
                })
              }
            >
              {createCustomRoleMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('roles.create_custom_role', 'Create Custom Role')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMetaModal} onOpenChange={setShowMetaModal}>
        <DialogContent data-tour="components-settings-rolesandpermissions.dialogcontent.roles.edit_details" className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t('roles.edit_details', 'Edit details')}</DialogTitle>
            <DialogDescription>
              {t('roles.edit_details_desc', 'Update the name and description for this custom role.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="meta-role-name">{t('roles.custom_role_name', 'Name')}</Label>
              <Input data-tour="components-settings-rolesandpermissions.input.meta-role-name"
                id="meta-role-name"
                value={metaName}
                onChange={(e) => setMetaName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-role-description">
                {t('roles.custom_role_description', 'Description (optional)')}
              </Label>
              <Textarea data-tour="components-settings-rolesandpermissions.textarea.meta-role-description"
                id="meta-role-description"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="components-settings-rolesandpermissions.button.common.cancel" variant="outline" onClick={() => setShowMetaModal(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-rolesandpermissions.button.common.save"
              className="btn-brand-primary"
              disabled={!metaRole || !metaName.trim() || updateCustomRoleMutation.isPending}
              onClick={() => {
                if (!metaRole) return;
                updateCustomRoleMutation.mutate({
                  id: metaRole.id,
                  name: metaName.trim(),
                  description: metaDescription.trim() || null,
                });
              }}
            >
              {updateCustomRoleMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
