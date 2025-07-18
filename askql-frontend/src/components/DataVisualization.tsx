"use client";

import React from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Table,
  TrendingUp,
  Target,
  Lightbulb,
  AlertTriangle,
} from "lucide-react";

interface VisualizationData {
  type: "chart" | "table" | "metric" | "analysis";
  title: string;
  description?: string;
  config: {
    chartType?: "bar" | "line" | "pie" | "scatter" | "area" | "doughnut";
    // New structure coming from backend (labels + datasets)
    labels?: string[];
    datasets?: Array<{
      label: string;
      data: number[];
      color?: string;
    }>;
    // Legacy structure (series) kept for backward-compatibility
    series?: Array<{
      name: string;
      data: any[];
      color?: string;
    }>;
    options?: any;
    columns?: string[]; // Added for table visualization
  };
  data?: any[]; // optional – required only for tables
  insights?: string[];
  recommendations?: string[];
}

interface AnalysisResult {
  summary: string;
  keyMetrics: Array<{
    label: string;
    value: any;
    change?: number;
    trend?: "up" | "down" | "stable";
  }>;
  trends: Array<{
    period: string;
    value: any;
    change: number;
  }>;
  patterns: string[];
  anomalies?: string[];
}

interface DataVisualizationProps {
  visualizations?: VisualizationData[];
  analysis?: AnalysisResult;
}

const COLORS = [
  "#0088FE",
  "#00C49F",
  "#FFBB28",
  "#FF8042",
  "#8884D8",
  "#82CA9D",
];

const DataVisualization: React.FC<DataVisualizationProps> = ({
  visualizations = [],
  analysis,
}) => {
  if (!visualizations.length && !analysis) {
    return null;
  }

  const renderChart = (viz: VisualizationData) => {
    const { chartType, series, labels, datasets } = viz.config;

    // Build chartData in a unified format { x, y, name }
    let chartData: Array<{ x: string; y: number; name?: string }> = [];

    if (series && series.length > 0) {
      // Legacy structure
      chartData = series[0].data as Array<{
        x: string;
        y: number;
        name?: string;
      }>;
    } else if (labels && datasets && datasets.length > 0) {
      // New labels + datasets structure – take first dataset for now
      const firstSet = datasets[0];
      chartData = labels.map((label, idx) => ({
        x: label,
        name: label,
        y: firstSet.data[idx] ?? 0,
      }));
    }

    if (!chartData || chartData.length === 0) return null;

    switch (chartType) {
      case "bar":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="y" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        );

      case "line":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="y"
                stroke="#8884d8"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case "pie":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }: { name: string; percent: number }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                outerRadius={80}
                fill="#8884d8"
                dataKey="y"
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case "area":
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="y"
                stroke="#8884d8"
                fill="#8884d8"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  const renderTable = (viz: VisualizationData) => {
    if (!viz.data || !viz.data.length) return null;

    const firstRow = viz.data[0];
    const columns = Array.from(
      new Set([...(viz.config.columns || []), ...Object.keys(firstRow)])
    );

    if (columns.length === 0) {
      return <p className="text-gray-500">No data available to display.</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b"
                >
                  {column
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (char) => char.toUpperCase())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {viz.data?.map((row, index) => (
              <tr key={index} className="hover:bg-gray-50">
                {columns.map((column) => (
                  <td
                    key={column}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-b"
                  >
                    {String(
                      row[column] ??
                        row[column.toLowerCase()] ??
                        row[column.toUpperCase()] ??
                        ""
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderVisualization = (viz: VisualizationData) => {
    const getIcon = () => {
      switch (viz.config.chartType) {
        case "bar":
          return <BarChart3 className="h-5 w-5" />;
        case "line":
          return <LineChartIcon className="h-5 w-5" />;
        case "pie":
          return <PieChartIcon className="h-5 w-5" />;
        default:
          return <Table className="h-5 w-5" />;
      }
    };

    return (
      <div
        key={viz.title}
        className="bg-white rounded-lg border border-gray-200 p-6 mb-6"
      >
        <div className="flex items-center gap-2 mb-4">
          {getIcon()}
          <h3 className="text-lg font-semibold text-gray-900">{viz.title}</h3>
        </div>

        {viz.description && (
          <p className="text-gray-600 mb-4">{viz.description}</p>
        )}

        <div className="mb-4">
          {viz.type === "chart" ? renderChart(viz) : renderTable(viz)}
        </div>

        {viz.insights && viz.insights.length > 0 && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="h-4 w-4 text-blue-600" />
              <h4 className="font-medium text-blue-900">Insights</h4>
            </div>
            <ul className="text-sm text-blue-800 space-y-1">
              {viz.insights.map((insight, index) => (
                <li key={index}>• {insight}</li>
              ))}
            </ul>
          </div>
        )}

        {viz.recommendations && viz.recommendations.length > 0 && (
          <div className="mt-4 p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Target className="h-4 w-4 text-green-600" />
              <h4 className="font-medium text-green-900">Recommendations</h4>
            </div>
            <ul className="text-sm text-green-800 space-y-1">
              {viz.recommendations.map((rec, index) => (
                <li key={index}>• {rec}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderAnalysis = (analysis: AnalysisResult) => {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-5 w-5 text-green-600" />
          <h3 className="text-lg font-semibold text-gray-900">Data Analysis</h3>
        </div>

        {analysis.summary && (
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
            <p className="text-gray-700">{analysis.summary}</p>
          </div>
        )}

        {analysis.keyMetrics && analysis.keyMetrics.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3">Key Metrics</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {analysis.keyMetrics.map((metric, index) => (
                <div key={index} className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">{metric.label}</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {metric.value}
                  </div>
                  {metric.change !== undefined && (
                    <div
                      className={`text-sm ${
                        metric.change >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {metric.change >= 0 ? "+" : ""}
                      {metric.change}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {analysis.patterns && analysis.patterns.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3">
              Patterns & Insights
            </h4>
            <ul className="space-y-2">
              {analysis.patterns.map((pattern, index) => (
                <li key={index} className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-gray-700">{pattern}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {analysis.anomalies && analysis.anomalies.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              Anomalies Detected
            </h4>
            <ul className="space-y-2">
              {analysis.anomalies.map((anomaly, index) => (
                <li key={index} className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-gray-700">{anomaly}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {analysis && renderAnalysis(analysis)}
      {visualizations.map(renderVisualization)}
    </div>
  );
};

export default DataVisualization;
