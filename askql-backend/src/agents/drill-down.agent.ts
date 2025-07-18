import { Injectable } from '@nestjs/common';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AIProviderService } from '../ai/ai-provider.service';
import { DatabaseService } from '../database/database.service';

// Input interface for drill-down requests
export interface DrillDownInput {
  operation: 'detail' | 'filter' | 'group' | 'trend';
  originalVisualization: {
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
      supportedOperations?: Array<'detail' | 'filter' | 'group' | 'trend'>;
    };
  };
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
  availableData?: any[]; // Current data for context
}

// Zod schema for AI response
const DrillDownSchema = z.object({
  success: z.boolean().describe('Whether the drill-down can be performed'),
  reasoning: z
    .string()
    .describe('Explanation of what drill-down operation is being performed'),

  // New SQL query for drill-down
  newSqlQuery: z.string().describe('Modified SQL query to get drill-down data'),

  // New visualization configuration
  newVisualization: z.object({
    type: z
      .enum(['chart', 'table'])
      .describe('Type of drill-down visualization'),
    title: z.string().describe('Title for the drill-down result'),
    config: z.object({
      chartType: z
        .enum(['bar', 'line', 'pie', 'scatter', 'area', 'doughnut'])
        .optional(),
      labels: z.array(z.string()).optional(),
      datasets: z
        .array(
          z.object({
            label: z.string(),
            data: z.array(z.number()),
            color: z.string().optional(),
          }),
        )
        .optional(),
      columns: z.array(z.string()).optional(),
    }),
  }),

  // Metadata
  operationType: z.string().describe('Type of operation performed'),
  filtersApplied: z
    .array(z.string())
    .optional()
    .describe('List of filters applied'),

  // Error handling
  error: z
    .string()
    .optional()
    .describe('Error message if drill-down cannot be performed'),
});

export type DrillDownOutput = z.infer<typeof DrillDownSchema>;

@Injectable()
export class DrillDownAgent {
  constructor(
    private readonly aiProviderService: AIProviderService,
    private readonly databaseService: DatabaseService,
  ) {}

  async processDrillDown(input: DrillDownInput): Promise<DrillDownOutput> {
    const llm = this.aiProviderService.getCustomModel(0.2); // Lower temperature for precise SQL
    const structuredLlm = llm.withStructuredOutput(DrillDownSchema, {
      name: 'drill_down_processor',
    });

    const systemPrompt = `You are an expert data analyst who specializes in creating drill-down queries for data exploration.

Your job is to take a user's drill-down request and generate an appropriate SQL query and visualization configuration.

Types of drill-down operations:
1. **detail**: Show more detailed records (e.g., individual rows instead of aggregated data)
2. **filter**: Filter data based on a specific value or criteria  
3. **group**: Group data by additional dimensions for more granular analysis
4. **trend**: Show trends over time or sequences

Key principles:
- Always preserve the core insight while adding more detail
- Generate valid SQL that works with the original table structure
- Choose appropriate visualization types for the drill-down data
- Apply sensible limits to avoid overwhelming results
- Use proper SQL syntax and avoid injection vulnerabilities

When generating SQL:
- CRITICALLY IMPORTANT: ONLY use column names that exist in the Available Columns list
- NEVER create new column names or derive new columns (like registration_month from registration_year)
- NEVER use functions to create new columns unless they existed in the original query
- Always use the original table name and schema exactly as provided
- Apply WHERE clauses for filtering using ONLY existing columns from the list
- Use GROUP BY for aggregations with ONLY valid column names from the list
- Add ORDER BY for meaningful sorting using ONLY existing columns from the list
- Include appropriate LIMIT clauses (default 100 for details, 50 for aggregations)
- Never assume column names like 'name', 'id', 'title' unless explicitly provided
- If the available columns are limited (like only registration_year, number_of_schools), work within those constraints
- Do not try to extract months, days, or other time units unless those columns already exist
- If you need to reference data, use EXACTLY the column names from the Available Columns list`;

    const drillDownContext = input.originalVisualization.drillDown;
    const currentData = input.availableData || [];

    const humanPrompt = `Original Visualization:
Type: ${input.originalVisualization.type}
Title: ${input.originalVisualization.title}
Current Data Rows: ${currentData.length}

Original Context:
Table: ${drillDownContext?.dataSource.table || 'unknown'}
Available Columns: ${JSON.stringify(drillDownContext?.dataSource.columns || [])}
IMPORTANT: You MUST ONLY use these exact column names in your SQL. Do not use any other column names.

EXAMPLE OF WHAT NOT TO DO:
If Available Columns are: ["registration_year", "number_of_schools"]
DO NOT write: SELECT registration_month, COUNT(*) FROM table...
REASON: "registration_month" does not exist in the available columns
CORRECT: SELECT registration_year, number_of_schools FROM table WHERE registration_year = 2019

Original SQL: ${drillDownContext?.sqlContext || 'Not available'}
Original Question: ${drillDownContext?.originalQuestion || 'Not available'}

Drill-Down Request:
Operation: ${input.operation}
Parameters: ${JSON.stringify(input.parameters || {})}

Current Data Sample: ${JSON.stringify(currentData.slice(0, 3), null, 2)}

DRILL-DOWN EXAMPLES WITH LIMITED COLUMNS:
For Available Columns: ["registration_year", "number_of_schools"]

Detail Operation:
- CORRECT: SELECT registration_year, number_of_schools FROM ${drillDownContext?.dataSource.table || 'table'} WHERE registration_year = 2019 LIMIT 100
- WRONG: SELECT registration_month, school_name FROM table (these columns don't exist)

Filter Operation:
- CORRECT: SELECT registration_year, number_of_schools FROM ${drillDownContext?.dataSource.table || 'table'} WHERE number_of_schools > 100
- WRONG: SELECT *, registration_month FROM table WHERE created_at > '2019-01-01' (using non-existent columns/tables)

Group Operation:
- If only 2 columns available, you cannot group further - return error or show detail instead
- CORRECT: SELECT registration_year, SUM(number_of_schools) as total_schools FROM ${drillDownContext?.dataSource.table || 'table'} GROUP BY registration_year

Generate a drill-down query and visualization configuration for this ${input.operation} operation.`;

    try {
      console.log('🔍 Processing drill-down request:', {
        operation: input.operation,
        visualizationId: input.originalVisualization.id,
        hasParameters: !!input.parameters,
        dataRows: currentData.length,
      });

      const result = await structuredLlm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ]);

      console.log('🔍 Drill-down result:', {
        success: result.success,
        operation: result.operationType,
        newVisualizationType: result.newVisualization.type,
        hasNewQuery: !!result.newSqlQuery,
      });

      // Validate that the generated SQL only uses valid columns
      if (result.success && result.newSqlQuery) {
        const validationResult = this.validateSQLColumns(
          result.newSqlQuery,
          drillDownContext?.dataSource.columns || [],
        );

        if (!validationResult.valid) {
          console.error(
            '🔍 Generated SQL uses invalid columns:',
            validationResult.invalidColumns,
          );
          return {
            ...result,
            success: false,
            error: `Generated SQL uses invalid columns: ${validationResult.invalidColumns.join(', ')}. Available columns: ${drillDownContext?.dataSource.columns?.join(', ') || 'none'}. Please try a different drill-down operation that works with the existing data structure.`,
          };
        }
      }

      return result;
    } catch (error) {
      console.error('🔍 Drill-down error:', error);
      throw new Error(`Drill-down processing failed: ${error.message}`);
    }
  }

  // Helper method to validate drill-down operations
  async validateDrillDown(
    input: DrillDownInput,
  ): Promise<{ valid: boolean; reason?: string }> {
    const drillDownContext = input.originalVisualization.drillDown;

    if (!drillDownContext) {
      return {
        valid: false,
        reason: 'No drill-down context available for this visualization',
      };
    }

    if (!drillDownContext.dataSource.table) {
      return {
        valid: false,
        reason: 'No table information available for drill-down',
      };
    }

    // Check if the operation is supported
    const supportedOps = drillDownContext.supportedOperations || [];
    if (supportedOps.length > 0 && !supportedOps.includes(input.operation)) {
      return {
        valid: false,
        reason: `Operation '${input.operation}' not supported. Available: ${supportedOps.join(', ')}`,
      };
    }

    return { valid: true };
  }

  // Helper method to suggest drill-down operations
  async suggestDrillDowns(
    visualization: DrillDownInput['originalVisualization'],
  ): Promise<string[]> {
    const suggestions: string[] = [];
    const drillDownContext = visualization.drillDown;

    if (!drillDownContext) return suggestions;

    const supportedOps = drillDownContext.supportedOperations || [
      'detail',
      'filter',
      'group',
      'trend',
    ];

    // Generate suggestions based on supported operations
    if (supportedOps.includes('detail')) {
      suggestions.push('Show detailed records');
      suggestions.push('View individual entries');
    }

    if (supportedOps.includes('filter')) {
      suggestions.push('Filter by specific value');
      suggestions.push('Show only selected category');
    }

    if (supportedOps.includes('group')) {
      suggestions.push('Group by additional dimension');
      suggestions.push('Break down by subcategory');
    }

    if (supportedOps.includes('trend')) {
      suggestions.push('Show trends over time');
      suggestions.push('View temporal patterns');
    }

    return suggestions.slice(0, 4); // Return max 4 suggestions
  }

  // Helper method to generate smart filters based on clicked data
  generateSmartFilters(
    selectedValue: any,
    selectedLabel: string,
    availableData: any[],
  ): Record<string, any> {
    const filters: Record<string, any> = {};

    if (!availableData.length) return filters;

    const firstRow = availableData[0];
    const columns = Object.keys(firstRow);

    // Try to find the column that contains the selected value
    for (const col of columns) {
      const values = availableData.map((row) => row[col]);
      if (values.includes(selectedValue) || values.includes(selectedLabel)) {
        filters[col] = selectedValue || selectedLabel;
        break;
      }
    }

    return filters;
  }

  // Helper method to validate that SQL only uses valid column names
  private validateSQLColumns(
    sqlQuery: string,
    validColumns: string[],
  ): { valid: boolean; invalidColumns: string[] } {
    const invalidColumns: string[] = [];

    if (!validColumns.length) {
      return { valid: true, invalidColumns }; // Skip validation if no columns provided
    }

    // Convert to lowercase for case-insensitive comparison
    const validColumnsLower = validColumns.map((col) => col.toLowerCase());

    // Enhanced regex to find potential column references
    // This catches direct column references and some function calls
    const columnPattern =
      /(?:SELECT\s+|,\s*|WHERE\s+|GROUP\s+BY\s+|ORDER\s+BY\s+|HAVING\s+|\.|\s+)([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\(|,|$|\s|WHERE|FROM|GROUP|ORDER|LIMIT)/gi;

    const reservedWords = [
      'select',
      'from',
      'where',
      'group',
      'by',
      'order',
      'having',
      'limit',
      'count',
      'sum',
      'avg',
      'max',
      'min',
      'extract',
      'year',
      'month',
      'day',
      'and',
      'or',
      'not',
      'in',
      'like',
      'between',
      'as',
      'asc',
      'desc',
      'inner',
      'left',
      'right',
      'join',
      'on',
      'distinct',
      'all',
      'case',
      'when',
      'then',
      'else',
      'end',
    ];

    let match;
    while ((match = columnPattern.exec(sqlQuery)) !== null) {
      const columnName = match[1].toLowerCase().trim();

      // Skip SQL reserved words and functions
      if (reservedWords.includes(columnName)) {
        continue;
      }

      // Skip numeric literals
      if (/^\d+$/.test(columnName)) {
        continue;
      }

      // Check if this is a valid column
      if (!validColumnsLower.includes(columnName)) {
        // Special check for common AI mistakes - trying to derive time columns
        const timeDerivatives = [
          'registration_month',
          'registration_day',
          'creation_month',
          'creation_day',
          'month',
          'day',
        ];
        if (timeDerivatives.includes(columnName)) {
          console.warn(
            `🔍 AI attempted to create derived time column: ${columnName}`,
          );
        }
        invalidColumns.push(match[1]); // Use original case
      }
    }

    // Remove duplicates
    const uniqueInvalidColumns = Array.from(new Set(invalidColumns));

    return {
      valid: uniqueInvalidColumns.length === 0,
      invalidColumns: uniqueInvalidColumns,
    };
  }
}
