# Socket Manager Client

This module provides a client connection to a Socket Manager server running on port 3000.

## Features

- Automatic connection on application startup
- Automatic reconnection with exponential backoff
- App registration with token and status
- Event emission and listening capabilities
- Graceful shutdown handling

## Configuration

Set these environment variables in your `.env` file:

```env
SOCKET_MANAGER_URL=http://localhost:3000
APP_TOKEN=your-app-token-here
APP_NAME=Soxiate API
```

If not set, defaults will be used:

- `SOCKET_MANAGER_URL`: `http://localhost:3000`
- `APP_TOKEN`: `soxiate-api-token-{timestamp}`
- `APP_NAME`: `Soxiate API`

## Usage

The service automatically connects when the application starts and emits an `app:register` event:

```typescript
socket.emit('app:register', {
  token: APP_TOKEN,
  name: APP_NAME,
  status: 'online',
  timestamp: new Date().toISOString(),
});
```

### Using the Service in Other Modules

Inject the `SocketManagerService` into your services:

```typescript
import { SocketManagerService } from '../socket-manager/socket-manager.service';

@Injectable()
export class YourService {
  constructor(private readonly socketManager: SocketManagerService) {}

  someMethod() {
    // Emit an event to Socket Manager
    this.socketManager.emitToManager('custom:event', { data: 'value' });

    // Listen for events from Socket Manager
    this.socketManager.onManagerEvent('custom:response', (data) => {
      console.log('Received:', data);
    });

    // Check connection status
    if (this.socketManager.isConnected()) {
      console.log('Connected with ID:', this.socketManager.getSocketId());
    }
  }
}
```

## Events

### Emitted Events

- `app:register` - Sent on connect and disconnect with app status

### Received Events

- `app:registered` - Confirmation of registration
- `app:message` - Messages from Socket Manager
- Custom events can be added using `onManagerEvent()`

## Logging

The service logs all connection events, errors, and reconnection attempts using NestJS Logger.
