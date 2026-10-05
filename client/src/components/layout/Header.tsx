import { QuickActionsMenu } from '@/components/quick-actions/QuickActionsMenu';
import { GuidedTourHelpButton } from '@/components/guided-tours/GuidedTourProvider';
import { useState, useRef, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, User, Settings, HelpCircle, Building, ArrowLeft, Globe, Search, X, Wifi, WifiOff, ScrollText, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useBranding } from '@/contexts/branding-context';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { ProfileLanguageSelector } from '@/components/ui/profile-language-selector';
import ThemeToggle from '@/components/ui/theme-toggle';
import { usePermissions, PermissionGate } from '@/hooks/usePermissions';
import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { SearchDropdown } from '@/components/ui/search-dropdown';
import { useConversations } from '@/context/ConversationContext';
import { useTheme } from 'next-themes';
import { ChangelogDialog } from '@/components/changelog/ChangelogDialog';
import { useAppSidebarChrome } from '@/contexts/AppSidebarChromeContext';

function adjustColor(color: string, amount: number): string {
  try {
    color = color.replace('#', '');

    let r = parseInt(color.substring(0, 2), 16);
    let g = parseInt(color.substring(2, 4), 16);
    let b = parseInt(color.substring(4, 6), 16);

    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch (error) {
    return '#1f2937';
  }
}

function getInitials(name: string): string {
  return name
    ?.split(' ')
    .map((part: string) => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2) || 'JD';
}

const getFullscreenElement = () =>
  document.fullscreenElement ||
  (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ||
  (document as Document & { mozFullScreenElement?: Element | null }).mozFullScreenElement ||
  (document as Document & { msFullscreenElement?: Element | null }).msFullscreenElement;

export default function Header() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [_, navigate] = useLocation();
  const { user, company, logoutMutation, isImpersonating, returnFromImpersonationMutation } = useAuth();
  const { branding } = useBranding();
  const { PERMISSIONS } = usePermissions();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const { sidebarCollapsed, toggleSidebarCollapsed } = useAppSidebarChrome();

  let isWebSocketConnected = true;
  try {
    const { isWebSocketConnected: wsConnected } = useConversations();
    isWebSocketConnected = wsConnected;
  } catch {
  }

  const {
    searchQuery,
    isOpen,
    isLoading,
    results,
    handleSearch,
    clearSearch,
    closeDropdown,
    openDropdown,
  } = useDebouncedSearch(300);

  const handleLogout = () => {
    sessionStorage.removeItem('isImpersonating');
    localStorage.removeItem('isImpersonating');
    localStorage.removeItem('originalSuperAdminId');

    logoutMutation.mutate();
  };

  const handleReturnToAdmin = () => {
    returnFromImpersonationMutation.mutate();
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        closeDropdown();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [closeDropdown]);


  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const headerStyle = isDark
    ? {
        headerBg: { backgroundColor: 'hsl(var(--card))' },
        borderColor: { borderColor: 'hsl(var(--border))' },
        textColor: 'text-white',
        inputClasses: 'bg-background/20 border-input/50 text-white placeholder-muted-foreground',
        iconTone: 'text-white'
      }
    : {
        headerBg: { backgroundColor: '#ffffff' },
        borderColor: { borderColor: '#e5e7eb' },
        textColor: 'text-gray-900',
        inputClasses: 'bg-white border-gray-300 text-gray-900 placeholder-gray-500',
        iconTone: 'text-gray-600'
      };

  const [isFullscreen, setIsFullscreen] = useState(() => !!getFullscreenElement());

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!getFullscreenElement());
    };

    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    document.addEventListener('mozfullscreenchange', handler);
    document.addEventListener('MSFullscreenChange', handler);

    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
      document.removeEventListener('mozfullscreenchange', handler);
      document.removeEventListener('MSFullscreenChange', handler);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!isFullscreen) {
        const docElm = document.documentElement as HTMLElement & {
          mozRequestFullScreen?: () => Promise<void> | void;
          webkitRequestFullscreen?: () => Promise<void> | void;
          msRequestFullscreen?: () => Promise<void> | void;
        };

        if (docElm.requestFullscreen) await docElm.requestFullscreen();
        else if (docElm.mozRequestFullScreen) docElm.mozRequestFullScreen();
        else if (docElm.webkitRequestFullscreen) docElm.webkitRequestFullscreen();
        else if (docElm.msRequestFullscreen) docElm.msRequestFullscreen();
      } else {
        const doc = document as Document & {
          mozCancelFullScreen?: () => Promise<void> | void;
          webkitExitFullscreen?: () => Promise<void> | void;
          msExitFullscreen?: () => Promise<void> | void;
        };

        if (document.exitFullscreen) await document.exitFullscreen();
        else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
        else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        else if (doc.msExitFullscreen) doc.msExitFullscreen();
      }
    } catch (error) {
      toast({
        title: t('fullscreen.error', 'Unable to toggle fullscreen'),
        description: (error as Error).message,
        variant: 'destructive'
      });
    }
  };

  return (
    <header data-tour-header
      className={`sticky top-0 z-10 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-center border-b px-4 py-2 ${headerStyle.textColor}`}
      style={{
        ...headerStyle.headerBg,
        ...headerStyle.borderColor
      }}
    >
      <div className="flex items-center">
        <button
          type="button"
          className={`mr-3 hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors md:flex ${isDark ? 'border-white/10 bg-background/20 text-white/70 hover:bg-background/30 hover:text-white' : 'border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900'}`}
          onClick={toggleSidebarCollapsed}
          aria-label={sidebarCollapsed ? t('sidebar.expand', 'Expand sidebar') : t('sidebar.collapse', 'Collapse sidebar')}
          title={sidebarCollapsed ? t('sidebar.expand', 'Expand sidebar') : t('sidebar.collapse', 'Collapse sidebar')}
        >
          {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
        {isImpersonating && (
          <Button
            variant="brand"
            size="sm"
            className="btn-brand-primary mr-2 h-8 w-8 shrink-0 p-0 sm:mr-4 sm:h-auto sm:w-auto sm:px-3 sm:py-2 text-amber-600 border-amber-600 hover:bg-amber-50"
            onClick={handleReturnToAdmin}
            disabled={returnFromImpersonationMutation.isPending}
            aria-label={
              returnFromImpersonationMutation.isPending
                ? t('admin.returning', 'Returning...')
                : t('admin.return_to_admin', 'Return to Admin')
            }
          >
            <ArrowLeft className="h-4 w-4 sm:mr-1" />
            <span className="hidden sm:inline">
              {returnFromImpersonationMutation.isPending
                ? t('admin.returning', 'Returning...')
                : t('admin.return_to_admin', 'Return to Admin')}
            </span>
          </Button>
        )}
      </div>

      <div className="hidden justify-center md:flex">
        <div className="relative w-[400px] max-w-full hidden md:block" ref={searchContainerRef}>
          <form onSubmit={handleSearchSubmit}>
            <div className="relative">
              <input
                type="search"
                placeholder={t('common.search_placeholder', 'Search conversations, contacts, templates...')}
                className={`w-full px-4 py-2 pr-10 rounded-lg border focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors ${headerStyle.inputClasses}`}
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={openDropdown}
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={clearSearch}
            className={`absolute right-3 top-2.5 transition-colors hover:text-primary ${headerStyle.iconTone === 'text-white' ? 'text-muted-foreground' : 'text-gray-400'}`}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <Search className={`h-4 w-4 absolute right-3 top-2.5 ${headerStyle.iconTone === 'text-white' ? 'text-muted-foreground' : 'text-gray-400'}`} />
              )}
            </div>
          </form>

          <SearchDropdown
            isOpen={isOpen}
            isLoading={isLoading}
            results={results}
            onClose={closeDropdown}
            onSelect={clearSearch}
            query={searchQuery}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 md:gap-4">
        <QuickActionsMenu />
        <GuidedTourHelpButton />
        <button
          className={`md:hidden flex items-center justify-center h-8 w-8 rounded-full border transition-colors ${isDark ? 'bg-background/20 border-white/10 hover:bg-background/30' : 'bg-white border-gray-200 shadow-sm hover:bg-gray-50'}`}
          onClick={() => setIsMobileSearchOpen(true)}
        >
          <Search className={`h-4 w-4 ${headerStyle.iconTone}`} />
        </button>

        <button
          className={`hidden md:flex items-center justify-center h-8 w-8 rounded-full border transition-colors ${isDark ? 'bg-background/20 border-white/10 hover:bg-background/30' : 'bg-white border-gray-200 shadow-sm hover:bg-gray-50'}`}
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? t('fullscreen.exit', 'Exit fullscreen') : t('fullscreen.enter', 'Enter fullscreen')}
        >
          {isFullscreen ? (
            <Minimize2 className={`h-4 w-4 ${headerStyle.iconTone}`} />
          ) : (
            <Maximize2 className={`h-4 w-4 ${headerStyle.iconTone}`} />
          )}
        </button>

        <ThemeToggle
          variant="compact"
          className={`flex items-center justify-center h-8 w-8 rounded-full border transition-colors ${isDark ? 'bg-background/20 border-white/10 hover:bg-background/30 text-white' : 'bg-white border-gray-200 shadow-sm hover:bg-gray-50 text-gray-600'}`}
        />

        <button
          className={`hidden md:flex items-center justify-center h-8 w-8 rounded-full border transition-colors ${isDark ? 'bg-background/20 border-white/10 hover:bg-background/30' : 'bg-white border-gray-200 shadow-sm hover:bg-gray-50'}`}
          onClick={() => setChangelogOpen(true)}
          aria-label={t('changelog.title', 'Changelog')}
        >
          <ScrollText className={`h-4 w-4 ${headerStyle.iconTone}`} />
        </button>

        <div className="hidden md:block"><LanguageSwitcher
          variant="compact"
          className={!isDark ? 'text-gray-600 [&_svg]:text-gray-600' : undefined}
        /></div>

        <PermissionGate permissions={[PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS]}>
          <button
            className={`hidden md:flex items-center justify-center h-8 w-8 rounded-full border transition-colors ${isDark ? 'bg-background/20 border-white/10 hover:bg-background/30' : 'bg-white border-gray-200 shadow-sm hover:bg-gray-50'}`}
            onClick={() => navigate('/settings')}
          >
            <i className={`ri-settings-3-line ${headerStyle.iconTone}`}></i>
          </button>
        </PermissionGate>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center cursor-pointer hover:opacity-80">
            <Avatar className="h-8 w-8">
              {user?.avatarUrl ? (
                <AvatarImage src={user.avatarUrl} alt={user.fullName || 'User'} />
              ) : null}
              <AvatarFallback
                className="text-white font-medium text-sm"
                style={{ backgroundColor: company?.primaryColor || branding.primaryColor }}
              >
                {getInitials(user?.fullName || '')}
              </AvatarFallback>
            </Avatar>
            <span className={`ml-2 hidden max-w-32 truncate md:block ${isDark ? 'text-white' : 'text-gray-900'}`}>{user?.fullName || 'John Doe'}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem className="md:hidden" onClick={toggleFullscreen}><Maximize2 className="mr-2 h-4 w-4" />{isFullscreen ? t('fullscreen.exit','Exit fullscreen') : t('fullscreen.enter','Enter fullscreen')}</DropdownMenuItem>
            <DropdownMenuItem className="md:hidden" onClick={() => setChangelogOpen(true)}><ScrollText className="mr-2 h-4 w-4" />{t('changelog.title','Changelog')}</DropdownMenuItem>
            <div className="px-2 py-1.5 text-sm font-medium">
              <div>{user?.fullName || 'John Doe'}</div>
              <div className="text-xs text-muted-foreground">{user?.email || 'email@example.com'}</div>
              {company && (
                <div className="text-xs flex items-center mt-1 text-primary">
                  <Building className="h-3 w-3 mr-1" />
                  {company.name}
                </div>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => navigate('/profile')}
            >
              <User className="mr-2 h-4 w-4" />
              <span>{t('nav.profile', 'Profile')}</span>
            </DropdownMenuItem>

            <PermissionGate permissions={[PERMISSIONS.VIEW_SETTINGS, PERMISSIONS.MANAGE_SETTINGS]}>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => navigate('/settings')}
              >
                <Settings className="mr-2 h-4 w-4" />
                <span>{t('nav.settings', 'Settings')}</span>
              </DropdownMenuItem>
            </PermissionGate>

            <DropdownMenuItem className="p-0">
              <ProfileLanguageSelector className="w-full justify-start p-2" />
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-red-600 focus:text-red-600"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>{logoutMutation.isPending ? t('auth.logging_out', 'Logging out...') : t('auth.logout', 'Logout')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />

      {isMobileSearchOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setIsMobileSearchOpen(false)} />
          <div
          className="fixed top-0 left-0 right-0 border-b p-4"
          style={{
            ...headerStyle.headerBg,
            ...headerStyle.borderColor
          }}
          >
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setIsMobileSearchOpen(false)}
                className={`flex items-center justify-center h-8 w-8 rounded-full border transition-colors ${
                  isDark
                    ? 'bg-background/20 border-white/10 hover:bg-background/30'
                    : 'bg-white border-gray-200 hover:bg-gray-100'
                }`}
              >
                <X className={`h-4 w-4 ${headerStyle.iconTone}`} />
              </button>
              <div className="flex-1 relative">
                <input
                  type="search"
                  placeholder={t('common.search_placeholder', 'Search conversations, contacts, templates...')}
                  className={`w-full px-4 py-2 pr-10 rounded-lg border focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors ${headerStyle.inputClasses}`}
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  autoFocus
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className={`absolute right-3 top-2.5 transition-colors hover:text-primary ${headerStyle.iconTone === 'text-white' ? 'text-muted-foreground' : 'text-gray-400'}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : (
                  <Search className={`h-4 w-4 absolute right-3 top-2.5 ${headerStyle.iconTone === 'text-white' ? 'text-muted-foreground' : 'text-gray-400'}`} />
                )}
              </div>
            </div>

            <div className="mt-4 max-h-96 overflow-y-auto">
              <SearchDropdown
                isOpen={true}
                isLoading={isLoading}
                results={results}
                onClose={() => setIsMobileSearchOpen(false)}
                onSelect={() => {
                  clearSearch();
                  setIsMobileSearchOpen(false);
                }}
                query={searchQuery}
              />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
