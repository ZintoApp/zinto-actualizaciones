import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLocation } from 'wouter';
import { queryClient } from '@/lib/queryClient';
import { accountSessionRequest, installAccountNetwork, pauseAccountNetwork, pendingAccountWrites, resumeAccountNetwork } from '@/lib/account-network';
import { readStableAccountSession, registerAccountTab, TRANSITION_STORAGE_KEY } from '@/lib/account-tabs';
import { hasExecutedCompanyCustomJs } from '@/lib/company-customization';
import { resetMessageCache } from '@/services/message-cache';
import type { Company, User } from '@shared/schema';

export type AccountDestination = { destination?: string };
export type CompanySwitch = number | (AccountDestination & { companyId: number });
type Identity = { user: User | null; company: Company | null; impersonating: boolean };
type Stage = 'idle' | 'draining' | 'switching' | 'error';
const PUBLIC_QUERIES = new Set(['/public/custom-scripts', '/public/custom-css', '/public/branding']);
const safePath = (path: string) => {
  try {
    const url = new URL(path, window.location.origin);
    return path.startsWith('/') && url.origin === window.location.origin ? url.pathname + url.search + url.hash : '/';
  } catch { return '/'; }
};

export function useAccountSwitch() {
  const [, navigate] = useLocation();
  const [stage, setStage] = useState<Stage>(() => {
    installAccountNetwork();
    // A newly opened tab cannot fetch account data halfway through a switch.
    if (localStorage.getItem(TRANSITION_STORAGE_KEY)) { pauseAccountNetwork(); return 'switching'; }
    return 'idle';
  });
  const [switchError, setSwitchError] = useState<Error | null>(null);
  const [epoch, setEpoch] = useState(0);
  const busy = useRef(false);
  const recovering = useRef(false);
  const preparation = useRef<Promise<void> | null>(null);
  const intent = useRef<{ companyId?: number; destination: string }>();
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const callbacks = useRef({ prepare: async () => {}, reconcile: async () => {} });
  const tab = useRef<ReturnType<typeof registerAccountTab>>();
  const setPhase = (phase: Stage) => { stageRef.current = phase; flushSync(() => setStage(phase)); };

  const prepareWork = async () => {
    setSwitchError(null);
    setPhase('draining');
    const deadline = Date.now() + 14000;
    // Keep providers mounted until submitted mutations (including their success
    // callbacks and follow-up requests) finish; the overlay blocks new UI actions.
    while (pendingAccountWrites() || queryClient.isMutating({ predicate: mutation => !mutation.options.meta?.accountSwitch })) {
      if (Date.now() > deadline) {
        // No session request has been sent. Keep the mounted form, upload and
        // socket alive so the existing business operation can still finish.
        setPhase('idle');
        throw new Error('Pending operations have not finished');
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    setPhase('switching'); // Unmount account providers and their subscriptions first.
    pauseAccountNetwork();
    await queryClient.cancelQueries({ predicate: query => !PUBLIC_QUERIES.has(String(query.queryKey[0])) });
  };
  const prepare = () => {
    if (!preparation.current) preparation.current = prepareWork().finally(() => { preparation.current = null; });
    return preparation.current;
  };

  const verify = async (): Promise<Identity> => {
    let user: User;
    try { user = await accountSessionRequest('/api/user'); }
    catch (error) {
      if ((error as { status?: number }).status === 401) return { user: null, company: null, impersonating: false };
      throw error;
    }
    if (!user || !Number.isSafeInteger(user.id)) throw new Error('Invalid account response');
    const company = user.companyId && !user.isSuperAdmin ? (await accountSessionRequest('/api/user/with-company')).company : null;
    if (user.companyId && !user.isSuperAdmin && company?.id !== user.companyId) throw new Error('Invalid company response');
    const impersonating = !!company && (await accountSessionRequest('/api/guided-tours/authoring')).allowed === true;
    return { user, company, impersonating };
  };

  const commit = async (identity: Identity, destination?: string) => {
    // Stale persistent data is disposable. Keep preferences and editor return
    // state; never use localStorage.clear()/sessionStorage.clear() here.
    await resetMessageCache();
    for (const key of ['bothive_active_channel_id', 'selectedContactId', 'selectedChannelType', 'selectedChannelId', 'whatsapp-call-event-cursor', 'originalSuperAdminId']) {
      localStorage.removeItem(key); sessionStorage.removeItem(key);
    }
    for (const storage of [localStorage, sessionStorage]) {
      if (identity.impersonating) storage.setItem('isImpersonating', 'true');
      else storage.removeItem('isImpersonating');
    }
    // Keep public platform customization observers intact: reinjecting global
    // scripts could duplicate their timers/listeners during a soft transition.
    queryClient.removeQueries({ predicate: query => !PUBLIC_QUERIES.has(String(query.queryKey[0])) });
    queryClient.getMutationCache().clear();
    queryClient.setQueryData(['/api/user'], identity.user);
    queryClient.setQueryData(['/api/user/with-company'], identity.company);
    const path = safePath(destination || (identity.user?.isSuperAdmin ? '/admin/dashboard' : '/'));
    if (hasExecutedCompanyCustomJs()) {
      window.location.replace(identity.user ? path : '/admin/login?returnTo=%2Fadmin%2Fguided-tours');
      return;
    }
    if (!identity.user) {
      setSwitchError(new Error('Administrator sign-in required'));
      setPhase('error');
      return;
    }
    // Route guards never see the new identity paired with the previous route.
    navigate(path, { replace: true });
    resumeAccountNetwork();
    setSwitchError(null);
    setEpoch(value => value + 1);
    setPhase('idle');
  };

  const reconcile = async () => {
    if (busy.current || recovering.current) return;
    recovering.current = true;
    try {
      if (preparation.current) await preparation.current;
      if (stageRef.current === 'idle' && !intent.current) {
        const unchanged = await readStableAccountSession(async () => {
          const identity = await verify();
          const current = queryClient.getQueryData<User>(['/api/user']);
          return !!identity.user && current?.id === identity.user.id && current?.companyId === identity.user.companyId && current?.isSuperAdmin === identity.user.isSuperAdmin && current?.role === identity.user.role;
        });
        // A cancelled switch in another tab must not interrupt an outstanding
        // save here. Browser notices alone never establish this identity check.
        if (unchanged) return;
      }
      if (stageRef.current !== 'switching') await prepare();
      await readStableAccountSession(async () => {
        const currentPath = window.location.pathname + window.location.search;
        const identity = await verify();
        const canKeepPath = identity.user?.isSuperAdmin ? currentPath.startsWith('/admin') : !currentPath.startsWith('/admin');
        const arrived = intent.current && (intent.current.companyId ? identity.user?.companyId === intent.current.companyId && identity.impersonating : identity.user?.isSuperAdmin);
        await commit(identity, arrived ? intent.current?.destination : canKeepPath ? currentPath : undefined);
      });
      intent.current = undefined;
    } catch (error) { pauseAccountNetwork(); setSwitchError(error as Error); setPhase('error'); }
    finally { recovering.current = false; }
  };
  callbacks.current = { prepare, reconcile };
  useEffect(() => {
    tab.current = registerAccountTab(() => callbacks.current.prepare(), () => callbacks.current.reconcile());
    const recover = async () => {
      // Also recover tabs opened during a transition, or when its owner closed.
      if (stageRef.current !== 'idle' && !busy.current) {
        const locks = await navigator.locks?.query();
        if (!locks?.held?.some(lock => lock.name === 'bothive-workspace-switch')) void callbacks.current.reconcile();
      }
    };
    window.addEventListener('focus', recover);
    const onStorage = (event: StorageEvent) => {
      if (event.key === TRANSITION_STORAGE_KEY && !event.newValue) void recover();
    };
    window.addEventListener('storage', onStorage);
    if (stageRef.current !== 'idle') void recover();
    return () => { tab.current?.dispose(); window.removeEventListener('focus', recover); window.removeEventListener('storage', onStorage); };
  }, []);

  const switchAccount = async (companyId?: number, destination?: string) => {
    if (companyId !== undefined && (!Number.isSafeInteger(companyId) || companyId <= 0)) throw new Error('Invalid company');
    if (busy.current || recovering.current || stageRef.current !== 'idle') throw new Error('An account switch is already in progress');
    busy.current = true;
    const previous = queryClient.getQueryData<User>(['/api/user']);
    const previousPath = window.location.pathname + window.location.search;
    const target = safePath(destination || (companyId ? '/' : '/admin/dashboard'));
    intent.current = { companyId, destination: target };
    try {
      if (!tab.current) throw new Error('Workspace is not ready');
      await tab.current.run(async () => {
        let failure: unknown;
        try { await accountSessionRequest(companyId ? `/api/admin/impersonate/${companyId}` : '/api/admin/return-from-impersonation', 'POST'); }
        catch (error) { failure = error; }
        // A lost response may follow a successful switch. Never retry the POST
        // until the current session has been reconciled with the server.
        const identity = await verify();
        const arrived = companyId ? identity.user?.companyId === companyId && identity.impersonating : identity.user?.isSuperAdmin;
        if (arrived) await commit(identity, target);
        else if (identity.user?.id === previous?.id) {
          await commit(identity, previousPath);
          throw failure || new Error('Account switch was not completed');
        } else await commit(identity);
        intent.current = undefined;
      });
    } catch (error) {
      setSwitchError(error as Error);
      if (stageRef.current !== 'idle') { pauseAccountNetwork(); setPhase('error'); }
      else intent.current = undefined;
      throw error;
    } finally { busy.current = false; }
  };

  return {
    stage, epoch, switchError, switchAccount, retry: reconcile,
    signIn: () => {
      queryClient.clear();
      // A full navigation here is the existing administrator sign-in recovery,
      // and also discards any untrusted company script effects.
      window.location.replace('/admin/login?returnTo=%2Fadmin%2Fguided-tours');
    },
  };
}
