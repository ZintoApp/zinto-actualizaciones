import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Check, Edit, Trash2, Bot, Zap, DollarSign, AlertTriangle, Settings, HardDrive, Search } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { PriceDisplay } from "@/components/ui/price-display";
import { PlanFormFields, type AdminPlanFormData } from "./PlanFormFields";
import { formatPlanDurationShort } from "./planDuration";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import AiProviderConfigManager from "@/components/admin/AiProviderConfigManager";

interface Plan {
  id: number;
  name: string;
  description: string;
  price: number;
  maxUsers: number;
  maxContacts: number;
  maxChannels: number;
  maxFlows: number;
  maxCampaigns: number;
  maxCampaignRecipients: number;
  campaignFeatures: string[];
  isActive: boolean;
  isFree: boolean;
  hasTrialPeriod: boolean;
  trialDays: number;
  features: string[];

  aiTokensIncluded?: number;
  aiTokensMonthlyLimit?: number | null;
  aiTokensDailyLimit?: number | null;
  aiOverageEnabled?: boolean;
  aiOverageRate?: string;
  aiOverageBlockEnabled?: boolean;
  aiBillingEnabled?: boolean;

  discountType?: "none" | "percentage" | "fixed_amount";
  discountValue?: number;
  discountDuration?: "permanent" | "first_month" | "first_year" | "limited_time";
  discountStartDate?: string;
  discountEndDate?: string;
  originalPrice?: number;


  storageLimit?: number; // in MB
  bandwidthLimit?: number; // monthly bandwidth in MB
  fileUploadLimit?: number; // max file size per upload in MB
  totalFilesLimit?: number; // max number of files

  createdAt: string;
  updatedAt: string;
}

export default function PlansPage() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAiConfigDialogOpen, setIsAiConfigDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [formData, setFormData] = useState<AdminPlanFormData>({
    name: "",
    description: "",
    price: 0,
    maxUsers: 5,
    maxContacts: 1000,
    maxChannels: 3,
    maxFlows: 1,
    maxCampaigns: 5,
    maxCampaignRecipients: 1000,
    campaignFeatures: ["basic_campaigns"],
    isActive: true,
    isFree: false,
    hasTrialPeriod: false,
    trialDays: 0,
    features: ["Basic chat", "Contact management", "1 flow"],

    aiTokensIncluded: 0,
    aiTokensMonthlyLimit: null as number | null,
    aiTokensDailyLimit: null as number | null,
    aiOverageEnabled: false,
    aiOverageRate: "0.000000",
    aiOverageBlockEnabled: false,
    aiBillingEnabled: false,


    discountType: "none" as "none" | "percentage" | "fixed_amount",
    discountValue: 0,
    discountDuration: "permanent" as "permanent" | "first_month" | "first_year" | "limited_time",
    discountStartDate: "",
    discountEndDate: "",
    originalPrice: undefined as number | undefined,


    storageLimit: 1024, // 1GB default
    bandwidthLimit: 10240, // 10GB default
    fileUploadLimit: 25, // 25MB default
    totalFilesLimit: 1000, // 1000 files default
    

    billingInterval: 'monthly' as 'lifetime' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'biennial' | 'custom',
    customDurationDays: null as number | null
  });

  useEffect(() => {
    if (!isLoading && user && !user.isSuperAdmin) {
      window.location.href = "/";
    }
  }, [user, isLoading]);

  const { data: plans, isLoading: isLoadingPlans } = useQuery<Plan[]>({
    queryKey: ['/api/admin/plans'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/plans");
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
    enabled: !!user?.isSuperAdmin
  });

  const filteredPlans = plans?.filter(plan =>
    plan.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const createPlanMutation = useMutation({
    mutationFn: async (data: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>) => {
      const res = await apiRequest("POST", "/api/admin/plans", data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.plans.error.create", "Failed to create plan"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: t("admin.plans.toast.created_title", "Plan Created"),
        description: t("admin.plans.toast.created_desc", "The plan has been created successfully"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.plans.error.create", "Failed to create plan"),
        variant: "destructive",
      });
    }
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<Plan> }) => {
      const res = await apiRequest("PUT", `/api/admin/plans/${id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.plans.error.update", "Failed to update plan"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      setIsEditDialogOpen(false);
      setSelectedPlan(null);
      toast({
        title: t("admin.plans.toast.updated_title", "Plan Updated"),
        description: t("admin.plans.toast.updated_desc", "The plan has been updated successfully"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.plans.error.update", "Failed to update plan"),
        variant: "destructive",
      });
    }
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/plans/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.plans.error.delete", "Failed to delete plan"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/plans'] });
      toast({
        title: t("admin.plans.toast.deleted_title", "Plan Deleted"),
        description: t("admin.plans.toast.deleted_desc", "The plan has been deleted successfully"),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.plans.error.delete", "Failed to delete plan"),
        variant: "destructive",
      });
    }
  });

  const handleCreatePlan = () => {
    createPlanMutation.mutate(formData);
  };

  const handleUpdatePlan = () => {
    if (!selectedPlan) return;
    updatePlanMutation.mutate({ id: selectedPlan.id, data: formData });
  };

  const handleDeletePlan = (id: number) => {
    deletePlanMutation.mutate(id);
  };

  const handleConfigureAiProviders = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsAiConfigDialogOpen(true);
  };

  const handleEditPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description,
      price: plan.price,
      maxUsers: plan.maxUsers,
      maxContacts: plan.maxContacts,
      maxChannels: plan.maxChannels,
      maxFlows: plan.maxFlows || 1,
      maxCampaigns: plan.maxCampaigns || 5,
      maxCampaignRecipients: plan.maxCampaignRecipients || 1000,
      campaignFeatures: [...(plan.campaignFeatures || ["basic_campaigns"])],
      isActive: plan.isActive,
      isFree: plan.isFree || false,
      hasTrialPeriod: plan.hasTrialPeriod || false,
      trialDays: plan.trialDays || 0,
      features: [...plan.features],

      aiTokensIncluded: plan.aiTokensIncluded || 0,
      aiTokensMonthlyLimit: plan.aiTokensMonthlyLimit || null,
      aiTokensDailyLimit: plan.aiTokensDailyLimit || null,
      aiOverageEnabled: plan.aiOverageEnabled || false,
      aiOverageRate: plan.aiOverageRate || "0.000000",
      aiOverageBlockEnabled: plan.aiOverageBlockEnabled || false,
      aiBillingEnabled: plan.aiBillingEnabled || false,


      discountType: (plan as any).discountType || "none",
      discountValue: (plan as any).discountValue || 0,
      discountDuration: (plan as any).discountDuration || "permanent",
      discountStartDate: (plan as any).discountStartDate ? new Date((plan as any).discountStartDate).toISOString().split('T')[0] : "",
      discountEndDate: (plan as any).discountEndDate ? new Date((plan as any).discountEndDate).toISOString().split('T')[0] : "",
      originalPrice: (plan as any).originalPrice || undefined,


      storageLimit: (plan as any).storageLimit || 1024,
      bandwidthLimit: (plan as any).bandwidthLimit || 10240,
      fileUploadLimit: (plan as any).fileUploadLimit ?? 25,
      totalFilesLimit: (plan as any).totalFilesLimit || 1000,
      

      billingInterval: (plan as any).billingInterval || 'monthly',
      customDurationDays: (plan as any).customDurationDays || null
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      price: 0,
      maxUsers: 5,
      maxContacts: 1000,
      maxChannels: 3,
      maxFlows: 1,
      maxCampaigns: 5,
      maxCampaignRecipients: 1000,
      campaignFeatures: ["basic_campaigns"],
      isActive: true,
      isFree: false,
      hasTrialPeriod: false,
      trialDays: 0,
      features: ["Basic chat", "Contact management", "1 flow"],

      aiTokensIncluded: 0,
      aiTokensMonthlyLimit: null,
      aiTokensDailyLimit: null,
      aiOverageEnabled: false,
      aiOverageRate: "0.000000",
      aiOverageBlockEnabled: false,
      aiBillingEnabled: false,


      discountType: "none",
      discountValue: 0,
      discountDuration: "permanent",
      discountStartDate: "",
      discountEndDate: "",
      originalPrice: undefined,


      storageLimit: 1024,
      bandwidthLimit: 10240,
      fileUploadLimit: 25,
      totalFilesLimit: 1000,
      

      billingInterval: 'monthly',
      customDurationDays: null
    });
  };

  const handleFeatureChange = (index: number, value: string) => {
    const newFeatures = [...formData.features];
    newFeatures[index] = value;
    setFormData({ ...formData, features: newFeatures });
  };

  const addFeature = () => {
    setFormData({ ...formData, features: [...formData.features, ""] });
  };

  const removeFeature = (index: number) => {
    const newFeatures = [...formData.features];
    newFeatures.splice(index, 1);
    setFormData({ ...formData, features: newFeatures });
  };

  const handleCampaignFeatureChange = (index: number, value: string) => {
    const newCampaignFeatures = [...formData.campaignFeatures];
    newCampaignFeatures[index] = value;
    setFormData({ ...formData, campaignFeatures: newCampaignFeatures });
  };

  const addCampaignFeature = () => {
    setFormData({ ...formData, campaignFeatures: [...formData.campaignFeatures, ""] });
  };

  const removeCampaignFeature = (index: number) => {
    const newCampaignFeatures = [...formData.campaignFeatures];
    newCampaignFeatures.splice(index, 1);
    setFormData({ ...formData, campaignFeatures: newCampaignFeatures });
  };

  if (isLoading) {
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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl">{t("admin.plans.title", "Subscription Plans")}</h1>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="brand"
                className="btn-brand-primary"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("admin.plans.new_plan", "New Plan")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>{t("admin.plans.create_title", "Create New Plan")}</DialogTitle>
                <DialogDescription>
                  {t("admin.plans.create_description", "Create a new subscription plan for your customers.")}
                </DialogDescription>
              </DialogHeader>
              <PlanFormFields
                idPrefix=""
                formData={formData}
                setFormData={setFormData}
                handleFeatureChange={handleFeatureChange}
                addFeature={addFeature}
                removeFeature={removeFeature}
                handleCampaignFeatureChange={handleCampaignFeatureChange}
                addCampaignFeature={addCampaignFeature}
                removeCampaignFeature={removeCampaignFeature}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {t("admin.plans.cancel", "Cancel")}
                </Button>
                <Button
                  onClick={handleCreatePlan}
                  disabled={createPlanMutation.isPending}
                  variant="brand"
                  className="btn-brand-primary"
                >
                  {createPlanMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("admin.plans.creating", "Creating...")}
                    </>
                  ) : (
                    t("admin.plans.create_plan", "Create Plan")
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("admin.plans.manage_title", "Manage Plans")}</CardTitle>
            <CardDescription>
              {t("admin.plans.manage_description", "View and manage all subscription plans in the system")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("admin.plans.search_placeholder", "Search plans...")}
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {isLoadingPlans ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredPlans?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm 
                  ? t("admin.plans.no_search_results", "No plans match your search") 
                  : t("admin.plans.empty_state", "No plans found. Create your first plan to get started.")}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPlans?.map((plan) => (
                  <Card
                key={plan.id}
                className={`overflow-hidden border-2 ${!plan.isActive ? "opacity-60" : "border-primary/20 hover:border-primary/50 transition-all"}`}
              >
                {!plan.isActive && (
                  <div className="bg-muted/80 text-muted-foreground text-xs font-medium py-1 px-3 text-center">
                    {t("admin.plans.inactive_badge", "Inactive Plan")}
                  </div>
                )}
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{plan.name}</CardTitle>
                      <CardDescription className="mt-1">{plan.description}</CardDescription>
                      <div className="flex gap-2 mt-2">
                        {plan.isFree && (
                          <span className="bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 text-xs font-medium py-1 px-2 rounded-full border border-emerald-500/20">
                            {t("admin.plans.badge.free", "Free")}
                          </span>
                        )}
                        {plan.hasTrialPeriod && plan.trialDays > 0 && (
                          <span className="bg-primary/15 text-primary text-xs font-medium py-1 px-2 rounded-full border border-primary/25">
                            {t("admin.plans.badge.trial_days", "{{days}} day trial", { days: plan.trialDays })}
                          </span>
                        )}
                      </div>
                    </div>
                    {plan.isActive && (
                      <div className="bg-primary/10 text-primary text-xs font-medium py-1 px-3 rounded-full">
                        {t("admin.plans.badge.active", "Active")}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pb-6">
                  <div className="mb-6">
                    <PriceDisplay
                      plan={plan}
                      size="lg"
                      showDiscountBadge={true}
                      showSavings={true}
                      layout="vertical"
                    />
                    <div className="text-center mt-2">
                      <span className="text-sm text-muted-foreground">
                        {t("admin.plans.duration_label", "Duration: {{value}}", {
                          value: formatPlanDurationShort(
                            (plan as any).billingInterval || "monthly",
                            (plan as any).customDurationDays,
                            t
                          ),
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-muted/30 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{plan.maxUsers}</div>
                      <div className="text-xs text-muted-foreground">{t("admin.plans.stat.users", "Users")}</div>
                    </div>
                    <div className="bg-muted/30 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{plan.maxContacts.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{t("admin.plans.stat.contacts", "Contacts")}</div>
                    </div>
                    <div className="bg-muted/30 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{plan.maxChannels}</div>
                      <div className="text-xs text-muted-foreground">{t("admin.plans.stat.channels", "Channels")}</div>
                    </div>
                    <div className="bg-muted/30 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{plan.maxFlows}</div>
                      <div className="text-xs text-muted-foreground">{t("admin.plans.stat.flows", "Flows")}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-primary/10 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{plan.maxCampaigns || 0}</div>
                      <div className="text-xs text-muted-foreground">{t("admin.plans.stat.campaigns", "Campaigns")}</div>
                    </div>
                    <div className="bg-primary/10 p-3 rounded-lg text-center">
                      <div className="text-lg font-semibold">{(plan.maxCampaignRecipients || 0).toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">{t("admin.plans.stat.recipients", "Recipients")}</div>
                    </div>
                  </div>

                  {/* Storage & Data Limits */}
                  <div className="rounded-lg border border-border bg-muted/30 p-4 mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <HardDrive className="w-4 h-4 text-primary" />
                      <h4 className="font-medium text-sm text-foreground">
                        {t("admin.plans.section.storage_limits", "Storage & Data Limits")}
                      </h4>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="rounded bg-background/80 border border-border/60 p-2 text-center">
                        <div className="text-sm font-semibold text-foreground">
                          {plan.storageLimit ? `${(plan.storageLimit / 1024).toFixed(1)} GB` : "1 GB"}
                        </div>
                        <div className="text-xs text-muted-foreground">{t("admin.plans.card.storage", "Storage")}</div>
                      </div>
                      <div className="rounded bg-background/80 border border-border/60 p-2 text-center">
                        <div className="text-sm font-semibold text-foreground">
                          {plan.bandwidthLimit ? `${(plan.bandwidthLimit / 1024).toFixed(1)} GB` : "10 GB"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("admin.plans.card.bandwidth_month", "Bandwidth/Month")}
                        </div>
                      </div>
                      <div className="rounded bg-background/80 border border-border/60 p-2 text-center">
                        <div className="text-sm font-semibold text-foreground">
                          {plan.fileUploadLimit === 0 ? t('common.unlimited', 'Unlimited') : `${plan.fileUploadLimit ?? 25} MB`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("admin.plans.card.max_file_size", "Max File Size")}
                        </div>
                      </div>
                      <div className="rounded bg-background/80 border border-border/60 p-2 text-center">
                        <div className="text-sm font-semibold text-foreground">
                          {(plan.totalFilesLimit || 1000).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">{t("admin.plans.card.total_files", "Total Files")}</div>
                      </div>
                    </div>
                  </div>

                  {/* AI Token Billing Information */}
                  {plan.aiBillingEnabled && (
                    <div className="rounded-lg border border-border bg-primary/5 p-4 mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <Bot className="w-4 h-4 text-primary" />
                        <h4 className="font-medium text-sm text-foreground">
                          {t("admin.plans.section.ai_token_billing", "AI Token Billing")}
                        </h4>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="rounded bg-background/80 border border-border/60 p-2 text-center">
                          <div className="text-sm font-semibold text-foreground">
                            {plan.aiTokensIncluded?.toLocaleString() || 0}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t("admin.plans.card.included_tokens", "Included Tokens")}
                          </div>
                        </div>
                        <div className="rounded bg-background/80 border border-border/60 p-2 text-center">
                          <div className="text-sm font-semibold text-foreground">
                            {plan.aiTokensMonthlyLimit ? plan.aiTokensMonthlyLimit.toLocaleString() : "∞"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t("admin.plans.card.monthly_limit", "Monthly Limit")}
                          </div>
                        </div>
                      </div>

                      {plan.aiOverageEnabled && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{t("admin.plans.card.overage_rate_label", "Overage Rate:")}</span>
                          <span className="font-medium text-foreground">
                            ${parseFloat(plan.aiOverageRate || "0").toFixed(6)}/token
                          </span>
                        </div>
                      )}

                      {plan.aiOverageBlockEnabled && (
                        <div className="flex items-center gap-1 mt-2">
                          <AlertTriangle className="w-3 h-3 text-amber-500 dark:text-amber-400" />
                          <span className="text-xs text-muted-foreground">
                            {t("admin.plans.card.usage_blocked", "Usage blocked when limits exceeded")}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">
                        {t("admin.plans.field.features", "Features")}
                      </h4>
                      <ul className="space-y-2">
                        {plan.features.map((feature, index) => (
                          <li key={index} className="flex items-start">
                            <Check className="h-4 w-4 text-primary mr-2 mt-1 shrink-0" />
                            <span className="text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {plan.campaignFeatures && plan.campaignFeatures.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">
                          {t("admin.plans.field.campaign_features", "Campaign Features")}
                        </h4>
                        <ul className="space-y-2">
                          {plan.campaignFeatures.map((feature, index) => (
                            <li key={index} className="flex items-start">
                              <Check className="h-4 w-4 text-primary mr-2 mt-1 shrink-0" />
                              <span className="text-sm capitalize">{feature.replace(/_/g, ' ')}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex justify-between bg-muted/20 pt-4 pb-4">
                  <div className="flex gap-2">
                    <Button
                      variant="brand"
                      size="sm"
                      onClick={() => handleEditPlan(plan)}
                      className="border-primary/30 hover:border-primary"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      {t("admin.plans.edit", "Edit")}
                    </Button>
                    {plan.aiBillingEnabled && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleConfigureAiProviders(plan)}
                        className="border-border"
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        {t("admin.plans.ai_config", "AI Config")}
                      </Button>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t("admin.plans.delete", "Delete")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="max-w-md max-h-[90vh]">
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("admin.plans.delete_confirm_title", "Are you sure?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t(
                            "admin.plans.delete_confirm_desc",
                            "This action cannot be undone. This will permanently delete the plan and remove it from our servers."
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="mt-4">
                        <AlertDialogCancel>{t("admin.plans.cancel", "Cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeletePlan(plan.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t("admin.plans.delete", "Delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{t("admin.plans.edit_dialog_title", "Edit Plan")}</DialogTitle>
            <DialogDescription>
              {t("admin.plans.edit_description", "Update the subscription plan details.")}
            </DialogDescription>
          </DialogHeader>
          <PlanFormFields
            idPrefix="edit-"
            formData={formData}
            setFormData={setFormData}
            handleFeatureChange={handleFeatureChange}
            addFeature={addFeature}
            removeFeature={removeFeature}
            handleCampaignFeatureChange={handleCampaignFeatureChange}
            addCampaignFeature={addCampaignFeature}
            removeCampaignFeature={removeCampaignFeature}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {t("admin.plans.cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleUpdatePlan}
              disabled={updatePlanMutation.isPending}
              variant="brand"
              className="btn-brand-primary"
            >
              {updatePlanMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("admin.plans.updating", "Updating...")}
                </>
              ) : (
                t("admin.plans.update_plan", "Update Plan")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Provider Configuration Dialog */}
      <Dialog open={isAiConfigDialogOpen} onOpenChange={setIsAiConfigDialogOpen}>
        <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("admin.plans.ai_provider.dialog_title", "AI Provider Configuration")}</DialogTitle>
            <DialogDescription>
              {t("admin.plans.ai_provider.dialog_description", "Configure AI provider-specific settings for {{planName}}", {
                planName: selectedPlan?.name ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {selectedPlan && (
              <AiProviderConfigManager
                planId={selectedPlan.id}
                planName={selectedPlan.name}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiConfigDialogOpen(false)}>
              {t("admin.plans.close", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
