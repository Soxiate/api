import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { ChatModule } from './chat/chat.module';
import { SocketManagerModule } from './socket-manager/socket-manager.module';

@Module({
  imports: [PrismaModule, ChatModule, SocketManagerModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
