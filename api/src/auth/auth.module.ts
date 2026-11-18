import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EmailModule } from "../email/email.module";
import { AvatarStoreModule } from "../profile/avatar-store.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { SocialAvatarService } from "./social-avatar.service";
import {
  BetterAuthAccountEntity,
  BetterAuthSessionEntity,
  BetterAuthUserEntity,
  BetterAuthVerificationEntity,
} from "./entities";

@Module({
  imports: [
    AvatarStoreModule,
    EmailModule,
    TypeOrmModule.forFeature([
      BetterAuthAccountEntity,
      BetterAuthSessionEntity,
      BetterAuthUserEntity,
      BetterAuthVerificationEntity,
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, SocialAvatarService],
  exports: [AuthService],
})
export class AuthModule {}
