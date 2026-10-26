import { configuredTranslationModel, createTranslator } from './translation.ts';

export function contentTranslationConfig(env: NodeJS.ProcessEnv, dev: boolean) {
  const inherited = env.CHAT_TRANSLATION_PROVIDER ?? (dev ? 'mock' : 'openai');
  const provider = env.CONTENT_TRANSLATION_PROVIDER ?? inherited;
  const model = env.CONTENT_TRANSLATION_MODEL ?? env.CHAT_TRANSLATION_MODEL ?? 'gpt-4o-mini';
  return {
    profile: `${provider === 'off' ? inherited : provider}:${model}:1`,
    translate: provider === 'off' ? undefined : createTranslator(configuredTranslationModel({
      ...env, CHAT_TRANSLATION_PROVIDER: provider, CHAT_TRANSLATION_MODEL: model,
    }, dev)),
  };
}
