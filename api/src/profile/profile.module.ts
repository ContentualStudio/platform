import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "../auth/auth.module";
import { BetterAuthUserEntity } from "../auth/entities";
import { StorageModule } from "../storage/storage.module";
import { AvatarStoreModule } from "./avatar-store.module";
import { UserProfileEntity } from "./entities/user-profile.entity";
import { ProfileController } from "./profile.controller";
import { ProfileService } from "./profile.service";

@Module({
  imports: [
    AuthModule,
    AvatarStoreModule,
    StorageModule,
    TypeOrmModule.forFeature([UserProfileEntity, BetterAuthUserEntity]),
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
