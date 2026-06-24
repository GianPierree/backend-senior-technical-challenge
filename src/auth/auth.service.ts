import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { JwtPayload } from '../common/interfaces/auth.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponseDto> {
    const found = await this.usersService.findByUsernameWithPassword(dto.username);

    if (!found) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    }

    const { passwordHash, user } = found;

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        error: 'USER_INACTIVE',
        message: 'User account is not active',
      });
    }

    const isValid = await this.usersService.verifyPassword(dto.password, passwordHash);
    if (!isValid) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    }

    const expiresIn = parseInt(process.env.JWT_EXPIRES_IN ?? '3600', 10);
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    return {
      token: this.jwtService.sign(payload, { expiresIn }),
      expiresIn,
    };
  }
}
