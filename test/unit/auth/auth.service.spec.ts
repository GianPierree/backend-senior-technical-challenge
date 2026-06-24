import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../../../src/auth/auth.service';
import { UsersService } from '../../../src/users/users.service';
import { IUserPublic } from '../../../src/users/interfaces/user.interface';

const mockUser: IUserPublic = {
  id: 'uuid-001',
  username: 'senior.backend',
  role: 'ADMIN',
  status: 'ACTIVE',
  fullName: 'Admin User',
  email: 'admin@ligo.pe',
  createdAt: new Date(),
};

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let usersService: jest.Mocked<UsersService>;

  beforeEach(async () => {
    const mockJwtService = { sign: jest.fn().mockReturnValue('mock-jwt-token') };
    const mockUsersService = {
      findByUsernameWithPassword: jest.fn(),
      verifyPassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
    usersService = module.get(UsersService);

    process.env.JWT_EXPIRES_IN = '3600';
  });

  it('should return token on valid credentials', async () => {
    usersService.findByUsernameWithPassword.mockResolvedValue({
      passwordHash: 'salt:hash',
      user: mockUser,
    });
    usersService.verifyPassword.mockResolvedValue(true);

    const result = await service.login({ username: 'senior.backend', password: 'Password123' });

    expect(result.token).toBe('mock-jwt-token');
    expect(result.expiresIn).toBe(3600);
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'senior.backend', role: 'ADMIN' }),
      expect.any(Object),
    );
  });

  it('should throw UnauthorizedException when user not found', async () => {
    usersService.findByUsernameWithPassword.mockResolvedValue(null);

    await expect(service.login({ username: 'unknown', password: 'any' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException on wrong password', async () => {
    usersService.findByUsernameWithPassword.mockResolvedValue({
      passwordHash: 'salt:hash',
      user: mockUser,
    });
    usersService.verifyPassword.mockResolvedValue(false);

    await expect(
      service.login({ username: 'senior.backend', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when user is inactive', async () => {
    usersService.findByUsernameWithPassword.mockResolvedValue({
      passwordHash: 'salt:hash',
      user: { ...mockUser, status: 'SUSPENDED' },
    });
    usersService.verifyPassword.mockResolvedValue(true);

    await expect(
      service.login({ username: 'senior.backend', password: 'Password123' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
