"use client";

import React, { useState } from "react";
import {
  X,
  Search,
  Filter,
  BarChart3,
  TrendingUp,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  askQLAPI,
  type VisualizationDrillDownRequest,
  type VisualizationDrillDownResponse,
} from "@/lib/askql-api";

interface VisualizationData {
  id: string;
  type: "chart" | "table";
  title: string;
  config?: any;
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
    supportedOperations: Array<"detail" | "filter" | "group" | "trend">;
    description: string;
  };
}

interface VisualizationDrillDownProps {
  visualization: VisualizationData;
  isOpen: boolean;
  onClose: () => void;
  onDrillDownResult: (result: VisualizationDrillDownResponse) => void;
  availableData?: any[]; // Data available for drill-down context
}

const VisualizationDrillDown: React.FC<VisualizationDrillDownProps> = ({
  visualization,
  isOpen,
  onClose,
  onDrillDownResult,
  availableData = [],
}) => {
  const [selectedOperation, setSelectedOperation] = useState<
    "detail" | "filter" | "group" | "trend"
  >("detail");
  const [parameters, setParameters] = useState<{
    filters?: Record<string, any>;
    groupBy?: string[];
    timeRange?: { start: string; end: string };
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }>({
    limit: 50,
    sortOrder: "asc",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !visualization.drillDown) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validate drill-down context before sending request
    if (!visualization.drillDown) {
      setError("This visualization doesn't support drill-down operations.");
      setIsLoading(false);
      return;
    }

    if (!visualization.drillDown.dataSource.table) {
      setError("Drill-down failed: No table information available.");
      setIsLoading(false);
      return;
    }

    if (
      !visualization.drillDown.dataSource.columns ||
      visualization.drillDown.dataSource.columns.length === 0
    ) {
      setError("Drill-down failed: No column information available.");
      setIsLoading(false);
      return;
    }

    try {
      // Enhanced drill-down request with full context
      const request: VisualizationDrillDownRequest = {
        visualizationId: visualization.id,
        operation: selectedOperation,
        parameters,
        // Include full visualization context for the backend
        visualization: {
          id: visualization.id,
          type: visualization.type,
          title: visualization.title,
          config: visualization.config || {},
          data: visualization.data,
          drillDown: visualization.drillDown,
        },
        availableData,
      };

      console.log("🔍 Sending drill-down request:", {
        visualizationId: request.visualizationId,
        operation: request.operation,
        hasVisualization: !!request.visualization,
        hasAvailableData: !!request.availableData?.length,
        hasDrillDown: !!request.visualization?.drillDown,
        tableName: request.visualization?.drillDown?.dataSource.table,
        columns: request.visualization?.drillDown?.dataSource.columns,
      });

      const result = await askQLAPI.processDrillDown(request);
      onDrillDownResult(result);

      if (!result.success) {
        // Enhanced error message for column validation errors
        let errorMessage =
          result.error || "Failed to process drill-down request";
        if (errorMessage.includes("invalid columns")) {
          errorMessage +=
            "\n\nTip: This visualization has limited data columns. Try a different type of drill-down operation or filter by specific values instead of creating new groupings.";
        }
        setError(errorMessage);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case "detail":
        return <Search className="h-4 w-4" />;
      case "filter":
        return <Filter className="h-4 w-4" />;
      case "group":
        return <BarChart3 className="h-4 w-4" />;
      case "trend":
        return <TrendingUp className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getOperationDescription = (operation: string) => {
    switch (operation) {
      case "detail":
        return "Get more detailed data for this visualization";
      case "filter":
        return "Apply filters to narrow down the data";
      case "group":
        return "Group data by different dimensions";
      case "trend":
        return "Analyze trends over time";
      default:
        return "";
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Explore: {visualization.title}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {visualization.drillDown.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Operation Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Choose Analysis Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {visualization.drillDown.supportedOperations.map((operation) => (
                <button
                  key={operation}
                  type="button"
                  onClick={() => setSelectedOperation(operation)}
                  className={`p-4 border rounded-lg transition-all ${
                    selectedOperation === operation
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {getOperationIcon(operation)}
                    <span className="font-medium capitalize">{operation}</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    {getOperationDescription(operation)}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Parameters</h3>

            {/* Limit */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Number of records to retrieve
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={parameters.limit || 50}
                onChange={(e) =>
                  setParameters((prev) => ({
                    ...prev,
                    limit: parseInt(e.target.value) || 50,
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Sort Order */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Sort Order
              </label>
              <select
                value={parameters.sortOrder || "asc"}
                onChange={(e) =>
                  setParameters((prev) => ({
                    ...prev,
                    sortOrder: e.target.value as "asc" | "desc",
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>

            {/* Column for sorting */}
            {visualization.drillDown.dataSource.columns.length > 0 && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Sort by column
                </label>
                <select
                  value={parameters.sortBy || ""}
                  onChange={(e) =>
                    setParameters((prev) => ({
                      ...prev,
                      sortBy: e.target.value || undefined,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Default</option>
                  {visualization.drillDown.dataSource.columns.map((column) => (
                    <option key={column} value={column}>
                      {column
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (char) => char.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Group By (for group operation) */}
            {selectedOperation === "group" &&
              visualization.drillDown.dataSource.columns.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Group by columns
                  </label>
                  <div className="space-y-2">
                    {visualization.drillDown.dataSource.columns
                      .slice(0, 5)
                      .map((column) => (
                        <label key={column} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={
                              parameters.groupBy?.includes(column) || false
                            }
                            onChange={(e) => {
                              setParameters((prev) => {
                                const currentGroupBy = prev.groupBy || [];
                                if (e.target.checked) {
                                  return {
                                    ...prev,
                                    groupBy: [...currentGroupBy, column],
                                  };
                                } else {
                                  return {
                                    ...prev,
                                    groupBy: currentGroupBy.filter(
                                      (col) => col !== column
                                    ),
                                  };
                                }
                              });
                            }}
                            className="mr-2 rounded text-blue-500 focus:ring-blue-500"
                          />
                          <span className="text-sm">
                            {column
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (char) => char.toUpperCase())}
                          </span>
                        </label>
                      ))}
                  </div>
                </div>
              )}
          </div>

          {/* Data Source Info */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Data Source
            </h4>
            <p className="text-sm text-gray-600">
              Table:{" "}
              <span className="font-mono bg-white px-1 rounded">
                {visualization.drillDown.dataSource.table}
              </span>
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Available columns:{" "}
              {visualization.drillDown.dataSource.columns.length}
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium text-red-800">Error</span>
              </div>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Analyze Data"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VisualizationDrillDown;
