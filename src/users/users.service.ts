import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { UserEntity } from './entities/user.entity';
import { ICreateUser, IUpdateUser, IUserPublic, IUserService } from './interfaces/user.interface';

@Injectable()
export class UsersService implements IUserService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  private async hashPassword(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await new Promise<string>((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex'));
      });
    });
    return `${salt}:${hash}`;
  }

  async verifyPassword(plaintext: string, storedHash: string): Promise<boolean> {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false; 
    const derived = await new Promise<string>((resolve, reject) => {
      crypto.scrypt(plaintext, salt, 64, (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey.toString('hex'));
      });
    });
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
  }

  async create(data: ICreateUser): Promise<IUserPublic> {
    const existing = await this.userRepo.findOne({ where: { username: data.username } });
    if (existing) {
      throw new ConflictException({
        error: 'USERNAME_TAKEN',
        message: `Username '${data.username}' is already in use`,
      });
    }

    const passwordHash = await this.hashPassword(data.password);
    const user = this.userRepo.create({
      username: data.username,
      passwordHash,
      role: data.role ?? 'OPERATOR',
      status: 'ACTIVE',
      fullName: data.fullName ?? null,
      email: data.email ?? null,
    });

    const saved = await this.userRepo.save(user);
    this.logger.log(`User created: ${saved.username} [${saved.role}]`);
    return this.toPublic(saved);
  }

  async findAll(): Promise<IUserPublic[]> {
    const users = await this.userRepo.find({ order: { createdAt: 'DESC' } });
    return users.map(this.toPublic);
  }

  async findById(id: string): Promise<IUserPublic | null> {
    const user = await this.userRepo.findOne({ where: { id } });
    return user ? this.toPublic(user) : null;
  }

  async findByUsername(username: string): Promise<IUserPublic | null> {
    const user = await this.userRepo.findOne({ where: { username } });
    return user ? this.toPublic(user) : null;
  }

  async findByUsernameWithPassword(
    username: string,
  ): Promise<{ passwordHash: string; user: IUserPublic } | null> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) return null;
    return { passwordHash: user.passwordHash, user: this.toPublic(user) };
  }

  async updateStatus(id: string, data: IUpdateUser): Promise<IUserPublic> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({ error: 'USER_NOT_FOUND', message: `User '${id}' not found` });
    }

    if (data.fullName !== undefined) user.fullName = data.fullName;
    if (data.email !== undefined) user.email = data.email;
    if (data.role !== undefined) user.role = data.role;
    if (data.status !== undefined) user.status = data.status;

    const updated = await this.userRepo.save(user);
    return this.toPublic(updated);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({ error: 'USER_NOT_FOUND', message: `User '${id}' not found` });
    }
    user.passwordHash = await this.hashPassword(newPassword);
    await this.userRepo.save(user);
  }

  private toPublic(user: UserEntity): IUserPublic {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      fullName: user.fullName,
      email: user.email,
      createdAt: user.createdAt,
    };
  }
}
