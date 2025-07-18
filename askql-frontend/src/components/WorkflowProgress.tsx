import React from "react";
import { WorkflowStep } from "@/lib/askql-api";

const WORKFLOW_ORDER = [
  "schema_loading",
  "nl_to_sql",
  "sql_validation",
  "sql_execution",
  "result_interpretation",
  "final_result",
] as const;

interface Props {
  steps: WorkflowStep[];
}

export default function WorkflowProgress({ steps }: Props) {
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const percent = (completedCount / WORKFLOW_ORDER.length) * 100;

  return (
    <div className="h-2 w-full bg-gray-200 rounded">
      <div
        style={{ width: `${percent}%` }}
        className="h-full bg-blue-500 rounded transition-all duration-500"
      />
    </div>
  );
}
