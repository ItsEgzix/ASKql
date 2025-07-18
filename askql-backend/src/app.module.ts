import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AskQLModule } from './askql/askql.module';

@Module({
  imports: [AskQLModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
