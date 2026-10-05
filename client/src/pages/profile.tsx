import { useState, useEffect, useMemo, useRef, type CSSProperties } from 'react';
import './profile-settings.css';
import { UserSignatureCard } from '@/components/profile/UserSignatureCard';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/use-translation';
import Header from '@/components/layout/Header';
import { InboxAvailabilitySettingsForm } from '@/components/inbox/InboxAvailabilitySettingsForm';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Loader2, User, Mail, Key, Check, Save, Upload, Calendar, Globe, Bell, BellOff, Clock, Building2, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';

interface UserProfile {
  id: number;
  username: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  companyId?: number;
  isSuperAdmin?: boolean;
  languagePreference?: string;
  createdAt?: string;
  updatedAt?: string;
  company?: {
    id: number;
    name: string;
    slug: string;
    plan?: string;
    registerNumber?: string;
    companyEmail?: string;
    contactPerson?: string;
    iban?: string;
    logo?: string;
    primaryColor?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  marketingEmails: boolean;
  securityAlerts: boolean;
}

type Translate = (key: string, fallback?: string, variables?: Record<string, any>) => string;

const createProfileFormSchema = (t: Translate) => z.object({
  fullName: z.string().min(2, t('profile.validation.name_min', 'Name must be at least 2 characters')),
  email: z.string().email(t('profile.validation.email_invalid', 'Please enter a valid email address')),
  username: z.string().min(3, t('profile.validation.username_min', 'Username must be at least 3 characters')),
  languagePreference: z.string().optional(),
});

const notificationFormSchema = z.object({
  emailNotifications: z.boolean(),
  pushNotifications: z.boolean(),
  marketingEmails: z.boolean(),
  securityAlerts: z.boolean(),
});


const validateIBAN = (iban: string): boolean => {
  if (!iban) return true; // Allow empty IBAN (optional field)


  const cleanIban = iban.replace(/\s/g, '').toUpperCase();



  if (cleanIban.length !== 24) {
    return false;
  }


  if (!/^SA[0-9]{2}/.test(cleanIban)) {
    return false;
  }


  if (!/^SA[0-9]{22}$/.test(cleanIban)) {
    return false;
  }


  try {

    const rearranged = cleanIban.slice(4) + cleanIban.slice(0, 4);


    const numericString = rearranged.replace(/[A-Z]/g, (char) =>
      (char.charCodeAt(0) - 55).toString()
    );


    let remainder = 0;
    for (let i = 0; i < numericString.length; i++) {
      remainder = (remainder * 10 + parseInt(numericString[i])) % 97;
    }

    return remainder === 1;
  } catch {
    return false;
  }
};


const formatSaudiIBAN = (iban: string): string => {
  if (!iban) return '';
  const clean = iban.replace(/\s/g, '').toUpperCase();
  if (clean.length <= 4) return clean;


  return clean.replace(/^(SA\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4 $5 $6');
};

const createCompanyFormSchema = (t: Translate) => z.object({
  name: z.string().min(2, t('profile.validation.company_name_min', 'Company name must be at least 2 characters')),















  primaryColor: z.string().optional(),
});

const createPasswordFormSchema = (t: Translate) => z.object({
  currentPassword: z.string().min(6, t('profile.validation.current_password_required', 'Current password is required')),
  newPassword: z.string().min(8, t('profile.validation.password_min', 'Password must be at least 8 characters')),
  confirmPassword: z.string().min(8, t('profile.validation.confirm_password', 'Please confirm your password')),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: t('profile.validation.passwords_mismatch', "Passwords don't match"),
  path: ["confirmPassword"],
});

type ProfileFormValues = z.infer<ReturnType<typeof createProfileFormSchema>>;
type PasswordFormValues = z.infer<ReturnType<typeof createPasswordFormSchema>>;
type NotificationFormValues = z.infer<typeof notificationFormSchema>;
type CompanyFormValues = z.infer<ReturnType<typeof createCompanyFormSchema>>;

export default function ProfilePage() {
  const { toast } = useToast();
  const { t, languages, currentLanguage } = useTranslation();
  const [activeTab, setActiveTab] = useState("account");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileFormSchema = useMemo(() => createProfileFormSchema(t), [t]);
  const companyFormSchema = useMemo(() => createCompanyFormSchema(t), [t]);
  const passwordFormSchema = useMemo(() => createPasswordFormSchema(t), [t]);

  const {
    data: user,
    isLoading: isLoadingUser,
    error: userError
  } = useQuery<UserProfile>({
    queryKey: ['/api/users/me'],
    refetchOnWindowFocus: false,
  });

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      username: "",
      languagePreference: "",
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const notificationForm = useForm<NotificationFormValues>({
    resolver: zodResolver(notificationFormSchema),
    defaultValues: {
      emailNotifications: true,
      pushNotifications: false,
      marketingEmails: false,
      securityAlerts: true,
    },
  });

  const companyForm = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: "",





      primaryColor: "#333235",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const response = await apiRequest('PATCH', '/api/users/me', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('profile.errors.update_profile', 'Failed to update profile'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('profile.toast.profile_updated_title', 'Profile Updated'),
        description: t('profile.toast.profile_updated_description', 'Your profile information has been updated successfully.'),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/users/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('profile.toast.profile_update_failed', 'Failed to update profile: {{message}}', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  const uploadAvatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch('/api/users/me/avatar', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('profile.errors.upload_avatar', 'Failed to upload avatar'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('profile.toast.avatar_updated_title', 'Avatar Updated'),
        description: t('profile.toast.avatar_updated_description', 'Your profile picture has been updated successfully.'),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/users/me'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      setIsUploadingAvatar(false);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('profile.toast.avatar_upload_failed', 'Failed to upload avatar: {{message}}', { message: error.message }),
        variant: "destructive",
      });
      setIsUploadingAvatar(false);
    }
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormValues) => {
      const response = await apiRequest('POST', '/api/users/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('profile.errors.change_password', 'Failed to change password'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('profile.toast.password_changed_title', 'Password Changed'),
        description: t('profile.toast.password_changed_description', 'Your password has been changed successfully.'),
      });
      passwordForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('profile.toast.password_change_failed', 'Failed to change password: {{message}}', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  const updateNotificationsMutation = useMutation({
    mutationFn: async (data: NotificationFormValues) => {
      const response = await apiRequest('PATCH', '/api/users/me/notifications', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('profile.errors.update_notifications', 'Failed to update notification settings'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('profile.toast.notifications_updated_title', 'Notifications Updated'),
        description: t('profile.toast.notifications_updated_description', 'Your notification preferences have been updated successfully.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('profile.toast.notifications_update_failed', 'Failed to update notifications: {{message}}', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: CompanyFormValues) => {
      const response = await apiRequest('PATCH', '/api/companies/me', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('profile.errors.update_company', 'Failed to update company information'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('profile.toast.company_updated_title', 'Company Updated'),
        description: t('profile.toast.company_updated_description', 'Your company information has been updated successfully.'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/users/me'] });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('profile.toast.company_update_failed', 'Failed to update company: {{message}}', { message: error.message }),
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    window.scrollTo({ top: 0, left: 0 });

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  useEffect(() => {
    if (user) {
      profileForm.reset({
        fullName: user.fullName,
        email: user.email,
        username: user.username,
        languagePreference: user.languagePreference || currentLanguage?.code || 'en',
      });

      if (user.company) {
        companyForm.reset({
          name: user.company.name || "",





          primaryColor: user.company.primaryColor || "#333235",
        });
      }
    }
  }, [user, profileForm, companyForm, currentLanguage]);

  const onProfileSubmit = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordFormValues) => {
    changePasswordMutation.mutate(data);
  };

  const onNotificationSubmit = (data: NotificationFormValues) => {
    updateNotificationsMutation.mutate(data);
  };

  const onCompanySubmit = (data: CompanyFormValues) => {
    updateCompanyMutation.mutate(data);
  };

  const handleAvatarUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const maxSize = 5 * 1024 * 1024; // 5MB

      if (!allowedTypes.includes(file.type)) {
        toast({
          title: t('profile.avatar.invalid_type_title', 'Invalid File Type'),
          description: t('profile.avatar.invalid_type_description', 'Please select a valid image file (JPEG, PNG, GIF, or WebP).'),
          variant: "destructive",
        });

        event.target.value = '';
        return;
      }

      if (file.size > maxSize) {
        toast({
          title: t('profile.avatar.too_large_title', 'File Too Large'),
          description: t('profile.avatar.too_large_description', 'Please select an image smaller than 5MB.'),
          variant: "destructive",
        });

        event.target.value = '';
        return;
      }

      setIsUploadingAvatar(true);
      uploadAvatarMutation.mutate(file);
    }

    event.target.value = '';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('profile.common.not_available', 'N/A');
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    const locale = (currentLanguage?.code || 'en').replace('_', '-');
    try {
      return new Intl.DateTimeFormat(locale, options).format(new Date(dateString));
    } catch {
      return new Intl.DateTimeFormat('en', options).format(new Date(dateString));
    }
  };

  const getInitials = (name: string) => {
    return name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
  };

  if (isLoadingUser) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
        <Header />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-4 sm:px-5 sm:py-5 lg:p-6">
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
                <p className="text-muted-foreground">{t('profile.loading', 'Loading your profile...')}</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (userError) {
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
        <Header />
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-3 py-4 sm:px-5 sm:py-5 lg:p-6">
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <h2 data-tour="pages-profile.h2.profile.load_error_title" className="text-xl font-semibold mb-2">{t('profile.load_error_title', 'Error loading profile')}</h2>
                <p className="text-muted-foreground mb-4">{(userError as Error).message}</p>
                <Button data-tour="pages-profile.button.common.try_again" onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/users/me'] })}>
                  {t('common.try_again', 'Try Again')}
                </Button>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
          <div className="profile-settings min-w-0" style={{ "--profile-accent": user?.company?.primaryColor || "var(--brand-primary-color, hsl(var(--primary)))" } as CSSProperties}>
            <div className="mb-6">
              <h1 data-tour="pages-profile.h1.profile.page.title" className="profile-page-title text-foreground">{t('profile.page.title', 'Account Settings')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('profile.page.subtitle', 'Manage your account, company, security, notifications, and availability.')}
              </p>
            </div>
            
            <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
              <div className="profile-tabs-navigation">
                <TabsList  aria-label={t("profile.page.title")}>
                  <TabsTrigger data-tour="pages-profile.tabstrigger.account" value="account"><User aria-hidden="true" />{t('profile.tabs.account', 'Account')}</TabsTrigger>
                  <TabsTrigger data-tour="pages-profile.tabstrigger.company" value="company"><Building2 aria-hidden="true" />{t('profile.tabs.company', 'Company')}</TabsTrigger>
                  <TabsTrigger data-tour="pages-profile.tabstrigger.security" value="security"><ShieldCheck aria-hidden="true" />{t('profile.tabs.security', 'Security')}</TabsTrigger>
                  <TabsTrigger data-tour="pages-profile.tabstrigger.notifications" value="notifications"><Bell aria-hidden="true" />{t('profile.tabs.notifications', 'Notifications')}</TabsTrigger>
                  <TabsTrigger data-tour="pages-profile.tabstrigger.availability" value="availability">
                    <Clock aria-hidden="true" />
                    {t('inbox_availability.profile_tab', 'Availability')}
                  </TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent data-tour="pages-profile.tabscontent.account" value="account" className="min-w-0">
                <div className="profile-account-layout">
                  <Card className="profile-card" data-profile-summary>
                    <CardHeader className="profile-card-header">
                      <CardTitle className="profile-card-title">{t('profile.summary.title')}</CardTitle>
                      <CardDescription>{t('profile.summary.description')}</CardDescription>
                    </CardHeader>
                    <CardContent className="profile-card-content">
                      <div className="profile-summary-identity">
                        <Avatar className="profile-summary-avatar shrink-0">
                          {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.fullName} />}
                          <AvatarFallback className="text-2xl">{getInitials(user?.fullName || '')}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 space-y-1">
                          <h2 className="break-words text-xl font-semibold">{user?.fullName}</h2>
                          <p className="break-all text-sm text-muted-foreground">{user?.email}</p>
                          {user?.role && <Badge variant="secondary" className="mt-2 rounded-full bg-muted px-3 font-normal">{t(`profile.roles.${user.role}`, user.role)}</Badge>}
                          {user?.company && <div className="pt-3"><p className="break-words font-medium">{user.company.name}</p>{user.company.plan && <p className="text-sm text-muted-foreground">{t(`profile.plans.${user.company.plan}`, user.company.plan)}</p>}</div>}
                        </div>
                        <Button className="profile-summary-upload" variant="outline" onClick={handleAvatarUpload} disabled={isUploadingAvatar}>
                          {isUploadingAvatar ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="h-4 w-4" />}
                          {t(isUploadingAvatar ? 'profile.avatar.uploading' : 'profile.avatar.change')}
                        </Button>
                        <input data-tour="pages-profile.input.profile.avatar.change" ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" aria-label={t('profile.avatar.change')} onChange={handleFileChange} className="hidden" />
                      </div>
                      <dl className="profile-summary-metadata">
                        <div><dt>{t('profile.account.created')}</dt><dd>{formatDate(user?.createdAt)}</dd></div>
                        <div><dt>{t('profile.account.last_updated')}</dt><dd>{formatDate(user?.updatedAt)}</dd></div>
                        <div><dt>{t('profile.account.user_id')}</dt><dd>{user?.id}</dd></div>
                        {user?.isSuperAdmin && <div><dt>{t('profile.account.admin_status')}</dt><dd>{t('profile.roles.super_admin')}</dd></div>}
                      </dl>
                    </CardContent>
                  </Card>
                  <div className="min-w-0 space-y-5">
                    <Card className="profile-card overflow-hidden">
                      <CardHeader className="profile-card-header">
                        <CardTitle className="profile-card-title">{t('profile.account.title')}</CardTitle>
                        <CardDescription>{t('profile.account.description')}</CardDescription>
                      </CardHeader>
                      <CardContent className="profile-card-content">
                    <Form {...profileForm}>
                      <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-7">
                        <div className="grid min-w-0 gap-x-6 gap-y-6 sm:grid-cols-2">
                        <FormField
                          control={profileForm.control}
                          name="fullName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('profile.account.full_name', 'Full Name')}</FormLabel>
                              <div className="relative">
                                  <User aria-hidden="true" className="profile-field-icon" />
                                  <FormControl><Input data-tour="pages-profile.input.profile.account.full_name_placeholder" className="profile-icon-control" placeholder={t('profile.account.full_name_placeholder', 'Your full name')} {...field} /></FormControl>
                                </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={profileForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('profile.account.email', 'Email Address')}</FormLabel>
                              <div className="relative">
                                  <Mail aria-hidden="true" className="profile-field-icon" />
                                  <FormControl><Input data-tour="pages-profile.input.profile.account.email_placeholder" className="profile-icon-control" placeholder={t('profile.account.email_placeholder', 'your.email@example.com')} {...field} /></FormControl>
                                </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={profileForm.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('profile.account.username', 'Username')}</FormLabel>
                              <div className="relative">
                                  <User aria-hidden="true" className="profile-field-icon" />
                                  <FormControl><Input data-tour="pages-profile.input.profile.account.username_placeholder" className="profile-icon-control" placeholder={t('profile.account.username_placeholder', 'username')} {...field} /></FormControl>
                                </div>
                              <FormDescription>
                                {t('profile.account.username_help', 'Your public display name.')}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={profileForm.control}
                          name="languagePreference"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('profile.account.language_preference', 'Language Preference')}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-tour="pages-profile.selecttrigger.profile.account.select_language" className="relative profile-icon-control"><Globe aria-hidden="true" className="profile-field-icon" />
                                    <SelectValue placeholder={t('profile.account.select_language', 'Select a language')} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {languages.map((language) => (
                                    <SelectItem key={language.code} value={language.code}>
                                      <span className="mr-2">{language.flagIcon}</span>
                                      {language.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                {t('profile.account.language_help', 'Choose the language used in the interface.')}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        </div>
                        <div className="profile-actions">
                        <Button data-tour="pages-profile.button.profile.actions.saving_changes"
                          type="submit" 
                          className="w-full sm:w-auto"
                          disabled={updateProfileMutation.isPending}
                        >
                          {updateProfileMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('profile.actions.saving_changes', 'Saving Changes')}
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              {t('common.save_changes', 'Save Changes')}
                            </>
                          )}
                        </Button>
                        </div>
                      </form>
                    </Form>
                      </CardContent>
                    </Card>
                    <UserSignatureCard />
                  </div>
                </div>
              </TabsContent>

              <TabsContent data-tour="pages-profile.tabscontent.company" value="company" className="min-w-0">
                <Card className="profile-card min-w-0 overflow-hidden">
                  <CardHeader className="profile-card-header">
                    <CardTitle className="profile-card-title">{t('profile.company.title', 'Company Information')}</CardTitle>
                    <CardDescription>
                      {t('profile.company.description', 'Manage your company details and settings.')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="profile-card-content">
                    {/* Company Overview - Read Only Information */}
                    <div className="mb-6 grid grid-cols-1 gap-4 rounded-lg bg-muted/30 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-3">
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">{t('profile.company.slug', 'Company Slug')}</Label>
                        <p className="text-sm font-mono">{user?.company?.slug}</p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">{t('profile.company.plan', 'Plan')}</Label>
                        <p className="text-sm capitalize">
                          {user?.company?.plan
                            ? t(`profile.plans.${user.company.plan}`, user.company.plan)
                            : t('profile.plans.free', 'Free')}
                        </p>
                      </div>
                      <div>
                        <Label className="text-sm font-medium text-muted-foreground">{t('profile.company.created', 'Company Created')}</Label>
                        <p className="text-sm">{formatDate(user?.company?.createdAt)}</p>
                      </div>
                    </div>

                    <Form {...companyForm}>
                      <form onSubmit={companyForm.handleSubmit(onCompanySubmit)} className="space-y-6">
                        <div className="grid gap-6 sm:grid-cols-2">
                          <FormField
                            control={companyForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('profile.company.name', 'Company Name')}</FormLabel>
                                <FormControl>
                                  <Input data-tour="pages-profile.input.profile.company.name_placeholder" placeholder={t('profile.company.name_placeholder', 'Your Company Name')} {...field} />
                                </FormControl>
                                <FormDescription>
                                  {t('profile.company.name_help', 'The official name of your company.')}
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {/* For Kaif Ahmad - Commented out fields that are not needed anymore
                          <FormField
                            control={companyForm.control}
                            name="companyEmail"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Company Email</FormLabel>
                                <FormControl>
                                  <Input
                                    type="email"
                                    placeholder="info@yourcompany.com"
                                    {...field}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Official email address for your company.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          */}
                          <FormField
                            control={companyForm.control}
                            name="primaryColor"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('profile.company.primary_color', 'Primary Color')}</FormLabel>
                                <FormControl>
                                  <div className="flex min-w-0 items-center gap-2">
                                    <Input
                                      type="color"
                                      className="h-10 w-12 shrink-0 rounded border p-1"
                                      {...field}
                                    />
                                    <Input
                                      type="text"
                                      placeholder="#333235"
                                      className="min-w-0 flex-1"
                                      {...field}
                                    />
                                  </div>
                                </FormControl>
                                <FormDescription>
                                  {t('profile.company.primary_color_help', 'Primary brand color for your company.')}
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        {/* For Kaif Ahmad - Commented out fields that are not needed anymore  
                        <div className="grid gap-6 sm:grid-cols-2">
                          <FormField
                            control={companyForm.control}
                            name="contactPerson"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Contact Person</FormLabel>
                                <FormControl>
                                  <Input placeholder="Felix Zona" {...field} />
                                </FormControl>
                                <FormDescription>
                                  Main contact person for your company.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        */}
                        {/* For Kaif Ahmad - Commented out fields that are not needed anymore
                        <div className="grid gap-6 sm:grid-cols-2">
                          <FormField
                            control={companyForm.control}
                            name="registerNumber"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Commercial Registration Number (KSA)</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="1234567890"
                                    className="font-mono"
                                    maxLength={10}
                                    onChange={(e) => {

                                      const value = e.target.value.replace(/\D/g, '');
                                      field.onChange(value);
                                    }}
                                    onBlur={field.onBlur}
                                    name={field.name}
                                    ref={field.ref}
                                    value={field.value || ''}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Your company's 10-digit Commercial Registration Number (CR) issued by the KSA Ministry of Commerce.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={companyForm.control}
                            name="iban"
                            render={({ field }) => {
                              const isValidIban = field.value ? validateIBAN(field.value) : true;
                              const displayValue = field.value ? formatSaudiIBAN(field.value) : '';

                              return (
                                <FormItem>
                                  <FormLabel>Company IBAN Number (KSA)</FormLabel>
                                  <FormControl>
                                    <div className="relative">
                                      <Input
                                        placeholder="SA03 8000 0000 6080 1016 7519"
                                        className={`font-mono pr-10 ${
                                          field.value && !isValidIban
                                            ? 'border-red-500 focus:border-red-500'
                                            : field.value && isValidIban
                                            ? 'border-green-500 focus:border-green-500'
                                            : ''
                                        }`}
                                        style={{ textTransform: 'uppercase' }}
                                        value={displayValue}
                                        onChange={(e) => {

                                          const cleanValue = e.target.value.replace(/\s/g, '').toUpperCase();

                                          if (cleanValue.length <= 24) {
                                            field.onChange(cleanValue);
                                          }
                                        }}
                                        onBlur={field.onBlur}
                                        name={field.name}
                                        ref={field.ref}
                                        maxLength={29} // Allow for spaces in display: SA03 8000 0000 6080 1016 7519
                                      />
                                      {field.value && (
                                        <div className="absolute right-3 top-2.5">
                                          {isValidIban ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                          ) : (
                                            <span className="h-4 w-4 text-red-500 text-xs">✕</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </FormControl>
                                  <FormDescription>
                                    Your company's official KSA IBAN (24 characters: SA + 22 digits).
                                    {field.value && !isValidIban && (
                                      <span className="text-red-500 block mt-1">
                                        Please enter a valid KSA IBAN (e.g., SA0380000000608010167519)
                                      </span>
                                    )}
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              );
                            }}
                          />
                        </div>
                        */}
                        <div className="profile-actions">
                        <Button data-tour="pages-profile.button.profile.actions.saving_changes"
                          type="submit"
                          className="w-full sm:w-auto"
                          disabled={updateCompanyMutation.isPending}
                        >
                          {updateCompanyMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('profile.actions.saving_changes', 'Saving Changes')}
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              {t('profile.company.save', 'Save Company Information')}
                            </>
                          )}
                        </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent data-tour="pages-profile.tabscontent.security" value="security" className="min-w-0">
                <Card className="profile-card min-w-0 overflow-hidden">
                  <CardHeader className="profile-card-header">
                    <CardTitle className="profile-card-title">{t('profile.security.title', 'Password')}</CardTitle>
                    <CardDescription>
                      {t('profile.security.description', 'Change your password to keep your account secure.')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="profile-card-content">
                    <Form {...passwordForm}>
                      <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
                        <FormField
                          control={passwordForm.control}
                          name="currentPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('profile.security.current_password', 'Current Password')}</FormLabel>
                              <div className="relative">
                                  <Key className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                  <FormControl><Input
                                    className="pl-9" 
                                    type="password" 
                                    placeholder="••••••••" 
                                    {...field} 
                                  /></FormControl>
                                </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid gap-6 sm:grid-cols-2">
                          <FormField
                            control={passwordForm.control}
                            name="newPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('profile.security.new_password', 'New Password')}</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="password" 
                                    placeholder="••••••••" 
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={passwordForm.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('profile.security.confirm_password', 'Confirm New Password')}</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="password" 
                                    placeholder="••••••••" 
                                    {...field} 
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="profile-actions">
                        <Button data-tour="pages-profile.button.profile.security.changing"
                          type="submit" 
                          className="w-full sm:w-auto"
                          disabled={changePasswordMutation.isPending}
                        >
                          {changePasswordMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('profile.security.changing', 'Changing Password')}
                            </>
                          ) : (
                            <>
                              <Check className="mr-2 h-4 w-4" />
                              {t('profile.security.change', 'Change Password')}
                            </>
                          )}
                        </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>
              
              <TabsContent data-tour="pages-profile.tabscontent.notifications" value="notifications" className="min-w-0">
                <Card className="profile-card min-w-0 overflow-hidden">
                  <CardHeader className="profile-card-header">
                    <CardTitle className="profile-card-title">{t('profile.notifications.title', 'Notification Settings')}</CardTitle>
                    <CardDescription>
                      {t('profile.notifications.description', 'Configure how you want to be notified about important events.')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="profile-card-content">
                    <Form {...notificationForm}>
                      <form onSubmit={notificationForm.handleSubmit(onNotificationSubmit)} className="space-y-6">
                        <div>
                        <FormField
                          control={notificationForm.control}
                          name="emailNotifications"
                          render={({ field }) => (
                            <FormItem className="profile-notification-row">
                              <div className="min-w-0 space-y-0.5">
                                <FormLabel className="text-base flex items-center gap-2">
                                  <Mail className="h-4 w-4" />
                                  {t('profile.notifications.email_title', 'Email Notifications')}
                                </FormLabel>
                                <FormDescription>
                                  {t('profile.notifications.email_description', 'Receive email notifications for important updates and messages.')}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  className="shrink-0"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={notificationForm.control}
                          name="pushNotifications"
                          render={({ field }) => (
                            <FormItem className="profile-notification-row">
                              <div className="min-w-0 space-y-0.5">
                                <FormLabel className="text-base flex items-center gap-2">
                                  {field.value ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                                  {t('profile.notifications.push_title', 'Push Notifications')}
                                </FormLabel>
                                <FormDescription>
                                  {t('profile.notifications.push_description', 'Receive browser push notifications for real-time updates.')}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  className="shrink-0"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={notificationForm.control}
                          name="marketingEmails"
                          render={({ field }) => (
                            <FormItem className="profile-notification-row">
                              <div className="min-w-0 space-y-0.5">
                                <FormLabel className="text-base">
                                  {t('profile.notifications.marketing_title', 'Marketing Communications')}
                                </FormLabel>
                                <FormDescription>
                                  {t('profile.notifications.marketing_description', 'Receive emails about new features, tips, and promotional content.')}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  className="shrink-0"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={notificationForm.control}
                          name="securityAlerts"
                          render={({ field }) => (
                            <FormItem className="profile-notification-row">
                              <div className="min-w-0 space-y-0.5">
                                <FormLabel className="text-base">
                                  {t('profile.notifications.security_title', 'Security Alerts')}
                                </FormLabel>
                                <FormDescription>
                                  {t('profile.notifications.security_description', 'Receive notifications about security-related events and login attempts.')}
                                </FormDescription>
                              </div>
                              <FormControl>
                                <Switch
                                  className="shrink-0"
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        </div>
                        <div className="profile-actions">
                        <Button data-tour="pages-profile.button.profile.notifications.saving"
                          type="submit"
                          className="w-full sm:w-auto"
                          disabled={updateNotificationsMutation.isPending}
                        >
                          {updateNotificationsMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('profile.notifications.saving', 'Saving Settings')}
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              {t('profile.notifications.save', 'Save Notification Settings')}
                            </>
                          )}
                        </Button>
                        </div>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent data-tour="pages-profile.tabscontent.availability" value="availability" className="min-w-0 overflow-hidden">
                <div className="min-w-0">
                  <InboxAvailabilitySettingsForm presentation="profile" />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}
