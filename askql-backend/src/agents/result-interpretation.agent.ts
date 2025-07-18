import { Injectable } from '@nestjs/common';
import { AIProviderService } from '../ai/ai-provider.service';
import {
  askQLStructuredOutputSchema,
  AskQLStructuredOutput,
} from '../askql/askql.schema';

export interface ResultInterpretationInput {
  originalQuestion: string;
  sqlQuery: string;
  queryResults: any[];
}

@Injectable()
export class ResultInterpretationAgent {
  constructor(private readonly aiProviderService: AIProviderService) {}

  async interpretResults(
    input: ResultInterpretationInput,
  ): Promise<AskQLStructuredOutput> {
    const llm = this.aiProviderService.getInterpretationModel();
    const structuredLlm = llm.withStructuredOutput(
      askQLStructuredOutputSchema,
      {
        name: 'data_analyst_report',
      },
    );

    const prompt = this.createPrompt(input);

    console.log('🔍 Result Interpretation Input:', {
      originalQuestion: input.originalQuestion,
      sqlQuery: input.sqlQuery,
      queryResultsLength: input.queryResults.length,
      queryResultsPreview: input.queryResults.slice(0, 3),
    });

    try {
      console.log(
        'Calling Result Interpretation Agent with structured output...',
      );
      const result = await structuredLlm.invoke(prompt);
      console.log('Result Interpretation Agent returned successfully.');

      console.log('🔍 Result Interpretation Output:', {
        summary: result.summary,
        tableShould_show: result.table.should_show,
        tableColumnsLength: result.table.columns.length,
        tableDataLength: result.table.data.length,
        tableDataPreview: result.table.data.slice(0, 3),
      });

      // Safeguard: If AI generated empty table data but should_show is true, inject the real data
      if (
        result.table.should_show &&
        (!result.table.data ||
          result.table.data.length === 0 ||
          result.table.data.every((row) => Object.keys(row).length === 0))
      ) {
        console.log(
          '🔧 AI generated empty table data, injecting real data from query results',
        );
        result.table.data = input.queryResults;

        // Also ensure columns are set correctly
        if (input.queryResults.length > 0) {
          result.table.columns = Object.keys(input.queryResults[0]);
        }

        console.log('🔧 Fixed table data:', {
          dataLength: result.table.data.length,
          columnsLength: result.table.columns.length,
          firstRow: result.table.data[0],
        });
      }

      return result;
    } catch (error) {
      console.error('Error in Result Interpretation Agent:', error);
      throw new Error(`Failed to interpret results: ${error.message}`);
    }
  }

  private createPrompt(input: ResultInterpretationInput): string {
    const { originalQuestion, sqlQuery, queryResults } = input;
    const resultsPreview = JSON.stringify(queryResults.slice(0, 10), null, 2); // Show a preview of the data

    return `
      As a senior data analyst, your task is to interpret the results of a SQL query and generate a comprehensive JSON report for the user.

      The user's original question was: "${originalQuestion}"
      The SQL query that was executed is: "${sqlQuery}"
      The query returned ${queryResults.length} rows. Here is a preview of the first 10 rows:
      ${resultsPreview}

      Your job is to analyze this data and generate a structured JSON output with the following properties:
      1.  **summary**: A clear, natural language summary of the findings that directly answers the user's question.
      2.  **table**: A table view of the raw data.
      3.  **bar_chart**, **line_chart**, **pie_chart**: Optional charts to visualize the data.

      Follow these instructions carefully:
      - **summary**: Write a concise summary that gives the user the key insights from the data.
      - **table**:
        - Set \`should_show\` to true if the data is suitable for a table (e.g., user asked to "list" something, few rows, non-numeric data).
        - If \`should_show\` is true, you MUST populate the \`columns\` and \`data\` fields.
        - The \`columns\` array MUST contain the exact, original keys from the JSON objects in the data (e.g., 'registration_year'). Do NOT modify them.
        - The \`data\` field MUST contain the full, unmodified JSON data from the query results.
        - IMPORTANT: Copy the exact JSON objects from the query results. Do NOT create empty objects or modify the structure.
      - **charts** (bar_chart, line_chart, pie_chart):
        - For any chart that is insightful, set its \`should_show\` flag to true.
        - If \`should_show\` is true, you MUST also provide a descriptive \`title\` and the complete chart \`data\` (labels and datasets).
        - A **bar chart** is for comparing categories.
        - A **line chart** is for showing trends over time.
        - A **pie chart** is for showing proportions.
        - If a chart type is not appropriate, ensure its \`should_show\` flag is set to false.

      Generate the complete JSON output now based on the user's question and the provided data.
    `;
  }
}
