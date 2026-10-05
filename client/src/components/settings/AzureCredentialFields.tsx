import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DEFAULT_AZURE_OPENAI_API_VERSION } from '@shared/ai-providers';
import type { AzureDeployment } from '@/services/azure';

type AzureCredentialFieldsProps = {
  endpoint: string;
  apiVersion: string;
  defaultChatDeployment: string;
  deployments?: AzureDeployment[];
  onChange: (patch: {
    endpoint?: string;
    apiVersion?: string;
    defaultChatDeployment?: string;
  }) => void;
};

export function AzureCredentialFields({
  endpoint,
  apiVersion,
  defaultChatDeployment,
  deployments = [],
  onChange,
}: AzureCredentialFieldsProps) {
  const chatDeployments = deployments.filter((item) => item.kind === 'chat');

  return (
    <div className="space-y-4">
      <div>
        <Label>Azure endpoint</Label>
        <Input data-tour="components-settings-azurecredentialfields.input.endpoint"
          value={endpoint}
          onChange={(event) => onChange({ endpoint: event.target.value })}
          placeholder="https://your-resource.openai.azure.com"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Resource name or full origin. Paths like /openai/deployments are stripped.
        </p>
      </div>
      <div>
        <Label>API version</Label>
        <Input data-tour="components-settings-azurecredentialfields.input.apiVersion"
          value={apiVersion}
          onChange={(event) => onChange({ apiVersion: event.target.value })}
          placeholder={DEFAULT_AZURE_OPENAI_API_VERSION}
        />
      </div>
      <div>
        <Label>Default chat deployment</Label>
        {chatDeployments.length > 0 ? (
          <Select
            value={defaultChatDeployment || undefined}
            onValueChange={(value) => onChange({ defaultChatDeployment: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a chat deployment" />
            </SelectTrigger>
            <SelectContent>
              {chatDeployments.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} {item.underlyingModel && item.underlyingModel !== item.id ? `(${item.underlyingModel})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input data-tour="components-settings-azurecredentialfields.input.defaultChatDeployment"
            value={defaultChatDeployment}
            onChange={(event) => onChange({ defaultChatDeployment: event.target.value })}
            placeholder="Optional. Used by inbox and text assist."
          />
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Required for inbox image analysis and compose assist. Flow nodes pick their own deployment.
        </p>
      </div>
    </div>
  );
}
