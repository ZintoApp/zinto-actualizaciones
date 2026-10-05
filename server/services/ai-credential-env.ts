export function getEnvironmentKeyForProvider(
  provider: string,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  switch (provider.toLowerCase()) {
    case 'openai':
      return env.OPENAI_API_KEY || null;
    case 'openrouter':
      return env.OPENROUTER_API_KEY || null;
    case 'anthropic':
    case 'claude':
      return env.ANTHROPIC_API_KEY || null;
    default:
      return null;
  }
}
