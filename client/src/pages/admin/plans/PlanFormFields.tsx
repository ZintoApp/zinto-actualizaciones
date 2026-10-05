import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bot, Zap, DollarSign, AlertTriangle, Settings, HardDrive, Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";

const nativeSelectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export type AdminPlanFormData = {
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
  aiTokensIncluded: number;
  aiTokensMonthlyLimit: number | null;
  aiTokensDailyLimit: number | null;
  aiOverageEnabled: boolean;
  aiOverageRate: string;
  aiOverageBlockEnabled: boolean;
  aiBillingEnabled: boolean;
  discountType: "none" | "percentage" | "fixed_amount";
  discountValue: number;
  discountDuration: "permanent" | "first_month" | "first_year" | "limited_time";
  discountStartDate: string;
  discountEndDate: string;
  originalPrice: number | undefined;
  storageLimit: number;
  bandwidthLimit: number;
  fileUploadLimit: number;
  totalFilesLimit: number;
  billingInterval:
    | "lifetime"
    | "daily"
    | "weekly"
    | "biweekly"
    | "monthly"
    | "quarterly"
    | "semi_annual"
    | "annual"
    | "biennial"
    | "custom";
  customDurationDays: number | null;
};

type PlanFormFieldsProps = {
  idPrefix: string;
  formData: AdminPlanFormData;
  setFormData: Dispatch<SetStateAction<AdminPlanFormData>>;
  handleFeatureChange: (index: number, value: string) => void;
  addFeature: () => void;
  removeFeature: (index: number) => void;
  handleCampaignFeatureChange: (index: number, value: string) => void;
  addCampaignFeature: () => void;
  removeCampaignFeature: (index: number) => void;
};

export function PlanFormFields({
  idPrefix,
  formData,
  setFormData,
  handleFeatureChange,
  addFeature,
  removeFeature,
  handleCampaignFeatureChange,
  addCampaignFeature,
  removeCampaignFeature,
}: PlanFormFieldsProps) {
  const { t } = useTranslation();
  const pid = (name: string) => `${idPrefix}${name}`;

  return (
    <div className="grid gap-4 py-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("name")} className="sm:text-right">
          {t("admin.plans.field.name", "Name")}
        </Label>
        <Input
          id={pid("name")}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="sm:col-span-3"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("description")} className="sm:text-right">
          {t("admin.plans.field.description", "Description")}
        </Label>
        <Input
          id={pid("description")}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="sm:col-span-3"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("price")} className="sm:text-right">
          {t("admin.plans.field.price_usd", "Price ($)")}
        </Label>
        <Input
          id={pid("price")}
          type="number"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
          className="sm:col-span-3"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("maxUsers")} className="sm:text-right">
          {t("admin.plans.field.max_users", "Max Users")}
        </Label>
        <Input
          id={pid("maxUsers")}
          type="number"
          value={formData.maxUsers}
          onChange={(e) => setFormData({ ...formData, maxUsers: parseInt(e.target.value) })}
          className="sm:col-span-3"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("maxContacts")} className="sm:text-right">
          {t("admin.plans.field.max_contacts", "Max Contacts")}
        </Label>
        <Input
          id={pid("maxContacts")}
          type="number"
          value={formData.maxContacts}
          onChange={(e) => setFormData({ ...formData, maxContacts: parseInt(e.target.value) })}
          className="sm:col-span-3"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("maxChannels")} className="sm:text-right">
          {t("admin.plans.field.max_channels", "Max Channels")}
        </Label>
        <Input
          id={pid("maxChannels")}
          type="number"
          value={formData.maxChannels}
          onChange={(e) => setFormData({ ...formData, maxChannels: parseInt(e.target.value) })}
          className="sm:col-span-3"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("maxFlows")} className="sm:text-right">
          {t("admin.plans.field.max_flows", "Max Flows")}
        </Label>
        <Input
          id={pid("maxFlows")}
          type="number"
          value={formData.maxFlows}
          onChange={(e) => setFormData({ ...formData, maxFlows: parseInt(e.target.value) })}
          className="sm:col-span-3"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("maxCampaigns")} className="sm:text-right">
          {t("admin.plans.field.max_campaigns", "Max Campaigns")}
        </Label>
        <Input
          id={pid("maxCampaigns")}
          type="number"
          value={formData.maxCampaigns}
          onChange={(e) => setFormData({ ...formData, maxCampaigns: parseInt(e.target.value) })}
          className="sm:col-span-3"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("maxCampaignRecipients")} className="sm:text-right">
          {t("admin.plans.field.max_recipients", "Max Recipients")}
        </Label>
        <Input
          id={pid("maxCampaignRecipients")}
          type="number"
          value={formData.maxCampaignRecipients}
          onChange={(e) => setFormData({ ...formData, maxCampaignRecipients: parseInt(e.target.value) })}
          className="sm:col-span-3"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("isActive")} className="sm:text-right">
          {t("admin.plans.field.active", "Active")}
        </Label>
        <div className="sm:col-span-3 flex items-center space-x-2">
          <Switch
            id={pid("isActive")}
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
          />
          <Label htmlFor={pid("isActive")}>
            {formData.isActive
              ? t("admin.plans.state.active", "Active")
              : t("admin.plans.state.inactive", "Inactive")}
          </Label>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("isFree")} className="sm:text-right">
          {t("admin.plans.field.free_plan", "Free Plan")}
        </Label>
        <div className="sm:col-span-3 flex items-center space-x-2">
          <Switch
            id={pid("isFree")}
            checked={formData.isFree}
            onCheckedChange={(checked) => setFormData({ ...formData, isFree: checked })}
          />
          <Label htmlFor={pid("isFree")}>
            {formData.isFree ? t("admin.plans.state.free", "Free") : t("admin.plans.state.paid", "Paid")}
          </Label>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
        <Label htmlFor={pid("hasTrialPeriod")} className="sm:text-right">
          {t("admin.plans.field.trial_period", "Trial Period")}
        </Label>
        <div className="sm:col-span-3 flex items-center space-x-2">
          <Switch
            id={pid("hasTrialPeriod")}
            checked={formData.hasTrialPeriod}
            onCheckedChange={(checked) => setFormData({ ...formData, hasTrialPeriod: checked })}
          />
          <Label htmlFor={pid("hasTrialPeriod")}>
            {formData.hasTrialPeriod
              ? t("admin.plans.state.has_trial", "Has Trial")
              : t("admin.plans.state.no_trial", "No Trial")}
          </Label>
        </div>
      </div>
      {formData.hasTrialPeriod && (
        <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4">
          <Label htmlFor={pid("trialDays")} className="sm:text-right">
            {t("admin.plans.field.trial_days", "Trial Days")}
          </Label>
          <Input
            id={pid("trialDays")}
            type="number"
            min="1"
            max="365"
            value={formData.trialDays}
            onChange={(e) => setFormData({ ...formData, trialDays: parseInt(e.target.value) || 0 })}
            className="sm:col-span-3"
            placeholder={t(
              "admin.plans.placeholder.trial_days",
              "Number of trial days (e.g., 7, 14, 30)"
            )}
          />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Label className="sm:text-right pt-2">{t("admin.plans.field.features", "Features")}</Label>
        <div className="sm:col-span-3 space-y-2">
          {formData.features.map((feature, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={feature}
                onChange={(e) => handleFeatureChange(index, e.target.value)}
                placeholder={t("admin.plans.placeholder.feature", "Feature description")}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeFeature(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="brand"
            size="sm"
            onClick={addFeature}
            className="mt-2 border-primary/30 hover:border-primary"
          >
            {t("admin.plans.action.add_feature", "Add Feature")}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Label className="sm:text-right pt-2">
          {t("admin.plans.field.campaign_features", "Campaign Features")}
        </Label>
        <div className="sm:col-span-3 space-y-2">
          {formData.campaignFeatures.map((feature, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={feature}
                onChange={(e) => handleCampaignFeatureChange(index, e.target.value)}
                placeholder={t(
                  "admin.plans.placeholder.campaign_feature",
                  "Campaign feature (e.g., basic_campaigns, templates, segments)"
                )}
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeCampaignFeature(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="brand"
            size="sm"
            onClick={addCampaignFeature}
            className="mt-2 border-primary/30 hover:border-primary"
          >
            {t("admin.plans.action.add_campaign_feature", "Add Campaign Feature")}
          </Button>
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center gap-2 mb-4">
          <Bot className="w-4 h-4 text-primary" />
          <Label className="text-sm font-semibold text-foreground">
            {t("admin.plans.section.ai_token_billing", "AI Token Billing")}
          </Label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
          <Label htmlFor={pid("aiBillingEnabled")} className="sm:text-right">
            {t("admin.plans.field.enable_ai_billing", "Enable AI Billing")}
          </Label>
          <div className="sm:col-span-3 flex items-center space-x-2">
            <Switch
              id={pid("aiBillingEnabled")}
              checked={formData.aiBillingEnabled}
              onCheckedChange={(checked) => setFormData({ ...formData, aiBillingEnabled: checked })}
            />
            <Label htmlFor={pid("aiBillingEnabled")}>
              {formData.aiBillingEnabled
                ? t("admin.plans.state.enabled", "Enabled")
                : t("admin.plans.state.disabled", "Disabled")}
            </Label>
          </div>
        </div>

        {formData.aiBillingEnabled && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
              <Label htmlFor={pid("aiTokensIncluded")} className="sm:text-right">
                <div className="flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {t("admin.plans.field.included_tokens", "Included Tokens")}
                </div>
              </Label>
              <Input
                id={pid("aiTokensIncluded")}
                type="number"
                min="0"
                value={formData.aiTokensIncluded}
                onChange={(e) => setFormData({ ...formData, aiTokensIncluded: parseInt(e.target.value) || 0 })}
                className="sm:col-span-3"
                placeholder={t("admin.plans.placeholder.tokens_included", "Number of tokens included in base price")}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor={pid("aiTokensMonthlyLimit")} className="text-xs font-medium text-foreground">
                  {t("admin.plans.field.monthly_token_limit", "Monthly Token Limit")}
                </Label>
                <Input
                  id={pid("aiTokensMonthlyLimit")}
                  type="number"
                  min="0"
                  value={formData.aiTokensMonthlyLimit || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      aiTokensMonthlyLimit: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  className="mt-1"
                  placeholder={t("admin.plans.placeholder.unlimited", "Leave empty for unlimited")}
                />
              </div>
              <div>
                <Label htmlFor={pid("aiTokensDailyLimit")} className="text-xs font-medium text-foreground">
                  {t("admin.plans.field.daily_token_limit", "Daily Token Limit")}
                </Label>
                <Input
                  id={pid("aiTokensDailyLimit")}
                  type="number"
                  min="0"
                  value={formData.aiTokensDailyLimit || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      aiTokensDailyLimit: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  className="mt-1"
                  placeholder={t("admin.plans.placeholder.unlimited", "Leave empty for unlimited")}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
              <Label htmlFor={pid("aiOverageEnabled")} className="sm:text-right">
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  {t("admin.plans.field.allow_overages", "Allow Overages")}
                </div>
              </Label>
              <div className="sm:col-span-3 flex items-center space-x-2">
                <Switch
                  id={pid("aiOverageEnabled")}
                  checked={formData.aiOverageEnabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, aiOverageEnabled: checked })}
                />
                <Label htmlFor={pid("aiOverageEnabled")}>
                  {formData.aiOverageEnabled
                    ? t("admin.plans.state.enabled", "Enabled")
                    : t("admin.plans.state.disabled", "Disabled")}
                </Label>
              </div>
            </div>

            {formData.aiOverageEnabled && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                  <Label htmlFor={pid("aiOverageRate")} className="sm:text-right">
                    {t("admin.plans.field.overage_rate", "Overage Rate ($/token)")}
                  </Label>
                  <Input
                    id={pid("aiOverageRate")}
                    type="number"
                    step="0.000001"
                    min="0"
                    value={formData.aiOverageRate}
                    onChange={(e) => setFormData({ ...formData, aiOverageRate: e.target.value || "0.000000" })}
                    className="sm:col-span-3"
                    placeholder={t(
                      "admin.plans.placeholder.overage_cost",
                      "Cost per token for usage beyond limits"
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                  <Label htmlFor={pid("aiOverageBlockEnabled")} className="sm:text-right">
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {t("admin.plans.field.block_on_exceed", "Block on Exceed")}
                    </div>
                  </Label>
                  <div className="sm:col-span-3 flex items-center space-x-2">
                    <Switch
                      id={pid("aiOverageBlockEnabled")}
                      checked={formData.aiOverageBlockEnabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, aiOverageBlockEnabled: checked })}
                    />
                    <Label htmlFor={pid("aiOverageBlockEnabled")}>
                      {formData.aiOverageBlockEnabled
                        ? t("admin.plans.hint.block_when_exceeded", "Block usage when limits exceeded")
                        : t("admin.plans.hint.allow_with_overage", "Allow usage with overage charges")}
                    </Label>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        <div className="border-t border-border pt-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-primary" />
            <Label className="text-sm font-semibold text-foreground">
              {t("admin.plans.section.plan_duration", "Plan Duration")}
            </Label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
            <Label htmlFor={pid("billingInterval")} className="sm:text-right">
              {t("admin.plans.field.duration_type", "Duration Type")}
            </Label>
            <div className="sm:col-span-3">
              <Select
                value={formData.billingInterval}
                onValueChange={(value: AdminPlanFormData["billingInterval"]) =>
                  setFormData({
                    ...formData,
                    billingInterval: value,
                    customDurationDays: value === "custom" ? formData.customDurationDays : null,
                  })
                }
              >
                <SelectTrigger id={pid("billingInterval")}>
                  <SelectValue placeholder={t("admin.plans.placeholder.duration_type", "Select duration type")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lifetime">
                    {t("admin.plans.billing.lifetime", "One-time payment / Lifetime")}
                  </SelectItem>
                  <SelectItem value="daily">{t("admin.plans.billing.daily", "Daily (24 hours)")}</SelectItem>
                  <SelectItem value="weekly">{t("admin.plans.billing.weekly", "Weekly (7 days)")}</SelectItem>
                  <SelectItem value="biweekly">{t("admin.plans.billing.biweekly", "Bi-weekly (14 days)")}</SelectItem>
                  <SelectItem value="monthly">{t("admin.plans.billing.monthly", "Monthly (30 days)")}</SelectItem>
                  <SelectItem value="quarterly">{t("admin.plans.billing.quarterly", "Quarterly (3 months)")}</SelectItem>
                  <SelectItem value="semi_annual">
                    {t("admin.plans.billing.semi_annual", "Semi-annual (6 months)")}
                  </SelectItem>
                  <SelectItem value="annual">{t("admin.plans.billing.annual", "Annual (12 months)")}</SelectItem>
                  <SelectItem value="biennial">{t("admin.plans.billing.biennial", "Biennial (2 years)")}</SelectItem>
                  <SelectItem value="custom">{t("admin.plans.billing.custom", "Custom duration")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.billingInterval === "custom" && (
            <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
              <Label htmlFor={pid("customDurationDays")} className="sm:text-right">
                {t("admin.plans.field.custom_days", "Custom Days")}
              </Label>
              <div className="sm:col-span-3">
                <Input
                  id={pid("customDurationDays")}
                  type="number"
                  min="1"
                  value={formData.customDurationDays || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, customDurationDays: parseInt(e.target.value) || null })
                  }
                  placeholder={t("admin.plans.placeholder.custom_days", "Enter number of days")}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("admin.plans.hint.custom_days", "Enter the number of days for this plan duration")}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="w-4 h-4 text-primary" />
            <Label className="text-sm font-semibold text-foreground">
              {t("admin.plans.section.storage_limits", "Storage & Data Limits")}
            </Label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
            <Label htmlFor={pid("storageLimit")} className="sm:text-right">
              {t("admin.plans.field.storage_limit_mb", "Storage Limit (MB)")}
            </Label>
            <div className="sm:col-span-3">
              <Input
                id={pid("storageLimit")}
                type="number"
                min="0"
                value={formData.storageLimit}
                onChange={(e) => setFormData({ ...formData, storageLimit: parseInt(e.target.value) || 0 })}
                placeholder="1024"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {formData.storageLimit
                  ? t("admin.plans.hint.gb_equivalent", "{{gb}} GB", {
                      gb: (formData.storageLimit / 1024).toFixed(2),
                    })
                  : t("admin.plans.hint.gb_zero", "0 GB")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
            <Label htmlFor={pid("bandwidthLimit")} className="sm:text-right">
              {t("admin.plans.field.bandwidth_limit_mb", "Monthly Bandwidth (MB)")}
            </Label>
            <div className="sm:col-span-3">
              <Input
                id={pid("bandwidthLimit")}
                type="number"
                min="0"
                value={formData.bandwidthLimit}
                onChange={(e) => setFormData({ ...formData, bandwidthLimit: parseInt(e.target.value) || 0 })}
                placeholder="10240"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {formData.bandwidthLimit
                  ? t("admin.plans.hint.gb_equivalent", "{{gb}} GB", {
                      gb: (formData.bandwidthLimit / 1024).toFixed(2),
                    })
                  : t("admin.plans.hint.gb_zero", "0 GB")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
            <Label htmlFor={pid("fileUploadLimit")} className="sm:text-right">
              {t("admin.plans.field.max_file_upload_mb", "Max File Upload (MB)")}
            </Label>
            <div className="sm:col-span-3">
              <Input
                id={pid("fileUploadLimit")}
                type="number"
                min="0"
                value={formData.fileUploadLimit}
                onChange={(e) => setFormData({ ...formData, fileUploadLimit: parseInt(e.target.value) || 0 })}
                placeholder="25"
              />
              <p className="text-xs text-muted-foreground">{t("admin.plans.file_upload_unlimited_hint", "0 means unlimited by the plan. Channel limits still apply.")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
            <Label htmlFor={pid("totalFilesLimit")} className="sm:text-right">
              {t("admin.plans.field.total_files_limit", "Total Files Limit")}
            </Label>
            <div className="sm:col-span-3">
              <Input
                id={pid("totalFilesLimit")}
                type="number"
                min="0"
                value={formData.totalFilesLimit}
                onChange={(e) => setFormData({ ...formData, totalFilesLimit: parseInt(e.target.value) || 0 })}
                placeholder="1000"
              />
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-primary" />
            <Label className="text-sm font-semibold text-foreground">
              {t("admin.plans.section.plan_discount", "Plan Discount")}
            </Label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
            <Label htmlFor={pid("discountType")} className="sm:text-right">
              {t("admin.plans.field.discount_type", "Discount Type")}
            </Label>
            <div className="sm:col-span-3">
              <select
                id={pid("discountType")}
                value={formData.discountType}
                onChange={(e) => setFormData({ ...formData, discountType: e.target.value as AdminPlanFormData["discountType"] })}
                className={nativeSelectClass}
              >
                <option value="none">{t("admin.plans.discount.none", "No Discount")}</option>
                <option value="percentage">{t("admin.plans.discount.percentage", "Percentage Discount")}</option>
                <option value="fixed_amount">{t("admin.plans.discount.fixed_amount", "Fixed Amount Discount")}</option>
              </select>
            </div>
          </div>

          {formData.discountType !== "none" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                <Label htmlFor={pid("discountValue")} className="sm:text-right">
                  {t("admin.plans.field.discount_value", "Discount Value")}
                </Label>
                <div className="sm:col-span-3">
                  <div className="relative">
                    {formData.discountType === "percentage" && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                    )}
                    {formData.discountType === "fixed_amount" && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    )}
                    <Input
                      id={pid("discountValue")}
                      type="number"
                      min="0"
                      max={formData.discountType === "percentage" ? "100" : undefined}
                      step={formData.discountType === "percentage" ? "1" : "0.01"}
                      value={formData.discountValue}
                      onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })}
                      className={formData.discountType === "fixed_amount" ? "pl-8" : "pr-8"}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                <Label htmlFor={pid("discountDuration")} className="sm:text-right">
                  {t("admin.plans.field.discount_duration", "Duration")}
                </Label>
                <div className="sm:col-span-3">
                  <select
                    id={pid("discountDuration")}
                    value={formData.discountDuration}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discountDuration: e.target.value as AdminPlanFormData["discountDuration"],
                      })
                    }
                    className={nativeSelectClass}
                  >
                    <option value="permanent">{t("admin.plans.discount.permanent", "Permanent")}</option>
                    <option value="first_month">{t("admin.plans.discount.first_month", "First Month Only")}</option>
                    <option value="first_year">{t("admin.plans.discount.first_year", "First Year Only")}</option>
                    <option value="limited_time">{t("admin.plans.discount.limited_time", "Limited Time")}</option>
                  </select>
                </div>
              </div>

              {formData.discountDuration === "limited_time" && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                    <Label htmlFor={pid("discountStartDate")} className="sm:text-right">
                      {t("admin.plans.field.start_date", "Start Date")}
                    </Label>
                    <div className="sm:col-span-3">
                      <Input
                        id={pid("discountStartDate")}
                        type="date"
                        value={formData.discountStartDate}
                        onChange={(e) => setFormData({ ...formData, discountStartDate: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 items-center gap-4 mb-4">
                    <Label htmlFor={pid("discountEndDate")} className="sm:text-right">
                      {t("admin.plans.field.end_date", "End Date")}
                    </Label>
                    <div className="sm:col-span-3">
                      <Input
                        id={pid("discountEndDate")}
                        type="date"
                        value={formData.discountEndDate}
                        onChange={(e) => setFormData({ ...formData, discountEndDate: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
