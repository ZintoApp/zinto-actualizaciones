import { initAuthCreds, BufferJSON, type AuthenticationState } from 'baileys';
import type { IStorage } from '../../storage';

/**
 * In-memory write-through cache key: "${keyType}:${keyId}"
 */
const cacheKey = (keyType: string, keyId: string) => `${keyType}:${keyId}`;

/**
 * Deserialize JSONB row data that may contain Buffer placeholders from BufferJSON.
 */
function deserializeData(data: any): any {
  if (data == null) return data;
  const str = JSON.stringify(data);
  return JSON.parse(str, BufferJSON.reviver);
}

/**
 * Serialize value to a JSONB-safe plain object (Buffer -> { type: 'Buffer', data: [...] }).
 */
function serializeForJsonb(value: any): any {
  const str = JSON.stringify(value, BufferJSON.replacer);
  return JSON.parse(str);
}

export async function usePostgresAuthState(
  connectionId: number,
  storage: IStorage
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const cache = new Map<string, any>();

  // Initialization: load creds
  const credsRows = await storage.getWhatsappAuthStateByType(connectionId, 'creds');
  let creds: any;
  if (credsRows.length > 0) {
    const row = credsRows[0];
    creds = deserializeData(row.data);
  } else {
    creds = initAuthCreds();
  }

  const keys = {
    get: async (type: string, ids: string[]): Promise<Record<string, any>> => {
      const result: Record<string, any> = {};
      const misses: string[] = [];
      for (const id of ids) {
        const key = cacheKey(type, id);
        const cached = cache.get(key);
        if (cached !== undefined) {
          result[id] = cached;
        } else {
          misses.push(id);
        }
      }
      if (misses.length > 0) {
        const rows = await storage.getWhatsappAuthStateByType(connectionId, type);
        for (const row of rows) {
          const value = deserializeData(row.data);
          cache.set(cacheKey(type, row.keyId), value);
          if (ids.includes(row.keyId)) {
            result[row.keyId] = value;
          }
        }
      }
      return result;
    },
    set: async (data: Record<string, Record<string, any | null>>): Promise<void> => {
      const batch: Array<{ connectionId: number; keyType: string; keyId: string; data: any }> = [];
      const deletes: Array<{ connectionId: number; type: string; id: string }> = [];
      for (const [type, idMap] of Object.entries(data)) {
        for (const [id, value] of Object.entries(idMap)) {
          const key = cacheKey(type, id);
          if (value == null) {
            cache.delete(key);
            deletes.push({ connectionId, type, id });
          } else {
            const jsonbSafe = serializeForJsonb(value);
            cache.set(key, value);
            batch.push({ connectionId, keyType: type, keyId: id, data: jsonbSafe });
          }
        }
      }
      for (const { connectionId, type, id } of deletes) {
        await storage.deleteWhatsappAuthStateKey(connectionId, type, id);
      }
      if (batch.length > 0) {
        await storage.saveWhatsappAuthStateBatch(batch);
      }
    },
  };

  const state: AuthenticationState = {
    creds,
    keys,
  };

  async function saveCreds(): Promise<void> {
    const serialized = serializeForJsonb(state.creds);
    await storage.saveWhatsappAuthState(connectionId, 'creds', 'default', serialized);
  }

  return { state, saveCreds };
}
