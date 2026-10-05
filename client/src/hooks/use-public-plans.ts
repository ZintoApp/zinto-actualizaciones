import { useQuery } from "@tanstack/react-query";

export interface PublicPlan {
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
  isActive: boolean;
  isFree: boolean;
  hasTrialPeriod: boolean;
  trialDays: number;
  features: string[];
  createdAt: string;
  updatedAt: string;

  discountType?: "none" | "percentage" | "fixed_amount";
  discountValue?: number;
  discountDuration?: "permanent" | "first_month" | "first_year" | "limited_time";
  discountStartDate?: string;
  discountEndDate?: string;
  originalPrice?: number;


  billingInterval?: string;
  customDurationDays?: number | null;

  storageLimit?: number; // in MB
  bandwidthLimit?: number; // monthly bandwidth in MB
  fileUploadLimit?: number; // max file size per upload in MB
  totalFilesLimit?: number; // max number of files
}

export function usePublicPlans() {
  const { data: plans, isLoading, error } = useQuery<PublicPlan[]>({
    queryKey: ['/api/plans/public'],
    queryFn: async () => {
      const res = await fetch("/api/plans/public");
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  return {
    plans: plans || [],
    isLoading,
    error
  };
}
