import { isAppSumoOrigin } from '@shared/appsumo';
import { AppSumoCompanyLicense } from '@/components/settings/AppSumo';
import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { usePlans } from "@/hooks/use-plans";
import { useTranslation } from "@/hooks/use-translation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  ArrowLeft,
  Save,
  Trash,
  LogIn,
  UserCog,
  Upload,
  Building2 as TabIconBuilding2,
  ChartColumn as TabIconChartColumn,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AdminLayout from "@/components/admin/AdminLayout";
import { DataUsageTab } from "@/components/admin/DataUsageTab";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getPlanBillingPeriod } from "@/utils/plan-duration";
import { useCurrency } from "@/contexts/currency-context";

interface Company {
  appsumoLicenseKey?: string | null;
  appsumoSuspended?: boolean;
  id: number;
  name: string;
  slug: string;
  logo?: string;
  primaryColor: string;
  active: boolean;
  plan: string;
  planId?: number;
  maxUsers: number;
  createdAt: string;
  updatedAt: string;
  companyEmail?: string;
  contactPerson?: string;
  registerNumber?: string;
  iban?: string;
}

function getCompanyInitials(name: string): string {
  return name
    ?.split(' ')
    .map((part: string) => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2) || 'CO';
}


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
















export default function CompanyDetailPage() {
  const { user, isLoading: isLoadingAuth, impersonateCompanyMutation } = useAuth();
  const { plans, isLoading: isLoadingPlans } = usePlans();
  const { formatCurrency } = useCurrency();
  const { t } = useTranslation();
  const [_, navigate] = useLocation();
  const [match, params] = useRoute<{ id: string }>("/admin/companies/:id");
  const { toast } = useToast();
  
  const companySchema = z.object({
    name: z.string().min(1, t('admin.companies.detail.validation.company_name_required', 'Company name is required')),
    slug: z.string().min(1, t('admin.companies.detail.validation.slug_required', 'Slug is required')).regex(/^[a-z0-9-]+$/, t('admin.companies.detail.validation.slug_invalid', 'Slug can only contain lowercase letters, numbers, and hyphens')),
    logo: z.string().optional(),
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, t('admin.companies.detail.validation.color_invalid', 'Must be a valid hex color')),
    active: z.boolean(),
    planId: z.number().int().min(1, t('admin.companies.detail.validation.plan_required', 'Plan is required')),
    maxUsers: z.number().int().min(1, t('admin.companies.detail.validation.max_users_required', 'Must have at least 1 user')),
  });

  type CompanyFormValues = z.infer<typeof companySchema>;
  
  const [activeTab, setActiveTab] = useState("details");
  const [isImpersonateDialogOpen, setIsImpersonateDialogOpen] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isLoadingAuth && user && !user.isSuperAdmin) {
      navigate("/");
    }
  }, [user, isLoadingAuth, navigate]);

  const companyId = match ? parseInt(params.id) : null;

  const { data: company, isLoading: isLoadingCompany } = useQuery<Company>({
    queryKey: [`/api/admin/companies/${companyId}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/companies/${companyId}`);
      if (!res.ok) throw new Error(t('admin.companies.detail.error.fetch_company', 'Failed to fetch company'));
      return res.json();
    },
    enabled: !!companyId && !!user?.isSuperAdmin
  });

  const findPlanId = (company: Company) => {

    if (company.planId) {
      return company.planId;
    }


    if (company.plan) {
      const plan = plans.find(p => p.name.toLowerCase() === company.plan.toLowerCase());
      return plan?.id || 0;
    }

    return 0;
  };

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: "",
      slug: "",
      logo: "",
      primaryColor: "#333235",
      active: true,
      planId: 0,
      maxUsers: 5,





    }
  });

  useEffect(() => {
    if (company && plans.length > 0) {
      const planId = findPlanId(company);

      form.reset({
        name: company.name,
        slug: company.slug,
        logo: company.logo || "",
        primaryColor: company.primaryColor,
        active: company.active,
        planId: planId,
        maxUsers: company.maxUsers,





      });
    }
  }, [company, plans, form]);

  const updateMutation = useMutation({
    mutationFn: async (data: CompanyFormValues) => {
      const res = await apiRequest("PUT", `/api/admin/companies/${companyId}`, data);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || t('admin.companies.detail.error.update_failed', 'Failed to update company'));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.companies.detail.toast.update_success_title', 'Company updated'),
        description: t('admin.companies.detail.toast.update_success_description', 'The company has been updated successfully'),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/companies/${companyId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('admin.companies.detail.toast.update_failed_title', 'Update failed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/admin/companies/${companyId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || t('admin.companies.detail.error.deactivate_failed', 'Failed to deactivate company'));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.companies.detail.toast.deactivate_success_title', 'Company deactivated'),
        description: t('admin.companies.detail.toast.deactivate_success_description', 'The company has been deactivated successfully'),
      });
      navigate("/admin/dashboard");
    },
    onError: (error: Error) => {
      toast({
        title: t('admin.companies.detail.toast.deactivate_failed_title', 'Deactivation failed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('logo', file);

      const response = await fetch(`/api/admin/companies/${companyId}/logo`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || t('admin.companies.detail.error.upload_logo_failed', 'Failed to upload logo'));
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('admin.companies.detail.toast.logo_updated_title', 'Logo Updated'),
        description: t('admin.companies.detail.toast.logo_updated_description', 'Company logo has been updated successfully.'),
      });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/companies/${companyId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });
      setIsUploadingLogo(false);
    },
    onError: (error: any) => {
      toast({
        title: t('admin.companies.detail.toast.error_title', 'Error'),
        description: t('admin.companies.detail.toast.upload_logo_error', 'Failed to upload logo: {{error}}', { error: error.message }),
        variant: "destructive",
      });
      setIsUploadingLogo(false);
    }
  });

  const onSubmit = (data: CompanyFormValues) => {
    updateMutation.mutate(data);
  };

  const handleImpersonateCompany = () => {
    if (companyId) {
      impersonateCompanyMutation.mutate(companyId);
      setIsImpersonateDialogOpen(false);
    }
  };

  const handleLogoUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;


    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: t('admin.companies.detail.toast.invalid_file_type_title', 'Invalid file type'),
        description: t('admin.companies.detail.toast.invalid_file_type_description', 'Please select a valid image file (JPEG, PNG, GIF, or WebP).'),
        variant: "destructive",
      });
      event.target.value = '';
      return;
    }


    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      toast({
        title: t('admin.companies.detail.toast.file_too_large_title', 'File too large'),
        description: t('admin.companies.detail.toast.file_too_large_description', 'Please select an image smaller than 5MB.'),
        variant: "destructive",
      });
      event.target.value = '';
      return;
    }

    setIsUploadingLogo(true);
    uploadLogoMutation.mutate(file);
    event.target.value = '';
  };

  if (isLoadingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user?.isSuperAdmin) {
    return null;
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Button variant="ghost" onClick={() => navigate("/admin/dashboard")} className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('common.back', 'Back')}
            </Button>
            <h1 className="text-2xl">
              {isLoadingCompany ? t('common.loading', 'Loading...') : t('admin.companies.detail.title', 'Company: {{name}}', { name: company?.name || '' })}
            </h1>
          </div>

          {!isLoadingCompany && company && (
            <AlertDialog open={isImpersonateDialogOpen} onOpenChange={setIsImpersonateDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button className="ml-auto btn-brand-primary">
                  <LogIn className="h-4 w-4 mr-2" />
                  {t('admin.companies.impersonate_title', 'Impersonate Company')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-md max-h-[90vh]">
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('admin.companies.impersonate_title', 'Impersonate Company')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('admin.companies.impersonate_description', 'You are about to log in as an admin user for {{name}}. This will allow you to access the company dashboard and perform actions as a company admin.', { name: company.name })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-4">
                  <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                  <AlertDialogAction className="btn-brand-primary" onClick={handleImpersonateCompany}>
                    {impersonateCompanyMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('admin.companies.impersonating', 'Impersonating...')}
                      </>
                    ) : (
                      <>
                        <UserCog className="h-4 w-4 mr-2" />
                        {t('admin.companies.detail.impersonate_button', 'Impersonate')}
                      </>
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger icon={TabIconBuilding2} value="details">{t('admin.companies.detail.tabs.details', 'Company Details')}</TabsTrigger>
            <TabsTrigger icon={TabIconChartColumn} value="data">{t('admin.companies.detail.tabs.data_usage', 'Data & Usage')}</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.companies.detail.card.title', 'Company Information')}</CardTitle>
                <CardDescription>
                  {t('admin.companies.detail.card.description', 'Manage company details and settings')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                  {company?.appsumoLicenseKey && isAppSumoOrigin(window.location.origin) && <AppSumoCompanyLicense licenseKey={company.appsumoLicenseKey} />}
                {isLoadingCompany ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-6 mb-6">
                      <Avatar className="h-20 w-20">
                        {company?.logo ? (
                          <AvatarImage src={company.logo} alt={company.name} />
                        ) : null}
                        <AvatarFallback
                          className="text-white font-medium text-lg"
                          style={{ backgroundColor: company?.primaryColor || '#333235' }}
                        >
                          {getCompanyInitials(company?.name || '')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h3 className="text-lg font-medium">{company?.name}</h3>
                        <p className="text-sm text-muted-foreground">{company?.slug}</p>
                        <p className="text-sm text-muted-foreground capitalize">{company?.plan}</p>
                        <div className="flex gap-2 mt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleLogoUpload}
                            disabled={isUploadingLogo}
                          >
                            {isUploadingLogo ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('admin.companies.detail.uploading', 'Uploading...')}
                              </>
                            ) : (
                              <>
                                <Upload className="mr-2 h-4 w-4" />
                                {t('admin.companies.detail.change_logo', 'Change Logo')}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept="image/*"
                      className="hidden"
                    />
                  </>
                )}
                {!isLoadingCompany && (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('admin.companies.detail.form.company_name', 'Company Name')}</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="slug"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('admin.companies.detail.form.slug', 'Slug')}</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormDescription>
                                {t('admin.companies.detail.form.slug_description', 'Used for URL and identification')}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="logo"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('admin.companies.detail.form.logo_url', 'Logo URL')}</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="primaryColor"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('admin.companies.detail.form.primary_color', 'Primary Color')}</FormLabel>
                              <div className="flex items-center space-x-2">
                                <div
                                  className="w-6 h-6 rounded-full border cursor-pointer"
                                  style={{ backgroundColor: field.value }}
                                  onClick={() => {
                                    const colorInput = document.getElementById('primaryColorPicker') as HTMLInputElement;
                                    if (colorInput) colorInput.click();
                                  }}
                                />
                                <FormControl>
                                  <Input
                                    id="primaryColorPicker"
                                    type="color"
                                    {...field}
                                    className="w-16 h-10 p-1 border rounded cursor-pointer"
                                  />
                                </FormControl>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder={t('admin.companies.detail.form.color_placeholder', '#333235')}
                                    className="flex-1"
                                  />
                                </FormControl>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="planId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('admin.companies.detail.form.plan', 'Plan')}</FormLabel>
                              <Select
                                onValueChange={(value) => {
                                  field.onChange(parseInt(value));
                                  const selectedPlan = plans.find(p => p.id === parseInt(value));
                                  if (selectedPlan) {
                                    form.setValue('maxUsers', selectedPlan.maxUsers);
                                  }
                                }}
                                value={field.value?.toString() || ""}
                                disabled={Boolean(company?.appsumoLicenseKey) || isLoadingPlans || plans.length === 0}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder={t('admin.companies.detail.form.select_plan_placeholder', 'Select a plan')} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {isLoadingPlans ? (
                                    <SelectItem value="loading" disabled>
                                      <div className="flex items-center">
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        {t('admin.companies.detail.form.loading_plans', 'Loading plans...')}
                                      </div>
                                    </SelectItem>
                                  ) : plans.length === 0 ? (
                                    <SelectItem value="none" disabled>{t('admin.companies.detail.form.no_plans_available', 'No plans available')}</SelectItem>
                                  ) : (
                                    plans.map((plan) => (
                                      <SelectItem key={plan.id} value={plan.id.toString()}>
                                        {plan.name} ({formatCurrency(plan.price)}{getPlanBillingPeriod(plan)})
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                {field.value ? (
                                  <>
                                    {plans.find(p => p.id === field.value)?.description || ""}
                                  </>
                                ) : t('admin.companies.detail.form.plan_description', 'Select a subscription plan for this company')}
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="maxUsers"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('admin.companies.detail.form.max_users', 'Max Users')}</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* For Kaif Ahmad - Commented out fields that are not needed anymore
                        <FormField
                          control={form.control}
                          name="companyEmail"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Company Email</FormLabel>
                              <FormControl>
                                <Input
                                  type="email"
                                  placeholder="info@company.com"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription>
                                Official email address for the company.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="contactPerson"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contact Person</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="John Doe"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription>
                                Primary contact person for the company.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="registerNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Commercial Registration Number (KSA)</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="1234567890"
                                  className="font-mono"
                                  maxLength={10}
                                  {...field}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/\D/g, '');
                                    field.onChange(value);
                                  }}
                                />
                              </FormControl>
                              <FormDescription>
                                Company's 10-digit Commercial Registration Number (CR) issued by the KSA Ministry of Commerce.
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="iban"
                          render={({ field }) => {
                            const isValidIban = field.value ? validateIBAN(field.value) : true;
                            const formatSaudiIBAN = (iban: string): string => {
                              if (!iban) return '';
                              const clean = iban.replace(/\s/g, '').toUpperCase();
                              if (clean.length <= 4) return clean;
                              return clean.replace(/^(SA\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})$/, '$1 $2 $3 $4 $5 $6');
                            };
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
                                        const value = e.target.value.replace(/\s/g, '').toUpperCase();
                                        field.onChange(value);
                                      }}
                                      maxLength={29}
                                    />
                                    {field.value && (
                                      <div className="absolute right-3 top-2.5">
                                        {isValidIban ? (
                                          <span className="text-green-500 text-sm">✓</span>
                                        ) : (
                                          <span className="text-red-500 text-sm">✕</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </FormControl>
                                <FormDescription>
                                  Company's official KSA IBAN (24 characters: SA + 22 digits).
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
                        */}
                      </div>

                      <FormField
                        control={form.control}
                        name="active"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">{t('admin.companies.detail.form.active_status', 'Active Status')}</FormLabel>
                              <FormDescription>
                                {t('admin.companies.detail.form.active_status_description', 'When inactive, users cannot access the platform')}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <div className="flex justify-between">
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => {
                            if (confirm(t('admin.companies.detail.confirm.deactivate', 'Are you sure you want to deactivate this company? This will prevent all users from accessing the platform.'))) {
                              deactivateMutation.mutate();
                            }
                          }}
                          disabled={deactivateMutation.isPending}
                        >
                          {deactivateMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('admin.companies.detail.deactivating', 'Deactivating...')}
                            </>
                          ) : (
                            <>
                              <Trash className="mr-2 h-4 w-4" />
                              {t('admin.companies.detail.deactivate_company', 'Deactivate Company')}
                            </>
                          )}
                        </Button>

                        <Button
                          type="submit"
                          disabled={updateMutation.isPending}
                          variant="brand"
                          className="btn-brand-primary"
                        >
                          {updateMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              {t('common.saving', 'Saving...')}
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
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data">
            {companyId && <DataUsageTab companyId={companyId} />}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
