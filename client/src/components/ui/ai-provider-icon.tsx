import { OpenAIIcon } from '@/components/ui/openai-icon';
import { AzureIcon } from '@/components/ui/azure-icon';
import { OpenRouterIcon } from '@/components/ui/openrouter-icon';

export function AiProviderIcon({
  provider,
  className = 'h-4 w-4 shrink-0',
  size = 16,
}: {
  provider: string;
  className?: string;
  size?: number;
}) {
  switch (provider) {
    case 'openai':
      return <OpenAIIcon size={size} className={className} />;
    case 'azure':
      return <AzureIcon size={size} className={className} />;
    case 'openrouter':
      return <OpenRouterIcon size={size} className={className} />;
    default:
      return null;
  }
}

export function AiProviderOption({
  provider,
  label,
  size = 16,
}: {
  provider: string;
  label: string;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <AiProviderIcon provider={provider} size={size} />
      <span>{label}</span>
    </span>
  );
}
