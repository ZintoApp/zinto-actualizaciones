import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocalizedPhoneInput } from "@/components/ui/localized-phone-input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { USER_PERMISSION_MODES, RESERVED_ADMIN_PERMISSIONS } from '@shared/schema';
import {
  getSelectedRoleDefaultPermissions,
  hasSeededPermissionSnapshot,
  normalizeCustomPermissionsSnapshot,
  parseRoleSelectionValue,
  roleSelectionFromMember,
  roleSelectionToValue,
  type RoleSelection,
} from './permissionCatalog';
import { PermissionEditorPanel } from './PermissionEditorPanel';

interface TeamMember {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
  customRoleId?: number | null;
  customRoleName?: string | null;
  whatsappNumber?: string;
  permissionMode?: 'inherit' | 'custom';
  customPermissions?: Record<string, boolean>;
  permissions?: Record<string, boolean>;
}

interface RolePermission {
  role: 'admin' | 'agent';
  permissions: Record<string, boolean>;
}

interface CustomRoleOption {
  id: number;
  name: string;
  permissions: Record<string, boolean>;
}

interface EditTeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  teamMember: TeamMember | null;
}

export function EditTeamMemberModal({ isOpen, onClose, onSuccess, teamMember }: EditTeamMemberModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [roleSelection, setRoleSelection] = useState<RoleSelection>({ kind: 'builtin', role: 'agent' });
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [permissionMode, setPermissionMode] = useState<'inherit' | 'custom'>(USER_PERMISSION_MODES.INHERIT);
  const [customPermissions, setCustomPermissions] = useState<Record<string, boolean>>({});
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data: rolePermissions = [] } = useQuery<RolePermission[]>({
    queryKey: ['/api/role-permissions'],
    enabled: isOpen,
    refetchOnWindowFocus: false,
  });

  const { data: customRoles = [] } = useQuery<CustomRoleOption[]>({
    queryKey: ['/api/custom-roles'],
    enabled: isOpen,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (teamMember && isOpen) {
      setFullName(teamMember.fullName);
      setEmail(teamMember.email);
      setPassword('');
      setShowPassword(false);
      setRoleSelection(roleSelectionFromMember(teamMember));
      setWhatsappNumber(teamMember.whatsappNumber ?? '');

      const mode = teamMember.permissionMode ?? USER_PERMISSION_MODES.INHERIT;
      setPermissionMode(mode);

      if (mode === USER_PERMISSION_MODES.CUSTOM) {
        setCustomPermissions(normalizeCustomPermissionsSnapshot(teamMember));
      } else {
        setCustomPermissions({});
      }
    }
  }, [teamMember, isOpen]);

  const handleRoleChange = (value: string) => {
    const parsed = parseRoleSelectionValue(value);
    if (!parsed) return;
    setRoleSelection(parsed);
    if (permissionMode === USER_PERMISSION_MODES.CUSTOM) {
      setCustomPermissions(
        getSelectedRoleDefaultPermissions(parsed, rolePermissions, customRoles)
      );
    }
  };

  const updateTeamMemberMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest('PATCH', `/api/team/members/${teamMember?.id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      const passwordUpdated = password.trim().length > 0;
      toast({
        title: t('settings.team.edit.success_title', 'Team Member Updated'),
        description: passwordUpdated
          ? t(
              'settings.team.edit.success_description_with_password',
              '{{name}} has been updated successfully (including password).',
              { name: fullName }
            )
          : t(
              'settings.team.edit.success_description',
              '{{name}} has been updated successfully.',
              { name: fullName }
            ),
      });

      setPassword('');
      setShowPassword(false);

      onClose();

      queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });
      queryClient.invalidateQueries({ queryKey: ['userPermissions'] });

      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: t(
          'settings.team.edit.error',
          'Failed to update team member: {{error}}',
          { error: error.message }
        ),
        variant: 'destructive',
      });
    },
  });

  const togglePermission = (permission: string, value: boolean) => {
    setCustomPermissions(prev => ({ ...prev, [permission]: value }));
  };

  const handlePermissionModeChange = (mode: 'inherit' | 'custom') => {
    setPermissionMode(mode);
    if (mode === USER_PERMISSION_MODES.CUSTOM) {
      const existingSnapshot = teamMember ? normalizeCustomPermissionsSnapshot(teamMember) : {};
      if (hasSeededPermissionSnapshot(existingSnapshot)) {
        setCustomPermissions(existingSnapshot);
      } else {
        setCustomPermissions(
          getSelectedRoleDefaultPermissions(roleSelection, rolePermissions, customRoles)
        );
      }
    } else if (mode === USER_PERMISSION_MODES.INHERIT) {
      setCustomPermissions({});
    }
  };

  const isAdminBuiltin =
    roleSelection.kind === 'builtin' && roleSelection.role === 'admin';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim()) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('settings.team.create.validation_full_name', 'Please enter a full name'),
        variant: 'destructive',
      });
      return;
    }

    if (!email.trim()) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('settings.team.create.validation_email', 'Please enter an email address'),
        variant: 'destructive',
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('settings.team.create.validation_email_invalid', 'Please enter a valid email address'),
        variant: 'destructive',
      });
      return;
    }

    if (password.trim() && password.length < 6) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('settings.team.create.validation_password', 'Password must be at least 6 characters long'),
        variant: 'destructive',
      });
      return;
    }

    const updateData: Record<string, unknown> = {
      fullName,
      email,
      role: roleSelection.kind === 'builtin' ? roleSelection.role : 'agent',
      customRoleId: roleSelection.kind === 'custom' ? roleSelection.id : null,
      permissionMode,
    };

    const trimmedWhatsapp = whatsappNumber.trim();
    if (trimmedWhatsapp) {
      updateData.whatsappNumber = trimmedWhatsapp;
    }

    if (password.trim()) {
      updateData.password = password;
    }

    if (permissionMode === USER_PERMISSION_MODES.CUSTOM) {
      if (!hasSeededPermissionSnapshot(customPermissions)) {
        toast({
          title: t('auth.error', 'Error'),
          description: t(
            'settings.team.permissions.defaults_loading',
            'Permission defaults are still loading. Please wait a moment and try again.'
          ),
          variant: 'destructive',
        });
        return;
      }
      updateData.customPermissions = customPermissions;
    }

    updateTeamMemberMutation.mutate(updateData);
  };

  if (!teamMember) return null;

  const isCustomMode = permissionMode === USER_PERMISSION_MODES.CUSTOM;
  const customSnapshotReady = !isCustomMode || hasSeededPermissionSnapshot(customPermissions);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-settings-editteammembermodal.dialogcontent.settings.team.edit.title" className={isCustomMode ? 'sm:max-w-[900px] lg:max-w-[1000px] max-h-[90vh] overflow-y-auto' : 'sm:max-w-[500px]'}>
        <DialogHeader>
          <DialogTitle>{t('settings.team.edit.title', 'Edit Team Member')}</DialogTitle>
          <DialogDescription>
            {t(
              'settings.team.edit.description',
              'Update team member information and permission mode.'
            )}
            {isCustomMode
              ? t(
                  'settings.team.edit.description_custom',
                  ' This member uses a fixed permission snapshot and will not receive future role-default updates.'
                )
              : t(
                  'settings.team.edit.description_inherit',
                  ' This member inherits permissions from role defaults and will track future role-default changes.'
                )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-fullName">{t('settings.team.create.full_name', 'Full Name')}</Label>
            <Input data-tour="components-settings-editteammembermodal.input.edit-fullName"
              id="edit-fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">{t('settings.team.create.email', 'Email Address')}</Label>
            <Input data-tour="components-settings-editteammembermodal.input.edit-email"
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-password">{t('settings.team.create.password', 'Password')}</Label>
            <div className="relative">
              <Input data-tour="components-settings-editteammembermodal.input.settings.team.edit.password_placeholder"
                id="edit-password"
                type={showPassword ? "text" : "password"}
                placeholder={t('settings.team.edit.password_placeholder', 'Leave blank to keep current password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'settings.team.edit.password_hint',
                'Optional: Enter a new password or leave blank to keep the current password. Minimum 6 characters if provided.'
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-whatsappNumber">{t('settings.team.create.whatsapp', 'WhatsApp Number')}</Label>
            <LocalizedPhoneInput
              id="edit-whatsappNumber"
              placeholder={t('settings.team.create.whatsapp_placeholder', '+1234567890')}
              value={whatsappNumber}
              onChange={setWhatsappNumber}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'settings.team.edit.whatsapp_hint',
                'Used to receive handoff notifications via WhatsApp.'
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-role">{t('settings.team.create.role', 'Role')}</Label>
            <Select
              value={roleSelectionToValue(roleSelection)}
              onValueChange={handleRoleChange}
            >
              <SelectTrigger data-tour="components-settings-editteammembermodal.selecttrigger.settings.team.create.role_placeholder" id="edit-role">
                <SelectValue placeholder={t('settings.team.create.role_placeholder', 'Select a role')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">{t('roles.administrator', 'Administrator')}</SelectItem>
                <SelectItem value="agent">{t('roles.agent', 'Agent')}</SelectItem>
                {customRoles.map((role) => (
                  <SelectItem key={role.id} value={`custom:${role.id}`}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <Label>{t('settings.team.edit.permission_mode', 'Permission mode')}</Label>
            <RadioGroup
              value={permissionMode}
              onValueChange={(value) => handlePermissionModeChange(value as 'inherit' | 'custom')}
              className="space-y-2"
            >
              <div className="flex items-start space-x-2">
                <RadioGroupItem value={USER_PERMISSION_MODES.INHERIT} id="mode-inherit" className="mt-1" />
                <div>
                  <Label htmlFor="mode-inherit" className="font-normal cursor-pointer">
                    {t('settings.team.edit.mode_inherit', 'Inherit from role defaults')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'settings.team.edit.mode_inherit_desc',
                      'Permissions follow the selected role and update when role defaults change.'
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <RadioGroupItem value={USER_PERMISSION_MODES.CUSTOM} id="mode-custom" className="mt-1" />
                <div>
                  <Label htmlFor="mode-custom" className="font-normal cursor-pointer">
                    {t('settings.team.edit.mode_custom', 'Fixed custom permissions')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'settings.team.edit.mode_custom_desc',
                      'Save a fixed snapshot. This member will not receive future role-default updates.'
                    )}
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>

          {isCustomMode && (
            <div className="border rounded-lg p-4">
              <PermissionEditorPanel
                permissions={customPermissions}
                onToggle={togglePermission}
                idPrefix="edit-member"
                enforcedPermissions={isAdminBuiltin ? RESERVED_ADMIN_PERMISSIONS : []}
              />
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button data-tour="components-settings-editteammembermodal.button.common.cancel" variant="outline" type="button" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-editteammembermodal.button.settings.team.edit.submit"
              type="submit"
              variant="brand"
              disabled={updateTeamMemberMutation.isPending || !customSnapshotReady}
              className="btn-brand-primary"
            >
              {updateTeamMemberMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('settings.team.edit.submit', 'Update Team Member')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
