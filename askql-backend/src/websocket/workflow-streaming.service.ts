import { Injectable } from '@nestjs/common';
import { AskQLGateway, WorkflowStep } from './askql.gateway';

@Injectable()
export class WorkflowStreamingService {
  constructor(private readonly gateway: AskQLGateway) {}

  private createTimestamp(): string {
    return new Date().toISOString();
  }

  // Schema loading step
  emitSchemaLoading(sessionId: string) {
    const step: WorkflowStep = {
      step: 'schema_loading',
      status: 'starting',
      message: 'Loading database schema information...',
      timestamp: this.createTimestamp(),
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  emitSchemaLoaded(sessionId: string, tableCount: number) {
    const step: WorkflowStep = {
      step: 'schema_loading',
      status: 'completed',
      message: `Database schema loaded successfully. Found ${tableCount} tables.`,
      timestamp: this.createTimestamp(),
      metadata: { rowCount: tableCount },
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  // NL to SQL conversion step
  emitNLToSQLStarting(sessionId: string, question: string) {
    const step: WorkflowStep = {
      step: 'nl_to_sql',
      status: 'starting',
      message: `Converting natural language to SQL: "${question}"`,
      timestamp: this.createTimestamp(),
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  emitNLToSQLProcessing(sessionId: string) {
    const step: WorkflowStep = {
      step: 'nl_to_sql',
      status: 'processing',
      message: 'AI is analyzing the question and generating SQL query...',
      timestamp: this.createTimestamp(),
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  emitNLToSQLCompleted(
    sessionId: string,
    sqlQuery: string,
    confidence: number,
    explanation: string,
  ) {
    const step: WorkflowStep = {
      step: 'nl_to_sql',
      status: 'completed',
      message: `SQL query generated successfully`,
      timestamp: this.createTimestamp(),
      data: { sqlQuery, explanation },
      metadata: { confidence },
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  // SQL validation step
  emitSQLValidationStarting(sessionId: string) {
    const step: WorkflowStep = {
      step: 'sql_validation',
      status: 'starting',
      message: 'Validating SQL query for safety and correctness...',
      timestamp: this.createTimestamp(),
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  emitSQLValidationCompleted(
    sessionId: string,
    isValid: boolean,
    riskLevel: string,
    issues: string[],
  ) {
    const step: WorkflowStep = {
      step: 'sql_validation',
      status: 'completed',
      message: isValid
        ? `SQL validation passed (Risk: ${riskLevel})`
        : `SQL validation found issues: ${issues.join(', ')}`,
      timestamp: this.createTimestamp(),
      data: { isValid, riskLevel, issues },
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  // Query experimentation step
  emitExperimentationStarting(sessionId: string) {
    const step: WorkflowStep = {
      step: 'experimentation',
      status: 'starting',
      message: 'Experimenting with alternative query approaches...',
      timestamp: this.createTimestamp(),
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  emitExperimentationCompleted(sessionId: string, alternativesCount: number) {
    const step: WorkflowStep = {
      step: 'experimentation',
      status: 'completed',
      message: `Generated ${alternativesCount} alternative approaches`,
      timestamp: this.createTimestamp(),
      metadata: { rowCount: alternativesCount },
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  // SQL execution step
  emitSQLExecutionStarting(sessionId: string, query: string) {
    const step: WorkflowStep = {
      step: 'sql_execution',
      status: 'starting',
      message: 'Executing SQL query against the database...',
      timestamp: this.createTimestamp(),
      data: { query },
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  emitSQLExecutionCompleted(
    sessionId: string,
    success: boolean,
    rowCount: number,
    executionTime: number,
    error?: string,
  ) {
    const step: WorkflowStep = {
      step: 'sql_execution',
      status: success ? 'completed' : 'error',
      message: success
        ? `Query executed successfully. Found ${rowCount} result(s) in ${executionTime}ms`
        : `Query execution failed: ${error}`,
      timestamp: this.createTimestamp(),
      metadata: { executionTime, rowCount },
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  // Result interpretation step
  emitResultInterpretationStarting(sessionId: string, resultCount: number) {
    const step: WorkflowStep = {
      step: 'result_interpretation',
      status: 'starting',
      message: `Interpreting ${resultCount} result(s) into natural language...`,
      timestamp: this.createTimestamp(),
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  emitResultInterpretationCompleted(sessionId: string, answer: string) {
    const step: WorkflowStep = {
      step: 'result_interpretation',
      status: 'completed',
      message: 'Generated natural language response',
      timestamp: this.createTimestamp(),
      data: { answer: answer.substring(0, 200) + '...' }, // Truncate for step display
    };
    this.gateway.emitWorkflowStep(sessionId, step);
  }

  // Error handling
  emitError(sessionId: string, step: string, error: string) {
    const errorStep: WorkflowStep = {
      step,
      status: 'error',
      message: `Error in ${step}: ${error}`,
      timestamp: this.createTimestamp(),
      data: { error },
    };
    this.gateway.emitWorkflowStep(sessionId, errorStep);
  }

  // Final completion
  emitWorkflowCompleted(sessionId: string, finalResult: any) {
    this.gateway.emitWorkflowComplete(sessionId, {
      status: 'completed',
      timestamp: this.createTimestamp(),
      result: finalResult,
    });
  }

  emitWorkflowError(sessionId: string, error: string) {
    this.gateway.emitWorkflowError(sessionId, error);
  }
}
