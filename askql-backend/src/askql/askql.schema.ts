import { z } from 'zod';

// Factory to create a fresh chart-data schema each time (avoids JSON-Schema $ref reuse)
const chartDataSchema = () =>
  z.object({
    labels: z
      .array(z.string())
      .describe('The labels for the x-axis (e.g., categories, dates).'),
    datasets: z.array(
      z.object({
        label: z
          .string()
          .describe('The name of this dataset (e.g., "Sales", "User Count").'),
        data: z
          .array(z.number())
          .describe('The numerical data points for the y-axis.'),
      }),
    ),
  });

// Main schema for the AI's structured output
export const askQLStructuredOutputSchema = z.object({
  summary: z
    .string()
    .describe(
      'A concise, insightful, natural language summary of the findings from the query results. This should be a human-readable interpretation of the data.',
    ),

  table: z
    .object({
      should_show: z
        .boolean()
        .describe(
          "Set to true if the raw data is valuable to show in a table, for example, if the user asks to 'list' something or for detailed records.",
        ),
      columns: z
        .array(z.string())
        .describe('An array of column headers for the table.'),
      data: z
        .array(z.record(z.any()))
        .describe(
          'The raw or summarized data for the table, as an array of objects.',
        ),
    })
    .describe('Represents a detailed data table.'),

  bar_chart: z
    .object({
      should_show: z
        .boolean()
        .describe(
          'Set to true if a bar chart is a suitable and insightful visualization for this data (e.g., for comparing counts across categories).',
        ),
      title: z.string().describe('A descriptive title for the bar chart.'),
      data: chartDataSchema(),
    })
    .optional()
    .describe('Represents a bar chart visualization.'),

  line_chart: z
    .object({
      should_show: z
        .boolean()
        .describe(
          'Set to true if a line chart is a suitable and insightful visualization for showing a trend over time.',
        ),
      title: z.string().describe('A descriptive title for the line chart.'),
      data: chartDataSchema(),
    })
    .optional()
    .describe('Represents a line chart visualization.'),

  pie_chart: z
    .object({
      should_show: z
        .boolean()
        .describe(
          'Set to true if a pie chart is a suitable and insightful visualization for showing proportions of a whole.',
        ),
      title: z.string().describe('A descriptive title for the pie chart.'),
      data: chartDataSchema(),
    })
    .optional()
    .describe('Represents a pie chart visualization.'),
});

export type AskQLStructuredOutput = z.infer<typeof askQLStructuredOutputSchema>;
