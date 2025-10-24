import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RoomType } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  // User operations
  async createUser(data: {
    name: string;
    email: string;
    password: string;
    authId: string;
    avatar?: string;
  }) {
    return this.prisma.user.create({
      data,
    });
  }

  async getUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async getUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        authId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // Room operations
  async createRoom(data: { name: string; type?: RoomType; userIds: string[] }) {
    const room = await this.prisma.room.create({
      data: {
        name: data.name,
        type: data.type || 'DIRECT',
        users: {
          create: data.userIds.map((userId) => ({
            userId,
          })),
        },
      },
      include: {
        users: {
          include: {
            user: true,
          },
        },
      },
    });

    return room;
  }

  async getOrCreateDirectRoom(userId1: string, userId2: string) {
    // Check if a direct room already exists between these users
    const existingRoom = await this.prisma.room.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          {
            users: {
              some: {
                userId: userId1,
              },
            },
          },
          {
            users: {
              some: {
                userId: userId2,
              },
            },
          },
        ],
      },
      include: {
        users: {
          include: {
            user: true,
          },
        },
      },
    });

    if (existingRoom && existingRoom.users.length === 2) {
      return existingRoom;
    }

    // Create a new direct room with sender (userId1) joined, receiver (userId2) not joined yet
    const room = await this.prisma.room.create({
      data: {
        name: 'Direct Chat',
        type: 'DIRECT',
        users: {
          create: [
            { userId: userId1, joinedAt: new Date() }, // Sender has joinedAt
            { userId: userId2 }, // Receiver joinedAt is null (undefined)
          ],
        },
      },
      include: {
        users: {
          include: {
            user: true,
          },
        },
      },
    });

    return room;
  }

  // Find existing room without creating one
  async findDirectRoom(userId1: string, userId2: string) {
    return this.prisma.room.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          {
            users: {
              some: {
                userId: userId1,
              },
            },
          },
          {
            users: {
              some: {
                userId: userId2,
              },
            },
          },
        ],
      },
      include: {
        users: {
          include: {
            user: true,
          },
        },
      },
    });
  }

  // Update user's joinedAt when they respond to a message
  async markUserAsJoined(roomId: string, userId: string) {
    const roomUser = await this.prisma.roomUser.findFirst({
      where: {
        roomId,
        userId,
      },
    });

    if (roomUser && !roomUser.joinedAt) {
      await this.prisma.roomUser.update({
        where: {
          id: roomUser.id,
        },
        data: {
          joinedAt: new Date(),
        },
      });
    }
  }

  async getRoomsByUserId(userId: string) {
    return this.prisma.room.findMany({
      where: {
        users: {
          some: {
            userId,
          },
        },
      },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                authId: true,
                createdAt: true,
                updatedAt: true,
                password: false,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });
  }

  async getRoomWithUsers(roomId: string) {
    return this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        users: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  // Room validation and default room creation
  async ensureRoomExists(roomId: string): Promise<string> {
    // If roomId is 'default-room', create or get the default room
    if (roomId === 'default-room') {
      return this.getOrCreateDefaultRoom();
    }

    // Check if the room exists
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new Error(`Room with ID ${roomId} does not exist`);
    }

    return roomId;
  }

  async getOrCreateDefaultRoom(): Promise<string> {
    // Try to find an existing default room
    let defaultRoom = await this.prisma.room.findFirst({
      where: {
        name: 'General Chat',
        type: 'GROUP',
      },
    });

    if (!defaultRoom) {
      // Create a default room if it doesn't exist
      defaultRoom = await this.prisma.room.create({
        data: {
          name: 'General Chat',
          type: 'GROUP',
        },
      });
    }

    return defaultRoom.id;
  }

  // Message operations
  async createMessage(data: {
    content: string;
    senderId: string;
    roomId: string;
  }) {
    // Ensure the room exists before creating the message
    const validRoomId = await this.ensureRoomExists(data.roomId);

    return this.prisma.message.create({
      data: {
        ...data,
        roomId: validRoomId,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });
  }

  async getMessagesByRoomId(roomId: string) {
    console.log('Getting messages for room ID:', roomId);
    const messages = await this.prisma.message.findMany({
      where: { roomId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    console.log('Found', messages.length, 'messages for room:', roomId);
    return messages;
  }

  async getMessagesByUserId(userId: string) {
    return this.prisma.message.findMany({
      where: {
        room: {
          users: {
            some: {
              userId,
            },
          },
        },
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }
}
