"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Send,
  Loader2,
  Sparkles,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  TrendingUp,
  Filter,
  Lightbulb,
} from "lucide-react";
import { askQLAPI } from "@/lib/askql-api";

interface VisualizationEditChatProps {
  isOpen: boolean;
  onClose: () => void;
  visualization: {
    id: string;
    type: "chart" | "table";
    title: string;
    config: {
      chartType?: "bar" | "line" | "pie" | "scatter" | "area" | "doughnut";
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
  availableData: any[];
  originalSqlQuery: string;
  originalQuestion: string;
  onVisualizationUpdate: (newVisualization: any) => void;
}

interface EditMessage {
  id: string;
  type: "user" | "ai" | "system";
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

const VisualizationEditChat: React.FC<VisualizationEditChatProps> = ({
  isOpen,
  onClose,
  visualization,
  availableData,
  originalSqlQuery,
  originalQuestion,
  onVisualizationUpdate,
}) => {
  const [messages, setMessages] = useState<EditMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setMessages([
        {
          id: "welcome",
          type: "system",
          content: `I'm your AI visualization editor! I can help you modify this ${
            visualization.config.chartType || "visualization"
          }. What would you like to change?`,
          timestamp: new Date(),
        },
      ]);
      setInputValue("");
      loadSuggestions();

      // Focus input after modal animation
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, visualization]);

  const loadSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const data = await askQLAPI.getVisualizationSuggestions({
        visualization,
        availableData,
      });

      if (data.success) {
        setSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error("Failed to load suggestions:", error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isLoading) return;

    const userMessage: EditMessage = {
      id: Date.now().toString(),
      type: "user",
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    try {
      const result = await askQLAPI.editVisualization({
        userRequest: message,
        currentVisualization: visualization,
        availableData,
        originalSqlQuery,
        originalQuestion,
      });

      if (result.success) {
        const aiMessage: EditMessage = {
          id: (Date.now() + 1).toString(),
          type: "ai",
          content: result.reasoning,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiMessage]);

        // Update the visualization
        onVisualizationUpdate(result.newVisualization);

        // Show success feedback
        const successMessage: EditMessage = {
          id: (Date.now() + 2).toString(),
          type: "system",
          content:
            "✅ Visualization updated successfully! The changes are now applied.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, successMessage]);
      } else {
        const errorMessage: EditMessage = {
          id: (Date.now() + 1).toString(),
          type: "ai",
          content:
            result.error ||
            "I couldn't process that request. Could you try rephrasing it?",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      const errorMessage: EditMessage = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content:
          "Sorry, I encountered an error processing your request. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  const getChartIcon = (chartType: string) => {
    switch (chartType) {
      case "bar":
        return <BarChart3 className="h-4 w-4" />;
      case "line":
        return <LineChartIcon className="h-4 w-4" />;
      case "pie":
        return <PieChartIcon className="h-4 w-4" />;
      default:
        return <TrendingUp className="h-4 w-4" />;
    }
  };

  const getMessageIcon = (type: string) => {
    switch (type) {
      case "ai":
        return <Sparkles className="h-4 w-4 text-blue-500" />;
      case "system":
        return <Lightbulb className="h-4 w-4 text-green-500" />;
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 rounded-full">
              {getChartIcon(visualization.config.chartType || "chart")}
              <span className="text-sm font-medium text-blue-700">
                Edit {visualization.config.chartType || "visualization"}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900 truncate">
              {visualization.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {messages.map((message) => (
            <div key={message.id} className="flex gap-3">
              <div className="flex-shrink-0 mt-1">
                {getMessageIcon(message.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={`inline-block max-w-full px-4 py-2 rounded-lg ${
                    message.type === "user"
                      ? "bg-blue-500 text-white ml-auto"
                      : message.type === "system"
                      ? "bg-green-50 text-green-800 border border-green-200"
                      : "bg-gray-100 text-gray-900"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">
                    {message.content}
                  </p>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 mt-1">
                <Sparkles className="h-4 w-4 text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="inline-block bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Processing your request...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && !isLoading && (
          <div className="px-4 py-2 border-t border-gray-100">
            <div className="text-xs text-gray-500 mb-2">Quick suggestions:</div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Tell me how you'd like to modify this visualization..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow text-sm"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSendMessage(inputValue)}
              disabled={!inputValue.trim() || isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Try: "Make this a pie chart", "Change X-axis to categories", "Show
            only top 5"
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualizationEditChat;
