import { Injectable } from '@nestjs/common';
import { StateGraph, END } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { WorkflowStreamingService } from '../websocket/workflow-streaming.service';

import {
  NLToSQLAgent,
  NLToSQLInput,
  NLToSQLOutput,
} from '../agents/nl-to-sql.agent';
import {
  SQLValidationAgent,
  SQLValidationInput,
  SQLValidationOutput,
} from '../agents/sql-validation.agent';
import {
  SQLExecutionAgent,
  SQLExecutionInput,
  SQLExecutionOutput,
} from '../agents/sql-execution.agent';
import {
  ResultInterpretationAgent,
  ResultInterpretationInput,
} from '../agents/result-interpretation.agent';
import { AskQLStructuredOutput } from '../askql/askql.schema';
import { DatabaseService } from '../database/database.service';

// Define the state that flows through the graph
export interface AskQLState {
  originalQuestion: string;
  sessionId?: string; // For WebSocket streaming
  schema?: any;

  // NL to SQL stage
  sqlQuery?: string;
  queryExplanation?: string;
  sqlConfidence?: number;

  // Validation stage
  validationResult?: SQLValidationOutput;
  alternativeQueries?: Array<{
    query: string;
    explanation: string;
    confidence: number;
  }>;

  // Execution stage
  executionResult?: SQLExecutionOutput;

  // Final interpretation
  finalResponse?: AskQLStructuredOutput;

  // Error handling
  error?: string;
  retryCount?: number;

  // Messages for conversation tracking
  messages: BaseMessage[];
}

@Injectable()
export class AskQLWorkflow {
  // Using `any` to avoid tight coupling to internal builder/compiled types
  private workflow: any;

  constructor(
    private nlToSqlAgent: NLToSQLAgent,
    private sqlValidationAgent: SQLValidationAgent,
    private sqlExecutionAgent: SQLExecutionAgent,
    private resultInterpretationAgent: ResultInterpretationAgent,
    private databaseService: DatabaseService,
    private streamingService: WorkflowStreamingService,
  ) {
    this.buildWorkflow();
  }

  private buildWorkflow() {
    // Create the state graph builder
    let builder: any = new StateGraph<AskQLState>({
      channels: {
        originalQuestion: { value: null },
        schema: { value: null },
        sqlQuery: { value: null },
        queryExplanation: { value: null },
        sqlConfidence: { value: null },
        validationResult: { value: null },
        alternativeQueries: { value: null },
        executionResult: { value: null },
        finalResponse: { value: null },
        error: { value: null },
        retryCount: { value: null },
        messages: { value: null },
      },
    });

    // Helper to keep chain fluid
    const add = (g: any) => g;

    builder = add(builder.addNode('load_schema', this.loadSchema.bind(this)));
    builder = add(builder.addNode('nl_to_sql', this.convertNLToSQL.bind(this)));
    builder = add(builder.addNode('validate_sql', this.validateSQL.bind(this)));
    builder = add(
      builder.addNode(
        'experiment_alternatives',
        this.experimentWithAlternatives.bind(this),
      ),
    );
    builder = add(builder.addNode('execute_sql', this.executeSQL.bind(this)));
    builder = add(
      builder.addNode('interpret_results', this.interpretResults.bind(this)),
    );
    builder = add(builder.addNode('handle_error', this.handleError.bind(this)));

    // Define the workflow edges
    builder = add(builder.addEdge('__start__', 'load_schema'));
    builder = add(builder.addEdge('load_schema', 'nl_to_sql'));

    // Conditional edge from nl_to_sql based on confidence
    builder = add(
      builder.addConditionalEdges(
        'nl_to_sql',
        this.shouldValidateSQL.bind(this),
        {
          validate: 'validate_sql',
          error: 'handle_error',
        },
      ),
    );

    // Conditional edge from validate_sql
    builder = add(
      builder.addConditionalEdges(
        'validate_sql',
        this.shouldExecuteOrExperiment.bind(this),
        {
          execute: 'execute_sql',
          experiment: 'experiment_alternatives',
          error: 'handle_error',
        },
      ),
    );

    // From experiment_alternatives, choose best query and execute
    builder = add(builder.addEdge('experiment_alternatives', 'execute_sql'));

    // Conditional edge from execute_sql
    builder = add(
      builder.addConditionalEdges(
        'execute_sql',
        this.shouldInterpretOrError.bind(this),
        {
          interpret: 'interpret_results',
          error: 'handle_error',
        },
      ),
    );

    // Final edges
    builder = add(builder.addEdge('interpret_results', END));
    builder = add(builder.addEdge('handle_error', END));

    // Compile the workflow
    this.workflow = builder.compile();
  }

  async processQuery(
    question: string,
    sessionId?: string,
  ): Promise<AskQLState> {
    const initialState: AskQLState = {
      originalQuestion: question,
      retryCount: 0,
      messages: [],
    };

    console.log('🚀 Starting workflow for question:', question);

    // Emit starting event if we have a session ID
    if (sessionId) {
      this.streamingService.emitSchemaLoading(sessionId);
    }

    try {
      console.log('🔄 Invoking workflow...');
      // Add sessionId to the state for streaming
      const stateWithSession = { ...initialState, sessionId };
      const result = await this.workflow.invoke(stateWithSession);

      console.log('✅ Workflow completed');
      console.log('📊 Final state keys:', Object.keys(result));
      console.log('🎯 Has finalResponse:', !!result.finalResponse);
      console.log('❌ Has error:', !!result.error);
      console.log('📝 SQL Query:', result.sqlQuery);
      console.log('✅ Execution success:', result.executionResult?.success);

      // Emit completion event
      if (sessionId) {
        if (result.error) {
          this.streamingService.emitWorkflowError(sessionId, result.error);
        } else {
          this.streamingService.emitWorkflowCompleted(sessionId, result);
        }
      }

      return result;
    } catch (error) {
      console.error('💥 Workflow execution failed:', error.message);

      if (sessionId) {
        this.streamingService.emitWorkflowError(sessionId, error.message);
      }

      return {
        ...initialState,
        error: `Workflow execution failed: ${error.message}`,
      };
    }
  }

  // Node implementations
  private async loadSchema(state: AskQLState): Promise<Partial<AskQLState>> {
    if (state.sessionId) {
      this.streamingService.emitSchemaLoading(state.sessionId);
    }

    try {
      const schema = await this.databaseService.getSchemaInfo();

      if (state.sessionId) {
        const tableCount = Object.keys(schema).length;
        this.streamingService.emitSchemaLoaded(state.sessionId, tableCount);
      }

      return { schema };
    } catch (error) {
      if (state.sessionId) {
        this.streamingService.emitError(
          state.sessionId,
          'schema_loading',
          error.message,
        );
      }
      return { error: `Failed to load database schema: ${error.message}` };
    }
  }

  private async convertNLToSQL(
    state: AskQLState,
  ): Promise<Partial<AskQLState>> {
    if (state.sessionId) {
      this.streamingService.emitNLToSQLStarting(
        state.sessionId,
        state.originalQuestion,
      );
    }

    if (!state.schema) {
      return { error: 'Database schema not available' };
    }

    try {
      if (state.sessionId) {
        this.streamingService.emitNLToSQLProcessing(state.sessionId);
      }

      const input: NLToSQLInput = {
        naturalLanguageQuery: state.originalQuestion,
        schema: state.schema,
      };

      const result = await this.nlToSqlAgent.convertNLToSQL(input);

      if (state.sessionId) {
        this.streamingService.emitNLToSQLCompleted(
          state.sessionId,
          result.sqlQuery,
          result.confidence,
          result.explanation,
        );
      }

      return {
        sqlQuery: result.sqlQuery,
        queryExplanation: result.explanation,
        sqlConfidence: result.confidence,
      };
    } catch (error) {
      if (state.sessionId) {
        this.streamingService.emitError(
          state.sessionId,
          'nl_to_sql',
          error.message,
        );
      }
      return { error: `NL to SQL conversion failed: ${error.message}` };
    }
  }

  private async validateSQL(state: AskQLState): Promise<Partial<AskQLState>> {
    if (state.sessionId) {
      this.streamingService.emitSQLValidationStarting(state.sessionId);
    }

    if (!state.sqlQuery || !state.schema) {
      return { error: 'SQL query or schema missing for validation' };
    }

    try {
      const input: SQLValidationInput = {
        sqlQuery: state.sqlQuery,
        originalQuestion: state.originalQuestion,
        schema: state.schema,
        explanation: state.queryExplanation || '',
      };

      const validationResult = await this.sqlValidationAgent.validateSQL(input);

      if (state.sessionId) {
        this.streamingService.emitSQLValidationCompleted(
          state.sessionId,
          validationResult.isValid,
          validationResult.riskLevel,
          validationResult.issues,
        );
      }

      return { validationResult };
    } catch (error) {
      if (state.sessionId) {
        this.streamingService.emitError(
          state.sessionId,
          'sql_validation',
          error.message,
        );
      }
      return { error: `SQL validation failed: ${error.message}` };
    }
  }

  private async experimentWithAlternatives(
    state: AskQLState,
  ): Promise<Partial<AskQLState>> {
    if (state.sessionId) {
      this.streamingService.emitExperimentationStarting(state.sessionId);
    }

    if (!state.sqlQuery || !state.schema) {
      return {}; // Skip experimentation if we don't have the required data
    }

    try {
      const input: SQLValidationInput = {
        sqlQuery: state.sqlQuery,
        originalQuestion: state.originalQuestion,
        schema: state.schema,
        explanation: state.queryExplanation || '',
      };

      const alternatives =
        await this.sqlValidationAgent.experimentWithQuery(input);

      if (state.sessionId) {
        this.streamingService.emitExperimentationCompleted(
          state.sessionId,
          alternatives.alternatives?.length || 0,
        );
      }

      // Choose the best alternative if available
      if (alternatives.alternatives && alternatives.alternatives.length > 0) {
        const bestAlternative = alternatives.alternatives.reduce(
          (best, current) =>
            current.confidence > best.confidence ? current : best,
        );

        // If the best alternative has higher confidence, use it
        if (bestAlternative.confidence > (state.sqlConfidence || 0)) {
          return {
            alternativeQueries: alternatives.alternatives,
            sqlQuery: bestAlternative.query,
            queryExplanation: bestAlternative.explanation,
            sqlConfidence: bestAlternative.confidence,
          };
        }
      }

      return { alternativeQueries: alternatives.alternatives };
    } catch (error) {
      if (state.sessionId) {
        this.streamingService.emitError(
          state.sessionId,
          'experimentation',
          error.message,
        );
      }
      // If experimentation fails, continue with original query
      return {};
    }
  }

  private async executeSQL(state: AskQLState): Promise<Partial<AskQLState>> {
    if (state.sessionId) {
      this.streamingService.emitSQLExecutionStarting(
        state.sessionId,
        state.sqlQuery || '',
      );
    }

    if (!state.sqlQuery || !state.validationResult) {
      return { error: 'SQL query or validation result missing' };
    }

    try {
      const input: SQLExecutionInput = {
        sqlQuery: state.sqlQuery,
        isValidated: state.validationResult.isValid,
        riskLevel: state.validationResult.riskLevel,
      };

      const executionResult = await this.sqlExecutionAgent.executeSQL(input);

      if (state.sessionId) {
        this.streamingService.emitSQLExecutionCompleted(
          state.sessionId,
          executionResult.success,
          executionResult.rowCount,
          executionResult.executionTime,
          executionResult.error,
        );
      }

      return { executionResult };
    } catch (error) {
      if (state.sessionId) {
        this.streamingService.emitError(
          state.sessionId,
          'sql_execution',
          error.message,
        );
      }
      return { error: `SQL execution failed: ${error.message}` };
    }
  }

  private async interpretResults(
    state: AskQLState,
  ): Promise<Partial<AskQLState>> {
    console.log('🎭 Entering interpretResults step');
    console.log('📊 State has executionResult:', !!state.executionResult);
    console.log('📝 State has sqlQuery:', !!state.sqlQuery);

    if (state.sessionId) {
      this.streamingService.emitResultInterpretationStarting(
        state.sessionId,
        state.executionResult?.rowCount || 0,
      );
    }

    if (!state.executionResult || !state.sqlQuery) {
      console.error(
        '❌ Missing executionResult or sqlQuery in interpretResults',
      );
      if (state.sessionId) {
        this.streamingService.emitError(
          state.sessionId,
          'result_interpretation',
          'Missing execution result or SQL query',
        );
      }
      return {
        error: 'Execution result or SQL query missing for interpretation',
      };
    }

    console.log('✅ ExecutionResult success:', state.executionResult.success);
    console.log('📈 Row count:', state.executionResult.rowCount);

    try {
      const input: ResultInterpretationInput = {
        originalQuestion: state.originalQuestion,
        sqlQuery: state.sqlQuery,
        queryResults: state.executionResult.data || [],
      };

      console.log('🤖 Calling result interpretation agent...');
      const finalResponse =
        await this.resultInterpretationAgent.interpretResults(input);

      console.log('✅ Final response generated:', !!finalResponse);
      console.log('📝 Summary:', finalResponse?.summary);

      if (state.sessionId) {
        this.streamingService.emitResultInterpretationCompleted(
          state.sessionId,
          finalResponse.summary,
        );
      }

      return { finalResponse };
    } catch (error) {
      console.error('❌ Error in interpretResults:', error.message);
      if (state.sessionId) {
        this.streamingService.emitError(
          state.sessionId,
          'result_interpretation',
          error.message,
        );
      }
      return { error: `Result interpretation failed: ${error.message}` };
    }
  }

  private async handleError(state: AskQLState): Promise<Partial<AskQLState>> {
    const retryCount = (state.retryCount || 0) + 1;

    // If we've retried too many times, give up
    if (retryCount > 2) {
      return {
        error: `Maximum retry attempts exceeded. Original error: ${state.error}`,
        retryCount,
      };
    }

    // For now, just return the error. In a more sophisticated implementation,
    // we could try to fix common issues automatically
    return {
      error: state.error,
      retryCount,
    };
  }

  // Conditional edge functions
  private shouldValidateSQL(state: AskQLState): string {
    if (state.error) {
      return 'error';
    }
    return 'validate';
  }

  private shouldExecuteOrExperiment(state: AskQLState): string {
    if (state.error || !state.validationResult) {
      return 'error';
    }

    // If validation failed or confidence is low, try experimenting
    if (
      !state.validationResult.isValid ||
      !state.validationResult.shouldExecute ||
      (state.sqlConfidence && state.sqlConfidence < 70)
    ) {
      return 'experiment';
    }

    return 'execute';
  }

  private shouldInterpretOrError(state: AskQLState): string {
    if (state.error || !state.executionResult) {
      return 'error';
    }

    if (!state.executionResult.success) {
      return 'error';
    }

    return 'interpret';
  }
}
