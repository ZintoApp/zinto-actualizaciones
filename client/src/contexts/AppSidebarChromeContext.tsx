import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type AppSidebarChromeContextValue = {
  hideMainSidebar: boolean;
  setHideMainSidebar: (value: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  toggleSidebarCollapsed: () => void;
};

const AppSidebarChromeContext = createContext<AppSidebarChromeContextValue | null>(null);

export function AppSidebarChromeProvider({ children }: { children: React.ReactNode }) {
  const [hideMainSidebar, setHideMainSidebarState] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const setHideMainSidebar = useCallback((value: boolean) => {
    setHideMainSidebarState(value);
  }, []);
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((collapsed) => !collapsed);
  }, []);

  const value = useMemo(
    () => ({ hideMainSidebar, setHideMainSidebar, sidebarCollapsed, setSidebarCollapsed, toggleSidebarCollapsed }),
    [hideMainSidebar, setHideMainSidebar, sidebarCollapsed, toggleSidebarCollapsed],
  );

  return (
    <AppSidebarChromeContext.Provider value={value}>{children}</AppSidebarChromeContext.Provider>
  );
}

export function useAppSidebarChrome(): AppSidebarChromeContextValue {
  const ctx = useContext(AppSidebarChromeContext);
  if (!ctx) {
    throw new Error('useAppSidebarChrome must be used within AppSidebarChromeProvider');
  }
  return ctx;
}
