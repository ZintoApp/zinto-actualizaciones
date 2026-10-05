import { createContext, ReactNode, useContext } from "react";
import { useQuery, useMutation, type UseMutationResult } from "@tanstack/react-query";
import { User as SelectUser, Company, insertUserSchema } from "@shared/schema";
import { queryClient, getQueryFn, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useAccountSwitch, type AccountDestination, type CompanySwitch } from './use-account-switch';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';


type AuthContextType = {
  user: SelectUser | null;
  company: Company | null;
  isLoading: boolean;
  isMaintenanceMode: boolean;
  isLoadingMaintenance: boolean;
  error: Error | null;
  isImpersonating: boolean;
  isSwitchingAccount: boolean;
  switchError: Error | null;
  loginMutation: any;
  adminLoginMutation: any;
  logoutMutation: any;
  registerMutation: any;
  impersonateCompanyMutation: UseMutationResult<void, Error, CompanySwitch>;
  returnFromImpersonationMutation: UseMutationResult<void, Error, AccountDestination | void>;
};

type LoginData = {
  username: string;
  password: string;
};

const registerSchema = insertUserSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type RegisterData = z.infer<typeof registerSchema>;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const transition = useAccountSwitch();
  const suspended = transition.stage === 'switching' || transition.stage === 'error';


  const isOnAuthPage = window.location.pathname === '/auth' || 
                      window.location.pathname === '/login' || 
                      window.location.pathname === '/register';

  const {
    data: user,
    error,
    isLoading: isLoadingUser,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ['/api/user'],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !isOnAuthPage && transition.stage === 'idle', // Don't run on auth pages
  });

  const {
    data: company,
    isLoading: isLoadingCompany,
  } = useQuery<Company | null, Error>({
    queryKey: ['/api/user/with-company'],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", "/api/user/with-company");
        if (!res.ok) return null;
        const data = await res.json();
        return data.company;
      } catch (error) {
        console.error("Error fetching company data:", error);
        return null;
      }
    },
    enabled: !!user && !!user.companyId && !user.isSuperAdmin && transition.stage === 'idle',
  });



  const isImpersonating = !!(user?.companyId && !user?.isSuperAdmin &&
    (sessionStorage.getItem('isImpersonating') === 'true' || localStorage.getItem('isImpersonating') === 'true'));

  const isLoading = isLoadingUser || isLoadingCompany;



  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Invalid credentials");
      }
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(['/api/user'], user);
      queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.fullName}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const adminLoginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/admin/login", credentials);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Invalid admin credentials");
      }
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(['/api/user'], user);
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });

      toast({
        title: "Admin login successful",
        description: `Welcome back, ${user.fullName}!`,
      });

      setTimeout(() => {
        window.location.href = '/admin/dashboard';
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Admin login failed",
        description: error.message || "Invalid admin credentials",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterData) => {
      const { confirmPassword, ...userData } = data;
      const res = await apiRequest("POST", "/api/register", userData);
      return await res.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(['/api/user'], user);
      toast({
        title: "Registration successful",
        description: `Welcome, ${user.fullName}!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message || "Could not create account",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
      sessionStorage.removeItem('isImpersonating');
    },
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(['/api/user'], null);
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
      });

      setTimeout(() => {
        window.location.href = '/auth';
      }, 500);
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const switchFailure = () => {
    toast({ title: t('auth.switch_failed', 'Could not switch workspace. Please retry.'), variant: 'destructive' });
  };
  const impersonateCompanyMutation = useMutation({
    meta: { accountSwitch: true },
    mutationFn: (request: CompanySwitch) => transition.switchAccount(
      typeof request === 'number' ? request : request.companyId,
      typeof request === 'number' ? undefined : request.destination,
    ),
    onError: switchFailure,
  });
  const returnFromImpersonationMutation = useMutation({
    meta: { accountSwitch: true },
    mutationFn: (options: AccountDestination | void) => transition.switchAccount(undefined, options?.destination),
    onError: switchFailure,
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        company: company ?? null,
        isLoading: isLoading || suspended,
        isSwitchingAccount: transition.stage !== 'idle',
        switchError: transition.switchError,
        isMaintenanceMode: false,
        isLoadingMaintenance: false,
        error,
        isImpersonating,
        loginMutation,
        adminLoginMutation,
        logoutMutation,
        registerMutation,
        impersonateCompanyMutation,
        returnFromImpersonationMutation,
      }}
    >
      {!suspended && <div key={transition.epoch} style={{ display: 'contents' }} {...(transition.stage === 'draining' ? { inert: '' } as any : {})}>{children}</div>}
      {transition.stage !== 'idle' && (
        <Dialog open>
          <DialogContent showCloseButton={false} aria-describedby={undefined} onEscapeKeyDown={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()} dir={document.documentElement.dir || 'ltr'}>
          <DialogHeader><DialogTitle>{t('auth.switching_workspace', 'Switching workspace…')}</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center gap-4 p-4 text-center">
            {transition.stage === 'error' ? <>
              <p role="alert">{t('auth.switch_failed', 'Could not switch workspace. Please retry.')}</p>
              <p className="text-sm text-muted-foreground">{t('auth.switch_recovery', 'We need to verify your current session before continuing. Your tour editor context has been kept.')}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => void transition.retry()}>{t('common.retry', 'Retry')}</Button>
                <Button variant="outline" onClick={transition.signIn}>{t('guided_tours.admin_sign_in', 'Administrator sign-in')}</Button>
              </div>
            </> : <>
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              <p role="status">{t('auth.switching_workspace', 'Switching workspace…')}</p>
            </>}
          </div>
          </DialogContent>
        </Dialog>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
