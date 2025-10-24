import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable, forwardRef, Inject } from '@nestjs/common';
import { ChatService } from './chat.service';
import { SocketManagerService } from '../socket-manager/socket-manager.service';

interface MessageData {
  roomId: string;
  message: {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
    timestamp: Date;
    roomId: string;
  };
}

interface TypingData {
  roomId: string;
  userId: string;
  userName?: string;
}

@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3004',
    ],
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('ChatGateway');

  // Map to track user ID to socket ID
  private userSockets: Map<string, string> = new Map();

  constructor(
    @Inject(forwardRef(() => ChatService))
    private chatService: ChatService,
    private socketManagerService: SocketManagerService,
  ) {}

  afterInit() {
    // Listen for messages from Socket Manager
    this.socketManagerService.on('chat:message', (payload: any) => {
      this.logger.log(
        'Received chat message from Socket Manager, broadcasting to local clients:',
        payload,
      );
      if (payload && payload.roomId && payload.message) {
        this.emitNewMessage(payload.roomId, payload.message);
      }
    });

    this.logger.log('ChatGateway initialized and listening to Socket Manager');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Remove user from tracking
    for (const [userId, socketId] of this.userSockets.entries()) {
      if (socketId === client.id) {
        this.userSockets.delete(userId);
        this.logger.log(`User ${userId} unregistered`);
        break;
      }
    }
  }

  @SubscribeMessage('register-user')
  handleRegisterUser(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.userSockets.set(userId, client.id);
    this.logger.log(`User ${userId} registered with socket ${client.id}`);
    return { event: 'user-registered', data: userId };
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    void client.join(roomId);
    this.logger.log(`Client ${client.id} joined room: ${roomId}`);
    return { event: 'joined-room', data: roomId };
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @MessageBody() roomId: string,
    @ConnectedSocket() client: Socket,
  ) {
    void client.leave(roomId);
    this.logger.log(`Client ${client.id} left room: ${roomId}`);
    return { event: 'left-room', data: roomId };
  }

  @SubscribeMessage('send-message')
  handleMessage(
    @MessageBody() data: MessageData,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `Message received from ${client.id}: ${data.message.content}`,
    );

    // Broadcast to all clients in the room including sender
    this.server.to(data.roomId).emit('new-message', data.message);

    return { event: 'message-sent', data: data.message };
  }

  @SubscribeMessage('typing-start')
  handleTypingStart(
    @MessageBody() data: TypingData,
    @ConnectedSocket() client: Socket,
  ) {
    client.to(data.roomId).emit('user-typing', data);
  }

  @SubscribeMessage('typing-stop')
  handleTypingStop(
    @MessageBody() data: TypingData,
    @ConnectedSocket() client: Socket,
  ) {
    client.to(data.roomId).emit('user-stopped-typing', data);
  }

  @SubscribeMessage('user-online')
  handleUserOnline(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.broadcast.emit('user-status-changed', { userId, status: 'online' });
  }

  @SubscribeMessage('user-offline')
  handleUserOffline(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    client.broadcast.emit('user-status-changed', { userId, status: 'offline' });
  }

  // Helper method to emit events from outside the gateway
  async emitNewMessage(roomId: string, message: any) {
    this.logger.log(`Emitting message to room: ${roomId}`);

    // Emit to room (for users actively in that room)
    this.server.to(roomId).emit('new-message', message);

    // Also emit directly to all room participants' sockets (even if they're not in the room)
    try {
      const room = await this.chatService.getRoomWithUsers(roomId);
      if (room && room.users) {
        room.users.forEach((roomUser: any) => {
          const socketId = this.userSockets.get(roomUser.userId);
          if (socketId) {
            this.server.to(socketId).emit('new-message', message);
            this.logger.log(
              `Sent message to user ${roomUser.userId} via socket ${socketId}`,
            );
          }
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to emit to room participants: ${error.message}`,
      );
    }
  }
}
