import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { AIProviderService } from '../ai/ai-provider.service';

export interface SQLValidationInput {
  sqlQuery: string;
  originalQuestion: string;
  schema: any;
  explanation: string;
}

export interface SQLValidationOutput {
  isValid: boolean;
  issues: string[];
  suggestions: string[];
  improvedQuery?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  shouldExecute: boolean;
}

const SQLValidationSchema = z.object({
  isValid: z.boolean().describe('Whether the SQL query is valid and correct'),
  issues: z.array(z.string()).describe('List of issues found with the query'),
  suggestions: z.array(z.string()).describe('List of improvement suggestions'),
  improvedQuery: z.string().optional().describe('Improved SQL query if needed'),
  riskLevel: z
    .enum(['LOW', 'MEDIUM', 'HIGH'])
    .describe('Risk level of executing the query'),
  shouldExecute: z.boolean().describe('Whether the query should be executed'),
});

const QueryAlternativesSchema = z.object({
  alternatives: z
    .array(
      z.object({
        query: z.string().describe('Alternative SQL query'),
        explanation: z
          .string()
          .describe('Explanation of why this approach works'),
        confidence: z
          .number()
          .min(0)
          .max(100)
          .describe('Confidence score for this alternative'),
      }),
    )
    .describe('Array of alternative query approaches'),
});

@Injectable()
export class SQLValidationAgent {
  private llm: BaseChatModel;

  constructor(
    private databaseService: DatabaseService,
    private aiProvider: AIProviderService,
  ) {
    this.llm = this.aiProvider.getValidationModel();
  }

  async validateSQL(input: SQLValidationInput): Promise<SQLValidationOutput> {
    const syntaxValidation = await this.validateSyntax(input.sqlQuery);

    if (!syntaxValidation.isValid) {
      return {
        isValid: false,
        issues: [`Syntax error: ${syntaxValidation.error}`],
        suggestions: ['Fix the SQL syntax before proceeding'],
        riskLevel: 'HIGH',
        shouldExecute: false,
      };
    }

    const semanticValidation = await this.performSemanticValidation(input);

    return semanticValidation;
  }

  private async validateSyntax(
    sqlQuery: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      await this.databaseService.$queryRawUnsafe(`EXPLAIN ${sqlQuery}`);
      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: error.message,
      };
    }
  }

  private async performSemanticValidation(
    input: SQLValidationInput,
  ): Promise<SQLValidationOutput> {
    const systemPrompt = `You are an expert SQL validator and optimizer. Your job is to:
1. Analyze if the SQL query correctly answers the original natural language question
2. Identify potential issues with the query
3. Suggest improvements if needed
4. Assess the risk level of executing the query
5. Determine if the query should be executed

Database Schema:
${JSON.stringify(input.schema, null, 2)}

Consider these factors:
- Query correctness (does it answer the original question?)
- Performance implications (is it efficient?)
- Safety (no destructive operations)
- Completeness (does it handle edge cases?)
- Best practices (proper JOINs, WHERE clauses, etc.)

You must respond with structured data containing isValid, issues, suggestions, riskLevel, and shouldExecute fields.`;

    const humanPrompt = `Original Question: "${input.originalQuestion}"

Generated SQL Query:
${input.sqlQuery}

Query Explanation: ${input.explanation}

Please validate this SQL query and provide your analysis.`;

    try {
      const structuredLlm = this.llm.withStructuredOutput(SQLValidationSchema);

      const validationResult = (await structuredLlm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ])) as SQLValidationOutput;

      return validationResult;
    } catch (error) {
      return {
        isValid: false,
        issues: [`Validation failed: ${error.message}`],
        suggestions: ['Manual review required'],
        riskLevel: 'HIGH',
        shouldExecute: false,
      };
    }
  }

  async experimentWithQuery(input: SQLValidationInput): Promise<{
    alternatives: Array<{
      query: string;
      explanation: string;
      confidence: number;
    }>;
  }> {
    const systemPrompt = `You are an expert SQL optimizer. Given a SQL query and the original question, generate 2-3 alternative approaches to answer the same question.

Database Schema:
${JSON.stringify(input.schema, null, 2)}

For each alternative:
1. Provide a different but valid approach
2. Explain the reasoning
3. Rate confidence (0-100)

You must respond with structured data containing an alternatives array.`;

    const humanPrompt = `Original Question: "${input.originalQuestion}"
Current SQL Query: ${input.sqlQuery}

Generate alternative approaches to answer this question.`;

    try {
      const structuredLlm = this.llm.withStructuredOutput(
        QueryAlternativesSchema,
      );

      const result = (await structuredLlm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ])) as {
        alternatives: Array<{
          query: string;
          explanation: string;
          confidence: number;
        }>;
      };

      return result;
    } catch (error) {
      return {
        alternatives: [],
      };
    }
  }
}
