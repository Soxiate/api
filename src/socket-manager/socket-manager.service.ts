import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'node:events';

@Injectable()
export class SocketManagerService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private socket: Socket;
  private readonly logger = new Logger(SocketManagerService.name);

  // Configuration
  private readonly SOCKET_MANAGER_URL: string;
  private readonly SOCKET_MANAGER_TOKEN: string;
  private readonly APP_NAME: string;

  constructor() {
    super(); // Call EventEmitter constructor

    // Validate required environment variables
    if (!process.env.SOCKET_MANAGER_URL) {
      throw new Error(
        'SOCKET_MANAGER_URL is not defined in environment variables',
      );
    }
    if (!process.env.SOCKET_MANAGER_TOKEN) {
      throw new Error(
        'SOCKET_MANAGER_TOKEN is not defined in environment variables',
      );
    }
    if (!process.env.APP_NAME) {
      throw new Error('APP_NAME is not defined in environment variables');
    }

    this.SOCKET_MANAGER_URL = process.env.SOCKET_MANAGER_URL!;
    this.SOCKET_MANAGER_TOKEN = process.env.SOCKET_MANAGER_TOKEN!;
    this.APP_NAME = process.env.APP_NAME!;
  }

  async onModuleInit() {
    this.connectToSocketManager();
  }

  private connectToSocketManager() {
    this.logger.log(
      `Connecting to Socket Manager at ${this.SOCKET_MANAGER_URL}...`,
    );

    this.socket = io(this.SOCKET_MANAGER_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      this.logger.log(`Connected to Socket Manager: ${this.socket.id}`);

      // Identify your app with its token
      this.socket.emit('app:register', {
        token: this.SOCKET_MANAGER_TOKEN,
        name: this.APP_NAME,
        status: 'online',
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Registered with Socket Manager as "${this.APP_NAME}"`);
    });

    this.socket.on('disconnect', (reason) => {
      this.logger.warn(`Disconnected from Socket Manager: ${reason}`);
    });

    this.socket.on('connect_error', (error) => {
      this.logger.error(`Connection error to Socket Manager: ${error.message}`);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      this.logger.log(
        `Reconnected to Socket Manager after ${attemptNumber} attempts`,
      );
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      this.logger.log(
        `Attempting to reconnect to Socket Manager (attempt ${attemptNumber})...`,
      );
    });

    this.socket.on('reconnect_error', (error) => {
      this.logger.error(`Reconnection error: ${error.message}`);
    });

    this.socket.on('reconnect_failed', () => {
      this.logger.error('Failed to reconnect to Socket Manager');
    });

    // Listen for custom events from Socket Manager
    this.socket.on('app:registered', (data) => {
      this.logger.log(`Registration confirmed:`, data);
    });

    this.socket.on('app:message', (data) => {
      this.logger.log(`Received message from Socket Manager:`, data);
    });

    // Listen for app:event messages from Socket Manager
    this.socket.on(
      'app:event',
      (data: { eventName: string; payload: any; token?: string }) => {
        this.logger.log(`Received app:event from Socket Manager:`, {
          eventName: data.eventName,
          payload: data.payload,
        });

        // Handle different event types
        this.handleIncomingEvent(data.eventName, data.payload);
      },
    );
  }

  // Handle incoming events from Socket Manager
  private handleIncomingEvent(eventName: string, payload: any) {
    switch (eventName) {
      case 'chat:message':
        this.logger.log('Chat message received from Socket Manager:', payload);
        // Emit event that ChatGateway can listen to
        this.emit('chat:message', payload);
        break;

      case 'user:typing:start':
        this.logger.log('User typing event received:', payload);
        this.emit('user:typing:start', payload);
        break;

      case 'user:typing:stop':
        this.logger.log('User stopped typing event received:', payload);
        this.emit('user:typing:stop', payload);
        break;

      case 'user:status:online':
      case 'user:status:offline':
        this.logger.log('User status event received:', payload);
        this.emit('user:status', payload);
        break;

      default:
        this.logger.log(`Unknown event type: ${eventName}`, payload);
    }
  }

  // Method to emit events to Socket Manager using standardized format
  emitToManager(eventName: string, payload: any) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('app:event', {
        eventName,
        token: this.SOCKET_MANAGER_TOKEN,
        payload,
      });
      this.logger.log(
        `Emitted event "${eventName}" to Socket Manager via app:event`,
      );
    } else {
      this.logger.warn(
        `Cannot emit event "${eventName}": Not connected to Socket Manager`,
      );
    }
  }

  // Method to listen for custom events from Socket Manager
  onManagerEvent(event: string, callback: (...args: any[]) => void) {
    if (this.socket) {
      this.socket.on(event, callback);
      this.logger.log(`Listening for event "${event}" from Socket Manager`);
    }
  }

  // Check if connected
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Get socket ID
  getSocketId(): string | undefined {
    return this.socket?.id;
  }

  async onModuleDestroy() {
    if (this.socket) {
      this.logger.log('Disconnecting from Socket Manager...');

      // Notify Socket Manager that we're going offline
      this.socket.emit('app:register', {
        token: this.SOCKET_MANAGER_TOKEN,
        name: this.APP_NAME,
        status: 'offline',
        timestamp: new Date().toISOString(),
      });

      this.socket.disconnect();
      this.logger.log('Disconnected from Socket Manager');
    }
  }
}
