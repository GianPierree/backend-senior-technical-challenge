import { UserRole, UserStatus } from '../../common/types/user.types';

export interface ICreateUser {
  username: string;
  password: string;
  role?: UserRole;
  fullName?: string;
  email?: string;
}

export interface IUpdateUser {
  fullName?: string;
  email?: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface IUserPublic {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  fullName: string | null;
  email: string | null;
  createdAt: Date;
}

export interface IUserService {
  findByUsername(username: string): Promise<IUserPublic | null>;
  findByUsernameWithPassword(username: string): Promise<{ passwordHash: string; user: IUserPublic } | null>;
  create(data: ICreateUser): Promise<IUserPublic>;
  findAll(): Promise<IUserPublic[]>;
  findById(id: string): Promise<IUserPublic | null>;
  updateStatus(id: string, data: IUpdateUser): Promise<IUserPublic>;
}
