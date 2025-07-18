import { Injectable } from '@nestjs/common';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AIProviderService } from '../ai/ai-provider.service';

// Input interface for visualization editing requests
export interface VisualizationEditInput {
  userRequest: string; // Natural language request like "change x-axis to categories"
  currentVisualization: {
    id: string;
    type: 'chart' | 'table';
    title: string;
    config: {
      chartType?: 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'doughnut';
      labels?: string[];
      datasets?: Array<{
        label: string;
        data: number[];
        color?: string;
      }>;
      columns?: string[];
    };
    data?: any[];
  };
  availableData: any[]; // Raw data that can be transformed
  originalSqlQuery: string; // Original SQL for context
  originalQuestion: string; // User's original question for context
}

// Zod schema for AI response
const VisualizationEditSchema = z.object({
  success: z.boolean().describe('Whether the edit request can be fulfilled'),
  reasoning: z.string().describe('Explanation of what changes are being made'),

  // New visualization configuration
  newVisualization: z.object({
    type: z.enum(['chart', 'table']).describe('Type of visualization'),
    title: z.string().describe('Updated title for the visualization'),
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
    data: z.array(z.record(z.any())).optional(),
  }),

  // If a new SQL query is needed
  requiresNewQuery: z.boolean().describe('Whether a new SQL query is needed'),
  newSqlQuery: z
    .string()
    .optional()
    .describe('New SQL query if data transformation is needed'),

  // Error handling
  error: z
    .string()
    .optional()
    .describe('Error message if request cannot be fulfilled'),
});

export type VisualizationEditOutput = z.infer<typeof VisualizationEditSchema>;

@Injectable()
export class VisualizationEditAgent {
  constructor(private readonly aiProviderService: AIProviderService) {}

  async editVisualization(
    input: VisualizationEditInput,
  ): Promise<VisualizationEditOutput> {
    const llm = this.aiProviderService.getCustomModel(0.3); // Medium creativity for editing
    const structuredLlm = llm.withStructuredOutput(VisualizationEditSchema, {
      name: 'visualization_editor',
    });

    const systemPrompt = `You are an expert data visualization editor. Your job is to interpret user requests to modify existing charts and graphs.

You can handle these types of requests:
1. **Chart Type Changes**: "Make this a pie chart", "Convert to line graph", "Show as bar chart"
2. **Axis Changes**: "Change X-axis to categories", "Use time on X-axis", "Show revenue on Y-axis"
3. **Data Grouping**: "Group by region", "Show by month", "Aggregate by category"
4. **Filtering**: "Only show 2023 data", "Remove outliers", "Show top 10"
5. **Styling**: "Change colors", "Add trend line", "Make it bigger"

When processing requests:
- Analyze the current visualization and available data
- Determine if the request can be fulfilled with existing data
- If new data is needed, generate an appropriate SQL query
- Transform the data structure to match the new visualization requirements
- Provide clear reasoning for your changes

IMPORTANT RULES:
- Only suggest chart types that make sense for the data
- Preserve the core data insights when transforming
- If a request is unclear or impossible, explain why
- Always provide a clear title that reflects the new visualization
`;

    const humanPrompt = `Current Visualization:
Type: ${input.currentVisualization.type}
Chart Type: ${input.currentVisualization.config.chartType || 'N/A'}
Title: ${input.currentVisualization.title}
Labels: ${JSON.stringify(input.currentVisualization.config.labels?.slice(0, 5) || [])}
Data Preview: ${JSON.stringify(input.availableData.slice(0, 3), null, 2)}
Total Rows: ${input.availableData.length}

Original Question: "${input.originalQuestion}"
Original SQL: ${input.originalSqlQuery}

User Request: "${input.userRequest}"

Transform the visualization according to the user's request. Analyze the available data and provide the new configuration.`;

    try {
      console.log(
        '🎨 Processing visualization edit request:',
        input.userRequest,
      );

      const result = await structuredLlm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ]);

      console.log('🎨 Visualization edit result:', {
        success: result.success,
        reasoning: result.reasoning,
        newType: result.newVisualization.type,
        newChartType: result.newVisualization.config.chartType,
        requiresNewQuery: result.requiresNewQuery,
      });

      return result;
    } catch (error) {
      console.error('🎨 Visualization edit error:', error);
      throw new Error(`Visualization edit failed: ${error.message}`);
    }
  }

  // Helper method to suggest common edits for a visualization
  async suggestEdits(
    visualization: VisualizationEditInput['currentVisualization'],
    availableData: any[],
  ): Promise<string[]> {
    const suggestions: string[] = [];

    // Chart type suggestions
    if (visualization.config.chartType !== 'pie') {
      suggestions.push('Convert to pie chart');
    }
    if (visualization.config.chartType !== 'bar') {
      suggestions.push('Show as bar chart');
    }
    if (visualization.config.chartType !== 'line') {
      suggestions.push('Make it a line graph');
    }

    // Data transformation suggestions
    if (availableData.length > 0) {
      const firstRow = availableData[0];
      const columns = Object.keys(firstRow);

      // Suggest different groupings
      columns.forEach((col) => {
        if (col !== visualization.config.labels?.[0]) {
          suggestions.push(`Group by ${col.replace(/_/g, ' ')}`);
        }
      });

      // Date-based suggestions
      const dateColumns = columns.filter(
        (col) =>
          col.includes('date') ||
          col.includes('time') ||
          col.includes('year') ||
          col.includes('month'),
      );
      if (dateColumns.length > 0) {
        suggestions.push('Show trends over time');
        suggestions.push('Group by time period');
      }
    }

    // Limit suggestions
    suggestions.push('Show only top 10');
    suggestions.push('Filter recent data');

    return suggestions.slice(0, 6); // Return max 6 suggestions
  }

  // Helper method to validate chart type compatibility
  private isChartTypeCompatible(
    currentType: string,
    newType: string,
    data: any[],
  ): boolean {
    if (data.length === 0) return false;

    const firstRow = data[0];
    const columns = Object.keys(firstRow);
    const numericColumns = columns.filter(
      (col) => typeof firstRow[col] === 'number',
    );

    switch (newType) {
      case 'pie':
        // Pie charts need at least one categorical and one numeric column
        return numericColumns.length >= 1 && columns.length >= 2;
      case 'line':
        // Line charts are good for time series or sequential data
        return numericColumns.length >= 1;
      case 'bar':
        // Bar charts work with most data
        return numericColumns.length >= 1;
      default:
        return true;
    }
  }

  // Helper method to transform data for different chart types
  private transformDataForChartType(
    data: any[],
    fromType: string,
    toType: string,
  ): {
    labels: string[];
    datasets: Array<{ label: string; data: number[]; color?: string }>;
  } {
    if (data.length === 0) {
      return { labels: [], datasets: [] };
    }

    const firstRow = data[0];
    const columns = Object.keys(firstRow);
    const numericColumns = columns.filter(
      (col) => typeof firstRow[col] === 'number',
    );
    const categoryColumns = columns.filter(
      (col) => typeof firstRow[col] !== 'number',
    );

    // Default transformation
    const labelColumn = categoryColumns[0] || columns[0];
    const valueColumn = numericColumns[0] || columns[1];

    const labels = data.map((row) => String(row[labelColumn]));
    const values = data.map((row) => Number(row[valueColumn]) || 0);

    return {
      labels,
      datasets: [
        {
          label: valueColumn
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase()),
          data: values,
          color: this.getColorForChartType(toType),
        },
      ],
    };
  }

  private getColorForChartType(chartType: string): string {
    const colors = {
      bar: '#3B82F6',
      line: '#10B981',
      pie: '#8B5CF6',
      area: '#F59E0B',
      scatter: '#EF4444',
      doughnut: '#6366F1',
    };
    return colors[chartType] || '#6B7280';
  }
}
