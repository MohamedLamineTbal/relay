import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedWorkspace } from './authenticated-workspace';

const SESSION_DURATION_SECONDS = 3600;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(email: string, password: string) {
    const passwordHash = await bcrypt.hash(password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          password: passwordHash,
          membership: {
            create: {
              role: 'OWNER',
              workspace: {
                create: { name: email },
              },
            },
          },
        },
        select: {
          id: true,
          email: true,
          createdAt: true,
          membership: {
            select: {
              role: true,
              workspace: {
                select: {
                  id: true,
                  name: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          createdAt: user.createdAt,
        },
        workspace: user.membership!.workspace,
        role: user.membership!.role,
      };
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }

      throw error;
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(accessToken).digest('hex');

    await this.prisma.session.create({
      data: {
        tokenHash,
        expiresAt: new Date(Date.now() + SESSION_DURATION_SECONDS * 1000),
        userId: user.id,
      },
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: SESSION_DURATION_SECONDS,
    };
  }

  async authenticate(accessToken: string): Promise<AuthenticatedWorkspace> {
    const tokenHash = createHash('sha256').update(accessToken).digest('hex');
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: {
        expiresAt: true,
        user: {
          select: {
            id: true,
            email: true,
            createdAt: true,
            membership: {
              select: {
                role: true,
                workspace: {
                  select: {
                    id: true,
                    name: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      !session.user.membership
    ) {
      throw new UnauthorizedException();
    }

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        createdAt: session.user.createdAt,
      },
      workspace: session.user.membership.workspace,
      role: session.user.membership.role,
    };
  }
}
