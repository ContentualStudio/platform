import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AvatarStoreService } from "./avatar-store.service";
import { UserAvatarEntity } from "./entities/user-avatar.entity";

/**
 * Its own module because two features need it from opposite directions: the
 * profile endpoints, and the social-avatar import that runs inside account
 * creation. ProfileModule already imports AuthModule, so having AuthModule
 * reach into ProfileModule for this would close a cycle.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserAvatarEntity])],
  providers: [AvatarStoreService],
  exports: [AvatarStoreService],
})
export class AvatarStoreModule {}
