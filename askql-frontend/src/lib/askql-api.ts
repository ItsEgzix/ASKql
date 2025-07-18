import axios from "axios";
// (removed backend-only schema utilities; not needed in frontend)

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4001";

export interface AskQLQuery {
  question: string;
  includeDebugInfo?: boolean;
}

export interface AskQLStreamQuery extends AskQLQuery {
  sessionId: string;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
  }[];
}

export interface Visualization {
  id: string; // Unique identifier for drill-down functionality
  type: "chart" | "table";
  title: string;
  config: {
    chartType?: "bar" | "line" | "pie";
    // For tables, columns might be relevant
    columns?: string[];
    // Chart.js compatible data structure
    labels?: string[];
    datasets?: {
      label: string;
      data: number[];
      backgroundColor?: string | string[];
      borderColor?: string | string[];
      borderWidth?: number;
    }[];
  };
  data?: any[]; // Raw data for tables
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

export interface AskQLResponse {
  success: boolean;
  answer: string; // This is the AI's summary
  visualizations: Visualization[];
  metadata: {
    sqlQuery: string;
    // other metadata
  };
  // Optional advanced analysis section (not always provided)
  analysis?: any;
}

export interface WorkflowStep {
  step: string;
  status: "starting" | "processing" | "completed" | "error";
  message: string;
  timestamp: string;
  data?: any;
  metadata?: any;
}

export interface HealthCheck {
  status: string;
  details: any;
}

export interface SchemaInfo {
  schema: any;
}

export interface QuerySuggestions {
  suggestions: string[];
}

export interface VisualizationDrillDownRequest {
  visualizationId: string;
  operation: "detail" | "filter" | "group" | "trend";
  parameters?: {
    filters?: Record<string, any>;
    groupBy?: string[];
    timeRange?: { start: string; end: string };
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    selectedValue?: any; // Value clicked in the visualization
    selectedLabel?: string; // Label clicked in the visualization
  };
  // Enhanced context for drill-down processing
  visualization?: {
    id: string;
    type: "chart" | "table";
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
      supportedOperations: Array<"detail" | "filter" | "group" | "trend">;
    };
  };
  availableData?: any[]; // Current data for context
}

export interface VisualizationDrillDownResponse {
  success: boolean;
  visualization: Visualization;
  metadata: {
    executionTime: number;
    sqlQuery: string;
    rowCount: number;
  };
  error?: string;
}

class AskQLAPI {
  private api = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    headers: {
      "Content-Type": "application/json",
    },
  });

  async processQuery(query: AskQLQuery): Promise<AskQLResponse> {
    const response = await this.api.post("/askql/query", query);
    return response.data;
  }

  async processStreamQuery(query: AskQLStreamQuery): Promise<AskQLResponse> {
    const response = await this.api.post("/askql/query/stream", query);
    return response.data;
  }

  async getQuerySuggestions(): Promise<QuerySuggestions> {
    const response = await this.api.get("/askql/suggestions");
    return response.data;
  }

  async healthCheck(): Promise<HealthCheck> {
    const response = await this.api.get("/askql/health");
    return response.data;
  }

  async getSchema(): Promise<SchemaInfo> {
    const response = await this.api.get("/askql/schema");
    return response.data;
  }

  async getStreamStatus(): Promise<{ activeConnections: number }> {
    const response = await this.api.get("/askql/stream/status");
    return response.data;
  }

  async processDrillDown(
    request: VisualizationDrillDownRequest
  ): Promise<VisualizationDrillDownResponse> {
    const response = await this.api.post(
      "/askql/visualization/drill-down",
      request
    );
    return response.data;
  }

  async editVisualization(request: {
    userRequest: string;
    currentVisualization: any;
    availableData: any[];
    originalSqlQuery: string;
    originalQuestion: string;
  }): Promise<any> {
    const response = await this.api.post("/askql/edit-visualization", request);
    return response.data;
  }

  async getVisualizationSuggestions(request: {
    visualization: any;
    availableData: any[];
  }): Promise<{ success: boolean; suggestions: string[] }> {
    const response = await this.api.post(
      "/askql/visualization-suggestions",
      request
    );
    return response.data;
  }
}

export const askQLAPI = new AskQLAPI();
