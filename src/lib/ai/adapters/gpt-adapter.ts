import { OpenAICompatibleAdapter } from './openai-compatible-adapter';

export class GPTAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, model: string = 'gpt-4o') {
    super(apiKey, model, 'https://api.openai.com/v1');
  }
}
