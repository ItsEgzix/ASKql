import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AskQLController } from './askql.controller';
import { AskQLService } from './askql.service';
import { AskQLWorkflow } from '../workflow/askql-workflow';

import { DatabaseService } from '../database/database.service';
import { AIProviderService } from '../ai/ai-provider.service';
import { NLToSQLAgent } from '../agents/nl-to-sql.agent';
import { SQLValidationAgent } from '../agents/sql-validation.agent';
import { SQLExecutionAgent } from '../agents/sql-execution.agent';
import { ResultInterpretationAgent } from '../agents/result-interpretation.agent';
import { VisualizationEditAgent } from '../agents/visualization-edit.agent';
import { DrillDownAgent } from '../agents/drill-down.agent';
import { AskQLGateway } from '../websocket/askql.gateway';
import { WorkflowStreamingService } from '../websocket/workflow-streaming.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AskQLController],
  providers: [
    DatabaseService,
    AIProviderService,
    NLToSQLAgent,
    SQLValidationAgent,
    SQLExecutionAgent,
    ResultInterpretationAgent,
    VisualizationEditAgent,
    DrillDownAgent,
    AskQLWorkflow,
    AskQLService,
    AskQLGateway,
    WorkflowStreamingService,
  ],
  exports: [AskQLService, AskQLGateway, WorkflowStreamingService],
})
export class AskQLModule {}
