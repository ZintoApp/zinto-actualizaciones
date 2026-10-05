import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert";
import { Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

interface SesConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
  port?: number;
}

export function SesConfiguration() {
  const [sesConfig, setSesConfig] = useState<SesConfig>({
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    fromEmail: '',
    fromName: '',
    enabled: false,
    port: undefined
  });
  
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [storedSecretKey, setStoredSecretKey] = useState('');
  const [showSecretKey, setShowSecretKey] = useState(false);
  const { toast } = useToast();
  
  const { data: sesData, isLoading } = useQuery<SesConfig>({
    queryKey: ['/api/ses-config'],
    refetchOnWindowFocus: false
  });
  
  useEffect(() => {
    if (sesData) {
      setStoredSecretKey(sesData.secretAccessKey || '');
      setSesConfig({
        ...sesData,
        secretAccessKey: '' // Clear secret key field for security
      });
    }
  }, [sesData]);
  
  const updateSesConfig = useMutation({
    mutationFn: async (config: SesConfig) => {
      const res = await apiRequest('POST', '/api/ses-config', config);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Amazon SES Configuration Saved',
        description: 'Your SES settings have been updated successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ses-config'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: `Failed to update SES configuration: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
  
  const testSesConfig = useMutation({
    mutationFn: async ({ config, testEmail }: { config: SesConfig; testEmail: string }) => {
      const res = await apiRequest('POST', '/api/ses-config/test', { config, testEmail });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Test Email Sent',
        description: 'A test email has been sent successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: `Failed to send test email: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'port') {
      setSesConfig({
        ...sesConfig,
        port: value === '' ? undefined : Number(value)
      });
      return;
    }
    setSesConfig({
      ...sesConfig,
      [name]: value
    });
  };
  
  const handleToggleEnabled = (checked: boolean) => {
    setSesConfig({
      ...sesConfig,
      enabled: checked
    });
  };
  
  const handleSaveConfig = () => {
    if (!sesConfig.region) {
      toast({
        title: 'Validation Error',
        description: 'AWS Region is required',
        variant: 'destructive',
      });
      return;
    }
    
    if (!sesConfig.accessKeyId) {
      toast({
        title: 'Validation Error',
        description: 'Access Key ID is required',
        variant: 'destructive',
      });
      return;
    }
    
    if (!sesConfig.secretAccessKey && !storedSecretKey) {
      toast({
        title: 'Validation Error',
        description: 'Secret Access Key is required',
        variant: 'destructive',
      });
      return;
    }
    
    if (!sesConfig.fromEmail) {
      toast({
        title: 'Validation Error',
        description: 'From Email address is required',
        variant: 'destructive',
      });
      return;
    }

    const configToSave = {
      ...sesConfig,
      secretAccessKey: sesConfig.secretAccessKey || storedSecretKey
    };
    
    updateSesConfig.mutate(configToSave);
  };
  
  const handleTestEmail = () => {
    if (!testEmailAddress) {
      toast({
        title: 'Validation Error',
        description: 'Please enter an email address to send the test email to',
        variant: 'destructive',
      });
      return;
    }
    
    if (!sesConfig.region || !sesConfig.accessKeyId || (!sesConfig.secretAccessKey && !storedSecretKey) || !sesConfig.fromEmail) {
      toast({
        title: 'Validation Error',
        description: 'Please complete all required SES configuration fields first',
        variant: 'destructive',
      });
      return;
    }

    const configToTest = {
      ...sesConfig,
      secretAccessKey: sesConfig.secretAccessKey || storedSecretKey
    };
    
    testSesConfig.mutate({ config: configToTest, testEmail: testEmailAddress });
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Amazon SES Configuration</h3>
        <p className="text-sm text-gray-500 mb-4">
          Configure Amazon Simple Email Service (SES) to send emails for notifications, invitations, and campaigns.
        </p>
      </div>
      
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Important</AlertTitle>
        <AlertDescription>
          Ensure your SES account is out of sandbox mode and your sender email address is verified in AWS SES.
        </AlertDescription>
      </Alert>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="region">AWS Region</Label>
            <Input data-tour="components-settings-sesconfiguration.input.region"
              id="region"
              name="region"
              value={sesConfig.region}
              onChange={handleInputChange}
              placeholder="us-east-1"
            />
            <p className="text-xs text-gray-500">
              AWS region where your SES service is configured (e.g., us-east-1, eu-west-1)
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="port">Port</Label>
            <Input data-tour="components-settings-sesconfiguration.input.port"
              id="port"
              name="port"
              type="number"
              value={sesConfig.port ?? ''}
              onChange={handleInputChange}
              placeholder="443"
            />
            <p className="text-xs text-gray-500">
              Optional. SES SMTP port (e.g. 587, 465). Leave blank to use the default HTTPS endpoint.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="accessKeyId">Access Key ID</Label>
            <Input data-tour="components-settings-sesconfiguration.input.accessKeyId"
              id="accessKeyId"
              name="accessKeyId"
              value={sesConfig.accessKeyId}
              onChange={handleInputChange}
              placeholder="AKIAIOSFODNN7EXAMPLE"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="secretAccessKey">Secret Access Key</Label>
            <div className="relative">
              <Input data-tour="components-settings-sesconfiguration.input.secretAccessKey"
                id="secretAccessKey"
                name="secretAccessKey"
                type={showSecretKey ? "text" : "password"}
                value={sesConfig.secretAccessKey}
                onChange={handleInputChange}
                placeholder={storedSecretKey ? "Leave empty to keep current key" : "Enter secret access key"}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowSecretKey(!showSecretKey)}
              >
                {showSecretKey ? (
                  <EyeOff className="h-4 w-4 text-gray-500" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-500" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              {storedSecretKey ? "Secret key is set. Leave empty to keep it unchanged, or enter new key." : "Your AWS secret access key"}
            </p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fromEmail">From Email</Label>
            <Input data-tour="components-settings-sesconfiguration.input.fromEmail"
              id="fromEmail"
              name="fromEmail"
              value={sesConfig.fromEmail}
              onChange={handleInputChange}
              placeholder="noreply@yourcompany.com"
            />
            <p className="text-xs text-gray-500">
              Verified sender email address in AWS SES
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="fromName">From Name</Label>
            <Input data-tour="components-settings-sesconfiguration.input.fromName"
              id="fromName"
              name="fromName"
              value={sesConfig.fromName}
              onChange={handleInputChange}
              placeholder="Your Company Name"
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="enabled">Enable Amazon SES</Label>
              <Switch 
                id="enabled"
                checked={sesConfig.enabled}
                onCheckedChange={handleToggleEnabled}
              />
            </div>
            <p className="text-xs text-gray-500">
              Enable or disable Amazon SES for sending emails
            </p>
          </div>
        </div>
      </div>
      
      <div className="border-t pt-6 space-y-4">
        <h4 className="font-medium">Test Email Configuration</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Input data-tour="components-settings-sesconfiguration.input.testEmailAddress"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              placeholder="Enter an email address to receive a test message"
            />
          </div>
          <Button onClick={handleTestEmail} disabled={testSesConfig.isPending} className="w-full btn-brand-primary">
            {testSesConfig.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Send Test Email
          </Button>
        </div>
      </div>
      
      <div className="flex justify-end space-x-2">
        <Button variant="brand">Cancel</Button>
        <Button className='btn-brand-primary' onClick={handleSaveConfig} disabled={updateSesConfig.isPending}>
          {updateSesConfig.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
