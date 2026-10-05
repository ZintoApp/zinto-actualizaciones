import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";

export default function PaymentSuccessPage() {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [isVerifying, setIsVerifying] = useState(true);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const source = urlParams.get('source');
  const transaction_id = urlParams.get('transaction_id');
  const session_id = urlParams.get('session_id');
  const renewed = urlParams.get('renewed'); // Check for subscription renewal flag
  const from_renewal = urlParams.get('from_renewal'); // Additional check for renewal context

  const payment_id = urlParams.get('id') || urlParams.get('payment_id') || urlParams.get('paymentId');
  const status = urlParams.get('status');
  const message = urlParams.get('message');



  const checkout_session_id = urlParams.get('checkout_session_id');
  const gateway = urlParams.get('gateway');
  const isErpInvoice = source === 'erp_invoice' && checkout_session_id;

  const verifyPaymentMutation = useMutation({
    mutationFn: async () => {
      if (isErpInvoice) {
        const requestBody: Record<string, string> = {
          checkoutSessionId: checkout_session_id!,
          gateway: gateway || 'stripe',
        };
        if (session_id) requestBody.session_id = session_id;
        if (payment_id) requestBody.payment_id = payment_id;
        const ref = urlParams.get('reference') || urlParams.get('trxref');
        if (ref) requestBody.reference = ref;
        const orderId = urlParams.get('token');
        if (orderId) requestBody.order_id = orderId;

        const res = await apiRequest('POST', '/api/erp/payment/verify', requestBody);
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || t('payment.verification_failed', 'Failed to verify payment'));
        }
        return res.json();
      }

      if (!transaction_id) return null;

      const requestBody: any = {
        transactionId: transaction_id,
        source: source || "stripe"
      };

      if (source === 'moyasar' && payment_id) {
        requestBody.paymentId = payment_id;
      } else if (session_id) {
        requestBody.session_id = session_id;
      }

      const res = await apiRequest("POST", "/api/payment/verify", requestBody);

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('payment.verification_failed', 'Failed to verify payment'));
      }

      return res.json();
    },
    onSuccess: (data) => {
      setVerificationSuccess(true);
      setIsVerifying(false);
      setPaymentDetails(data);
      toast({
        title: t('payment.successful', 'Payment Successful'),
        description: isErpInvoice
          ? t('erp.invoices.payment.onlineSuccess', 'Your invoice payment was received successfully.')
          : t('payment.subscription_activated', 'Your subscription has been activated successfully.'),
      });
    },
    onError: (error: any) => {
      setVerificationSuccess(false);
      setIsVerifying(false);
      toast({
        title: t('payment.verification_failed', 'Payment Verification Failed'),
        description: error.message,
        variant: "destructive"
      });
    }
  });

  useEffect(() => {
    if (source === 'moyasar' && status && payment_id) {

      const successStatuses = ['paid', 'captured', 'authorized'];
      const isSuccessful = successStatuses.includes(status.toLowerCase());

      if (isSuccessful) {
        setVerificationSuccess(true);
        setIsVerifying(false);
        setPaymentDetails({
          paymentId: payment_id,
          status: status,
          message: message,
          source: source
        });
        toast({
          title: t('payment.successful', 'Payment Successful'),
          description: message || t('payment.processed_successfully', 'Your payment has been processed successfully.'),
        });

        if (transaction_id) {
          verifyPaymentMutation.mutate();
        }
      } else {
        setVerificationSuccess(false);
        setIsVerifying(false);
        setPaymentDetails({
          paymentId: payment_id,
          status: status,
          message: message,
          source: source
        });
        toast({
          title: t('payment.failed', 'Payment Failed'),
          description: message || t('payment.could_not_process', 'Your payment could not be processed.'),
          variant: "destructive"
        });
      }
    } else if (source === 'erp_invoice' && checkout_session_id) {
      verifyPaymentMutation.mutate();
    } else if (source === 'stripe' && session_id) {
      verifyPaymentMutation.mutate();
    } else if (transaction_id) {
      verifyPaymentMutation.mutate();
    } else {
      setVerificationSuccess(false);
      setIsVerifying(false);
      toast({
        title: t('payment.verification_failed', 'Payment Verification Failed'),
        description: t('payment.missing_info', 'Missing payment information. Please contact support if you completed a payment.'),
        variant: "destructive"
      });
    }
  }, [transaction_id, source, status, payment_id, message, session_id]);

  return (
    <div className="container max-w-md py-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {isVerifying
              ? t('payment.processing', 'Payment Processing')
              : (verificationSuccess
                ? t('payment.successful', 'Payment Successful')
                : (paymentDetails?.status === 'failed' || status === 'failed'
                  ? t('payment.failed', 'Payment Failed')
                  : t('payment.verification_failed', 'Payment Verification Failed')))}
          </CardTitle>
          <CardDescription>
            {isVerifying
              ? t('payment.verifying', 'We\'re verifying your payment...')
              : (verificationSuccess
                ? (renewed === 'true' || from_renewal === 'true'
                    ? 'Your subscription has been renewed successfully. You now have full access to all features.'
                    : t('payment.subscription_activated', 'Your subscription has been activated successfully.'))
                : (paymentDetails?.status === 'failed' || status === 'failed'
                  ? (paymentDetails?.message || message || t('payment.could_not_process', 'Your payment could not be processed. Please try again.'))
                  : t('payment.contact_support', 'We couldn\'t verify your payment. Please contact support.')))}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-center py-6">
            {isVerifying ? (
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
            ) : (
              verificationSuccess ? (
                <CheckCircle className="h-16 w-16 text-green-500" />
              ) : (
                <XCircle className="h-16 w-16 text-red-500" />
              )
            )}
          </div>

          {paymentDetails && (
            <div className="space-y-3 text-sm">
              <div className="border-t pt-4">
                <h3 className="font-medium text-center mb-3">{t('payment.details', 'Payment Details')}</h3>
                <div className="space-y-2">
                  {paymentDetails.paymentId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('payment.payment_id', 'Payment ID:')}</span>
                      <span className="font-mono text-xs">{paymentDetails.paymentId}</span>
                    </div>
                  )}
                  {transaction_id && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('payment.transaction_id', 'Transaction ID:')}</span>
                      <span className="font-mono text-xs">{transaction_id}</span>
                    </div>
                  )}
                  {paymentDetails.source && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('payment.payment_method', 'Payment Method:')}</span>
                      <span className="capitalize">{paymentDetails.source}</span>
                    </div>
                  )}
                  {paymentDetails.status && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('payment.status', 'Status:')}</span>
                      <span className={`capitalize ${
                        paymentDetails.status === 'paid' ? 'text-green-600' :
                        paymentDetails.status === 'failed' ? 'text-red-600' :
                        'text-amber-600'
                      }`}>
                        {paymentDetails.status}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-center gap-4">
          {!verificationSuccess && !isVerifying && (
            <Button variant="outline" onClick={() => navigate("/settings")} className="btn-brand-primary">
              {t('payment.try_again', 'Try Again')}
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate("/settings")} disabled={isVerifying}>
            {t('payment.return_to_settings', 'Return to Settings')}
          </Button>
          {verificationSuccess && (
            <Button variant="outline" className="btn-brand-primary" onClick={() => navigate("/inbox")} disabled={isVerifying}>
              {t('payment.go_to_inbox', 'Go to Inbox')}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
