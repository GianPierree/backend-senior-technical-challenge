import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from '../../../src/users/users.service';
import { UserEntity } from '../../../src/users/entities/user.entity';

const mockUserEntity = (overrides: Partial<UserEntity> = {}): UserEntity =>
  ({
    id: 'uuid-001',
    username: 'jane.ops',
    passwordHash: 'fakesalt:fakehash',
    role: 'OPERATOR',
    status: 'ACTIVE',
    fullName: 'Jane Ops',
    email: 'jane@ligo.pe',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as UserEntity);

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: repo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    it('should create a new user and return public profile', async () => {
      repo.findOne.mockResolvedValue(null);
      const entity = mockUserEntity();
      repo.create.mockReturnValue(entity);
      repo.save.mockResolvedValue(entity);

      const result = await service.create({ username: 'jane.ops', password: 'Secret123', role: 'OPERATOR' });

      expect(result.username).toBe('jane.ops');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('should throw ConflictException when username is taken', async () => {
      repo.findOne.mockResolvedValue(mockUserEntity());
      await expect(service.create({ username: 'jane.ops', password: 'Secret123' })).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return public user list without password hashes', async () => {
      repo.find.mockResolvedValue([mockUserEntity(), mockUserEntity({ username: 'bob' })]);
      const result = await service.findAll();
      expect(result).toHaveLength(2);
      result.forEach((u) => expect(u).not.toHaveProperty('passwordHash'));
    });
  });

  describe('findByUsername', () => {
    it('should return null when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.findByUsername('ghost')).toBeNull();
    });

    it('should return public user when found', async () => {
      repo.findOne.mockResolvedValue(mockUserEntity());
      const result = await service.findByUsername('jane.ops');
      expect(result?.username).toBe('jane.ops');
    });
  });

  describe('findByUsernameWithPassword', () => {
    it('should include passwordHash for auth use', async () => {
      repo.findOne.mockResolvedValue(mockUserEntity());
      const result = await service.findByUsernameWithPassword('jane.ops');
      expect(result?.passwordHash).toBeDefined();
      expect(result?.user.username).toBe('jane.ops');
    });
  });

  describe('updateStatus', () => {
    it('should update and return user', async () => {
      const entity = mockUserEntity();
      repo.findOne.mockResolvedValue(entity);
      repo.save.mockResolvedValue({ ...entity, role: 'ADMIN' });
      const result = await service.updateStatus('uuid-001', { role: 'ADMIN' });
      expect(result.role).toBe('ADMIN');
    });

    it('should throw NotFoundException for unknown id', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.updateStatus('bad-id', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyPassword', () => {
    it('should return true for correct password', async () => {
      const hash = await (service as any).hashPassword('mySecret123');
      expect(await service.verifyPassword('mySecret123', hash)).toBe(true);
    });

    it('should return false for wrong password', async () => {
      const hash = await (service as any).hashPassword('correctPass');
      expect(await service.verifyPassword('wrongPass', hash)).toBe(false);
    });
  });
});
