import { IStorageProvider } from './storage-provider.interface';
import { LocalStorageProvider } from './local-storage-provider';
import { GoogleDriveStorageProvider } from './google-drive-storage-provider';

/**
 * Storage Provider Registry
 * Manages registration and retrieval of storage providers
 */
export class StorageProviderRegistry {
  private providers: Map<string, IStorageProvider> = new Map();
  private static instance: StorageProviderRegistry;

  private constructor() {

  }

  /**
   * Get singleton instance
   */
  static getInstance(): StorageProviderRegistry {
    if (!StorageProviderRegistry.instance) {
      StorageProviderRegistry.instance = new StorageProviderRegistry();
    }
    return StorageProviderRegistry.instance;
  }

  /**
   * Register a storage provider
   */
  register(provider: IStorageProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Get a storage provider by name
   */
  get(name: string): IStorageProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Check if a provider is registered
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Validate storage locations against registered providers
   */
  validateStorageLocations(locations: string[]): { valid: boolean; invalidProviders: string[] } {
    const invalidProviders: string[] = [];
    
    for (const location of locations) {
      if (!this.has(location)) {
        invalidProviders.push(location);
      }
    }

    return {
      valid: invalidProviders.length === 0,
      invalidProviders
    };
  }

  /**
   * Initialize default providers
   */
  initializeDefaultProviders(backupDir: string): void {

    this.register(new LocalStorageProvider(backupDir));


    this.register(new GoogleDriveStorageProvider());
  }
}


export const storageProviderRegistry = StorageProviderRegistry.getInstance();

