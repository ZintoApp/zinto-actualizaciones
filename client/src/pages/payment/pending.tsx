import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

export default function PaymentPendingPage() {
  const [_, navigate] = useLocation();

  const urlParams = new URLSearchParams(window.location.search);
  const source = urlParams.get('source');
  const transaction_id = urlParams.get('transaction_id');

  return (
    <div className="container max-w-md py-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Payment Pending</CardTitle>
          <CardDescription>
            Your payment is being processed. This may take some time to complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <Clock className="h-16 w-16 text-amber-500" />
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <p className="text-sm text-center text-muted-foreground mb-2">
            We'll notify you once your payment is confirmed. You can check your subscription status in the settings page.
          </p>
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={() => navigate("/settings")}>
              Return to Settings
            </Button>
            <Button variant="outline" className="btn-brand-primary" onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
