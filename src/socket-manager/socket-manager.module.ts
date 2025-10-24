import { Module, Global } from '@nestjs/common';
import { SocketManagerService } from './socket-manager.service';

@Global()
@Module({
  providers: [SocketManagerService],
  exports: [SocketManagerService],
})
export class SocketManagerModule {}
