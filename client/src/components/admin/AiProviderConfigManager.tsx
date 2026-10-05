import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Edit, Trash2, Settings } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { OpenAIIcon } from "@/components/ui/openai-icon";
import { AzureIcon } from "@/components/ui/azure-icon";
import { OpenRouterIcon } from "@/components/ui/openrouter-icon";

interface AiProviderConfig {
  id: number;
  planId: number;
  provider: string;
  tokensMonthlyLimit?: number | null;
  tokensDailyLimit?: number | null;
  customPricingEnabled: boolean;
  inputTokenRate?: string | null;
  outputTokenRate?: string | null;
  enabled: boolean;
  priority: number;
  metadata: any;
  createdAt: string;
  updatedAt: string;
}

interface AiProviderConfigManagerProps {
  planId: number;
  planName: string;
}

export default function AiProviderConfigManager({ planId, planName }: AiProviderConfigManagerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<AiProviderConfig | null>(null);

  const AI_PROVIDERS = useMemo(
    () => [
      {
        value: "openai",
        label: t("admin.plans.ai_provider.openai", "OpenAI"),
        badgeClass: "border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
        icon: <OpenAIIcon className="w-4 h-4" />,
      },
      {
        value: "openrouter",
        label: t("admin.plans.ai_provider.openrouter", "OpenRouter"),
        badgeClass: "border border-primary/30 bg-primary/10 text-primary",
        icon: <OpenRouterIcon className="w-4 h-4" size={16} />,
      },
      {
        value: "azure",
        label: t("admin.plans.ai_provider.azure", "Azure OpenAI"),
        badgeClass: "border border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200",
        icon: <AzureIcon className="w-4 h-4" size={16} />,
      },
    ],
    [t]
  );

  const [formData, setFormData] = useState({
    provider: "",
    tokensMonthlyLimit: null as number | null,
    tokensDailyLimit: null as number | null,
    customPricingEnabled: false,
    inputTokenRate: null as string | null,
    outputTokenRate: null as string | null,
    enabled: true,
    priority: 0,
  });

  const { data: configs, isLoading } = useQuery<AiProviderConfig[]>({
    queryKey: [`/api/admin/plans/${planId}/ai-providers`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/plans/${planId}/ai-providers`);
      if (!res.ok) throw new Error("Failed to fetch AI provider configs");
      return res.json();
    },
  });

  const createConfigMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", `/api/admin/plans/${planId}/ai-providers`, {
        ...data,
        planId,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.plans.ai_provider.error.create", "Failed to create provider config"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/plans/${planId}/ai-providers`] });
      setIsCreateDialogOpen(false);
      resetForm();
      toast({
        title: t("admin.plans.ai_provider.toast.created_title", "Provider Config Created"),
        description: t(
          "admin.plans.ai_provider.toast.created_desc",
          "AI provider configuration has been created successfully"
        ),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.plans.ai_provider.error.create", "Failed to create provider config"),
        variant: "destructive",
      });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof formData> }) => {
      const res = await apiRequest("PUT", `/api/admin/plans/${planId}/ai-providers/${id}`, data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.plans.ai_provider.error.update", "Failed to update provider config"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/plans/${planId}/ai-providers`] });
      setIsEditDialogOpen(false);
      setSelectedConfig(null);
      toast({
        title: t("admin.plans.ai_provider.toast.updated_title", "Provider Config Updated"),
        description: t(
          "admin.plans.ai_provider.toast.updated_desc",
          "AI provider configuration has been updated successfully"
        ),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.plans.ai_provider.error.update", "Failed to update provider config"),
        variant: "destructive",
      });
    },
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/plans/${planId}/ai-providers/${id}`);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || t("admin.plans.ai_provider.error.delete", "Failed to delete provider config"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/plans/${planId}/ai-providers`] });
      toast({
        title: t("admin.plans.ai_provider.toast.deleted_title", "Provider Config Deleted"),
        description: t(
          "admin.plans.ai_provider.toast.deleted_desc",
          "AI provider configuration has been deleted successfully"
        ),
      });
    },
    onError: (error: any) => {
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("admin.plans.ai_provider.error.delete", "Failed to delete provider config"),
        variant: "destructive",
      });
    },
  });

  const handleCreateConfig = () => {
    createConfigMutation.mutate(formData);
  };

  const handleUpdateConfig = () => {
    if (!selectedConfig) return;
    updateConfigMutation.mutate({ id: selectedConfig.id, data: formData });
  };

  const handleEditConfig = (config: AiProviderConfig) => {
    setSelectedConfig(config);
    setFormData({
      provider: config.provider,
      tokensMonthlyLimit: config.tokensMonthlyLimit ?? null,
      tokensDailyLimit: config.tokensDailyLimit ?? null,
      customPricingEnabled: config.customPricingEnabled,
      inputTokenRate: config.inputTokenRate ?? null,
      outputTokenRate: config.outputTokenRate ?? null,
      enabled: config.enabled,
      priority: config.priority,
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteConfig = (id: number) => {
    deleteConfigMutation.mutate(id);
  };

  const resetForm = () => {
    setFormData({
      provider: "",
      tokensMonthlyLimit: null,
      tokensDailyLimit: null,
      customPricingEnabled: false,
      inputTokenRate: null,
      outputTokenRate: null,
      enabled: true,
      priority: 0,
    });
  };

  const getProviderInfo = (provider: string) => {
    return (
      AI_PROVIDERS.find((p) => p.value === provider) || {
        value: provider,
        label: provider,
        badgeClass: "border border-border bg-muted text-foreground",
        icon: "🔧" as const,
      }
    );
  };

  const getUsedProviders = () => {
    return configs?.map((config) => config.provider) || [];
  };

  const getAvailableProviders = () => {
    const usedProviders = getUsedProviders();
    return AI_PROVIDERS.filter((provider) => !usedProviders.includes(provider.value));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              {t("admin.plans.ai_provider.card_title", "AI Provider Configurations")}
            </CardTitle>
            <CardDescription>
              {t("admin.plans.ai_provider.card_description", "Configure provider-specific limits and pricing for {{planName}}", {
                planName,
              })}
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={getAvailableProviders().length === 0}>
                <Plus className="mr-2 h-4 w-4" />
                {t("admin.plans.ai_provider.add_provider", "Add Provider")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t("admin.plans.ai_provider.add_dialog_title", "Add AI Provider Configuration")}</DialogTitle>
                <DialogDescription>
                  {t("admin.plans.ai_provider.add_dialog_desc", "Configure provider-specific settings for this plan.")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="provider">{t("admin.plans.ai_provider.field_provider", "AI Provider")}</Label>
                  <Select value={formData.provider} onValueChange={(value) => setFormData({ ...formData, provider: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("admin.plans.ai_provider.select_provider", "Select an AI provider")} />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableProviders().map((provider) => (
                        <SelectItem key={provider.value} value={provider.value}>
                          <div className="flex items-center gap-2">
                            {provider.icon}
                            <span>{provider.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="tokensMonthlyLimit">{t("admin.plans.field.monthly_token_limit", "Monthly Token Limit")}</Label>
                    <Input
                      id="tokensMonthlyLimit"
                      type="number"
                      min="0"
                      value={formData.tokensMonthlyLimit || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tokensMonthlyLimit: e.target.value ? parseInt(e.target.value) : null,
                        })
                      }
                      placeholder={t("admin.plans.placeholder.unlimited", "Leave empty for unlimited")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="tokensDailyLimit">{t("admin.plans.field.daily_token_limit", "Daily Token Limit")}</Label>
                    <Input
                      id="tokensDailyLimit"
                      type="number"
                      min="0"
                      value={formData.tokensDailyLimit || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tokensDailyLimit: e.target.value ? parseInt(e.target.value) : null,
                        })
                      }
                      placeholder={t("admin.plans.placeholder.unlimited", "Leave empty for unlimited")}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="customPricingEnabled"
                    checked={formData.customPricingEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, customPricingEnabled: checked })}
                  />
                  <Label htmlFor="customPricingEnabled">
                    {t("admin.plans.ai_provider.enable_custom_pricing", "Enable Custom Pricing")}
                  </Label>
                </div>

                {formData.customPricingEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="inputTokenRate">{t("admin.plans.ai_provider.input_rate", "Input Token Rate ($/token)")}</Label>
                      <Input
                        id="inputTokenRate"
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={formData.inputTokenRate || ""}
                        onChange={(e) => setFormData({ ...formData, inputTokenRate: e.target.value || null })}
                        placeholder="0.00000000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="outputTokenRate">{t("admin.plans.ai_provider.output_rate", "Output Token Rate ($/token)")}</Label>
                      <Input
                        id="outputTokenRate"
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={formData.outputTokenRate || ""}
                        onChange={(e) => setFormData({ ...formData, outputTokenRate: e.target.value || null })}
                        placeholder="0.00000000"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Switch
                    id="enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  />
                  <Label htmlFor="enabled">{t("admin.plans.ai_provider.enable_provider", "Enable this provider")}</Label>
                </div>

                <div>
                  <Label htmlFor="priority">{t("admin.plans.ai_provider.priority", "Priority (0 = highest)")}</Label>
                  <Input
                    id="priority"
                    type="number"
                    min="0"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {t("admin.plans.cancel", "Cancel")}
                </Button>
                <Button onClick={handleCreateConfig} disabled={createConfigMutation.isPending || !formData.provider}>
                  {createConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("admin.plans.ai_provider.create_config", "Create Configuration")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t("admin.plans.ai_provider.edit_dialog_title", "Edit AI Provider Configuration")}</DialogTitle>
                <DialogDescription>
                  {t("admin.plans.ai_provider.edit_dialog_desc", "Update provider-specific settings for {{label}}.", {
                    label: selectedConfig ? getProviderInfo(selectedConfig.provider).label : "",
                  })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-tokensMonthlyLimit">{t("admin.plans.field.monthly_token_limit", "Monthly Token Limit")}</Label>
                    <Input
                      id="edit-tokensMonthlyLimit"
                      type="number"
                      min="0"
                      value={formData.tokensMonthlyLimit || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tokensMonthlyLimit: e.target.value ? parseInt(e.target.value) : null,
                        })
                      }
                      placeholder={t("admin.plans.placeholder.unlimited", "Leave empty for unlimited")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-tokensDailyLimit">{t("admin.plans.field.daily_token_limit", "Daily Token Limit")}</Label>
                    <Input
                      id="edit-tokensDailyLimit"
                      type="number"
                      min="0"
                      value={formData.tokensDailyLimit || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          tokensDailyLimit: e.target.value ? parseInt(e.target.value) : null,
                        })
                      }
                      placeholder={t("admin.plans.placeholder.unlimited", "Leave empty for unlimited")}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-customPricingEnabled"
                    checked={formData.customPricingEnabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, customPricingEnabled: checked })}
                  />
                  <Label htmlFor="edit-customPricingEnabled">
                    {t("admin.plans.ai_provider.enable_custom_pricing", "Enable Custom Pricing")}
                  </Label>
                </div>

                {formData.customPricingEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-inputTokenRate">{t("admin.plans.ai_provider.input_rate", "Input Token Rate ($/token)")}</Label>
                      <Input
                        id="edit-inputTokenRate"
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={formData.inputTokenRate || ""}
                        onChange={(e) => setFormData({ ...formData, inputTokenRate: e.target.value || null })}
                        placeholder="0.00000000"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-outputTokenRate">{t("admin.plans.ai_provider.output_rate", "Output Token Rate ($/token)")}</Label>
                      <Input
                        id="edit-outputTokenRate"
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={formData.outputTokenRate || ""}
                        onChange={(e) => setFormData({ ...formData, outputTokenRate: e.target.value || null })}
                        placeholder="0.00000000"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Switch
                    id="edit-enabled"
                    checked={formData.enabled}
                    onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                  />
                  <Label htmlFor="edit-enabled">{t("admin.plans.ai_provider.enable_provider", "Enable this provider")}</Label>
                </div>

                <div>
                  <Label htmlFor="edit-priority">{t("admin.plans.ai_provider.priority", "Priority (0 = highest)")}</Label>
                  <Input
                    id="edit-priority"
                    type="number"
                    min="0"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  {t("admin.plans.cancel", "Cancel")}
                </Button>
                <Button onClick={handleUpdateConfig} disabled={updateConfigMutation.isPending}>
                  {updateConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("admin.plans.ai_provider.update_config", "Update Configuration")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : configs?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("admin.plans.ai_provider.empty", "No AI provider configurations found. Add a provider to get started.")}
          </div>
        ) : (
          <div className="space-y-4">
            {configs?.map((config) => {
              const providerInfo = getProviderInfo(config.provider);
              return (
                <div key={config.id} className="border border-border rounded-lg p-4 bg-card">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-3">
                      <Badge className={providerInfo.badgeClass}>
                        <div className="flex items-center gap-1">
                          {providerInfo.icon}
                          <span>{providerInfo.label}</span>
                        </div>
                      </Badge>
                      {!config.enabled && <Badge variant="secondary">{t("admin.plans.state.disabled", "Disabled")}</Badge>}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleEditConfig(config)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteConfig(config.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">{t("admin.plans.ai_provider.monthly_limit_label", "Monthly Limit:")}</span>
                      <span className="ml-2 font-medium">
                        {config.tokensMonthlyLimit ? config.tokensMonthlyLimit.toLocaleString() : t("admin.plans.unlimited", "Unlimited")}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t("admin.plans.ai_provider.daily_limit_label", "Daily Limit:")}</span>
                      <span className="ml-2 font-medium">
                        {config.tokensDailyLimit ? config.tokensDailyLimit.toLocaleString() : t("admin.plans.unlimited", "Unlimited")}
                      </span>
                    </div>
                    {config.customPricingEnabled && (
                      <>
                        <div>
                          <span className="text-muted-foreground">{t("admin.plans.ai_provider.input_rate_label", "Input Rate:")}</span>
                          <span className="ml-2 font-medium">
                            ${parseFloat(config.inputTokenRate || "0").toFixed(8)}/token
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("admin.plans.ai_provider.output_rate_label", "Output Rate:")}</span>
                          <span className="ml-2 font-medium">
                            ${parseFloat(config.outputTokenRate || "0").toFixed(8)}/token
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
