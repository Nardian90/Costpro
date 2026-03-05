import { OpenAICompatibleAdapter } from './openai-compatible-adapter';

export class KimiAdapter extends OpenAICompatibleAdapter {
  constructor(apiKey: string, model: string = 'moonshot-v1-8k') {
    super(apiKey, model, 'https://api.moonshot.cn/v1');
  }
}
