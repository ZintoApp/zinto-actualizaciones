import { ReactNode, useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { useBranding } from "@/contexts/branding-context";
import { useIsMobile } from "@/hooks/use-mobile";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ProfileLanguageSelector } from "@/components/ui/profile-language-selector";
import ThemeToggle from "@/components/ui/theme-toggle";
import { ChangelogDialog } from "@/components/changelog/ChangelogDialog";
import { ADMIN_CHANGELOG_ENTRIES } from "@/lib/changelog-config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Settings, HelpCircle, Home, Building, Users, Package, BarChart, Globe, Menu, X, CreditCard, UserCheck, Layout, Tag, PanelLeftClose, PanelLeftOpen, ScrollText, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { branding } = useBranding();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' && window.localStorage.getItem('admin-sidebar-collapsed') === 'true'
  );
  const [brandingUpdateKey, setBrandingUpdateKey] = useState(0);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);

  useEffect(() => {
    const updateFullscreenState = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', updateFullscreenState);
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      toast({
        title: t('common.error', 'Error'),
        description: t('fullscreen.unavailable', 'Fullscreen mode is not available in this browser.'),
        variant: 'destructive',
      });
    }
  };

  const hexToRgba = (hex: string, alpha: number) => {
    const normalized = hex.replace('#', '');
    const safeHex = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : '070b18';
    const r = parseInt(safeHex.slice(0, 2), 16);
    const g = parseInt(safeHex.slice(2, 4), 16);
    const b = parseInt(safeHex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const gradientStart = branding.uiGradientStart || '#070b18';
  const gradientMiddle = branding.uiGradientMiddle || '#0f172a';
  const gradientEnd = branding.uiGradientEnd || '#1d4ed8';

  const headerBackground = isDark
    ? `linear-gradient(135deg, ${hexToRgba(gradientStart, 0.98)} 0%, ${hexToRgba(gradientMiddle, 0.96)} 45%, ${hexToRgba(gradientEnd, 0.72)} 100%)`
    : `linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--card)) 58%, hsl(var(--primary) / 0.08) 100%)`;

  const sidebarBackground = isDark
    ? `linear-gradient(180deg, ${hexToRgba(gradientStart, 0.98)} 0%, ${hexToRgba(gradientMiddle, 0.97)} 42%, ${hexToRgba(gradientEnd, 0.58)} 100%)`
    : `linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 54%, hsl(var(--primary) / 0.07) 100%)`;

  const navButtonClass = (isActive: boolean) =>
    `group relative h-12 w-full rounded-xl border text-foreground transition-all duration-200 ${sidebarCollapsed && !isMobile ? 'justify-center px-0' : 'justify-start px-3'} ${
      isActive
        ? 'border-border bg-accent text-accent-foreground shadow-[0_10px_28px_rgba(0,0,0,0.12)] backdrop-blur-sm before:absolute before:-left-px before:top-2 before:h-8 before:w-1 before:rounded-r-full before:bg-primary before:shadow-[0_0_14px_hsl(var(--primary))]'
        : 'border-transparent text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground'
    }`;

  const navIconClass = 'h-5 w-5';
  const navLabelClass = sidebarCollapsed && !isMobile ? 'sr-only' : '';
  const collapsedTitle = (label: string) => sidebarCollapsed && !isMobile ? label : undefined;

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      window.localStorage.setItem('admin-sidebar-collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location, isMobile]);

  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    } else {
      setSidebarOpen(true);
    }
  }, [isMobile]);


  useEffect(() => {
    const handleBrandingUpdate = () => {
      setBrandingUpdateKey(prev => prev + 1);
    };

    window.addEventListener('brandingUpdated', handleBrandingUpdate);
    return () => window.removeEventListener('brandingUpdated', handleBrandingUpdate);
  }, []);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/logout');
      if (!response.ok) {
        throw new Error('Failed to logout');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/user'], null);
      toast({
        title: t('auth.logged_out', 'Logged out'),
        description: t('auth.logged_out_success', 'You have been successfully logged out'),
      });

      setTimeout(() => {
        navigate('/admin');
      }, 500);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('auth.logout_failed', 'Failed to logout: {{error}}', { error: error.message }),
        variant: "destructive",
      });
    }
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <div className="admin-shell min-h-screen flex flex-col">
      <header
        className={cn(
          "relative z-40 flex min-h-[65px] items-center justify-between overflow-hidden border-b border-border px-6 py-3 text-foreground shadow-[0_12px_32px_rgba(2,6,23,0.12)] transition-[margin] duration-300",
          !isMobile && (sidebarCollapsed ? "ml-20" : "ml-72")
        )}
        style={{ backgroundImage: headerBackground }}
      >
        <div
          className={cn("pointer-events-none absolute inset-0", isDark ? "opacity-80" : "opacity-20")}
          style={{
            backgroundImage:
              `radial-gradient(circle at top left, ${hexToRgba(gradientMiddle, 0.18)}, transparent 30%), radial-gradient(circle at top right, ${hexToRgba(gradientEnd, 0.16)}, transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0))`,
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />

        <div className="relative z-10 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2 text-foreground hover:bg-accent"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>

          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="mr-3 h-10 w-10 rounded-lg border border-border bg-background/40 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? t('sidebar.expand', 'Expand sidebar') : t('sidebar.collapse', 'Collapse sidebar')}
              title={sidebarCollapsed ? t('sidebar.expand', 'Expand sidebar') : t('sidebar.collapse', 'Collapse sidebar')}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </Button>
          )}

          {isMobile && (branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.appName}
              className="h-10 w-auto max-w-md object-contain"
            />
          ) : (
            <>
              <svg className="h-8 w-8 text-foreground" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M12,20c-4.41,0-8-3.59-8-8s3.59-8,8-8s8,3.59,8,8
                S16.41,20,12,20z M14.59,8.59L16,10l-6,6l-4-4l1.41-1.41L10,13.17L14.59,8.59z"></path>
              </svg>
              <span className="ml-2 text-xl font-bold">{branding.appName}</span>
            </>
          ))}
        </div>

        <div className="relative z-10 flex items-center space-x-4">
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? t('fullscreen.exit', 'Exit fullscreen') : t('fullscreen.enter', 'Enter fullscreen')}
            title={isFullscreen ? t('fullscreen.exit', 'Exit fullscreen') : t('fullscreen.enter', 'Enter fullscreen')}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <ThemeToggle variant="compact" className="flex items-center justify-center h-8 w-8 rounded-full bg-background/40 hover:bg-accent text-foreground" />
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background/40 text-foreground transition-colors hover:bg-accent"
            onClick={() => setChangelogOpen(true)}
            aria-label={t('changelog.title', 'Changelog')}
            title={t('changelog.title', 'Changelog')}
          >
            <ScrollText className="h-4 w-4" />
          </button>
          <LanguageSwitcher variant="compact" />
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center cursor-pointer hover:opacity-80">
              <div className="h-8 w-8 rounded-full bg-primary-800 flex items-center justify-center text-white font-medium">
                {user?.fullName?.split(' ').map((name: string) => name[0]).join('') || 'SA'}
              </div>
              <span className="ml-2 hidden md:block">{user?.fullName || 'Super Admin'}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-sm font-medium">
                <div>{user?.fullName || 'Super Admin'}</div>
                <div className="text-xs text-muted-foreground">{user?.email || 'admin@example.com'}</div>
              </div>
              <DropdownMenuSeparator />

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
      </header>

      <ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} entries={ADMIN_CHANGELOG_ENTRIES} />

      <div className={cn("flex flex-1 relative transition-[padding] duration-300", !isMobile && (sidebarCollapsed ? "pl-20" : "pl-72"))}>
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`
            fixed left-0 top-0
            ${isMobile && !sidebarOpen ? '-translate-x-full' : 'translate-x-0'}
            ${!isMobile && sidebarCollapsed ? 'w-20' : 'w-72'} overflow-hidden border-r border-border text-foreground shadow-[18px_0_45px_rgba(2,6,23,0.14)] transition-[width,transform] duration-300 ease-in-out z-50
            h-screen
          `}
          style={{ backgroundImage: sidebarBackground }}
        >
          <div
            className={cn("pointer-events-none absolute inset-0", isDark ? "opacity-90" : "opacity-20")}
            style={{
              backgroundImage:
                `radial-gradient(circle at top left, ${hexToRgba(gradientEnd, 0.18)}, transparent 26%), radial-gradient(circle at 20% 80%, ${hexToRgba(gradientMiddle, 0.14)}, transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0))`,
            }}
          />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-border" />

          <div className={cn("relative z-10 flex min-h-[65px] items-center border-b border-border px-5", sidebarCollapsed && !isMobile && "justify-center px-2")}>
            {sidebarCollapsed && !isMobile && branding.faviconUrl ? (
              <img
                src={branding.faviconUrl}
                alt={`${branding.appName} favicon`}
                className="h-10 w-10 rounded-lg object-contain"
              />
            ) : branding.logoUrl ? (
              <div className={cn("flex min-w-0 flex-1 items-center", sidebarCollapsed && !isMobile && "justify-center")}>
                <img
                  src={branding.logoUrl}
                  alt={branding.appName}
                  className={cn(
                    "object-contain",
                    sidebarCollapsed && !isMobile
                      ? "h-10 w-10"
                      : "h-[52px] w-full max-w-[238px] object-left"
                  )}
                />
              </div>
            ) : (
              <>
                <svg className="h-8 w-8 shrink-0 text-foreground" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12,2C6.48,2,2,6.48,2,12s4.48,10,10,10s10-4.48,10-10S17.52,2,12,2z M12,20c-4.41,0-8-3.59-8-8s3.59-8,8-8s8,3.59,8,8 S16.41,20,12,20z M14.59,8.59L16,10l-6,6l-4-4l1.41-1.41L10,13.17L14.59,8.59z" />
                </svg>
                <span className={cn("ml-3 truncate text-xl font-bold", navLabelClass)}>{branding.appName}</span>
              </>
            )}
            {isMobile && (
              <Button variant="ghost" size="icon" className="ml-auto text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => setSidebarOpen(false)} aria-label={t('common.close', 'Close')}>
                <X className="h-5 w-5" />
              </Button>
            )}
          </div>

          <nav className={`admin-sidebar-scrollbar relative z-10 h-[calc(100vh-65px)] overflow-y-auto ${sidebarCollapsed && !isMobile ? 'space-y-2 p-2 pt-3' : 'space-y-7 px-4 py-7'}`}>
            <section>
              <p className={cn("mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground", navLabelClass)}>{t('admin.nav.section.overview', 'Overview')}</p>
              <div className="relative">
                <Link href="/admin/dashboard">
                  <Button variant="ghost" className={navButtonClass(location === '/admin/dashboard')} title={collapsedTitle(t('admin.nav.dashboard', 'Dashboard'))}>
                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/40 shadow-inner transition-colors", location === '/admin/dashboard' && "border-primary/40 bg-primary/10 text-primary")}><Home className={navIconClass} /></span>
                    <span className={cn("ml-3", navLabelClass)}>{t('admin.nav.dashboard', 'Dashboard')}</span>
                  </Button>
                </Link>
              </div>
              <Link href="/admin/analytics">
                <Button
                  variant="ghost"
                  className={navButtonClass(location.startsWith('/admin/analytics'))}
                  title={collapsedTitle(t('admin.nav.analytics', 'Analytics'))}
                >
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/40 shadow-inner transition-colors", location.startsWith('/admin/analytics') && "border-primary/40 bg-primary/10 text-primary")}>
                    <BarChart className={navIconClass} />
                  </span>
                  <span className={cn("ml-3", navLabelClass)}>{t('admin.nav.analytics', 'Analytics')}</span>
                </Button>
              </Link>
            </section>

            <section>
              <p className={cn("mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground", navLabelClass)}>{t('admin.nav.section.management', 'Management')}</p>
              <div className="space-y-1">
                {[
                  ['/admin/companies', t('admin.nav.companies', 'Companies'), Building],
                  ['/admin/users', t('admin.nav.users', 'Users'), Users],
                  ['/admin/plans', t('admin.nav.plans', 'Plans'), Package],
                  ['/admin/coupons', t('admin.nav.coupons', 'Coupons'), Tag],
                  ['/admin/payments', t('admin.payments.title', 'Payment Management'), CreditCard],
                  ['/admin/affiliate', t('admin.affiliate.title', 'Affiliate Management'), UserCheck],
                ].map(([href, label, Icon]) => {
                  const active = location.startsWith(href as string);
                  const NavIcon = Icon as typeof Building;
                  return <Link href={href as string} key={href as string}><Button variant="ghost" className={navButtonClass(active)} title={collapsedTitle(label as string)}><span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/40 shadow-inner transition-colors", active && "border-primary/40 bg-primary/10 text-primary")}><NavIcon className={navIconClass} /></span><span className={cn("ml-3 truncate", navLabelClass)}>{label as string}</span></Button></Link>;
                })}
              </div>
            </section>

            <section className={cn(!sidebarCollapsed && !isMobile && "border-t border-border pt-5")}>
              <p className={cn("mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground", navLabelClass)}>{t('admin.nav.section.configuration', 'Configuration')}</p>
              <div className="space-y-1">
                {[
                  ['/admin/translations', t('admin.nav.translations', 'Translations'), Globe],
                  ['/admin/guided-tours', t('guided_tours.title', 'Guided tours'), HelpCircle],
                  ['/admin/settings', t('admin.nav.settings', 'Settings'), Settings],
                ].map(([href, label, Icon]) => {
                  const active = location.startsWith(href as string);
                  const NavIcon = Icon as typeof Settings;
                  return <Link href={href as string} key={href as string}><Button variant="ghost" className={navButtonClass(active)} title={collapsedTitle(label as string)}><span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/40 shadow-inner transition-colors", active && "border-primary/40 bg-primary/10 text-primary")}><NavIcon className={navIconClass} /></span><span className={cn("ml-3", navLabelClass)}>{label as string}</span></Button></Link>;
                })}
              </div>
            </section>
          </nav>


        </aside>

        <main className={`flex-1 bg-gray-50 dark:bg-gray-900 overflow-auto transition-all duration-300 ${
          isMobile ? 'w-full' : sidebarOpen ? 'ml-0' : 'ml-0'
        }`}>
          {children}
        </main>
      </div>
    </div>
  );
}
