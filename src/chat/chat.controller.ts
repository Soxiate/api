import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { SocketManagerService } from '../socket-manager/socket-manager.service';
import * as bcrypt from 'bcrypt';

@Controller('api')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly socketManager: SocketManagerService,
  ) {}

  // Auth endpoints
  @Post('auth/login')
  async login(@Body() body: { email: string; password: string }) {
    const { email, password } = body;

    if (!email || !password) {
      throw new HttpException(
        'Email and password are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.chatService.getUserByEmail(email);

    if (!user) {
      throw new HttpException(
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new HttpException(
        'Invalid email or password',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Don't send password back
    const { password: _, ...userData } = user;

    return {
      user: {
        ...userData,
        status: 'online',
      },
    };
  }

  // User endpoints
  @Get('users')
  async getUsers() {
    const users = await this.chatService.getAllUsers();
    return {
      users: users.map((user) => ({
        ...user,
        status: 'online', // TODO: Implement real status tracking
      })),
    };
  }

  @Post('users')
  async createUser(
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      authId: string;
      avatar?: string;
    },
  ) {
    const { name, email, password, authId, avatar } = body;

    if (!name || !email || !password || !authId) {
      throw new HttpException(
        'Name, email, password, and authId are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check if user already exists
    const existingUser = await this.chatService.getUserByEmail(email);
    if (existingUser) {
      throw new HttpException('User already exists', HttpStatus.CONFLICT);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.chatService.createUser({
      name,
      email,
      password: hashedPassword,
      authId,
      avatar,
    });

    const { password: _, ...userData } = user;
    return {
      user: {
        ...userData,
        status: 'online',
      },
    };
  }

  // Room endpoints
  @Get('chat/rooms')
  async getRooms(@Query('userId') userId: string) {
    if (!userId) {
      throw new HttpException('User ID is required', HttpStatus.BAD_REQUEST);
    }

    const rooms = await this.chatService.getRoomsByUserId(userId);

    return {
      rooms: rooms.map((room) => ({
        id: room.id,
        name: room.name,
        type: room.type,
        participants: room.users.map((ru) => ({
          ...ru.user,
          status: 'online', // TODO: Implement real status tracking
        })),
        lastMessage: room.messages[0] || null,
        unreadCount: 0, // TODO: Implement unread count
      })),
    };
  }

  @Post('chat/rooms')
  async createRoom(
    @Body()
    body: {
      name: string;
      userIds: string[];
      type?: 'DIRECT' | 'GROUP';
    },
  ) {
    const { name, userIds, type } = body;

    if (!name || !userIds || userIds.length === 0) {
      throw new HttpException(
        'Name and userIds are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const room = await this.chatService.createRoom({
      name,
      userIds,
      type: type || 'DIRECT',
    });

    return {
      room: {
        id: room.id,
        name: room.name,
        type: room.type,
      },
    };
  }

  @Post('chat/rooms/direct')
  async getOrCreateDirectRoom(
    @Body() body: { userId1: string; userId2: string },
  ) {
    const { userId1, userId2 } = body;

    if (!userId1 || !userId2) {
      throw new HttpException(
        'Both user IDs are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const room = await this.chatService.getOrCreateDirectRoom(userId1, userId2);

    return {
      room: {
        id: room.id,
        name: room.name,
        type: room.type,
        users:
          room.users?.map((u) => ({ id: u.user.id, name: u.user.name })) || [],
      },
    };
  }

  @Get('chat/rooms/direct/find')
  async findDirectRoom(
    @Query('userId1') userId1: string,
    @Query('userId2') userId2: string,
  ) {
    if (!userId1 || !userId2) {
      throw new HttpException(
        'Both user IDs are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const room = await this.chatService.findDirectRoom(userId1, userId2);

    if (!room) {
      throw new HttpException('Room not found', HttpStatus.NOT_FOUND);
    }

    return {
      room: {
        id: room.id,
        name: room.name,
        type: room.type,
        users:
          room.users?.map((u) => ({ id: u.user.id, name: u.user.name })) || [],
      },
    };
  }

  // Message endpoints
  @Get('chat/messages')
  async getMessages(
    @Query('userId') userId?: string,
    @Query('roomId') roomId?: string,
  ) {
    if (!roomId && !userId) {
      throw new HttpException(
        'Either User ID or Room ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    let messages;
    if (roomId) {
      messages = await this.chatService.getMessagesByRoomId(roomId);
    } else if (userId) {
      messages = await this.chatService.getMessagesByUserId(userId);
    }

    return {
      messages: messages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        senderId: msg.senderId,
        senderName: msg.sender?.name || 'Unknown User',
        timestamp: msg.createdAt,
        roomId: msg.roomId,
        sender: msg.sender,
      })),
    };
  }

  @Post('chat/messages')
  async sendMessage(
    @Body()
    body: {
      content: string;
      senderId: string;
      roomId: string;
    },
  ) {
    const { content, senderId, roomId } = body;

    if (!content || !senderId) {
      throw new HttpException(
        'Content and senderId are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const message = await this.chatService.createMessage({
        content,
        senderId,
        roomId: roomId || 'default-room',
      });

      // Mark user as joined when they send a message
      await this.chatService.markUserAsJoined(message.roomId, senderId);

      const messageData = {
        id: message.id,
        content: message.content,
        senderId: message.senderId,
        senderName: message.sender?.name || 'Unknown User',
        timestamp: message.createdAt,
        roomId: message.roomId,
      };

      // Emit message via Socket.IO to local clients
      this.chatGateway.emitNewMessage(message.roomId, messageData);

      // Emit message to Socket Manager for external distribution
      this.socketManager.emitToManager('chat:message', {
        roomId: message.roomId,
        message: messageData,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: messageData,
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create message',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
