/**
 * Client-side protection and anti-tampering
 */
class ClientProtection {
  private static instance: ClientProtection;
  private protectionEnabled: boolean;
  private startTime: number;

  private constructor() {
    this.protectionEnabled = import.meta.env.PROD;
    this.startTime = Date.now();
    
    if (this.protectionEnabled) {
      this.initializeProtection();
    }
  }

  public static getInstance(): ClientProtection {
    if (!ClientProtection.instance) {
      ClientProtection.instance = new ClientProtection();
    }
    return ClientProtection.instance;
  }

  private initializeProtection(): void {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        return false;
      }
      
      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        return false;
      }
      
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        return false;
      }
      
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        return false;
      }
    });

    this.setupDevToolsDetection();
    
    this.setupConsoleProtection();
    
    this.setupDOMProtection();
  }

  private setupDevToolsDetection(): void {
    let devtools = {
      open: false,
      orientation: null as string | null
    };

    const threshold = 160;

    setInterval(() => {
      if (window.outerHeight - window.innerHeight > threshold || 
          window.outerWidth - window.innerWidth > threshold) {
        if (!devtools.open) {
          devtools.open = true;
          this.triggerProtection('devtools_opened');
        }
      } else {
        devtools.open = false;
      }
    }, 500);

    let element = document.createElement('div');
    element.id = 'devtools-detector';
    Object.defineProperty(element, 'id', {
      get: () => {
        this.triggerProtection('devtools_console_access');
        return 'devtools-detector';
      }
    });
  }

  private setupConsoleProtection(): void {

    const enableConsoleProtection = process.env.ENABLE_CONSOLE_PROTECTION === 'true';

    if (!enableConsoleProtection) {
      return;
    }

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args: any[]) => {
      if (this.protectionEnabled) {
        return;
      }
      originalLog.apply(console, args);
    };

    console.error = (...args: any[]) => {
      if (this.protectionEnabled) {
        return;
      }
      originalError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      if (this.protectionEnabled) {
        return;
      }
      originalWarn.apply(console, args);
    };

    if (this.protectionEnabled) {
      setInterval(() => {
        console.clear();
      }, 5000);
    }
  }

  private setupDOMProtection(): void {
    document.addEventListener('selectstart', (e) => {
      if (this.protectionEnabled) {
        e.preventDefault();
        return false;
      }
    });

    document.addEventListener('dragstart', (e) => {
      if (this.protectionEnabled) {
        e.preventDefault();
        return false;
      }
    });

    if (this.protectionEnabled) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element;
                if (element.tagName === 'SCRIPT' && 
                    !element.hasAttribute('data-allowed')) {
                  this.triggerProtection('unauthorized_script_injection');
                }
              }
            });
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  private triggerProtection(reason: string): void {
    if (this.protectionEnabled) {
      this.reportSecurityEvent(reason);
      
      setTimeout(() => {
        window.location.href = '/security-violation';
      }, 1000);
    }
  }

  private async reportSecurityEvent(reason: string): Promise<void> {
    try {
      await fetch('/api/security/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href
        })
      });
    } catch (error) {
    }
  }

  /**
   * Obfuscate sensitive data in client
   */
  public obfuscateData(data: string): string {
    if (!this.protectionEnabled) return data;
    
    return btoa(data).split('').reverse().join('');
  }

  /**
   * Deobfuscate sensitive data in client
   */
  public deobfuscateData(obfuscatedData: string): string {
    if (!this.protectionEnabled) return obfuscatedData;
    
    return atob(obfuscatedData.split('').reverse().join(''));
  }

  /**
   * Check if client is in secure state
   */
  public isSecure(): boolean {
    return this.protectionEnabled && 
           !window.location.href.includes('localhost') &&
           window.location.protocol === 'https:';
  }
}

export const clientProtection = ClientProtection.getInstance();

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      clientProtection;
    });
  } else {
    clientProtection;
  }
}
