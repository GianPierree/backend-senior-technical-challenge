import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WalletsService } from './wallets.service';
import {
  WalletBalanceResponseDto,
  MovementsResponseDto,
  GetMovementsQueryDto,
} from './dto/wallet.dto';

@ApiTags('Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get(':walletId/balance')
  @ApiOperation({ summary: 'Get wallet balance' })
  @ApiResponse({ status: 200, type: WalletBalanceResponseDto })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  getBalance(@Param('walletId') walletId: string): Promise<WalletBalanceResponseDto> {
    return this.walletsService.getBalance(walletId);
  }

  @Get(':walletId/movements')
  @ApiOperation({ summary: 'Get paginated movement list for a wallet' })
  @ApiResponse({ status: 200, type: MovementsResponseDto })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  getMovements(
    @Param('walletId') walletId: string,
    @Query() query: GetMovementsQueryDto,
  ): Promise<MovementsResponseDto> {
    return this.walletsService.getMovements(walletId, query);
  }
}
