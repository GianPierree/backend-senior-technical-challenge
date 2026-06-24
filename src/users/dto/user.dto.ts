import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsIn,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { UserRole, UserStatus } from '../../common/types/user.types';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_MSG =
  'Password must be at least 8 characters and contain uppercase, lowercase, and a number';

export class CreateUserDto {
  @ApiProperty({ example: 'jane.ops', description: 'Unique username' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  username: string;

  @ApiProperty({ example: 'Secret123', description: PASSWORD_MSG })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MSG })
  password: string;

  @ApiPropertyOptional({ enum: ['ADMIN', 'OPERATOR', 'VIEWER'], default: 'OPERATOR' })
  @IsOptional()
  @IsIn(['ADMIN', 'OPERATOR', 'VIEWER'])
  role?: UserRole;

  @ApiPropertyOptional({ example: 'Jane Ops' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ example: 'jane@ligo.pe' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jane Ops' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ example: 'jane@ligo.pe' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: ['ADMIN', 'OPERATOR', 'VIEWER'] })
  @IsOptional()
  @IsIn(['ADMIN', 'OPERATOR', 'VIEWER'])
  role?: UserRole;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] })
  @IsOptional()
  @IsIn(['ACTIVE', 'INACTIVE', 'SUSPENDED'])
  status?: UserStatus;
}

export class UserResponseDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  id: string;

  @ApiProperty({ example: 'jane.ops' })
  username: string;

  @ApiProperty({ enum: ['ADMIN', 'OPERATOR', 'VIEWER'] })
  role: UserRole;

  @ApiProperty({ enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] })
  status: UserStatus;

  @ApiPropertyOptional({ example: 'Jane Ops' })
  fullName: string | null;

  @ApiPropertyOptional({ example: 'jane@ligo.pe' })
  email: string | null;

  @ApiProperty()
  createdAt: Date;
}
