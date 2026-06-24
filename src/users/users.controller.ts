import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './dto/user.dto';
import { AuthenticatedRequest } from '../common/interfaces/auth.interface';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new user (ADMIN only)' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden — ADMIN role required' })
  @ApiResponse({ status: 409, description: 'Username already taken' })
  async create(
    @Body() dto: CreateUserDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Only ADMIN users can create new users',
      });
    }
    return this.usersService.create(dto) as unknown as Promise<UserResponseDto>;
  }

  @Get()
  @ApiOperation({ summary: 'List all users (ADMIN only)' })
  @ApiResponse({ status: 200, type: [UserResponseDto] })
  async findAll(@Request() req: AuthenticatedRequest): Promise<UserResponseDto[]> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Only ADMIN users can list users',
      });
    }
    return this.usersService.findAll() as unknown as Promise<UserResponseDto[]>;
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  async getMe(@Request() req: AuthenticatedRequest): Promise<UserResponseDto> {
    const user = await this.usersService.findByUsername(req.user.username);
    if (!user) {
      throw new NotFoundException({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    return user as unknown as UserResponseDto;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (ADMIN only)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Only ADMIN users can view other users',
      });
    }
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException({ error: 'USER_NOT_FOUND', message: `User '${id}' not found` });
    }
    return user as unknown as UserResponseDto;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user role/status/info (ADMIN only)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<UserResponseDto> {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException({
        error: 'FORBIDDEN',
        message: 'Only ADMIN users can update users',
      });
    }
    return this.usersService.updateStatus(id, dto) as unknown as Promise<UserResponseDto>;
  }
}
