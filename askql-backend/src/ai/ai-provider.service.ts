import { Injectable } from '@nestjs/common';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

// Currently we only support Google Gemini
export type AIProvider = 'google';

export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  temperature: number;
  apiKey: string;
}

export interface AIModelSettings {
  // Settings for NL to SQL conversion
  nlToSql: {
    temperature: number;
    model?: string; // Override default model for this use case
  };

  // Settings for SQL validation
  validation: {
    temperature: number;
    model?: string;
  };

  // Settings for result interpretation (more creative)
  interpretation: {
    temperature: number;
    model?: string;
  };
}

@Injectable()
export class AIProviderService {
  private config: AIProviderConfig;
  private modelSettings: AIModelSettings;

  constructor() {
    this.initializeConfig();
  }

  private initializeConfig() {
    // Default model settings optimized for each use case
    this.modelSettings = {
      nlToSql: {
        temperature: 0.1,
        model: process.env.AI_NL_TO_SQL_MODEL, // Optional override
      },
      validation: {
        temperature: 0.2,
        model: process.env.AI_VALIDATION_MODEL,
      },
      interpretation: {
        temperature: 0.3, 
        model: process.env.AI_INTERPRETATION_MODEL,
      },
    };

    this.config = {
      provider: 'google',
      model: process.env.GOOGLE_MODEL || 'gemini-1.5-pro',
      temperature: 0.2,
      apiKey: process.env.GOOGLE_API_KEY,
    };

    if (!this.config.apiKey) {
      throw new Error(
        'GOOGLE_API_KEY environment variable is required for Google Gemini provider.',
      );
    }

    console.log(
      `AI Provider initialized: ${this.config.provider} (${this.config.model})`,
    );
  }


  getNLToSQLModel(): BaseChatModel {
    const settings = this.modelSettings.nlToSql;
    return this.createModel({
      temperature: settings.temperature,
      model: settings.model || this.config.model,
    });
  }

  getValidationModel(): BaseChatModel {
    const settings = this.modelSettings.validation;
    return this.createModel({
      temperature: settings.temperature,
      model: settings.model || this.config.model,
    });
  }

  getInterpretationModel(): BaseChatModel {
    const settings = this.modelSettings.interpretation;
    return this.createModel({
      temperature: settings.temperature,
      model: settings.model || this.config.model,
    });
  }

  getCustomModel(temperature: number, model?: string): BaseChatModel {
    return this.createModel({
      temperature,
      model: model || this.config.model,
    });
  }

  getProviderInfo(): { provider: AIProvider; model: string } {
    return {
      provider: this.config.provider,
      model: this.config.model,
    };
  }

  private createModel(options: {
    temperature: number;
    model: string;
  }): BaseChatModel {
    // @ts-expect-error Suppress deep type instantiation error from langchain typings
    return new ChatGoogleGenerativeAI({
      modelName: options.model,
      temperature: options.temperature,
      apiKey: this.config.apiKey,
    });
  }

  async validateConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const model = this.getCustomModel(0.1);
      const response = await model.invoke([
        { role: 'user', content: 'Hello, respond with just "OK"' },
      ]);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `AI provider validation failed: ${error.message}`,
      };
    }
  }
}
