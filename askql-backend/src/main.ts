import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable WebSocket support
  app.useWebSocketAdapter(new IoAdapter(app));

  // Enable CORS for frontend integration
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Global prefix for API routes
  app.setGlobalPrefix('api');

  const port = process.env.PORT ?? 4001;
  await app.listen(port);

  console.log(
    `🚀 AskQL Agent System is running on: http://localhost:${port}/api`,
  );
  console.log(`📊 Available endpoints:`);
  console.log(`  POST /api/askql/query - Process natural language queries`);
  console.log(
    `  POST /api/askql/query/stream - Process queries with WebSocket streaming`,
  );
  console.log(`  GET  /api/askql/stream/test - WebSocket test page`);
  console.log(`  GET  /api/askql/stream/status - WebSocket connection status`);
  console.log(`  GET  /api/askql/suggestions - Get query suggestions`);
  console.log(`  GET  /api/askql/health - Health check`);
  console.log(`  GET  /api/askql/schema - View database schema`);
  console.log(`🔗 WebSocket namespace: /askql`);
  console.log(
    `📡 Test the chain of thoughts: http://localhost:${port}/api/askql/stream/test`,
  );
}
bootstrap();
