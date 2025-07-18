import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export interface WorkflowStep {
  step: string;
  status: 'starting' | 'processing' | 'completed' | 'error';
  message: string;
  timestamp: string;
  data?: any;
  metadata?: {
    executionTime?: number;
    confidence?: number;
    rowCount?: number;
  };
}

export interface WorkflowProgress {
  sessionId: string;
  question: string;
  steps: WorkflowStep[];
  currentStep: string;
  overallStatus: 'running' | 'completed' | 'error';
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/askql',
})
export class AskQLGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('AskQLGateway');
  private sessions = new Map<string, Socket>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.sessions.set(client.id, client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.sessions.delete(client.id);
  }

  @SubscribeMessage('start-query')
  handleStartQuery(
    @MessageBody() data: { question: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `Starting query for session ${client.id}: ${data.question}`,
    );

    // Initialize workflow progress
    const progress: WorkflowProgress = {
      sessionId: client.id,
      question: data.question,
      steps: [],
      currentStep: 'initializing',
      overallStatus: 'running',
    };

    this.emitWorkflowProgress(client.id, progress);
    return { sessionId: client.id, status: 'started' };
  }

  // Method to emit workflow step updates
  emitWorkflowStep(sessionId: string, step: WorkflowStep) {
    const client = this.sessions.get(sessionId);
    if (client) {
      client.emit('workflow-step', step);
      this.logger.debug(`Emitted step: ${step.step} - ${step.status}`);
    }
  }

  // Method to emit complete workflow progress
  emitWorkflowProgress(sessionId: string, progress: WorkflowProgress) {
    const client = this.sessions.get(sessionId);
    if (client) {
      client.emit('workflow-progress', progress);
    }
  }

  // Method to emit final result
  emitWorkflowComplete(sessionId: string, result: any) {
    const client = this.sessions.get(sessionId);
    if (client) {
      client.emit('workflow-complete', result);
      this.logger.log(`Workflow completed for session: ${sessionId}`);
    }
  }

  // Method to emit error
  emitWorkflowError(sessionId: string, error: string) {
    const client = this.sessions.get(sessionId);
    if (client) {
      client.emit('workflow-error', {
        error,
        timestamp: new Date().toISOString(),
      });
      this.logger.error(`Workflow error for session ${sessionId}: ${error}`);
    }
  }

  // Helper method to broadcast to all connected clients (optional)
  broadcastMessage(event: string, data: any) {
    this.server.emit(event, data);
  }

  // Get active sessions count
  getActiveSessionsCount(): number {
    return this.sessions.size;
  }
}
