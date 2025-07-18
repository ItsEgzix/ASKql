import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import { AskQLService, AskQLRequest, AskQLResponse } from './askql.service';
import { AskQLGateway } from '../websocket/askql.gateway';

class QueryDto {
  question: string;
  includeDebugInfo?: boolean;
}

class StreamQueryDto {
  question: string;
  sessionId: string;
  includeDebugInfo?: boolean;
}

@Controller('askql')
export class AskQLController {
  constructor(
    private readonly askQLService: AskQLService,
    private readonly askQLGateway: AskQLGateway,
  ) {}

  @Post('query')
  async processQuery(@Body() queryDto: QueryDto): Promise<AskQLResponse> {
    const request: AskQLRequest = {
      question: queryDto.question,
      includeDebugInfo: queryDto.includeDebugInfo || false,
    };

    return await this.askQLService.processNaturalLanguageQuery(request);
  }

  @Post('query/stream')
  async processStreamQuery(
    @Body() queryDto: StreamQueryDto,
  ): Promise<AskQLResponse> {
    const request: AskQLRequest = {
      question: queryDto.question,
      includeDebugInfo: queryDto.includeDebugInfo || false,
    };

    return await this.askQLService.processNaturalLanguageQueryStream(
      request,
      queryDto.sessionId,
    );
  }

  @Get('stream/status')
  async getStreamStatus(): Promise<{ activeConnections: number }> {
    return {
      activeConnections: this.askQLGateway.getActiveSessionsCount(),
    };
  }

  @Get('stream/test')
  async getStreamTestPage(): Promise<string> {
    return ` It is working `;
  }

  @Get('suggestions')
  async getQuerySuggestions(): Promise<{ suggestions: string[] }> {
    const suggestions = await this.askQLService.getQuerySuggestions();
    return { suggestions };
  }

  @Get('health')
  async healthCheck(): Promise<{ status: string; details: any }> {
    return await this.askQLService.healthCheck();
  }

  @Get('schema')
  async getSchema(): Promise<{ schema: any }> {
    try {
      const schemaInfo = await this.askQLService.getSchemaInfo();
      return { schema: schemaInfo };
    } catch (error) {
      return {
        schema: {
          error: 'Unable to retrieve schema information',
          details: error.message,
        },
      };
    }
  }
}
