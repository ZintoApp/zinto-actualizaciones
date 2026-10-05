import crypto from 'crypto';
import { performance } from 'perf_hooks';

/**
 * Runtime protection and anti-tampering system
 */
class RuntimeProtection {
  private static instance: RuntimeProtection;
  private startTime: number;
  private checksumMap: Map<string, string> = new Map();
  private protectionEnabled: boolean;

  private constructor() {
    this.startTime = Date.now();
    this.protectionEnabled = process.env.NODE_ENV === 'production';
    
    if (this.protectionEnabled) {
      this.initializeProtection();
    }
  }

  public static getInstance(): RuntimeProtection {
    if (!RuntimeProtection.instance) {
      RuntimeProtection.instance = new RuntimeProtection();
    }
    return RuntimeProtection.instance;
  }

  private initializeProtection(): void {
    this.setupAntiDebugging();
    
    this.setupIntegrityChecks();
    
    this.validateEnvironment();
    
    this.setupProcessMonitoring();
  }

  private setupAntiDebugging(): void {
    const antiDebug = () => {
      const start = performance.now();
      
      debugger;
      
      const end = performance.now();
      const timeDiff = end - start;
      
      if (timeDiff > 100) {
        console.error('🚨 Debugging attempt detected');
        this.triggerProtection('debugging_detected');
      }
    };

    setInterval(antiDebug, 5000 + Math.random() * 5000);

    const detectDevTools = () => {
      const threshold = 160;
      
      if (typeof window !== 'undefined') {
        if (window.outerHeight - window.innerHeight > threshold ||
            window.outerWidth - window.innerWidth > threshold) {
          this.triggerProtection('devtools_detected');
        }
      }
    };

    if (typeof window !== 'undefined') {
      setInterval(detectDevTools, 1000);
    }
  }

  private setupIntegrityChecks(): void {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    
    setInterval(() => {
      if (console.log !== originalConsoleLog || console.error !== originalConsoleError) {
        this.triggerProtection('console_tampering');
      }
    }, 3000);

    const forbiddenGlobals = [
      'webkitStorageInfo',
      'webkitIndexedDB',
      '__REACT_DEVTOOLS_GLOBAL_HOOK__',
      '__VUE_DEVTOOLS_GLOBAL_HOOK__'
    ];

    if (typeof global !== 'undefined') {
      setInterval(() => {
        forbiddenGlobals.forEach(prop => {
          if (prop in global) {
            this.triggerProtection(`forbidden_global_${prop}`);
          }
        });
      }, 2000);
    }
  }

  private validateEnvironment(): void {
    const suspiciousEnvVars = [
      'NODE_INSPECTOR',
      'NODE_DEBUG',
      'DEBUG',
      'VSCODE_INSPECTOR_OPTIONS'
    ];

    suspiciousEnvVars.forEach(envVar => {
      if (process.env[envVar]) {
        
        if (this.protectionEnabled) {
          this.triggerProtection(`suspicious_env_${envVar}`);
        }
      }
    });

    const suspiciousFlags = [
      '--inspect',
      '--inspect-brk',
      '--debug',
      '--debug-brk'
    ];

    const nodeArgs = process.execArgv.join(' ');
    suspiciousFlags.forEach(flag => {
      if (nodeArgs.includes(flag)) {
        this.triggerProtection(`suspicious_flag_${flag}`);
      }
    });
  }

  private setupProcessMonitoring(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const uptime = process.uptime();
      
      if (memUsage.heapUsed > 500 * 1024 * 1024) {
        
      }
      
      if (uptime < 10 && Date.now() - this.startTime > 60000) {
        this.triggerProtection('rapid_restart');
      }
    }, 10000);

    process.on('SIGUSR1', () => {
      this.triggerProtection('sigusr1_signal');
    });

    process.on('SIGUSR2', () => {
      this.triggerProtection('sigusr2_signal');
    });
  }

  private triggerProtection(reason: string): void {
    console.error(`🚨 Security violation detected: ${reason}`);
    
    if (this.protectionEnabled) {
      this.logSecurityEvent(reason);
      
      setTimeout(() => {
        process.exit(1);
      }, Math.random() * 2000 + 1000);
    }
  }

  private logSecurityEvent(reason: string): void {
    const event = {
      timestamp: new Date().toISOString(),
      reason,
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      env: process.env.NODE_ENV
    };

    console.error('Security Event:', JSON.stringify(event));
  }

  /**
   * Validate code integrity using checksums
   */
  public validateCodeIntegrity(filePath: string, expectedChecksum: string): boolean {
    try {
      const fs = require('fs');
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const actualChecksum = crypto.createHash('sha256').update(fileContent).digest('hex');
      
      if (actualChecksum !== expectedChecksum) {
        this.triggerProtection(`integrity_violation_${filePath}`);
        return false;
      }
      
      return true;
    } catch (error) {
      this.triggerProtection(`integrity_check_failed_${filePath}`);
      return false;
    }
  }

  /**
   * Obfuscate sensitive strings at runtime
   */
  public obfuscateString(str: string): string {
    if (!this.protectionEnabled) return str;
    
    const key = 0x5A;
    return str.split('').map(char => 
      String.fromCharCode(char.charCodeAt(0) ^ key)
    ).join('');
  }

  /**
   * Deobfuscate sensitive strings at runtime
   */
  public deobfuscateString(obfuscatedStr: string): string {
    if (!this.protectionEnabled) return obfuscatedStr;
    
    const key = 0x5A;
    return obfuscatedStr.split('').map(char => 
      String.fromCharCode(char.charCodeAt(0) ^ key)
    ).join('');
  }

  /**
   * Check if the application is running in a secure environment
   */
  public isSecureEnvironment(): boolean {
    return this.protectionEnabled && 
           process.env.NODE_ENV === 'production' &&
           !process.env.NODE_INSPECTOR &&
           !process.env.DEBUG;
  }
}

export const runtimeProtection = RuntimeProtection.getInstance();
