import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { LlmProviderOption } from '../../multiplayer/protocol';

export interface LlmProviderConfig {
  provider_name: string;
  base_url: string;
  api_key: string;
  model_ids: string[];
}

export interface LlmConfig {
  providers: LlmProviderConfig[];
}

let cachedConfig: LlmConfig | null = null;

function isProviderConfig(value: unknown): value is LlmProviderConfig {
  const provider = value as Partial<LlmProviderConfig>;
  return (
    typeof provider?.provider_name === 'string' &&
    typeof provider.base_url === 'string' &&
    typeof provider.api_key === 'string' &&
    Array.isArray(provider.model_ids) &&
    provider.model_ids.every((modelId) => typeof modelId === 'string')
  );
}

function normalizeConfig(value: unknown): LlmConfig {
  const providers = Array.isArray((value as Partial<LlmConfig>)?.providers)
    ? ((value as Partial<LlmConfig>).providers ?? [])
    : [];

  return {
    providers: providers.filter(isProviderConfig)
  };
}

export function clearLlmConfigCache(): void {
  cachedConfig = null;
}

export function loadLlmConfig(): LlmConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = resolve(process.cwd(), 'llm.json');
  if (!existsSync(configPath)) {
    cachedConfig = { providers: [] };
    return cachedConfig;
  }

  try {
    const rawConfig = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
    cachedConfig = normalizeConfig(rawConfig);
  } catch {
    cachedConfig = { providers: [] };
  }

  return cachedConfig;
}

export function getLlmProvider(providerName: string): LlmProviderConfig | null {
  return loadLlmConfig().providers.find((provider) => provider.provider_name === providerName) ?? null;
}

export function isValidLlmSelection(providerName: string, modelId: string): boolean {
  const provider = getLlmProvider(providerName);
  return Boolean(provider?.model_ids.includes(modelId));
}

export function getDefaultLlmSelection(): { providerName: string; modelId: string } | null {
  const [provider] = loadLlmConfig().providers;
  const [modelId] = provider?.model_ids ?? [];
  if (!provider || !modelId) {
    return null;
  }

  return {
    providerName: provider.provider_name,
    modelId
  };
}

export function getPublicLlmOptions(): LlmProviderOption[] {
  return loadLlmConfig().providers.map((provider) => ({
    providerName: provider.provider_name,
    modelIds: [...provider.model_ids]
  }));
}
