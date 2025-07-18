"use client";

import React, { useState, useEffect } from "react";
import {
  Send,
  Loader2,
  Database,
  Zap,
  CheckCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  Trash2,
} from "lucide-react";
import { useAskQLWebSocket } from "@/hooks/useAskQLWebSocket";
import {
  askQLAPI,
  type AskQLResponse,
  type VisualizationDrillDownResponse,
  type Visualization,
} from "@/lib/askql-api";
import DataVisualization from "./DataVisualization";
import WorkflowProgress from "./WorkflowProgress";
import WorkflowTimelineItem from "./WorkflowTimelineItem";
import VisualizationDrillDown from "./VisualizationDrillDown";
import FakeAIThoughtProcess from "./FakeAIThoughtProcess";

const AskQLInterface: React.FC = () => {
  const [question, setQuestion] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showStream, setShowStream] = useState(true);
  const [nonStreamResult, setNonStreamResult] = useState<AskQLResponse | null>(
    null
  );
  const [showFakeThoughtProcess, setShowFakeThoughtProcess] = useState(false);

  // Drill-down state
  const [selectedVisualization, setSelectedVisualization] =
    useState<Visualization | null>(null);
  const [isDrillDownOpen, setIsDrillDownOpen] = useState(false);
  const [drillDownResults, setDrillDownResults] = useState<
    VisualizationDrillDownResponse[]
  >([]);

  const { status, steps, result, connect, disconnect, startQuery, clearSteps } =
    useAskQLWebSocket();

  // Prevent hydration mismatch by not rendering WebSocket-dependent content until client-side
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    // Load query suggestions on component mount
    const loadSuggestions = async () => {
      try {
        const data = await askQLAPI.getQuerySuggestions();
        setSuggestions(data.suggestions);
      } catch (error) {
        console.error("Failed to load suggestions:", error);
      }
    };

    loadSuggestions();
  }, []);

  useEffect(() => {
    // Hide fake thought process when results are ready
    if (result || nonStreamResult) {
      setShowFakeThoughtProcess(false);
    }
  }, [result, nonStreamResult]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    // Reset states for new query
    setNonStreamResult(null);
    clearSteps();
    setIsLoading(true);
    setShowFakeThoughtProcess(true);

    try {
      if (showStream && status.isConnected) {
        // Use WebSocket streaming for real-time updates
        startQuery(question);

        // Also send HTTP request for processing
        await askQLAPI.processStreamQuery({
          question,
          sessionId: status.sessionId!,
          includeDebugInfo: true,
        });
      } else {
        // Use direct HTTP request
        clearSteps();
        setNonStreamResult(null);
        const response = await askQLAPI.processQuery({
          question,
          includeDebugInfo: true,
        });

        // For non-streaming mode, we'll manually set the result
        setNonStreamResult(response);
      }
    } catch (error) {
      console.error("Query failed:", error);
      // const errorStep = { // This block was removed as per the new_code, as steps is now managed by useAskQLWebSocket
      //   step: 'error',
      //   status: 'error' as const,
      //   message: ` Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      //   timestamp: new Date().toISOString(),
      // };
      // setSteps((prev) => [...prev, errorStep]);
    } finally {
      setIsLoading(false);
    }
  };

  const getStepIcon = (step: any) => {
    switch (step.status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Zap className="h-4 w-4 text-orange-500" />;
    }
  };

  const getStepColor = (step: any) => {
    switch (step.status) {
      case "completed":
        return "border-l-green-500 bg-green-50";
      case "error":
        return "border-l-red-500 bg-red-50";
      case "processing":
        return "border-l-blue-500 bg-blue-50";
      default:
        return "border-l-orange-500 bg-orange-50";
    }
  };

  const handleVisualizationSelect = (visualization: any) => {
    setSelectedVisualization(visualization);
    setIsDrillDownOpen(true);
  };

  const handleDrillDownResult = (result: VisualizationDrillDownResponse) => {
    setDrillDownResults((prev) => [...prev, result]);
    setIsDrillDownOpen(false);

    if (result.success) {
      // Optional: Show a success message or update UI
      console.log("Drill-down completed successfully", result);
    }
  };

  const closeDrillDown = () => {
    setIsDrillDownOpen(false);
    setSelectedVisualization(null);
  };

  const handleFakeThoughtProcessComplete = () => {
    setShowFakeThoughtProcess(false);
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
      {/* WebSocket Connection Controls */}
      {isClient && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              {status.isConnected ? (
                <Wifi className="h-5 w-5 text-green-600" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-500" />
              )}
              <span className="font-medium text-gray-700">
                {status.isConnected
                  ? "Real-time connection active"
                  : "Disconnected"}
              </span>
              {status.sessionId && (
                <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                  ID: {status.sessionId.slice(0, 8)}...
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStream}
                  onChange={(e) => setShowStream(e.target.checked)}
                  className="rounded text-blue-500 focus:ring-blue-500"
                />
                Stream results
              </label>
              {status.isConnected ? (
                <button
                  onClick={disconnect}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={connect}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold hover:bg-blue-600 transition-colors"
                >
                  Connect
                </button>
              )}
            </div>
          </div>
          {status.error && (
            <div className="mt-3 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
              Connection Error: {status.error}
            </div>
          )}
        </div>
      )}

      {/* Query Form */}
      <div className="bg-white rounded-lg p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="question"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              What would you like to ask your data?
            </label>
            <div className="flex gap-2">
              <input
                id="question"
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g., Show me sales trends for the last quarter"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!question.trim() || isLoading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                Ask
              </button>
            </div>
          </div>

          {/* Query Suggestions */}
          {suggestions.length > 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Try one of these:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.slice(0, 5).map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setQuestion(suggestion)}
                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm hover:bg-gray-200 transition-colors"
                    disabled={isLoading}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>
      </div>

      {/* AI Thought Process */}
      {isClient && showFakeThoughtProcess && (
        <FakeAIThoughtProcess
          isActive={showFakeThoughtProcess}
          onComplete={handleFakeThoughtProcessComplete}
        />
      )}

      {/* Original Workflow Steps (fallback for when WebSocket provides real steps) */}
      {isClient && !showFakeThoughtProcess && steps.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Real-time Process Steps
            </h3>
            <button
              onClick={clearSteps}
              className="flex items-center gap-1 px-3 py-1 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          </div>

          {/* Progress bar */}
          <WorkflowProgress steps={steps} />

          {/* Timeline */}
          <ul className="space-y-4 mt-4 max-h-96 overflow-y-auto pr-2">
            {steps.map((step, idx) => (
              <WorkflowTimelineItem
                key={`${step.timestamp}-${idx}`}
                step={step}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Final Result Display */}
      {isClient && (result || nonStreamResult) && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Database className="h-6 w-6 text-blue-500" />
            Analysis Report
          </h3>

          {(result?.answer || nonStreamResult?.answer) && (
            <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-lg mb-6">
              <h4 className="font-bold text-blue-800 mb-2">AI Summary:</h4>
              <p>{result?.answer || nonStreamResult?.answer}</p>
            </div>
          )}

          {/* Data Visualizations */}
          <DataVisualization
            visualizations={
              result?.visualizations || nonStreamResult?.visualizations
            }
            analysis={result?.analysis || nonStreamResult?.analysis}
            onVisualizationSelect={handleVisualizationSelect}
            originalSqlQuery={
              result?.metadata?.sqlQuery ||
              nonStreamResult?.metadata?.sqlQuery ||
              ""
            }
            originalQuestion={question}
            availableData={
              // Try to get the raw data from the first table visualization
              (result?.visualizations || nonStreamResult?.visualizations)?.find(
                (viz: any) => viz.type === "table"
              )?.data || []
            }
          />

          {(result?.metadata?.sqlQuery ||
            nonStreamResult?.metadata?.sqlQuery) && (
            <div className="mt-6">
              <h4 className="font-semibold text-gray-700 mb-2">
                Generated SQL Query:
              </h4>
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
                {result?.metadata?.sqlQuery ||
                  nonStreamResult?.metadata?.sqlQuery}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drill-down Results */}
      {drillDownResults.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Database className="h-6 w-6 text-green-500" />
            Drill-down Results
          </h3>

          {drillDownResults.map((result, index) => (
            <div key={index} className="mb-6 last:mb-0">
              {result.success ? (
                <div>
                  <h4 className="font-medium text-gray-700 mb-2">
                    Result #{index + 1}
                  </h4>
                  <DataVisualization
                    visualizations={[result.visualization]}
                    onVisualizationSelect={handleVisualizationSelect}
                  />
                  <div className="mt-2 text-sm text-gray-600">
                    Execution time: {result.metadata.executionTime}ms | Rows:{" "}
                    {result.metadata.rowCount}
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg">
                  <h4 className="font-medium text-red-800 mb-2">
                    Drill-down Error #{index + 1}
                  </h4>
                  <p>{result.error}</p>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={() => setDrillDownResults([])}
            className="mt-4 px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear Results
          </button>
        </div>
      )}

      {/* Drill-down Modal */}
      {selectedVisualization && (
        <VisualizationDrillDown
          visualization={selectedVisualization}
          isOpen={isDrillDownOpen}
          onClose={closeDrillDown}
          onDrillDownResult={handleDrillDownResult}
          availableData={
            // Try to get the raw data from the first table visualization
            (result?.visualizations || nonStreamResult?.visualizations)?.find(
              (viz: any) => viz.type === "table"
            )?.data || []
          }
        />
      )}
    </div>
  );
};

export default AskQLInterface;
