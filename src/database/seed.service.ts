import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly usersService: UsersService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedDefaultAdmin();
  }

  private async seedDefaultAdmin(): Promise<void> {
    const username = process.env.SEED_ADMIN_USERNAME ?? 'senior.backend';
    const password = process.env.SEED_ADMIN_PASSWORD ?? 'Password123';

    try {
      const found = await this.usersService.findByUsernameWithPassword(username);

      if (!found) {
        await this.usersService.create({
          username,
          password,
          role: 'ADMIN',
          fullName: 'Senior Backend (Admin)',
          email: 'senior@ligo.pe',
        });
        this.logger.log(`[Seed] Default admin '${username}' created`);
        return;
      }

      if (found.passwordHash === 'SEED_PLACEHOLDER') {
        await this.usersService.updatePassword(found.user.id, password);
        this.logger.log(`[Seed] Default admin '${username}' password hash updated`);
        return;
      }

      this.logger.log(`[Seed] Default admin '${username}' already seeded — skipping`);
    } catch (err) {
      this.logger.error(
        `[Seed] Failed to seed default admin: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
