/**
 * WhatsApp username resolution service.
 *
 * WhatsApp's 2026 usernames rollout lets users be reached via a unique @handle
 * instead of a phone number. On the unofficial (Baileys) channel we can resolve
 * a username to its LID JID live via a USync query (supported since Baileys
 * 7.0.0-rc14, optionally passing the user's "username key" PIN). On the
 * official Cloud API channel no lookup exists, so callers must rely on
 * contacts already stored in the database (captured from inbound webhooks).
 */
import { randomUUID } from 'crypto';
import { S_WHATSAPP_NET, USyncQuery, USyncUser, WASocket } from 'baileys';
import { normalizeUsername, validateUsername, extractLidFromJid } from './whatsapp-username-utils';

export {
  normalizeUsername,
  validateUsername,
  parseContactInput,
  extractLidFromJid,
  isBsuid,
  toLidJid,
  type ContactInputType,
  type ParsedContactInput
} from './whatsapp-username-utils';

export interface UsernameResolutionResult {
  exists: boolean;
  /** True only when WhatsApp explicitly signals a PIN is required (error node / keyRequired). */
  keyRequired?: boolean;
  /** True when MEX UsernameCheck says the handle is taken (owned by someone). */
  usernameTaken?: boolean;
  username: string;
  lid: string | null;
  jid: string | null;
}

const USERNAME_CHECK_QUERY_IDS = ['26124072630599518', '26124072630599520'] as const;

function parseUsernameUSyncResult(raw: any): {
  entries: Array<{
    id: string | null;
    contact: boolean | null;
    contactType: string | null;
    username: string | null;
    lid: string | null;
    errorCode: number | null;
    errorText: string | null;
  }>;
  keyRequired: boolean;
} {
  const usync = Array.isArray(raw?.content)
    ? raw.content.find((n: any) => n?.tag === 'usync')
    : undefined;
  const list = Array.isArray(usync?.content)
    ? usync.content.find((n: any) => n?.tag === 'list')
    : undefined;
  const users = Array.isArray(list?.content) ? list.content.filter((n: any) => n?.tag === 'user') : [];

  let keyRequired = false;
  const entries = users.map((userNode: any) => {
    const id = userNode?.attrs?.jid || userNode?.attrs?.lid || null;
    const children = Array.isArray(userNode?.content) ? userNode.content : [];
    let contact: boolean | null = null;
    let contactType: string | null = null;
    let username: string | null = null;
    let lid: string | null = null;
    let errorCode: number | null = null;
    let errorText: string | null = null;

    for (const child of children) {
      if (child?.tag === 'contact') {
        contactType = child?.attrs?.type ?? null;
        if (typeof child?.attrs?.username === 'string') username = child.attrs.username;
        const err = Array.isArray(child.content)
          ? child.content.find((c: any) => c?.tag === 'error')
          : undefined;
        if (err) {
          errorCode = err.attrs?.code != null ? Number(err.attrs.code) : null;
          errorText = err.attrs?.text || null;
          if (/pin|key/i.test(String(errorText || '')) || errorCode === 401 || errorCode === 403) {
            keyRequired = true;
          }
          contact = false;
        } else {
          contact = child?.attrs?.type === 'in';
        }
      } else if (child?.tag === 'lid') {
        lid = child?.attrs?.val || child?.attrs?.jid || null;
      } else if (child?.tag === 'username') {
        if (typeof child.content === 'string') username = child.content;
        else if (Buffer.isBuffer(child.content) || child.content instanceof Uint8Array) {
          username = Buffer.from(child.content).toString('utf8');
        }
      }
    }

    return { id, contact, contactType, username, lid, errorCode, errorText };
  });

  return { entries, keyRequired };
}

async function mexUsernameCheck(sock: WASocket, username: string): Promise<boolean | null> {
  for (const queryId of USERNAME_CHECK_QUERY_IDS) {
    try {
      const iq = {
        tag: 'iq',
        attrs: {
          to: S_WHATSAPP_NET,
          type: 'get',
          xmlns: 'w:mex'
        },
        content: [
          {
            tag: 'query',
            attrs: { query_id: queryId },
            content: Buffer.from(
              JSON.stringify({
                variables: {
                  username,
                  include_suggestions: true,
                  session_id: randomUUID(),
                  source: 'USER_INPUT'
                }
              }),
              'utf-8'
            )
          }
        ]
      };
      const result = await (sock as any).query(iq);
      const resultChild = Array.isArray(result?.content)
        ? result.content.find((n: any) => n?.tag === 'result')
        : undefined;
      if (!resultChild?.content) continue;
      const text =
        Buffer.isBuffer(resultChild.content) || resultChild.content instanceof Uint8Array
          ? Buffer.from(resultChild.content).toString('utf8')
          : typeof resultChild.content === 'string'
            ? resultChild.content
            : null;
      if (!text) continue;
      const parsed = JSON.parse(text);
      const check = parsed?.data?.xwa2_username_check;
      if (check?.result) {
        // SUCCESS means the handle is available (not taken).
        return check.result !== 'SUCCESS';
      }
    } catch {
      // Try next query id / fall through.
    }
  }
  return null;
}

async function usyncFindByUsername(
  sock: WASocket,
  username: string,
  pin?: string
): Promise<{ entries: ReturnType<typeof parseUsernameUSyncResult>['entries']; keyRequired: boolean }> {
  const pinAttrs = pin ? { pin: pin.trim() } : {};
  const iq = {
    tag: 'iq',
    attrs: {
      to: S_WHATSAPP_NET,
      type: 'get',
      xmlns: 'usync'
    },
    content: [
      {
        tag: 'usync',
        attrs: {
          context: 'interactive',
          mode: 'query',
          sid: `${Date.now()}`,
          last: 'true',
          index: '0'
        },
        content: [
          {
            tag: 'query',
            attrs: {},
            content: [{ tag: 'contact', attrs: {} }]
          },
          {
            tag: 'list',
            attrs: {},
            content: [
              {
                tag: 'user',
                attrs: {},
                content: [{ tag: 'contact', attrs: { username, ...pinAttrs } }]
              }
            ]
          }
        ]
      }
    ]
  };
  const raw = await (sock as any).query(iq);
  return parseUsernameUSyncResult(raw);
}

/**
 * Resolve a WhatsApp username to its LID JID over the wire using USync.
 */
export async function resolveUsernameViaUSync(
  sock: WASocket,
  usernameInput: string,
  pin?: string
): Promise<UsernameResolutionResult> {
  const username = normalizeUsername(usernameInput);
  if (!validateUsername(username)) {
    throw new Error(`Invalid WhatsApp username format: ${usernameInput}`);
  }
  if (!sock) {
    throw new Error('WhatsApp connection is not active');
  }

  const usernameTaken = await mexUsernameCheck(sock, username);

  let keyRequired = false;
  let hit: { id: string | null; lid: string | null } | null = null;

  try {
    const usync = await usyncFindByUsername(sock, username, pin);
    keyRequired = usync.keyRequired;
    const match = usync.entries.find((e) => e.contact === true && (e.id || e.lid));
    if (match) {
      hit = { id: match.id, lid: match.lid };
    }
  } catch {
    // Fall through to stock Baileys helper.
  }

  if (!hit && typeof (sock as any).executeUSyncQuery === 'function') {
    try {
      const user = new USyncUser().withUsername(username);
      if (pin) user.withUsernameKey(pin.trim());
      const parsed = await (sock as any).executeUSyncQuery(
        new USyncQuery().withContactProtocol().withContext('interactive').withUser(user)
      );
      const stock = parsed?.list?.[0];
      if (stock?.contact === true && stock.id) {
        hit = { id: stock.id, lid: typeof stock.lid === 'string' ? stock.lid : null };
      }
    } catch {
      // Leave unresolved.
    }
  }

  if (hit?.id || hit?.lid) {
    const jid =
      hit.id || (hit.lid?.includes('@') ? hit.lid : hit.lid ? `${hit.lid}@lid` : null);
    const lid =
      extractLidFromJid(jid) ||
      (hit.lid ? String(hit.lid).replace(/@lid$/i, '') : null);
    return {
      exists: true,
      username,
      jid,
      lid,
      usernameTaken: usernameTaken ?? undefined
    };
  }

  return {
    exists: false,
    keyRequired: keyRequired || undefined,
    usernameTaken: usernameTaken ?? undefined,
    username,
    lid: null,
    jid: null
  };
}
