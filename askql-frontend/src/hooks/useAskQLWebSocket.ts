import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { WorkflowStep } from "@/lib/askql-api";

export interface WebSocketStatus {
  isConnected: boolean;
  sessionId: string | null;
  error: string | null;
}

export interface AskQLWebSocketHook {
  status: WebSocketStatus;
  steps: WorkflowStep[];
  result: any | null;
  connect: () => void;
  disconnect: () => void;
  startQuery: (question: string) => void;
  clearSteps: () => void;
}

export const useAskQLWebSocket = (): AskQLWebSocketHook => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<WebSocketStatus>({
    isConnected: false,
    sessionId: null,
    error: null,
  });
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [result, setResult] = useState<any>(null);
  const [isClient, setIsClient] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:4001";

  useEffect(() => {
    setIsClient(true);
  }, []);

  const connect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const newSocket = io(`${WS_URL}/askql`);
    socketRef.current = newSocket;
    setSocket(newSocket);

    newSocket.on("connect", () => {
      setStatus({
        isConnected: true,
        sessionId: newSocket.id || null,
        error: null,
      });
    });

    newSocket.on("disconnect", () => {
      setStatus({
        isConnected: false,
        sessionId: null,
        error: null,
      });
    });

    newSocket.on("connect_error", (error) => {
      setStatus({
        isConnected: false,
        sessionId: null,
        error: error.message,
      });
    });

    newSocket.on("workflow-step", (step: WorkflowStep) => {
      setSteps((prevSteps) => [...prevSteps, step]);
    });

    newSocket.on("workflow-complete", (completedPayload: any) => {
      const payload = completedPayload.result ?? completedPayload;
      setResult(payload);
      setSteps((prevSteps) => [
        ...prevSteps,
        {
          step: "final_result",
          status: "completed",
          message: "🎉 Workflow completed successfully!",
          timestamp: new Date().toISOString(),
          data: payload,
        },
      ]);
    });

    newSocket.on("workflow-error", (error: any) => {
      setSteps((prevSteps) => [
        ...prevSteps,
        {
          step: "error",
          status: "error",
          message: `Workflow failed: ${error.error}`,
          timestamp: error.timestamp || new Date().toISOString(),
        },
      ]);
    });
  }, [WS_URL]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setStatus({
        isConnected: false,
        sessionId: null,
        error: null,
      });
    }
  }, []);

  const startQuery = useCallback(
    (question: string) => {
      if (!socketRef.current || !status.isConnected) {
        console.error("WebSocket not connected");
        return;
      }

      // Clear previous results
      setSteps([]);
      setResult(null);

      // Add initial step
      const initialStep: WorkflowStep = {
        step: "user_input",
        status: "starting",
        message: `rocessing question: "${question}"`,
        timestamp: new Date().toISOString(),
      };
      setSteps([initialStep]);

      // Emit query to WebSocket
      socketRef.current.emit("start-query", { question });
    },
    [status.isConnected]
  );

  const clearSteps = useCallback(() => {
    setSteps([]);
    setResult(null);
  }, []);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return {
    status,
    steps,
    result,
    connect,
    disconnect,
    startQuery,
    clearSteps,
  };
};
