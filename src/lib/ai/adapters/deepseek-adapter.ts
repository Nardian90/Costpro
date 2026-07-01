import { OpenAICompatibleAdapter } from './openai-compatible-adapter';

export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, model: string = 'deepseek-chat') {
    super(apiKey, model, 'https://api.deepseek.com');
  }
}
