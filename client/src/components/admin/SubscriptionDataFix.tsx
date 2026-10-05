import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle, RefreshCw, Database, Bug, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface DataReport {
  totalCompanies: number;
  statusBreakdown: Record<string, number>;
  issuesFound: string[];
  recommendations: string[];
}

interface ValidationResult {
  success: boolean;
  fixedCompanies: number;
  errors: string[];
  message: string;
}

export default function SubscriptionDataFix() {
  const [report, setReport] = useState<DataReport | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isRunningFix, setIsRunningFix] = useState(false);
  const { toast } = useToast();

  const loadReport = async () => {
    setIsLoadingReport(true);
    try {
      const response = await apiRequest('GET', '/api/subscription-data-fix/report');
      if (!response.ok) {
        throw new Error('Failed to load report');
      }
      const data = await response.json();
      setReport(data.report);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load subscription data report",
        variant: "destructive",
      });
    } finally {
      setIsLoadingReport(false);
    }
  };

  const runDataFix = async () => {
    setIsRunningFix(true);
    setValidationResult(null);
    
    try {
      const response = await apiRequest('POST', '/api/subscription-data-fix/validate-and-fix');
      const data = await response.json();
      
      setValidationResult(data);
      
      if (data.success) {
        toast({
          title: "Success",
          description: `Successfully fixed subscription data for ${data.fixedCompanies} companies`,
        });
      } else {
        toast({
          title: "Partial Success",
          description: `Fixed ${data.fixedCompanies} companies but encountered ${data.errors.length} errors`,
          variant: "destructive",
        });
      }
      

      await loadReport();
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to run subscription data fix",
        variant: "destructive",
      });
    } finally {
      setIsRunningFix(false);
    }
  };

  React.useEffect(() => {
    loadReport();
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'trial': return 'bg-blue-100 text-blue-800';
      case 'grace_period': return 'bg-yellow-100 text-yellow-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'NULL': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const hasIssues = report && report.issuesFound.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Subscription Data Fix</h2>
          <p className="text-muted-foreground">
            Fix critical subscription renewal dialog bugs in existing deployments
          </p>
        </div>
        <Button onClick={loadReport} disabled={isLoadingReport} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingReport ? 'animate-spin' : ''}`} />
          Refresh Report
        </Button>
      </div>

      {/* Critical Bug Alert */}
      <Alert className="border-red-200 bg-red-50">
        <Bug className="h-4 w-4" />
        <AlertTitle>Critical Bug Fix Available</AlertTitle>
        <AlertDescription>
          This tool fixes the critical bug where existing application deployments show incorrect renewal dialogs 
          for users with active subscriptions, while fresh installations work correctly. The issue is caused by 
          NULL values in subscription fields that were added in later migrations.
        </AlertDescription>
      </Alert>

      {/* Data Report */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Subscription Data Report
            </CardTitle>
            <CardDescription>
              Current state of subscription data across all companies
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">{report.totalCompanies}</div>
                <div className="text-sm text-muted-foreground">Total Companies</div>
              </div>
              {Object.entries(report.statusBreakdown).map(([status, count]) => (
                <div key={status} className="text-center">
                  <div className="text-2xl font-bold">{count}</div>
                  <Badge className={getStatusColor(status)}>{status}</Badge>
                </div>
              ))}
            </div>

            {/* Issues Found */}
            {report.issuesFound.length > 0 && (
              <Alert className="border-yellow-200 bg-yellow-50">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Issues Found</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    {report.issuesFound.map((issue, index) => (
                      <li key={index}>{issue}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold">Recommendations:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                  {report.recommendations.map((rec, index) => (
                    <li key={index}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fix Action */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {hasIssues ? (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            ) : (
              <CheckCircle className="h-5 w-5 text-green-500" />
            )}
            Data Validation & Fix
          </CardTitle>
          <CardDescription>
            {hasIssues 
              ? "Issues detected - run the fix to resolve subscription data inconsistencies"
              : "No issues detected - your subscription data is consistent"
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={runDataFix} 
            disabled={isRunningFix}
            className={hasIssues ? "bg-yellow-600 hover:bg-yellow-700" : ""}
          >
            {isRunningFix ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running Fix...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                {hasIssues ? "Fix Data Issues" : "Validate Data"}
              </>
            )}
          </Button>

          {/* Validation Result */}
          {validationResult && (
            <Alert className={validationResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              {validationResult.success ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              <AlertTitle>
                {validationResult.success ? "Fix Completed Successfully" : "Fix Completed with Errors"}
              </AlertTitle>
              <AlertDescription>
                <div className="space-y-2">
                  <p>{validationResult.message}</p>
                  {validationResult.fixedCompanies > 0 && (
                    <p><strong>Companies Fixed:</strong> {validationResult.fixedCompanies}</p>
                  )}
                  {validationResult.errors.length > 0 && (
                    <div>
                      <strong>Errors:</strong>
                      <ul className="list-disc list-inside mt-1">
                        {validationResult.errors.map((error, index) => (
                          <li key={index} className="text-sm">{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How This Fix Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong>Problem:</strong> Existing application deployments may have NULL values in subscription fields 
            that were added in later migrations, causing incorrect renewal dialog behavior.
          </p>
          <p>
            <strong>Solution:</strong> This tool identifies and fixes data inconsistencies by:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Normalizing NULL subscription_status values based on subscription dates</li>
            <li>Adding missing grace periods for expired subscriptions</li>
            <li>Fixing inconsistent trial statuses</li>
            <li>Initializing missing fields with proper defaults</li>
          </ul>
          <p>
            <strong>Safety:</strong> This fix is safe to run multiple times and only updates inconsistent data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
