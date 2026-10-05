import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import SubscriptionRenewalDialog from '@/components/plan-expiration/SubscriptionRenewalDialog';

export default function SubscriptionRenewalDemo() {
  const [showDialog, setShowDialog] = useState(false);
  const [scenarioType, setScenarioType] = useState<'expired' | 'grace'>('expired');

  const mockData = {
    expired: {
      companyName: "Demo Company",
      expirationDate: "2026-01-15",
      gracePeriodEnd: undefined,
      isInGracePeriod: false,
      planName: "Professional Plan",
      planPrice: 29.99
    },
    grace: {
      companyName: "Demo Company",
      expirationDate: "2026-01-10",
      gracePeriodEnd: "2026-01-17",
      isInGracePeriod: true,
      planName: "Professional Plan", 
      planPrice: 29.99
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Enhanced Subscription Renewal System
          </h1>
          <p className="text-gray-600">
            Demo of the new payment method selection dialog for subscription renewals
          </p>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                🔒 Security Enhanced
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                All renewals now require verified payment through secure payment gateways.
                No more direct renewal vulnerabilities.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                💳 Multiple Payment Methods
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Users can choose from Stripe, PayPal, Mercado Pago, Moyasar, or Bank Transfer
                with consistent UI/UX.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                🔄 Auto-Renewal Support
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Option to enable automatic renewal during the payment process
                to prevent future interruptions.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* Demo Controls */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Demo Controls</CardTitle>
            <CardDescription>
              Test the renewal dialog with different subscription scenarios
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button
                variant={scenarioType === 'expired' ? 'default' : 'outline'}
                onClick={() => setScenarioType('expired')}
              >
                Subscription Expired
              </Button>
              <Button
                variant={scenarioType === 'grace' ? 'default' : 'outline'}
                onClick={() => setScenarioType('grace')}
              >
                Grace Period Active
              </Button>
            </div>
            
            <Button 
              onClick={() => setShowDialog(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Show Renewal Dialog
            </Button>
          </CardContent>
        </Card>

        {/* Implementation Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Implementation Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">🔧 Backend Enhancements</h3>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Enhanced `/api/enhanced-subscription/initiate-renewal` endpoint with payment method selection</li>
                <li>Payment method validation and configuration checks</li>
                <li>Support for Stripe, PayPal, Mercado Pago, Moyasar, and Bank Transfer</li>
                <li>Auto-renewal option handling</li>
                <li>Secure payment session creation with proper metadata</li>
                <li>Bank transfer handling with email notifications</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">🎨 Frontend Improvements</h3>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>New `SubscriptionRenewalDialog` component with modern UI</li>
                <li>Payment method selection using existing `PaymentMethodSelector`</li>
                <li>Real-time payment method availability detection</li>
                <li>Subscription status display with grace period information</li>
                <li>Auto-renewal toggle option</li>
                <li>Proper error handling and user feedback</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">🔐 Security Features</h3>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Blocked direct renewal endpoint (prevents free renewals)</li>
                <li>Payment verification required for all renewals</li>
                <li>Webhook-based subscription activation</li>
                <li>Audit trail for all renewal attempts</li>
                <li>Payment gateway integration with proper metadata</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Demo Dialog */}
        <SubscriptionRenewalDialog
          isOpen={showDialog}
          onClose={() => setShowDialog(false)}
          {...mockData[scenarioType]}
        />
      </div>
    </div>
  );
}
