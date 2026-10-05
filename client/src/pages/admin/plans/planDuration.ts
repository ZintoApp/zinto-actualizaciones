/** Shared billing duration labels for admin plans (cards + selects). */

export function formatPlanDurationShort(
  billingInterval: string,
  customDurationDays: number | null | undefined,
  t: (key: string, fallback?: string, variables?: Record<string, unknown>) => string
): string {
  switch (billingInterval) {
    case "lifetime":
      return t("admin.plans.duration.short.lifetime", "Lifetime");
    case "daily":
      return t("admin.plans.duration.short.daily", "24 hours");
    case "weekly":
      return t("admin.plans.duration.short.weekly", "7 days");
    case "biweekly":
      return t("admin.plans.duration.short.biweekly", "14 days");
    case "monthly":
      return t("admin.plans.duration.short.monthly", "30 days");
    case "quarterly":
      return t("admin.plans.duration.short.quarterly", "3 months");
    case "semi_annual":
      return t("admin.plans.duration.short.semi_annual", "6 months");
    case "annual":
      return t("admin.plans.duration.short.annual", "12 months");
    case "biennial":
      return t("admin.plans.duration.short.biennial", "2 years");
    case "custom":
      return customDurationDays != null && customDurationDays > 0
        ? t("admin.plans.duration.short.custom_days", "{{days}} days", { days: customDurationDays })
        : t("admin.plans.duration.short.custom", "Custom");
    case "month":
      return t("admin.plans.duration.short.monthly", "30 days");
    case "quarter":
      return t("admin.plans.duration.short.quarterly", "3 months");
    case "year":
      return t("admin.plans.duration.short.annual", "12 months");
    default:
      return t("admin.plans.duration.short.monthly", "30 days");
  }
}
