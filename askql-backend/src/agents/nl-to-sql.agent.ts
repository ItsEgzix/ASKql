import { Injectable } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { DatabaseService } from '../database/database.service';
import { AIProviderService } from '../ai/ai-provider.service';

export interface NLToSQLInput {
  naturalLanguageQuery: string;
  schema: any;
}

export interface NLToSQLOutput {
  sqlQuery: string;
  explanation: string;
  confidence: number;
}


const NLToSQLSchema = z.object({
  sqlQuery: z.string().describe('The SQL SELECT query to execute'),
  explanation: z
    .string()
    .describe('Explanation of the query logic and assumptions made'),
  confidence: z
    .number()
    .min(0)
    .max(100)
    .describe('Confidence score from 0-100 for the generated query'),
});

@Injectable()
export class NLToSQLAgent {
  private llm: BaseChatModel;

  constructor(
    private databaseService: DatabaseService,
    private aiProvider: AIProviderService,
  ) {
    this.llm = this.aiProvider.getNLToSQLModel();
  }

  async convertNLToSQL(input: NLToSQLInput): Promise<NLToSQLOutput> {
    const systemPrompt = `You are an expert SQL query generator. Your task is to convert natural language questions into precise SQL queries.

Database Schema:
${JSON.stringify(input.schema, null, 2)}

Rules:
1. Generate ONLY SELECT queries (no INSERT, UPDATE, DELETE for safety)
2. Use proper table names and column names from the schema
3. Use appropriate JOINs when relationships are needed
4. Be precise with data types and constraints
5. Return valid SQL syntax compatible with the target database
6. If the question is ambiguous, make reasonable assumptions
7. Always include an explanation of your query logic
8. Provide a confidence score (0-100) based on how certain you are about the query

You must respond with structured data containing sqlQuery, explanation, and confidence fields.`;

    const humanPrompt = `Convert this natural language question to SQL: "${input.naturalLanguageQuery}"`;

    try {
      // Use structured output to ensure proper JSON formatting
      const structuredLlm = this.llm.withStructuredOutput(NLToSQLSchema);

      const parsedResponse = (await structuredLlm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ])) as NLToSQLOutput;

      // Additional safety check: ensure it's a SELECT query
      const trimmedQuery = parsedResponse.sqlQuery.trim().toUpperCase();
      if (!trimmedQuery.startsWith('SELECT')) {
        throw new Error('Generated query is not a SELECT statement');
      }

      return parsedResponse;
    } catch (error) {
      throw new Error(`NL to SQL conversion failed: ${error.message}`);
    }
  }

  async validateSQLSyntax(
    sqlQuery: string,
  ): Promise<{ isValid: boolean; error?: string }> {
    return await this.databaseService.validateQuerySyntax(sqlQuery);
  }
}
