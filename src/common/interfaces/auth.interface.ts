import { UserRole } from '../types/user.types';

export interface JwtPayload {
  sub: string;
  username: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest {
  user: JwtPayload;
}
