import { Controller, Post, Get, Body, Query } from '@nestjs/common';
import {
  AskQLService,
  AskQLRequest,
  AskQLResponse,
  VisualizationDrillDownRequest,
  VisualizationDrillDownResponse,
} from './askql.service';
import { AskQLGateway } from '../websocket/askql.gateway';
import {
  VisualizationEditAgent,
  VisualizationEditInput,
} from '../agents/visualization-edit.agent';

class QueryDto {
  question: string;
  includeDebugInfo?: boolean;
}

class StreamQueryDto {
  question: string;
  sessionId: string;
  includeDebugInfo?: boolean;
}

class VisualizationEditDto {
  userRequest: string;
  currentVisualization: {
    id: string;
    type: 'chart' | 'table';
    title: string;
    config: any;
    data?: any[];
  };
  availableData: any[];
  originalSqlQuery: string;
  originalQuestion: string;
}

class VisualizationSuggestionsDto {
  visualization: {
    id: string;
    type: 'chart' | 'table';
    title: string;
    config: any;
    data?: any[];
  };
  availableData: any[];
}

@Controller('askql')
export class AskQLController {
  constructor(
    private readonly askQLService: AskQLService,
    private readonly askQLGateway: AskQLGateway,
    private readonly visualizationEditAgent: VisualizationEditAgent,
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

  @Post('visualization/drill-down')
  async processDrillDown(
    @Body() drillDownDto: VisualizationDrillDownRequest,
  ): Promise<VisualizationDrillDownResponse> {
    console.log('🔍 Controller received drill-down request:', {
      visualizationId: drillDownDto.visualizationId,
      operation: drillDownDto.operation,
      hasVisualization: !!drillDownDto.visualization,
      hasParameters: !!drillDownDto.parameters,
      hasAvailableData: !!drillDownDto.availableData?.length,
    });

    return await this.askQLService.processDrillDownRequest(drillDownDto);
  }

  @Post('test-drill-down')
  async testDrillDown(@Body() body: any): Promise<any> {
    try {
      console.log('🔍 Test drill-down endpoint called with:', {
        bodyKeys: Object.keys(body),
        hasVisualization: !!body.visualization,
        hasVisualizationId: !!body.visualizationId,
        operation: body.operation,
      });

      return {
        success: true,
        message: 'Test drill-down endpoint working',
        received: {
          bodyKeys: Object.keys(body),
          hasVisualization: !!body.visualization,
          hasVisualizationId: !!body.visualizationId,
          operation: body.operation,
          visualizationData: body.visualization
            ? {
                id: body.visualization.id,
                type: body.visualization.type,
                title: body.visualization.title,
                hasDrillDown: !!body.visualization.drillDown,
              }
            : null,
        },
      };
    } catch (error) {
      console.error('🔍 Test drill-down error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('test-db')
  async testDatabase(): Promise<any> {
    try {
      // Test basic database connection
      const healthCheck = await this.askQLService.healthCheck();

      // Try to get schema info
      const schema = await this.askQLService.getSchemaInfo();

      // Return detailed test results
      return {
        success: true,
        health: healthCheck,
        schema: schema,
        tableCount: Object.keys(schema).length,
        tables: Object.keys(schema),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('test-query')
  async testQuery(@Body() body: { query: string }): Promise<any> {
    try {
      // Simple test query for debugging
      console.log('🔍 Test query endpoint called with:', body.query);

      const response = await this.askQLService.processNaturalLanguageQuery({
        question: body.query,
        includeDebugInfo: true,
      });

      console.log('🔍 Test query response:', {
        success: response.success,
        visualizationsCount: response.visualizations.length,
        error: response.error,
      });

      return response;
    } catch (error) {
      console.error('🔍 Test query error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('edit-visualization')
  async editVisualization(@Body() editDto: VisualizationEditDto): Promise<any> {
    try {
      console.log('🎨 Edit visualization request:', editDto.userRequest);

      const input: VisualizationEditInput = {
        userRequest: editDto.userRequest,
        currentVisualization: editDto.currentVisualization,
        availableData: editDto.availableData,
        originalSqlQuery: editDto.originalSqlQuery,
        originalQuestion: editDto.originalQuestion,
      };

      const result = await this.visualizationEditAgent.editVisualization(input);

      console.log('🎨 Edit visualization result:', {
        success: result.success,
        newChartType: result.newVisualization.config.chartType,
        requiresNewQuery: result.requiresNewQuery,
      });

      return result;
    } catch (error) {
      console.error('🎨 Edit visualization error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('visualization-suggestions')
  async getVisualizationSuggestions(
    @Body() suggestionsDto: VisualizationSuggestionsDto,
  ): Promise<any> {
    try {
      const suggestions = await this.visualizationEditAgent.suggestEdits(
        suggestionsDto.visualization,
        suggestionsDto.availableData,
      );

      return {
        success: true,
        suggestions,
      };
    } catch (error) {
      console.error('🎨 Visualization suggestions error:', error);
      return {
        success: false,
        error: error.message,
        suggestions: [],
      };
    }
  }
}
