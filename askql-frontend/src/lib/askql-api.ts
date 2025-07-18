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
}

export const askQLAPI = new AskQLAPI();
