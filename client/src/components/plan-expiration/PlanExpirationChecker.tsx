import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  Loader2,
  RefreshCw,
  CreditCard
} from "lucide-react";
import { getBillingCycleDays } from '@/utils/plan-duration';

interface PlanExpirationStatus {
  isExpired: boolean;
  isInGracePeriod: boolean;
  daysUntilExpiry: number;
  gracePeriodDaysRemaining: number;
  subscriptionStatus: string;
  canAccess: boolean;
  blockReason?: string;
  renewalRequired: boolean;
  nextBillingDate?: string;
}

interface RenewalStatus {
  success: boolean;
  company: any;
  plan: any;
  expirationStatus: PlanExpirationStatus;
  accessAllowed: boolean;
  reason?: string;
}

export function PlanExpirationChecker() {
  const { user, company } = useAuth();
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);


  const { data: renewalStatus, isLoading, error, refetch } = useQuery<RenewalStatus>({
    queryKey: ['/api/plan-renewal/status'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/plan-renewal/status');
      if (!res.ok) {
        throw new Error('Failed to fetch renewal status');
      }
      return res.json();
    },
    enabled: !!user && !!company,
    refetchInterval: false, // FIXED: Disable automatic polling to prevent false positives
  });


  useEffect(() => {




    setShowModal(false);



  }, [renewalStatus, isLoading]);


  const handleActivateSubscription = async () => {
    try {
      if (!renewalStatus?.plan?.id) {
        toast({
          title: "Error",
          description: "No plan found to activate",
          variant: "destructive",
        });
        return;
      }

      const res = await apiRequest('POST', '/api/plan-renewal/activate', {
        planId: renewalStatus.plan.id,
        duration: getBillingCycleDays(renewalStatus.plan.billingInterval || 'monthly', renewalStatus.plan.customDurationDays)
      });

      if (!res.ok) {
        throw new Error('Failed to activate subscription');
      }

      const result = await res.json();
      
      toast({
        title: "Success",
        description: "Subscription activated successfully!",
      });


      refetch();
      setShowModal(false);

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to activate subscription",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = () => {
    if (!renewalStatus) return <Loader2 className="h-6 w-6 animate-spin" />;
    
    if (renewalStatus.expirationStatus.isInGracePeriod) {
      return <Clock className="h-6 w-6 text-yellow-500" />;
    }
    
    if (!renewalStatus.accessAllowed) {
      return <AlertTriangle className="h-6 w-6 text-red-500" />;
    }
    
    return <CheckCircle className="h-6 w-6 text-green-500" />;
  };

  const getStatusMessage = () => {
    if (!renewalStatus) return "Checking subscription status...";
    
    const status = renewalStatus.expirationStatus;
    
    if (status.isInGracePeriod) {
      return `Your subscription is in a grace period. You have ${status.gracePeriodDaysRemaining} day(s) remaining to renew.`;
    }
    
    if (!renewalStatus.accessAllowed) {
      return renewalStatus.reason || "Your subscription has expired and needs to be renewed.";
    }
    
    if (status.subscriptionStatus === 'trial') {
      return `You are on a trial period. ${status.daysUntilExpiry} day(s) remaining.`;
    }
    
    if (status.subscriptionStatus === 'active') {
      return `Your subscription is active. ${status.daysUntilExpiry} day(s) until renewal.`;
    }
    
    return "Subscription status unknown.";
  };

  const getUrgencyLevel = () => {
    if (!renewalStatus) return "low";
    
    const status = renewalStatus.expirationStatus;
    
    if (!renewalStatus.accessAllowed) return "high";
    if (status.isInGracePeriod) return status.gracePeriodDaysRemaining <= 1 ? "high" : "medium";
    if (status.daysUntilExpiry <= 3) return "high";
    if (status.daysUntilExpiry <= 7) return "medium";
    
    return "low";
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-2 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking subscription...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-2 text-sm text-red-600">
        <AlertTriangle className="h-4 w-4" />
        Error checking subscription
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  const urgencyLevel = getUrgencyLevel();

  return (
    <>
      {/* Status indicator in header/sidebar */}
      {renewalStatus && (
        <div className={`flex items-center gap-2 p-2 text-sm rounded-md ${
          urgencyLevel === "high" ? "bg-red-50 text-red-700 border border-red-200" :
          urgencyLevel === "medium" ? "bg-yellow-50 text-yellow-700 border border-yellow-200" :
          "bg-green-50 text-green-700 border border-green-200"
        }`}>
          {getStatusIcon()}
          <span className="flex-1">{getStatusMessage()}</span>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Expiration Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getStatusIcon()}
              Subscription Action Required
            </DialogTitle>
            <DialogDescription>
              Your application subscription needs attention to continue using the service.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status Alert */}
            <Alert className={`${
              urgencyLevel === "high" ? "border-red-200 bg-red-50" : 
              urgencyLevel === "medium" ? "border-yellow-200 bg-yellow-50" : 
              "border-blue-200 bg-blue-50"
            }`}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Action Required</AlertTitle>
              <AlertDescription>
                {getStatusMessage()}
              </AlertDescription>
            </Alert>

            {/* Current Status */}
            {renewalStatus && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Current Subscription</CardTitle>
                  <CardDescription>
                    Your current subscription details
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Plan:</span>
                      <span>{renewalStatus.plan?.name || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Status:</span>
                      <Badge variant={renewalStatus.accessAllowed ? 'default' : 'destructive'}>
                        {renewalStatus.expirationStatus.subscriptionStatus}
                      </Badge>
                    </div>
                    {renewalStatus.expirationStatus.nextBillingDate && (
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Next Billing:</span>
                        <span>{new Date(renewalStatus.expirationStatus.nextBillingDate).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Status
              </Button>
              
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowModal(false)}>
                  Close
                </Button>
                <Button onClick={handleActivateSubscription} className="bg-blue-600 hover:bg-blue-700">
                  <CreditCard className="h-4 w-4 mr-2" />
                  Activate Subscription (Test)
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
