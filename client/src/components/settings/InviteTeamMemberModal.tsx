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
import { Switch } from "@/components/ui/switch";
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
  parseRoleSelectionValue,
  roleSelectionToValue,
  type RoleSelection,
} from './permissionCatalog';
import { PermissionEditorPanel } from './PermissionEditorPanel';

interface RolePermission {
  role: 'admin' | 'agent';
  permissions: Record<string, boolean>;
}

interface CustomRoleOption {
  id: number;
  name: string;
  permissions: Record<string, boolean>;
}

interface InviteTeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function InviteTeamMemberModal({ isOpen, onClose, onSuccess }: InviteTeamMemberModalProps) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [roleSelection, setRoleSelection] = useState<RoleSelection>({ kind: 'builtin', role: 'agent' });
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [customizePermissions, setCustomizePermissions] = useState(false);
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
    if (customizePermissions) {
      setCustomPermissions(
        getSelectedRoleDefaultPermissions(roleSelection, rolePermissions, customRoles)
      );
    }
  }, [roleSelection, customizePermissions, rolePermissions, customRoles]);

  const handleCustomizePermissionsChange = (enabled: boolean) => {
    setCustomizePermissions(enabled);
    if (enabled) {
      setCustomPermissions(
        getSelectedRoleDefaultPermissions(roleSelection, rolePermissions, customRoles)
      );
    } else {
      setCustomPermissions({});
    }
  };

  const handleRoleChange = (value: string) => {
    const parsed = parseRoleSelectionValue(value);
    if (!parsed) return;
    setRoleSelection(parsed);
    if (customizePermissions) {
      setCustomPermissions(
        getSelectedRoleDefaultPermissions(parsed, rolePermissions, customRoles)
      );
    }
  };

  const customSnapshotReady = !customizePermissions || hasSeededPermissionSnapshot(customPermissions);

  const createTeamMemberMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest('POST', '/api/team/members', data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('settings.team.create.success_title', 'Team Member Created'),
        description: t(
          'settings.team.create.success_description',
          '{{name}} has been added to your team and can log in immediately.',
          { name: fullName }
        ),
      });

      resetForm();
      onClose();

      queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });

      if (onSuccess) {
        onSuccess();
      }
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: t(
          'settings.team.create.error',
          'Failed to create team member: {{error}}',
          { error: error.message }
        ),
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFullName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setRoleSelection({ kind: 'builtin', role: 'agent' });
    setWhatsappNumber('');
    setCustomizePermissions(false);
    setCustomPermissions({});
  };

  const togglePermission = (permission: string, value: boolean) => {
    setCustomPermissions(prev => ({ ...prev, [permission]: value }));
  };

  const selectedRoleLabel =
    roleSelection.kind === 'custom'
      ? (customRoles.find((role) => role.id === roleSelection.id)?.name ??
        t('roles.custom_role', 'Custom role'))
      : roleSelection.role === 'admin'
        ? t('roles.administrator', 'Administrator')
        : t('roles.agent', 'Agent');

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

    if (!username.trim()) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('settings.team.create.validation_username', 'Please enter a username'),
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

    if (!password.trim() || password.length < 6) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('settings.team.create.validation_password', 'Password must be at least 6 characters long'),
        variant: 'destructive',
      });
      return;
    }

    const trimmedWhatsapp = whatsappNumber.trim();
    if (!trimmedWhatsapp) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('settings.team.create.validation_whatsapp', 'Please enter a WhatsApp number'),
        variant: 'destructive',
      });
      return;
    }

    const whatsappRegex = /^\+\d{7,15}$/;
    if (!whatsappRegex.test(trimmedWhatsapp)) {
      toast({
        title: t('auth.error', 'Error'),
        description: t(
          'settings.team.create.validation_whatsapp_invalid',
          'Please enter a valid WhatsApp number (e.g. +1234567890)'
        ),
        variant: 'destructive',
      });
      return;
    }

    const payload: Record<string, unknown> = {
      fullName,
      username,
      email,
      password,
      whatsappNumber: trimmedWhatsapp,
      role: roleSelection.kind === 'builtin' ? roleSelection.role : 'agent',
      customRoleId: roleSelection.kind === 'custom' ? roleSelection.id : null,
    };

    if (customizePermissions) {
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
      payload.permissionMode = USER_PERMISSION_MODES.CUSTOM;
      payload.customPermissions = customPermissions;
    }

    createTeamMemberMutation.mutate(payload);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-settings-inviteteammembermodal.dialogcontent.settings.team.create.title" className={customizePermissions ? 'sm:max-w-[900px] lg:max-w-[1000px] max-h-[90vh] overflow-y-auto' : 'sm:max-w-[500px]'}>
        <DialogHeader>
          <DialogTitle>{t('settings.team.create.title', 'Add Team Member')}</DialogTitle>
          <DialogDescription>
            {t(
              'settings.team.create.description',
              'Create a new team member account. They can log in immediately after creation.'
            )}
            {customizePermissions
              ? t(
                  'settings.team.create.description_custom',
                  ' A fixed permission snapshot will be saved and will not track future role-default changes.'
                )
              : t(
                  'settings.team.create.description_inherit',
                  ' Permissions will inherit from the selected role defaults.'
                )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('settings.team.create.full_name', 'Full Name')}</Label>
              <Input data-tour="components-settings-inviteteammembermodal.input.settings.team.create.full_name_placeholder"
                id="fullName"
                placeholder={t('settings.team.create.full_name_placeholder', 'John Doe')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="username">{t('settings.team.create.username', 'Username')}</Label>
              <Input data-tour="components-settings-inviteteammembermodal.input.settings.team.create.username_placeholder"
                id="username"
                placeholder={t('settings.team.create.username_placeholder', 'johndoe')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('settings.team.create.email', 'Email Address')}</Label>
            <Input data-tour="components-settings-inviteteammembermodal.input.settings.team.create.email_placeholder"
              id="email"
              type="email"
              placeholder={t('settings.team.create.email_placeholder', 'john@company.com')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t('settings.team.create.password', 'Password')}</Label>
            <div className="relative">
              <Input data-tour="components-settings-inviteteammembermodal.input.settings.team.create.password_placeholder"
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={t('settings.team.create.password_placeholder', 'Minimum 6 characters')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsappNumber">{t('settings.team.create.whatsapp', 'WhatsApp Number')}</Label>
            <LocalizedPhoneInput
              id="whatsappNumber"
              placeholder={t('settings.team.create.whatsapp_placeholder', '+1234567890')}
              value={whatsappNumber}
              onChange={setWhatsappNumber}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">{t('settings.team.create.role', 'Role')}</Label>
            <Select
              value={roleSelectionToValue(roleSelection)}
              onValueChange={handleRoleChange}
            >
              <SelectTrigger data-tour="components-settings-inviteteammembermodal.selecttrigger.settings.team.create.role_placeholder" id="role">
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
            <p className="text-xs text-muted-foreground">
              {isAdminBuiltin
                ? t(
                    'settings.team.create.role_admin_helper',
                    'Administrators have broad access. Role defaults can be customized below.'
                  )
                : roleSelection.kind === 'custom'
                  ? t(
                      'settings.team.create.role_custom_helper',
                      'Custom roles use agent-tier access with reusable permission defaults.'
                    )
                  : t(
                      'settings.team.create.role_agent_helper',
                      'Agents have limited access by default. Role defaults can be customized below.'
                    )}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="customize-permissions">
                {t('settings.team.create.customize_permissions', 'Customize permissions')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'settings.team.create.customize_permissions_desc',
                  'Save a fixed permission snapshot instead of inheriting role defaults.'
                )}
              </p>
            </div>
            <Switch
              id="customize-permissions"
              checked={customizePermissions}
              onCheckedChange={handleCustomizePermissionsChange}
            />
          </div>

          {customizePermissions && (
            <div className="border rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-4">
                {t(
                  'settings.team.create.custom_seed',
                  'Permissions are seeded from the current {{role}} role defaults. Adjust as needed — this snapshot will not update when role defaults change.',
                  { role: selectedRoleLabel }
                )}
              </p>
              <PermissionEditorPanel
                permissions={customPermissions}
                onToggle={togglePermission}
                idPrefix="create-member"
                enforcedPermissions={isAdminBuiltin ? RESERVED_ADMIN_PERMISSIONS : []}
              />
            </div>
          )}

          <DialogFooter className="mt-6">
            <Button data-tour="components-settings-inviteteammembermodal.button.common.cancel" variant="outline" type="button" onClick={onClose}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-settings-inviteteammembermodal.button.settings.team.create.submit"
              type="submit"
              variant="brand"
              disabled={createTeamMemberMutation.isPending || !customSnapshotReady}
              className="btn-brand-primary"
            >
              {createTeamMemberMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('settings.team.create.submit', 'Create Team Member')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
