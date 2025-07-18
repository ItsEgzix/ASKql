import { Injectable } from '@nestjs/common';
import { AskQLWorkflow, AskQLState } from '../workflow/askql-workflow';
import { DatabaseService } from '../database/database.service';
import { WorkflowStreamingService } from '../websocket/workflow-streaming.service';
import { DrillDownAgent, DrillDownInput } from '../agents/drill-down.agent';
import { SQLExecutionAgent } from '../agents/sql-execution.agent';

export interface AskQLRequest {
  question: string;
  includeDebugInfo?: boolean;
}

export interface VisualizationDrillDownRequest {
  visualizationId: string;
  operation: 'detail' | 'filter' | 'group' | 'trend';
  parameters?: {
    filters?: Record<string, any>;
    groupBy?: string[];
    timeRange?: { start: string; end: string };
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    selectedValue?: any; // Value clicked in the visualization
    selectedLabel?: string; // Label clicked in the visualization
  };
  // Enhanced context for drill-down processing
  visualization?: {
    id: string;
    type: 'chart' | 'table';
    title: string;
    config: any;
    data?: any[];
    drillDown?: {
      originalQuestion: string;
      sqlContext: string;
      dataSource: {
        table: string;
        columns: string[];
        filters?: Record<string, any>;
      };
      supportedOperations: Array<'detail' | 'filter' | 'group' | 'trend'>;
    };
  };
  availableData?: any[]; // Current data for context
}

export interface VisualizationDrillDownResponse {
  success: boolean;
  visualization: Visualization;
  metadata: {
    executionTime: number;
    sqlQuery: string;
    rowCount: number;
  };
  error?: string;
}

export interface Visualization {
  id: string; // Unique identifier for this visualization
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
  drillDown?: {
    enabled: boolean;
    originalQuestion: string;
    sqlContext: string;
    dataSource: {
      table: string;
      columns: string[];
      filters?: Record<string, any>;
    };
    supportedOperations: Array<'detail' | 'filter' | 'group' | 'trend'>;
    description: string;
  };
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
    private drillDownAgent: DrillDownAgent,
    private sqlExecutionAgent: SQLExecutionAgent,
  ) {}

  private generateVisualizationId(): string {
    return `viz_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createDrillDownMetadata(
    originalQuestion: string,
    sqlQuery: string,
    chartType: string,
    executionResult?: any,
  ): Visualization['drillDown'] {
    // Extract table information from SQL query (basic parsing)
    const tableMatch = sqlQuery.match(/FROM\s+(\w+)/i);
    const table = tableMatch ? tableMatch[1] : 'unknown_table';

    // Extract columns from execution result - try multiple approaches
    let columns: string[] = [];

    // Method 1: From metadata columnInfo
    if (executionResult?.metadata?.columnInfo) {
      columns = executionResult.metadata.columnInfo.map(
        (col) => col.name || col.columnName || col,
      );
    }

    // Method 2: From actual data (fallback)
    if (
      columns.length === 0 &&
      executionResult?.data &&
      executionResult.data.length > 0
    ) {
      columns = Object.keys(executionResult.data[0]);
    }

    // Method 3: From SQL query analysis (last resort)
    if (columns.length === 0) {
      const selectMatch = sqlQuery.match(/SELECT\s+(.*?)\s+FROM/is);
      if (selectMatch) {
        const selectClause = selectMatch[1];
        // Basic parsing - this is not perfect but better than nothing
        if (!selectClause.includes('*')) {
          columns = selectClause
            .split(',')
            .map((col) => col.trim().split(' AS ').pop()?.trim() || col.trim())
            .filter((col) => col && !col.includes('('));
        }
      }
    }

    console.log('🔍 Drill-down metadata created:', {
      table,
      columnsFound: columns.length,
      columns: columns,
      executionResultStructure: executionResult
        ? Object.keys(executionResult)
        : 'none',
      hasData: !!executionResult?.data?.length,
    });

    const drillDownMetadata = {
      enabled: true,
      originalQuestion,
      sqlContext: sqlQuery,
      dataSource: {
        table,
        columns,
      },
      supportedOperations: (chartType === 'table'
        ? ['detail', 'filter', 'group']
        : ['detail', 'filter', 'trend', 'group']) as Array<
        'detail' | 'filter' | 'group' | 'trend'
      >,
      description: `Click to explore more details about this ${chartType}`,
    };

    console.log('🔍 Created drill-down metadata:', {
      enabled: drillDownMetadata.enabled,
      table: drillDownMetadata.dataSource.table,
      columnsCount: drillDownMetadata.dataSource.columns.length,
      supportedOps: drillDownMetadata.supportedOperations.length,
    });

    return drillDownMetadata;
  }

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
          id: this.generateVisualizationId(),
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
          drillDown: this.createDrillDownMetadata(
            request.question,
            workflowResult.sqlQuery || '',
            'bar chart',
            executionResult,
          ),
        });
      }

      if (finalResponse.line_chart?.should_show) {
        visualizations.push({
          id: this.generateVisualizationId(),
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
          drillDown: this.createDrillDownMetadata(
            request.question,
            workflowResult.sqlQuery || '',
            'line chart',
            executionResult,
          ),
        });
      }

      if (finalResponse.pie_chart?.should_show) {
        visualizations.push({
          id: this.generateVisualizationId(),
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
          drillDown: this.createDrillDownMetadata(
            request.question,
            workflowResult.sqlQuery || '',
            'pie chart',
            executionResult,
          ),
        });
      }

      if (finalResponse.table.should_show) {
        // Use AI-provided data if available; otherwise fall back to executionResult rows
        console.log(
          '🔍 Table debugging - finalResponse.table.data:',
          finalResponse.table.data,
        );
        console.log(
          '🔍 Table debugging - executionResult?.data:',
          executionResult?.data,
        );
        console.log(
          '🔍 Table debugging - executionResult success:',
          executionResult?.success,
        );

        // Prioritize executionResult data if it exists and is successful
        let tableData = [];
        if (
          executionResult?.success &&
          executionResult?.data &&
          executionResult.data.length > 0
        ) {
          tableData = executionResult.data;
          console.log('🔍 Using executionResult data');
        } else if (
          finalResponse.table.data &&
          finalResponse.table.data.length > 0
        ) {
          tableData = finalResponse.table.data;
          console.log('🔍 Using AI-provided table data');
        } else {
          console.log('🔍 No data available from either source');
        }

        console.log('🔍 Table debugging - final tableData:', tableData);
        console.log('🔍 Table debugging - tableData length:', tableData.length);

        visualizations.push({
          id: this.generateVisualizationId(),
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
          drillDown: this.createDrillDownMetadata(
            request.question,
            workflowResult.sqlQuery || '',
            'table',
            executionResult,
          ),
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
          id: this.generateVisualizationId(),
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
          drillDown: this.createDrillDownMetadata(
            request.question,
            workflowResult.sqlQuery || '',
            'bar chart',
            executionResult,
          ),
        });
      }

      if (finalResponse.line_chart?.should_show) {
        visualizations.push({
          id: this.generateVisualizationId(),
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
          drillDown: this.createDrillDownMetadata(
            request.question,
            workflowResult.sqlQuery || '',
            'line chart',
            executionResult,
          ),
        });
      }

      if (finalResponse.pie_chart?.should_show) {
        visualizations.push({
          id: this.generateVisualizationId(),
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
          drillDown: this.createDrillDownMetadata(
            request.question,
            workflowResult.sqlQuery || '',
            'pie chart',
            executionResult,
          ),
        });
      }

      if (finalResponse.table.should_show) {
        console.log(
          '🔍 Table debugging (non-stream) - finalResponse.table.data:',
          finalResponse.table.data,
        );
        console.log(
          '🔍 Table debugging (non-stream) - executionResult?.data:',
          executionResult?.data,
        );
        console.log(
          '🔍 Table debugging (non-stream) - executionResult success:',
          executionResult?.success,
        );

        // Prioritize executionResult data if it exists and is successful
        let tableData = [];
        if (
          executionResult?.success &&
          executionResult?.data &&
          executionResult.data.length > 0
        ) {
          tableData = executionResult.data;
          console.log('🔍 Using executionResult data (non-stream)');
        } else if (
          finalResponse.table.data &&
          finalResponse.table.data.length > 0
        ) {
          tableData = finalResponse.table.data;
          console.log('🔍 Using AI-provided table data (non-stream)');
        } else {
          console.log('🔍 No data available from either source (non-stream)');
        }

        console.log(
          '🔍 Table debugging (non-stream) - final tableData:',
          tableData,
        );
        console.log(
          '🔍 Table debugging (non-stream) - tableData length:',
          tableData.length,
        );

        visualizations.push({
          id: this.generateVisualizationId(),
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
          drillDown: this.createDrillDownMetadata(
            request.question,
            workflowResult.sqlQuery || '',
            'table',
            executionResult,
          ),
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

  async processDrillDownRequest(
    request: VisualizationDrillDownRequest,
  ): Promise<VisualizationDrillDownResponse> {
    const startTime = Date.now();

    try {
      console.log('🔍 Processing drill-down request:', {
        visualizationId: request.visualizationId,
        operation: request.operation,
        hasVisualization: !!request.visualization,
        hasData: !!request.availableData?.length,
        visualizationType: request.visualization?.type,
        visualizationTitle: request.visualization?.title,
        hasDrillDownContext: !!request.visualization?.drillDown,
      });

      // Debug: Log the raw request to see what we're receiving
      console.log('🔍 Raw drill-down request structure:', {
        requestKeys: Object.keys(request),
        visualizationKeys: request.visualization
          ? Object.keys(request.visualization)
          : 'none',
        drillDownKeys: request.visualization?.drillDown
          ? Object.keys(request.visualization.drillDown)
          : 'none',
      });

      // Validate that we have the necessary context
      if (!request.visualization) {
        console.error(
          '🔍 Drill-down failed: No visualization context provided',
        );
        return {
          success: false,
          visualization: {
            id: request.visualizationId,
            type: 'table',
            title: 'Error',
            config: { columns: [] },
            data: [],
          },
          metadata: {
            executionTime: Date.now() - startTime,
            sqlQuery: '',
            rowCount: 0,
          },
          error:
            'Visualization context is required for drill-down operations. Please ensure the visualization has drill-down metadata.',
        };
      }

      if (!request.visualization.drillDown) {
        console.error(
          '🔍 Drill-down failed: No drill-down context in visualization',
        );
        return {
          success: false,
          visualization: {
            id: request.visualizationId,
            type: 'table',
            title: 'Error',
            config: { columns: [] },
            data: [],
          },
          metadata: {
            executionTime: Date.now() - startTime,
            sqlQuery: '',
            rowCount: 0,
          },
          error:
            'This visualization does not support drill-down operations. Drill-down context is missing.',
        };
      }

      // Prepare drill-down input
      const drillDownInput: DrillDownInput = {
        operation: request.operation,
        originalVisualization: request.visualization,
        parameters: request.parameters,
        availableData: request.availableData || [],
      };

      console.log('🔍 Drill-down input details:', {
        operation: drillDownInput.operation,
        tableName:
          drillDownInput.originalVisualization.drillDown?.dataSource.table,
        availableColumns:
          drillDownInput.originalVisualization.drillDown?.dataSource.columns,
        columnCount:
          drillDownInput.originalVisualization.drillDown?.dataSource.columns
            ?.length || 0,
        originalSQL:
          drillDownInput.originalVisualization.drillDown?.sqlContext?.substring(
            0,
            100,
          ) + '...',
        dataRows: drillDownInput.availableData.length,
        sampleData: drillDownInput.availableData.slice(0, 2),
      });

      // Extra validation for debugging
      const availableCols =
        drillDownInput.originalVisualization.drillDown?.dataSource.columns;
      if (!availableCols || availableCols.length === 0) {
        console.error(
          '🔍 WARNING: No columns available for drill-down operation',
        );
      } else {
        console.log('🔍 Columns that AI can use:', availableCols);
      }

      // Validate the drill-down operation
      const validation =
        await this.drillDownAgent.validateDrillDown(drillDownInput);
      if (!validation.valid) {
        return {
          success: false,
          visualization: {
            id: request.visualizationId,
            type: 'table',
            title: 'Drill-down Error',
            config: { columns: [] },
            data: [],
          },
          metadata: {
            executionTime: Date.now() - startTime,
            sqlQuery: '',
            rowCount: 0,
          },
          error: validation.reason || 'Drill-down operation is not valid',
        };
      }

      // Process the drill-down using AI
      const drillDownResult =
        await this.drillDownAgent.processDrillDown(drillDownInput);

      if (!drillDownResult.success) {
        return {
          success: false,
          visualization: {
            id: request.visualizationId,
            type: 'table',
            title: 'Drill-down Failed',
            config: { columns: [] },
            data: [],
          },
          metadata: {
            executionTime: Date.now() - startTime,
            sqlQuery: drillDownResult.newSqlQuery || '',
            rowCount: 0,
          },
          error:
            drillDownResult.error || 'Failed to process drill-down request',
        };
      }

      // Execute the new SQL query
      console.log('🔍 Executing drill-down SQL:', drillDownResult.newSqlQuery);

      const sqlExecutionResult = await this.sqlExecutionAgent.executeSQL({
        sqlQuery: drillDownResult.newSqlQuery,
        isValidated: true, // We trust the AI-generated query from drill-down
        riskLevel: 'LOW',
      });

      if (!sqlExecutionResult.success) {
        return {
          success: false,
          visualization: {
            id: request.visualizationId,
            type: 'table',
            title: 'Query Execution Failed',
            config: { columns: [] },
            data: [],
          },
          metadata: {
            executionTime: Date.now() - startTime,
            sqlQuery: drillDownResult.newSqlQuery,
            rowCount: 0,
          },
          error: `SQL execution failed: ${sqlExecutionResult.error}`,
        };
      }

      // Build the final visualization with the drill-down data
      const supportedChartTypes = ['bar', 'line', 'pie'] as const;
      const chartType = drillDownResult.newVisualization.config.chartType;
      const finalVisualization: Visualization = {
        id: this.generateVisualizationId(),
        type: drillDownResult.newVisualization.type,
        title: drillDownResult.newVisualization.title,
        config: {
          // Type cast to handle compatibility issues between drill-down and visualization configs
          ...(drillDownResult.newVisualization.config as any),
          // If it's a table, make sure we have columns
          ...(drillDownResult.newVisualization.type === 'table' &&
            sqlExecutionResult.data.length > 0 && {
              columns: Object.keys(sqlExecutionResult.data[0]),
            }),
        },
        // Always use the actual SQL execution data
        data:
          drillDownResult.newVisualization.type === 'table'
            ? sqlExecutionResult.data
            : undefined,
        drillDown: this.createDrillDownMetadata(
          request.visualization.drillDown?.originalQuestion ||
            'Drill-down analysis',
          drillDownResult.newSqlQuery,
          drillDownResult.newVisualization.type === 'chart'
            ? drillDownResult.newVisualization.config.chartType || 'chart'
            : 'table',
          sqlExecutionResult,
        ),
      };

      console.log('🔍 Drill-down completed successfully:', {
        operation: drillDownResult.operationType,
        newVisualizationType: finalVisualization.type,
        rowCount: sqlExecutionResult.data.length,
        executionTime: Date.now() - startTime,
      });

      return {
        success: true,
        visualization: finalVisualization,
        metadata: {
          executionTime: Date.now() - startTime,
          sqlQuery: drillDownResult.newSqlQuery,
          rowCount: sqlExecutionResult.data.length,
        },
      };
    } catch (error) {
      console.error('🔍 Drill-down processing error:', error);

      return {
        success: false,
        visualization: {
          id: request.visualizationId,
          type: 'table',
          title: 'Drill-down Error',
          config: { columns: [] },
          data: [],
        },
        metadata: {
          executionTime: Date.now() - startTime,
          sqlQuery: '',
          rowCount: 0,
        },
        error: `Drill-down processing failed: ${error.message}`,
      };
    }
  }
}
