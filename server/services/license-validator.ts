import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDecipheriv, createHash } from 'crypto';
import os from 'os';
import { logger } from '../utils/logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const ENCRYPTION_KEY = 'bothive-license-key-2024-secur';
const ALGORITHM = 'aes-256-cbc';

interface LicenseData {
  expiryDate: string;
  allowedIps: string[];
  generatedAt: string;
  signature: string;
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
  expiryDate?: Date;
  allowedIps?: string[];
}

class LicenseValidator {
  private static instance: LicenseValidator;
  private licenseData: LicenseData | null = null;
  private validationCache: { result: ValidationResult; timestamp: number } | null = null;
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private licenseFilePath: string;
  private licensedMarkerPath: string = '';
  private cachedServerIps: string[] | null = null;
  private ipCacheTimestamp: number = 0;
  private ipCacheTimeout = 10 * 60 * 1000; // 10 minutes

  private constructor() {
    
    const possiblePaths = [
      path.join(__dirname, 'license'), 
      path.join(__dirname, '.license'), 
      path.join(process.cwd(), 'dist', 'license'), 
      path.join(process.cwd(), 'dist', '.license'), 
      path.join(__dirname, '../../dist/license'), 
      path.join(__dirname, '../../dist/.license'), 
      path.join(process.cwd(), 'license'), 
      path.join(process.cwd(), '.license'), 
    ];

    
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        this.licenseFilePath = possiblePath;
        logger.info('license', `License file found at: ${possiblePath}`);
        return;
      }
    }

    this.licenseFilePath = path.join(__dirname, 'license');
    logger.warn('license', `License file not found. Using path: ${this.licenseFilePath}`);
    logger.info('license', `Current working directory: ${process.cwd()}`);
    logger.info('license', `__dirname: ${__dirname}`);
    logger.info('license', `Checked paths: ${possiblePaths.join(', ')}`);
    

    const markerPaths = [
      path.join(__dirname, '.licensed'),
      path.join(process.cwd(), 'dist', '.licensed'),
      path.join(__dirname, '../../dist/.licensed'),
      path.join(process.cwd(), '.licensed'),
    ];
    
    for (const markerPath of markerPaths) {
      if (fs.existsSync(markerPath)) {
        this.licensedMarkerPath = markerPath;
        break;
      }
    }
    
    if (!this.licensedMarkerPath) {
      this.licensedMarkerPath = path.join(__dirname, '.licensed');
    }
  }

  public static getInstance(): LicenseValidator {
    if (!LicenseValidator.instance) {
      LicenseValidator.instance = new LicenseValidator();
    }
    return LicenseValidator.instance;
  }

  private getEncryptionKey(): Buffer {
    return Buffer.from(ENCRYPTION_KEY, 'utf8');
  }

  private decryptLicense(encryptedLicense: string): LicenseData | null {
    try {
      const [ivHex, encrypted] = encryptedLicense.split(':');
      if (!ivHex || !encrypted) {
        logger.error('license', 'Invalid license format: missing IV or encrypted data');
        return null;
      }

      const iv = Buffer.from(ivHex, 'hex');
      if (iv.length !== 16) {
        logger.error('license', `Invalid IV length: ${iv.length}, expected 16`);
        return null;
      }

      const encryptionKey = this.getEncryptionKey();
      const decipher = createDecipheriv(ALGORITHM, encryptionKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const licenseData: LicenseData = JSON.parse(decrypted);
      return licenseData;
    } catch (error: any) {
      if (error.code === 'ERR_OSSL_BAD_DECRYPT') {
        logger.error('license', 'Failed to decrypt license: Encryption key mismatch. The license file may have been encrypted with a different key.');
        logger.error('license', 'Please rebuild the license file using npm run build:licensed');
      } else {
        logger.error('license', 'Failed to decrypt license:', error);
      }
      return null;
    }
  }

  private verifySignature(licenseData: LicenseData): boolean {
    try {
      const { signature, ...dataWithoutSignature } = licenseData;
      const expectedSignature = createHash('sha256')
        .update(JSON.stringify(dataWithoutSignature))
        .digest('hex');
      return signature === expectedSignature;
    } catch (error) {
      logger.error('license', 'Failed to verify license signature:', error);
      return false;
    }
  }

  private readLicenseFile(): LicenseData | null {
    try {

      if (!fs.existsSync(this.licenseFilePath)) {


        const possiblePaths = [
          path.join(__dirname, 'license'), 
          path.join(__dirname, '.license'), 
          path.join(process.cwd(), 'dist', 'license'), 
          path.join(process.cwd(), 'dist', '.license'), 
          path.join(__dirname, '../../dist/license'), 
          path.join(__dirname, '../../dist/.license'), 
          path.join(process.cwd(), 'license'), 
          path.join(process.cwd(), '.license'), 
        ];

        let foundPath: string | null = null;
        for (const possiblePath of possiblePaths) {
          if (fs.existsSync(possiblePath)) {
            foundPath = possiblePath;
            logger.info('license', `License file found at alternative location: ${foundPath}`);
            this.licenseFilePath = foundPath; 
            break;
          }
        }

        if (!foundPath) {
          logger.error('license', `License file not found at: ${this.licenseFilePath}`);
          logger.error('license', `Current working directory: ${process.cwd()}`);
          logger.error('license', `__dirname: ${__dirname}`);
          logger.error('license', `Checked paths: ${possiblePaths.join(', ')}`);
          

          try {
            const dirFiles = fs.readdirSync(__dirname);
            logger.error('license', `Files in __dirname (${__dirname}): ${dirFiles.join(', ')}`);
          } catch (e) {
            logger.error('license', `Could not read __dirname: ${e}`);
          }
          

          const distPath = path.join(process.cwd(), 'dist');
          if (fs.existsSync(distPath)) {
            try {
              const distFiles = fs.readdirSync(distPath);
              logger.error('license', `Files in dist/ (${distPath}): ${distFiles.join(', ')}`);
            } catch (e) {
              logger.error('license', `Could not read dist directory: ${e}`);
            }
          } else {
            logger.error('license', `dist/ directory does not exist at: ${distPath}`);
          }
          
          return null;
        }
      }

      const encryptedLicense = fs.readFileSync(this.licenseFilePath, 'utf8');
      const licenseData = this.decryptLicense(encryptedLicense);

      if (!licenseData) {
        return null;
      }

      if (!this.verifySignature(licenseData)) {
        logger.warn('license', 'License signature verification failed');
        return null;
      }

      return licenseData;
    } catch (error) {
      logger.error('license', 'Failed to read license file:', error);
      return null;
    }
  }

  private getServerIpAddresses(): string[] {

    if (this.cachedServerIps && Date.now() - this.ipCacheTimestamp < this.ipCacheTimeout) {
      return this.cachedServerIps;
    }

    const ipAddresses: string[] = [];


    if (process.env.SERVER_IP) {
      const serverIp = process.env.SERVER_IP.trim();
      if (serverIp) {
        ipAddresses.push(serverIp);
        logger.info('license', `Using SERVER_IP from environment: ${serverIp}`);
        this.cachedServerIps = ipAddresses;
        this.ipCacheTimestamp = Date.now();
        return ipAddresses;
      }
    }


    const interfaces = os.networkInterfaces();
    for (const interfaceName in interfaces) {
      const addresses = interfaces[interfaceName];
      if (!addresses) continue;

      for (const address of addresses) {
        if (address.family === 'IPv4' && !address.internal) {

          if (!address.address.startsWith('172.17.') && 
              !address.address.startsWith('172.18.') &&
              !address.address.startsWith('172.19.') &&
              !address.address.startsWith('172.20.') &&
              !address.address.startsWith('172.21.') &&
              !address.address.startsWith('172.22.') &&
              !address.address.startsWith('172.23.') &&
              !address.address.startsWith('172.24.') &&
              !address.address.startsWith('172.25.') &&
              !address.address.startsWith('172.26.') &&
              !address.address.startsWith('172.27.') &&
              !address.address.startsWith('172.28.') &&
              !address.address.startsWith('172.29.') &&
              !address.address.startsWith('172.30.') &&
              !address.address.startsWith('172.31.') &&
              !address.address.startsWith('10.') &&
              !address.address.startsWith('192.168.')) {
            ipAddresses.push(address.address);
            logger.debug('license', `Detected network interface IP: ${address.address}`);
          }
        }
      }
    }


    this.cachedServerIps = ipAddresses;
    this.ipCacheTimestamp = Date.now();

    return ipAddresses;
  }

  private async fetchPublicIpAsync(): Promise<string | null> {
    try {
      const publicIpResponse = await fetch('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      if (publicIpResponse.ok) {
        const data = await publicIpResponse.json();
        if (data.ip) {

          if (!this.cachedServerIps?.includes(data.ip)) {
            this.cachedServerIps = [...(this.cachedServerIps || []), data.ip];
            logger.info('license', `✅ Detected public IP: ${data.ip}`);
          }
          return data.ip;
        }
      }
    } catch (error) {
      logger.warn('license', 'Could not fetch public IP from external service:', error);

      try {
        const altResponse = await fetch('https://icanhazip.com', {
          signal: AbortSignal.timeout(5000)
        });
        if (altResponse.ok) {
          const publicIp = (await altResponse.text()).trim();
          if (publicIp && !this.cachedServerIps?.includes(publicIp)) {
            this.cachedServerIps = [...(this.cachedServerIps || []), publicIp];
            logger.info('license', `✅ Detected public IP (alternative service): ${publicIp}`);
            return publicIp;
          }
        }
      } catch (altError) {
        logger.warn('license', 'Could not fetch public IP from alternative service:', altError);
      }
    }
    return null;
  }

  private matchesIpPattern(ip: string, pattern: string): boolean {
    if (pattern === ip) {
      return true;
    }

    if (pattern.includes('*')) {
      const patternParts = pattern.split('.');
      const ipParts = ip.split('.');

      if (patternParts.length !== ipParts.length) {
        return false;
      }

      for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i] !== '*' && patternParts[i] !== ipParts[i]) {
          return false;
        }
      }

      return true;
    }

    return false;
  }

  private checkIpAgainstAllowedIps(ip: string, allowedIps: string[]): boolean {
    for (const allowedIp of allowedIps) {
      if (this.matchesIpPattern(ip, allowedIp)) {
        return true;
      }
    }
    return false;
  }

  public async validateLicense(): Promise<ValidationResult> {
    if (process.env.NODE_ENV !== 'production') {
      return { valid: true };
    }

    if (process.env.SKIP_LICENSE_CHECK === 'true') {
      return { valid: true };
    }


    const markerPaths = [
      path.join(__dirname, '.licensed'),
      path.join(process.cwd(), 'dist', '.licensed'),
      path.join(__dirname, '../../dist/.licensed'),
      path.join(process.cwd(), '.licensed'),
    ];
    
    const isLicensedBuild = markerPaths.some(p => fs.existsSync(p));
    

    if (!isLicensedBuild) {
      return { valid: true };
    }
    

    if (!fs.existsSync(this.licenseFilePath)) {

      const possiblePaths = [
        path.join(__dirname, 'license'),
        path.join(__dirname, '.license'),
        path.join(process.cwd(), 'dist', 'license'),
        path.join(process.cwd(), 'dist', '.license'),
        path.join(__dirname, '../../dist/license'),
        path.join(__dirname, '../../dist/.license'),
        path.join(process.cwd(), 'license'),
        path.join(process.cwd(), '.license'),
      ];

      const licenseExists = possiblePaths.some(p => fs.existsSync(p));
      if (!licenseExists) {

        const result: ValidationResult = {
          valid: false,
          reason: 'License file not found (licensed build detected but license file is missing)'
        };
        this.validationCache = { result, timestamp: Date.now() };
        return result;
      }
    }

    if (this.validationCache && Date.now() - this.validationCache.timestamp < this.cacheTimeout) {
      return this.validationCache.result;
    }

    const licenseData = this.readLicenseFile();

    if (!licenseData) {
      const result: ValidationResult = {
        valid: false,
        reason: 'License file not found'
      };
      this.validationCache = { result, timestamp: Date.now() };
      return result;
    }

    const expiryDate = new Date(licenseData.expiryDate);
    const now = new Date();

    if (expiryDate <= now) {
      const result: ValidationResult = {
        valid: false,
        reason: 'License expired',
        expiryDate,
        allowedIps: licenseData.allowedIps
      };
      this.validationCache = { result, timestamp: Date.now() };
      return result;
    }

    let serverIps = this.getServerIpAddresses();


    if (serverIps.length === 0 || serverIps.every(ip => ip.startsWith('172.') || ip.startsWith('10.') || ip.startsWith('192.168.'))) {

      try {
        const publicIp = await Promise.race([
          this.fetchPublicIpAsync(),
          new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 2000))
        ]);
        if (publicIp) {
          serverIps = this.getServerIpAddresses(); // Refresh from cache
        }
      } catch (error) {
        logger.debug('license', 'Could not fetch public IP during validation:', error);
      }
    }

    if (serverIps.length === 0) {
      const result: ValidationResult = {
        valid: false,
        reason: 'No server IP addresses found',
        expiryDate,
        allowedIps: licenseData.allowedIps
      };
      this.validationCache = { result, timestamp: Date.now() };
      return result;
    }

    let ipAllowed = false;
    for (const serverIp of serverIps) {
      if (this.checkIpAgainstAllowedIps(serverIp, licenseData.allowedIps)) {
        ipAllowed = true;
        break;
      }
    }

    if (!ipAllowed) {
      logger.warn('license', `Server IP addresses (${serverIps.join(', ')}) do not match allowed IPs (${licenseData.allowedIps.join(', ')})`);
      const result: ValidationResult = {
        valid: false,
        reason: 'Server IP address is not authorized',
        expiryDate,
        allowedIps: licenseData.allowedIps
      };
      this.validationCache = { result, timestamp: Date.now() };
      return result;
    }

    const result: ValidationResult = {
      valid: true,
      expiryDate,
      allowedIps: licenseData.allowedIps
    };

    this.validationCache = { result, timestamp: Date.now() };
    this.licenseData = licenseData;

    return result;
  }

  public getLicenseInfo(): { expiryDate?: Date; allowedIps?: string[]; daysRemaining?: number } | null {
    if (process.env.NODE_ENV !== 'production') {
      return null;
    }

    const licenseData = this.licenseData || this.readLicenseFile();
    if (!licenseData) {
      return null;
    }

    const expiryDate = new Date(licenseData.expiryDate);
    const now = new Date();
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      expiryDate,
      allowedIps: licenseData.allowedIps.map(ip => {
        if (ip.includes('*')) {
          return ip;
        }
        const parts = ip.split('.');
        return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
      }),
      daysRemaining
    };
  }

  public async isLicenseExpired(): Promise<boolean> {
    const validation = await this.validateLicense();
    return !validation.valid && validation.reason === 'License expired';
  }

  public async isIpAllowed(): Promise<boolean> {
    const validation = await this.validateLicense();
    if (!validation.valid) {
      return false;
    }

    const serverIps = this.getServerIpAddresses();
    if (serverIps.length === 0) {
      return false;
    }

    if (!validation.allowedIps) {
      return false;
    }

    for (const serverIp of serverIps) {
      if (this.checkIpAgainstAllowedIps(serverIp, validation.allowedIps)) {
        return true;
      }
    }

    return false;
  }

  public invalidateCache(): void {
    this.validationCache = null;
    this.licenseData = null;
    this.cachedServerIps = null;
    this.ipCacheTimestamp = 0;
  }

  public async initializeIpDetection(): Promise<void> {

    this.getServerIpAddresses();

    const publicIp = await this.fetchPublicIpAsync();
    if (publicIp) {
      logger.info('license', `Public IP detected: ${publicIp}`);
    } else {
      logger.warn('license', 'Could not automatically detect public IP. License validation may fail if server is behind a proxy.');
      logger.warn('license', 'Detected IPs:', this.cachedServerIps || []);
    }
  }
}

export const licenseValidator = LicenseValidator.getInstance();

