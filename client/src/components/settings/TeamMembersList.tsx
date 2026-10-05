import { useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MoreVertical,
  UserX,
  AlertTriangle,
  Loader2,
  Edit,
  Search,
  ListFilter,
  UserPlus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { InviteTeamMemberModal } from './InviteTeamMemberModal';
import { EditTeamMemberModal } from './EditTeamMemberModal';
import { useAuth } from '@/hooks/use-auth';
import { User as SelectUser, USER_PERMISSION_MODES } from '@shared/schema';
import { cn } from '@/lib/utils';

interface TeamMemberListItem {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
  customRoleId?: number | null;
  customRoleName?: string | null;
  avatarUrl?: string | null;
  whatsappNumber?: string;
  active?: boolean | null;
  permissions?: Record<string, boolean>;
  permissionMode?: 'inherit' | 'custom';
  customPermissions?: Record<string, boolean>;
}

interface TeamMembersListProps {
  maxUsers?: number;
}

const PAGE_SIZE = 10;

type RoleFilter = 'all' | 'admin' | 'agent' | 'custom';
type PermissionFilter = 'all' | 'inherit' | 'custom';

export function TeamMembersList({ maxUsers }: TeamMembersListProps) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [selectedTeamMember, setSelectedTeamMember] = useState<TeamMemberListItem | null>(null);
  const [selectedMemberToDelete, setSelectedMemberToDelete] = useState<TeamMemberListItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [permissionFilter, setPermissionFilter] = useState<PermissionFilter>('all');
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isImpersonating } = useAuth();

  const { data: currentUser } = useQuery<SelectUser>({
    queryKey: ['/api/user'],
    refetchOnWindowFocus: false
  });

  const hasCompanyTeamContext =
    !!currentUser?.companyId && (!currentUser?.isSuperAdmin || isImpersonating);

  const {
    data: teamMembers = [],
    isLoading: isLoadingMembers
  } = useQuery<TeamMemberListItem[]>({
    queryKey: ['/api/team/members'],
    refetchOnWindowFocus: false,
    enabled: hasCompanyTeamContext,
  });

  const canManageMembers =
    hasCompanyTeamContext &&
    (currentUser?.role === 'admin' ||
      (currentUser?.isSuperAdmin === true && isImpersonating));

  const deleteTeamMemberMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const res = await apiRequest('DELETE', `/api/team/members/${memberId}`);
      return await res.json();
    },
    onSuccess: (_, memberId) => {
      const member = teamMembers.find(m => m.id === memberId);
      toast({
        title: t('settings.team.delete.success_title', 'Team Member Removed'),
        description: member
          ? t(
              'settings.team.delete.success_description',
              '{{name}} has been removed from your team',
              { name: member.fullName }
            )
          : t('settings.team.delete.success_description_generic', 'Team member has been removed'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/team/members'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('auth.error', 'Error'),
        description: t(
          'settings.team.delete.error',
          'Failed to remove team member: {{error}}',
          { error: error.message }
        ),
        variant: 'destructive',
      });
    },
  });

  const handleDeleteMemberClick = (member: TeamMemberListItem) => {
    setSelectedMemberToDelete(member);
    setShowDeleteAlert(true);
  };

  const handleConfirmDelete = () => {
    if (selectedMemberToDelete) {
      deleteTeamMemberMutation.mutate(selectedMemberToDelete.id);
      setShowDeleteAlert(false);
      setSelectedMemberToDelete(null);
    }
  };

  const handleEditTeamMember = (member: TeamMemberListItem) => {
    setSelectedTeamMember(member);
    setShowEditModal(true);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getAvatarColorClass = (id: number) => {
    const colors = [
      'bg-emerald-500/20 text-emerald-400',
      'bg-blue-500/20 text-blue-400',
      'bg-violet-500/20 text-violet-400',
      'bg-amber-500/20 text-amber-400',
      'bg-cyan-500/20 text-cyan-400',
      'bg-rose-500/20 text-rose-400',
    ];
    return colors[id % colors.length];
  };

  const isCustomPermissions = (member: TeamMemberListItem) =>
    member.permissionMode === USER_PERMISSION_MODES.CUSTOM;

  const getRoleLabel = (member: TeamMemberListItem) => {
    if (member.customRoleName) return member.customRoleName;
    if (member.role === 'admin') return t('roles.administrator', 'Administrator');
    return t('roles.agent', 'Agent');
  };

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teamMembers.filter((member) => {
      if (q) {
        const haystack = `${member.fullName} ${member.email} ${member.username}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (roleFilter === 'admin' && member.role !== 'admin') return false;
      if (roleFilter === 'agent' && (member.role !== 'agent' || member.customRoleId)) return false;
      if (roleFilter === 'custom' && !member.customRoleId) return false;
      if (permissionFilter === 'inherit' && isCustomPermissions(member)) return false;
      if (permissionFilter === 'custom' && !isCustomPermissions(member)) return false;
      return true;
    });
  }, [teamMembers, searchQuery, roleFilter, permissionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pagedMembers = filteredMembers.slice(pageStart, pageStart + PAGE_SIZE);

  const activeFilters = roleFilter !== 'all' || permissionFilter !== 'all';

  if (!hasCompanyTeamContext) {
    return null;
  }

  return (
    <>
      <div className="space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {t('settings.team.title', 'Team Members')}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {t('settings.team.description', 'Manage team members and their permissions')}
              {maxUsers !== undefined && (
                <span className="ml-1 text-muted-foreground/80">
                  ({teamMembers.length}/{maxUsers})
                </span>
              )}
            </p>
          </div>
          {canManageMembers && (
            <Button data-tour="components-settings-teammemberslist.button.settings.team.members.add_member" className="btn-brand-primary shrink-0" onClick={() => setShowInviteModal(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              {t('settings.team.members.add_member', 'Add Team Member')}
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input data-tour="components-settings-teammemberslist.input.settings.team.members.search_placeholder"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder={t('settings.team.members.search_placeholder', 'Search members...')}
              className="pl-9 bg-muted/40 border-border"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-tour="components-settings-teammemberslist.button.settings.team.members.filters" variant="outline" className={cn('shrink-0', activeFilters && 'border-primary text-primary')}>
                <ListFilter className="h-4 w-4 mr-2" />
                {t('settings.team.members.filters', 'Filters')}
                {activeFilters && (
                  <span className="ml-2 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{t('settings.team.members.filter_role', 'Role')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value as RoleFilter);
                  setPage(1);
                }}
              >
                <DropdownMenuRadioItem value="all">
                  {t('settings.team.members.filter_all', 'All')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="admin">
                  {t('roles.administrator', 'Administrator')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="agent">
                  {t('roles.agent', 'Agent')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="custom">
                  {t('roles.custom_roles', 'Custom roles')}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {t('settings.team.members.column_permissions', 'Permissions')}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={permissionFilter}
                onValueChange={(value) => {
                  setPermissionFilter(value as PermissionFilter);
                  setPage(1);
                }}
              >
                <DropdownMenuRadioItem value="all">
                  {t('settings.team.members.filter_all', 'All')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="inherit">
                  {t('settings.team.members.inherited', 'Inherited')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="custom">
                  {t('settings.team.members.custom', 'Custom')}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              {activeFilters && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setRoleFilter('all');
                      setPermissionFilter('all');
                      setPage(1);
                    }}
                  >
                    {t('settings.team.members.clear_filters', 'Clear filters')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isLoadingMembers ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden bg-card/40">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('settings.team.members.column_member', 'Member')}
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('settings.team.members.column_email', 'Email')}
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('settings.team.members.column_role', 'Role')}
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('settings.team.members.column_permissions', 'Permissions')}
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {t('settings.team.members.column_status', 'Status')}
                    </th>
                    {canManageMembers && (
                      <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        {t('common.actions', 'Actions')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedMembers.map(member => {
                    const isActive = member.active !== false;
                    return (
                      <tr key={`member-${member.id}`} className="hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              {member.avatarUrl ? (
                                <AvatarImage src={member.avatarUrl} alt={member.fullName} />
                              ) : null}
                              <AvatarFallback className={cn('text-sm font-semibold', getAvatarColorClass(member.id))}>
                                {getInitials(member.fullName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="text-sm font-medium text-foreground flex items-center gap-2">
                                {member.fullName}
                                {currentUser?.id === member.id && (
                                  <span className="text-xs text-muted-foreground font-normal">
                                    {t('settings.team.members.you', 'You')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {member.email}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'font-normal border-0',
                              member.role === 'admin' && !member.customRoleId
                                ? 'bg-sky-500/15 text-sky-400 hover:bg-sky-500/15'
                                : member.customRoleId
                                  ? 'bg-violet-500/15 text-violet-400 hover:bg-violet-500/15'
                                  : 'bg-muted text-muted-foreground hover:bg-muted'
                            )}
                          >
                            {getRoleLabel(member)}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <Badge variant="outline" className="text-xs font-normal text-muted-foreground border-border">
                            {isCustomPermissions(member)
                              ? t('settings.team.members.custom', 'Custom')
                              : t('settings.team.members.inherited', 'Inherited')}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span
                            className={cn(
                              'inline-flex px-2.5 py-1 text-xs font-medium rounded-full',
                              isActive
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : 'bg-muted text-muted-foreground'
                            )}
                          >
                            {isActive
                              ? t('common.active', 'Active')
                              : t('common.inactive', 'Inactive')}
                          </span>
                        </td>
                        {canManageMembers && (
                          <td className="px-5 py-4 whitespace-nowrap text-right">
                            {currentUser?.id !== member.id ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuLabel>{t('common.actions', 'Actions')}</DropdownMenuLabel>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleEditTeamMember(member)}>
                                    <Edit className="h-4 w-4 mr-2" />
                                    {t('settings.team.members.edit_member', 'Edit Member')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDeleteMemberClick(member)}>
                                    <UserX className="h-4 w-4 mr-2 text-destructive" />
                                    <span className="text-destructive">
                                      {t('settings.team.members.remove_member', 'Remove Member')}
                                    </span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {filteredMembers.length === 0 && (
                    <tr>
                      <td
                        colSpan={canManageMembers ? 6 : 5}
                        className="px-5 py-12 text-center text-sm text-muted-foreground"
                      >
                        {teamMembers.length === 0
                          ? canManageMembers
                            ? t(
                                'settings.team.members.empty_admin',
                                'No team members found. Add members to join your team.'
                              )
                            : t('settings.team.members.empty', 'No team members found.')
                          : t(
                              'settings.team.members.empty_filtered',
                              'No members match your search or filters.'
                            )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredMembers.length > 0 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-3 border-t border-border bg-muted/20">
                <p className="text-sm text-muted-foreground">
                  {t(
                    'settings.team.members.showing',
                    'Showing {{from}}–{{to}} of {{total}} members',
                    {
                      from: pageStart + 1,
                      to: Math.min(pageStart + PAGE_SIZE, filteredMembers.length),
                      total: filteredMembers.length,
                    }
                  )}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                    .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === 'ellipsis' ? (
                        <span key={`e-${idx}`} className="px-1 text-muted-foreground text-sm">
                          …
                        </span>
                      ) : (
                        <Button
                          key={item}
                          variant={item === currentPage ? 'default' : 'ghost'}
                          size="icon"
                          className={cn(
                            'h-8 w-8',
                            item === currentPage && 'btn-brand-primary'
                          )}
                          onClick={() => setPage(item)}
                        >
                          {item}
                        </Button>
                      )
                    )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {canManageMembers && (
        <InviteTeamMemberModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {canManageMembers && (
        <EditTeamMemberModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedTeamMember(null);
          }}
          teamMember={selectedTeamMember}
        />
      )}

      {canManageMembers && (
        <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                <div className="flex items-center text-destructive">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  {t('settings.team.delete.title', 'Remove Team Member')}
                </div>
              </AlertDialogTitle>
              <AlertDialogDescription>
                {selectedMemberToDelete ? (
                  t(
                    'settings.team.delete.description',
                    'Are you sure you want to remove {{name}} from your team? This action cannot be undone.',
                    { name: selectedMemberToDelete.fullName }
                  )
                ) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-destructive hover:bg-destructive/90"
              >
                {deleteTeamMemberMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('settings.team.delete.confirm', 'Remove Member')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
