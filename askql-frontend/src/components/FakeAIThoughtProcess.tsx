"use client";

import React, { useState, useEffect } from "react";
import { Brain, Database, Search, Zap, CheckCircle } from "lucide-react";

interface ThoughtStep {
  id: string;
  category:
    | "analysis"
    | "query"
    | "validation"
    | "execution"
    | "interpretation";
  content: string;
  isVisible: boolean;
  isComplete: boolean;
}

const FakeAIThoughtProcess: React.FC<{
  isActive: boolean;
  onComplete?: () => void;
}> = ({ isActive, onComplete }) => {
  const [steps, setSteps] = useState<ThoughtStep[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const thoughtSteps: Omit<ThoughtStep, "isVisible" | "isComplete">[] = [
    {
      id: "understand-1",
      category: "analysis",
      content:
        "Analyzing the user query to understand the specific data requirements and context",
    },
    {
      id: "understand-2",
      category: "analysis",
      content:
        "Identifying key entities and relationships mentioned in the natural language query",
    },
    {
      id: "understand-3",
      category: "analysis",
      content:
        "Determining the most appropriate data visualization type based on the query semantics",
    },
    {
      id: "schema-1",
      category: "query",
      content:
        "Examining the database schema to understand available tables and their relationships",
    },
    {
      id: "schema-2",
      category: "query",
      content:
        "Mapping natural language concepts to specific database columns and data types",
    },
    {
      id: "schema-3",
      category: "query",
      content:
        "Analyzing table constraints and foreign key relationships for optimal query construction",
    },
    {
      id: "sql-1",
      category: "query",
      content:
        "Constructing the initial SQL query structure with appropriate SELECT clauses",
    },
    {
      id: "sql-2",
      category: "query",
      content:
        "Adding necessary JOIN operations to combine data from multiple related tables",
    },
    {
      id: "sql-3",
      category: "query",
      content:
        "Implementing GROUP BY and aggregate functions to summarize data appropriately",
    },
    {
      id: "sql-4",
      category: "query",
      content:
        "Optimizing WHERE clauses and filtering conditions for efficient data retrieval",
    },
    {
      id: "sql-5",
      category: "query",
      content:
        "Adding ORDER BY clauses to ensure meaningful data ordering in the results",
    },
    {
      id: "validate-1",
      category: "validation",
      content:
        "Performing syntax validation to ensure the generated SQL query is syntactically correct",
    },
    {
      id: "validate-2",
      category: "validation",
      content:
        "Checking query safety to prevent potentially harmful database operations",
    },
    {
      id: "validate-3",
      category: "validation",
      content:
        "Verifying that all referenced columns exist in the target database schema",
    },
    {
      id: "validate-4",
      category: "validation",
      content:
        "Estimating query performance impact and optimizing for reasonable execution time",
    },
    {
      id: "execute-1",
      category: "execution",
      content:
        "Establishing secure connection to the database with appropriate access controls",
    },
    {
      id: "execute-2",
      category: "execution",
      content:
        "Executing the validated SQL query against the target database system",
    },
    {
      id: "execute-3",
      category: "execution",
      content:
        "Monitoring query execution progress and handling any potential timeout scenarios",
    },
    {
      id: "execute-4",
      category: "execution",
      content:
        "Retrieving and processing the complete result set from the database query",
    },
    {
      id: "interpret-1",
      category: "interpretation",
      content:
        "Analyzing the structure and content of the returned data to understand patterns",
    },
    {
      id: "interpret-2",
      category: "interpretation",
      content:
        "Identifying the most effective visualization method for presenting the query results",
    },
    {
      id: "interpret-3",
      category: "interpretation",
      content:
        "Determining appropriate chart types, axes, and data groupings for optimal comprehension",
    },
    {
      id: "interpret-4",
      category: "interpretation",
      content:
        "Generating natural language insights and key findings from the data analysis",
    },
    {
      id: "interpret-5",
      category: "interpretation",
      content:
        "Creating actionable recommendations based on the discovered data patterns",
    },
    {
      id: "interpret-6",
      category: "interpretation",
      content:
        "Preparing drill-down capabilities and interactive features for deeper data exploration",
    },
    {
      id: "finalize-1",
      category: "interpretation",
      content:
        "Formatting the final response with comprehensive visualizations and explanatory text",
    },
    {
      id: "finalize-2",
      category: "interpretation",
      content:
        "Ensuring all components are properly structured for optimal user experience and understanding",
    },
  ];

  useEffect(() => {
    if (!isActive) {
      setSteps([]);
      setCurrentIndex(0);
      return;
    }

    const initialSteps = thoughtSteps.map((step) => ({
      ...step,
      isVisible: false,
      isComplete: false,
    }));
    setSteps(initialSteps);
    setCurrentIndex(0);
  }, [isActive]);

  useEffect(() => {
    if (!isActive || currentIndex >= thoughtSteps.length) {
      if (currentIndex >= thoughtSteps.length && onComplete) {
        onComplete();
      }
      return;
    }

    const timer = setTimeout(() => {
      setSteps((prev) =>
        prev.map((step, index) => {
          if (index === currentIndex) {
            return { ...step, isVisible: true };
          }
          return step;
        })
      );

      const completeTimer = setTimeout(() => {
        setSteps((prev) =>
          prev.map((step, index) => {
            if (index === currentIndex) {
              return { ...step, isComplete: true };
            }
            return step;
          })
        );
        setCurrentIndex((prev) => prev + 1);
      }, Math.random() * 2000 + 1500); // 1.5-3.5 seconds per step

      return () => clearTimeout(completeTimer);
    }, Math.random() * 800 + 200); // 0.2-1 second delay before showing

    return () => clearTimeout(timer);
  }, [currentIndex, isActive, onComplete]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "analysis":
        return <Brain className="h-4 w-4" />;
      case "query":
        return <Database className="h-4 w-4" />;
      case "validation":
        return <Search className="h-4 w-4" />;
      case "execution":
        return <Zap className="h-4 w-4" />;
      case "interpretation":
        return <CheckCircle className="h-4 w-4" />;
      default:
        return <Brain className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "analysis":
        return "text-purple-600 bg-purple-50 border-purple-200";
      case "query":
        return "text-blue-600 bg-blue-50 border-blue-200";
      case "validation":
        return "text-orange-600 bg-orange-50 border-orange-200";
      case "execution":
        return "text-green-600 bg-green-50 border-green-200";
      case "interpretation":
        return "text-indigo-600 bg-indigo-50 border-indigo-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  const SkeletonText: React.FC<{ text: string; isComplete: boolean }> = ({
    text,
    isComplete,
  }) => {
    if (isComplete) {
      return <span className="text-gray-700">{text}</span>;
    }

    return (
      <div className="flex flex-wrap gap-1">
        {text.split(" ").map((word, index) => (
          <span
            key={index}
            className="inline-block animate-pulse bg-gray-300 rounded h-4"
            style={{
              width: `${Math.max(word.length * 8, 20)}px`,
              animationDelay: `${index * 50}ms`,
              animationDuration: "1.5s",
            }}
          >
            <span className="invisible">{word}</span>
          </span>
        ))}
      </div>
    );
  };

  if (!isActive) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="h-5 w-5 text-gray-600 animate-pulse" />
        <h3 className="text-lg font-semibold text-gray-800">
          AI Analysis Process
        </h3>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {steps.map(
          (step, index) =>
            step.isVisible && (
              <div
                key={step.id}
                className={`flex gap-3 p-3 rounded-lg border transition-all duration-300 ${getCategoryColor(
                  step.category
                )}`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getCategoryIcon(step.category)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <SkeletonText
                      text={step.content}
                      isComplete={step.isComplete}
                    />
                  </div>
                </div>
                {step.isComplete && (
                  <div className="flex-shrink-0">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                )}
              </div>
            )
        )}
      </div>

      {currentIndex < thoughtSteps.length && (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full"></div>
          <span>
            Processing step {currentIndex + 1} of {thoughtSteps.length}
          </span>
        </div>
      )}
    </div>
  );
};

export default FakeAIThoughtProcess;
