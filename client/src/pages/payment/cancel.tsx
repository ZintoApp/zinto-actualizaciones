import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { XCircle } from "lucide-react";

export default function PaymentCancelPage() {
  const [_, navigate] = useLocation();

  const urlParams = new URLSearchParams(window.location.search);
  const source = urlParams.get('source');
  const transaction_id = urlParams.get('transaction_id');

  return (
    <div className="container max-w-md py-12">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Payment Cancelled</CardTitle>
          <CardDescription>
            Your payment process was cancelled. No charges were made.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-6">
          <XCircle className="h-16 w-16 text-amber-500" />
        </CardContent>
        <CardFooter className="flex justify-center gap-4">
          <Button variant="outline" onClick={() => navigate("/settings")}>
            Return to Settings
          </Button>
          <Button variant="outline" className="btn-brand-primary" onClick={() => navigate("/dashboard")}>
            Go to Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
