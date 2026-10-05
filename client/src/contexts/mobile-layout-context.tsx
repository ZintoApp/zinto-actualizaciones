import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface MobileLayoutContextType {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isConversationListOpen: boolean;
  isContactDetailsOpen: boolean;
  setConversationListOpen: (open: boolean) => void;
  setContactDetailsOpen: (open: boolean) => void;
  toggleConversationList: () => void;
  toggleContactDetails: () => void;
  closeAllPanels: () => void;
}

const MobileLayoutContext = createContext<MobileLayoutContextType | undefined>(undefined);

interface MobileLayoutProviderProps {
  children: ReactNode;
}

function getLayoutFlags(width: number) {
  const mobile = width < 768;
  const tablet = width >= 768 && width < 1024;
  const desktop = width >= 1024;
  return { mobile, tablet, desktop };
}

export function MobileLayoutProvider({ children }: MobileLayoutProviderProps) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return getLayoutFlags(window.innerWidth).mobile;
  });
  const [isTablet, setIsTablet] = useState(() => {
    if (typeof window === 'undefined') return false;
    return getLayoutFlags(window.innerWidth).tablet;
  });
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return true;
    return getLayoutFlags(window.innerWidth).desktop;
  });
  const [isConversationListOpen, setIsConversationListOpen] = useState(false);
  const [isContactDetailsOpen, setIsContactDetailsOpen] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      const { mobile, tablet, desktop } = getLayoutFlags(window.innerWidth);
      setIsMobile((prev) => (prev === mobile ? prev : mobile));
      setIsTablet((prev) => (prev === tablet ? prev : tablet));
      setIsDesktop((prev) => (prev === desktop ? prev : desktop));


      if (mobile) {
        setIsConversationListOpen(false);
        setIsContactDetailsOpen(false);
      } else if (desktop) {

        setIsConversationListOpen(true);
        setIsContactDetailsOpen(false);
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  const setConversationListOpen = (open: boolean) => {
    setIsConversationListOpen(open);

    if (open && isMobile) {
      setIsContactDetailsOpen(false);
    }
  };

  const setContactDetailsOpen = (open: boolean) => {
    setIsContactDetailsOpen(open);

    if (open && isMobile) {
      setIsConversationListOpen(false);
    }
  };

  const toggleConversationList = () => {
    setConversationListOpen(!isConversationListOpen);
  };

  const toggleContactDetails = () => {
    setContactDetailsOpen(!isContactDetailsOpen);
  };

  const closeAllPanels = () => {
    setIsConversationListOpen(false);
    setIsContactDetailsOpen(false);
  };

  const value: MobileLayoutContextType = {
    isMobile,
    isTablet,
    isDesktop,
    isConversationListOpen,
    isContactDetailsOpen,
    setConversationListOpen,
    setContactDetailsOpen,
    toggleConversationList,
    toggleContactDetails,
    closeAllPanels,
  };

  return (
    <MobileLayoutContext.Provider value={value}>
      {children}
    </MobileLayoutContext.Provider>
  );
}

export function useMobileLayout() {
  const context = useContext(MobileLayoutContext);
  if (context === undefined) {
    throw new Error('useMobileLayout must be used within a MobileLayoutProvider');
  }
  return context;
}
