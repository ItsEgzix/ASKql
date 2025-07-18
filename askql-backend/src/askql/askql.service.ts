import { Injectable } from '@nestjs/common';
import { AskQLWorkflow, AskQLState } from '../workflow/askql-workflow';
import { DatabaseService } from '../database/database.service';
import { WorkflowStreamingService } from '../websocket/workflow-streaming.service';

export interface AskQLRequest {
  question: string;
  includeDebugInfo?: boolean;
}

export interface Visualization {
  type: 'chart' | 'table';
  title: string;
  config: {
    chartType?: 'bar' | 'line' | 'pie';
    labels?: string[];
    datasets?: {
      label: string;
      data: number[];
    }[];
    columns?: string[];
  };
  data?: any[];
}

export interface AskQLResponse {
  success: boolean;
  answer: string;
  visualizations: Visualization[];
  metadata: {
    executionTime: number;
    sqlQuery?: string;
    confidence?: number;
    rowCount: number;
  };
  debugInfo?: {
    workflow: AskQLState;
    steps: string[];
  };
  error?: string;
}

@Injectable()
export class AskQLService {
  constructor(
    private askQLWorkflow: AskQLWorkflow,
    private databaseService: DatabaseService,
    private streamingService: WorkflowStreamingService,
  ) {}

  // New method for streaming queries via WebSocket
  async processNaturalLanguageQueryStream(
    request: AskQLRequest,
    sessionId: string,
  ): Promise<AskQLResponse> {
    const startTime = Date.now();

    try {
      // Process the query through the LangGraph workflow with streaming
      const workflowResult = await this.askQLWorkflow.processQuery(
        request.question,
        sessionId, // Pass session ID for streaming
      );

      const totalExecutionTime = Date.now() - startTime;

      // Check if workflow completed successfully
      if (workflowResult.error) {
        const errorResponse: AskQLResponse = {
          success: false,
          answer: `I encountered an error while processing your question: ${workflowResult.error}`,
          visualizations: [],
          metadata: {
            executionTime: totalExecutionTime,
            rowCount: 0,
          },
          error: workflowResult.error,
          ...(request.includeDebugInfo && {
            debugInfo: {
              workflow: workflowResult,
              steps: this.extractWorkflowSteps(workflowResult),
            },
          }),
        };

        // Emit error via WebSocket
        this.streamingService.emitWorkflowError(
          sessionId,
          workflowResult.error,
        );
        return errorResponse;
      }

      // Extract results from successful workflow
      console.log('🔍 Service extracting results from workflow');
      console.log('📊 WorkflowResult keys:', Object.keys(workflowResult));
      console.log('🎯 finalResponse exists:', !!workflowResult.finalResponse);
      console.log(
        '⚡ executionResult exists:',
        !!workflowResult.executionResult,
      );

      const finalResponse = workflowResult.finalResponse;
      const executionResult = workflowResult.executionResult;

      if (!finalResponse) {
        console.error('❌ No finalResponse found in workflow result');
        console.log(
          '🔍 Full workflow result:',
          JSON.stringify(workflowResult, null, 2),
        );

        const noResponseError: AskQLResponse = {
          success: false,
          answer: 'I was unable to generate a response to your question.',
          visualizations: [],
          metadata: {
            executionTime: totalExecutionTime,
            rowCount: 0,
          },
          error: 'No final response generated',
        };

        this.streamingService.emitWorkflowError(
          sessionId,
          'No final response generated',
        );
        return noResponseError;
      }

      console.log('✅ Final response found, generating success response');

      const visualizations: Visualization[] = [];

      if (finalResponse.bar_chart?.should_show) {
        visualizations.push({
          type: 'chart',
          title: finalResponse.bar_chart.title || 'Bar Chart',
          config: {
            chartType: 'bar',
            labels: finalResponse.bar_chart.data.labels,
            datasets: finalResponse.bar_chart.data.datasets as unknown as {
              label: string;
              data: number[];
            }[],
          },
        });
      }

      if (finalResponse.line_chart?.should_show) {
        visualizations.push({
          type: 'chart',
          title: finalResponse.line_chart.title || 'Line Chart',
          config: {
            chartType: 'line',
            labels: finalResponse.line_chart.data.labels,
            datasets: finalResponse.line_chart.data.datasets as unknown as {
              label: string;
              data: number[];
            }[],
          },
        });
      }

      if (finalResponse.pie_chart?.should_show) {
        visualizations.push({
          type: 'chart',
          title: finalResponse.pie_chart.title || 'Pie Chart',
          config: {
            chartType: 'pie',
            labels: finalResponse.pie_chart.data.labels,
            datasets: finalResponse.pie_chart.data.datasets as unknown as {
              label: string;
              data: number[];
            }[],
          },
        });
      }

      if (finalResponse.table.should_show) {
        // Use AI-provided data if available; otherwise fall back to executionResult rows
        const tableData =
          finalResponse.table.data && finalResponse.table.data.length > 0
            ? finalResponse.table.data
            : executionResult?.data || [];

        visualizations.push({
          type: 'table',
          title: 'Data Table',
          config: {
            columns: finalResponse.table.columns.length
              ? finalResponse.table.columns
              : tableData.length > 0
                ? Object.keys(tableData[0])
                : [],
          },
          data: tableData,
        });
      }

      const successResponse: AskQLResponse = {
        success: true,
        answer: finalResponse.summary,
        visualizations: visualizations as Visualization[],
        metadata: {
          executionTime: totalExecutionTime,
          sqlQuery: workflowResult.sqlQuery,
          confidence: workflowResult.sqlConfidence,
          rowCount: executionResult?.data?.length || 0,
        },
        ...(request.includeDebugInfo && {
          debugInfo: {
            workflow: workflowResult,
            steps: this.extractWorkflowSteps(workflowResult),
          },
        }),
      };

      // Emit completion via WebSocket
      this.streamingService.emitWorkflowCompleted(sessionId, successResponse);
      return successResponse;
    } catch (error) {
      const totalExecutionTime = Date.now() - startTime;

      const errorResponse: AskQLResponse = {
        success: false,
        answer: `I encountered an unexpected error while processing your question: ${error.message}`,
        visualizations: [],
        metadata: {
          executionTime: totalExecutionTime,
          rowCount: 0,
        },
        error: error.message,
      };

      // Emit error via WebSocket
      this.streamingService.emitWorkflowError(sessionId, error.message);
      return errorResponse;
    }
  }

  // Original method (keep for backward compatibility)
  async processNaturalLanguageQuery(
    request: AskQLRequest,
  ): Promise<AskQLResponse> {
    const startTime = Date.now();

    try {
      // Process the query through the LangGraph workflow
      const workflowResult = await this.askQLWorkflow.processQuery(
        request.question,
      );

      const totalExecutionTime = Date.now() - startTime;

      // Check if workflow completed successfully
      if (workflowResult.error) {
        return {
          success: false,
          answer: `I encountered an error while processing your question: ${workflowResult.error}`,
          visualizations: [],
          metadata: {
            executionTime: totalExecutionTime,
            rowCount: 0,
          },
          error: workflowResult.error,
          ...(request.includeDebugInfo && {
            debugInfo: {
              workflow: workflowResult,
              steps: this.extractWorkflowSteps(workflowResult),
            },
          }),
        };
      }

      const finalResponse = workflowResult.finalResponse;
      const executionResult = workflowResult.executionResult;

      if (!finalResponse) {
        return {
          success: false,
          answer: 'I was unable to generate a response to your question.',
          visualizations: [],
          metadata: {
            executionTime: totalExecutionTime,
            rowCount: 0,
          },
          error: 'No final response generated',
        };
      }

      // Build visualizations array using the same strongly-typed helper logic as the streaming variant
      const visualizations: Visualization[] = [];

      if (finalResponse.bar_chart?.should_show) {
        visualizations.push({
          type: 'chart',
          title: finalResponse.bar_chart.title || 'Bar Chart',
          config: {
            chartType: 'bar',
            labels: finalResponse.bar_chart.data.labels,
            datasets: finalResponse.bar_chart.data.datasets as unknown as {
              label: string;
              data: number[];
            }[],
          },
        });
      }

      if (finalResponse.line_chart?.should_show) {
        visualizations.push({
          type: 'chart',
          title: finalResponse.line_chart.title || 'Line Chart',
          config: {
            chartType: 'line',
            labels: finalResponse.line_chart.data.labels,
            datasets: finalResponse.line_chart.data.datasets as unknown as {
              label: string;
              data: number[];
            }[],
          },
        });
      }

      if (finalResponse.pie_chart?.should_show) {
        visualizations.push({
          type: 'chart',
          title: finalResponse.pie_chart.title || 'Pie Chart',
          config: {
            chartType: 'pie',
            labels: finalResponse.pie_chart.data.labels,
            datasets: finalResponse.pie_chart.data.datasets as unknown as {
              label: string;
              data: number[];
            }[],
          },
        });
      }

      if (finalResponse.table.should_show) {
        const tableData =
          finalResponse.table.data && finalResponse.table.data.length > 0
            ? finalResponse.table.data
            : executionResult?.data || [];

        visualizations.push({
          type: 'table',
          title: 'Data Table',
          config: {
            columns: finalResponse.table.columns.length
              ? finalResponse.table.columns
              : tableData.length > 0
                ? Object.keys(tableData[0])
                : [],
          },
          data: tableData,
        });
      }

      return {
        success: true,
        answer: finalResponse.summary,
        visualizations: visualizations as Visualization[],
        metadata: {
          executionTime: totalExecutionTime,
          sqlQuery: workflowResult.sqlQuery,
          confidence: workflowResult.sqlConfidence,
          rowCount: executionResult?.data?.length || 0,
        },
        ...(request.includeDebugInfo && {
          debugInfo: {
            workflow: workflowResult,
            steps: this.extractWorkflowSteps(workflowResult),
          },
        }),
      };
    } catch (error) {
      const totalExecutionTime = Date.now() - startTime;

      return {
        success: false,
        answer: `I encountered an unexpected error while processing your question: ${error.message}`,
        visualizations: [],
        metadata: {
          executionTime: totalExecutionTime,
          rowCount: 0,
        },
        error: error.message,
      };
    }
  }

  private extractWorkflowSteps(workflowResult: AskQLState): string[] {
    const steps: string[] = [];

    if (workflowResult.schema) {
      steps.push('✓ Loaded database schema');
    }

    if (workflowResult.sqlQuery) {
      steps.push('✓ Converted natural language to SQL');
    }

    if (workflowResult.validationResult) {
      steps.push(
        `✓ Validated SQL query (${workflowResult.validationResult.riskLevel} risk)`,
      );
    }

    if (
      workflowResult.alternativeQueries &&
      workflowResult.alternativeQueries.length > 0
    ) {
      steps.push(
        `✓ Experimented with ${workflowResult.alternativeQueries.length} alternative approaches`,
      );
    }

    if (workflowResult.executionResult) {
      if (workflowResult.executionResult.success) {
        steps.push('✓ Executed SQL query successfully');
      } else {
        steps.push('✗ SQL execution failed');
      }
    }

    if (workflowResult.finalResponse) {
      steps.push('✓ Interpreted results to natural language');
    }

    if (workflowResult.error) {
      steps.push(`✗ Error: ${workflowResult.error}`);
    }

    return steps;
  }

  // Helper method to get query suggestions based on schema
  async getQuerySuggestions(): Promise<string[]> {
    try {
      const schema = await this.databaseService.getSchemaInfo();
      const tableNames = Object.keys(schema);

      if (tableNames.length === 0) {
        return ['No tables found in the database.'];
      }

      const suggestions = [
        'Show me all tables in this database',
        'What is the structure of this database?',
        'How many records are in each table?',
        'Show me the distribution of data across categories',
        'What are the trends in the data over time?',
        'Give me a breakdown of the data by category',
        'Show me the top 10 records by value',
        'What are the key metrics for this dataset?',
      ];

      // Add table-specific suggestions based on detected tables
      for (const tableName of tableNames.slice(0, 3)) {
        // Limit to first 3 tables
        suggestions.push(`How many records are in the ${tableName} table?`);
        suggestions.push(`Show me the first 5 rows from ${tableName}`);
        suggestions.push(`What columns does the ${tableName} table have?`);
      }

      // Add some generic suggestions
      suggestions.push(
        'Show me the largest tables by record count',
        'What are the relationships between tables?',
        'Show me tables with the most columns',
      );

      return suggestions.slice(0, 8); // Limit to 8 suggestions
    } catch (error) {
      return [
        'Show me all tables in this database',
        'What is the structure of this database?',
        'How many tables are in this database?',
      ];
    }
  }

  // Get schema information
  async getSchemaInfo(): Promise<{ [tableName: string]: any }> {
    try {
      return await this.databaseService.getSchemaInfo();
    } catch (error) {
      throw new Error(`Failed to get schema info: ${error.message}`);
    }
  }

  // Health check method
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      const dbStatus = await this.databaseService.testConnection();
      return {
        status: dbStatus.connected ? 'healthy' : 'unhealthy',
        details: {
          workflow: 'available',
          agents: 'ready',
          database: dbStatus.connected ? 'connected' : 'disconnected',
          dbType: dbStatus.dbType,
          timestamp: new Date().toISOString(),
          ...(dbStatus.error && { dbError: dbStatus.error }),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}
