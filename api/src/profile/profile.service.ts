import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { BetterAuthUserEntity } from "../auth/entities";
import { StorageService } from "../storage/storage.service";
import { AvatarStoreService, type StoredAvatar } from "./avatar-store.service";
import { UserProfileEntity } from "./entities/user-profile.entity";
import {
  NotificationPreferencesInput,
  ProfileUpdateInput,
  Stage1PartialAnswersInput,
  ThemePreferenceInput,
} from "./profile.schemas";
import type { AuthenticatedUser } from "../auth/guards/session.guard";

export interface ProfileSummary {
  onboardingCompleted: boolean;
  notifications: NotificationPreferencesInput;
  preferences: ThemePreferenceInput;
  user: {
    id: string;
    email: string;
    image: string | null;
    name: string;
  };
  stage1: {
    name: string;
    userType: string | null;
    region: string | null;
    timezone: string | null;
    platforms: string[] | null;
    experienceLevel: string | null;
    postingFrequency: string | null;
    mainGoal: string | null;
    biggestChallenge: string | null;
    bio: string | null;
  };
}

export interface AvatarUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(UserProfileEntity)
    private readonly profileRepository: Repository<UserProfileEntity>,
    @InjectRepository(BetterAuthUserEntity)
    private readonly userRepository: Repository<BetterAuthUserEntity>,
    private readonly storageService: StorageService,
    private readonly avatarStore: AvatarStoreService,
  ) {}

  async getProfile(user: AuthenticatedUser): Promise<ProfileSummary> {
    const profile = await this.profileRepository.findOneBy({
      userId: user.id,
    });

    return this.toSummary(user, profile);
  }

  // A step can be saved on its own (partial input) so progress survives an
  // abandoned session. Completion is derived after every save rather than
  // driven by an explicit "finish" flag from the client.
  async saveStage1Answers(
    currentUser: AuthenticatedUser,
    input: Stage1PartialAnswersInput,
  ): Promise<ProfileSummary> {
    const { name, ...profileFields } = input;
    const writes: Promise<unknown>[] = [];

    if (name !== undefined && name !== currentUser.name) {
      writes.push(this.userRepository.update({ id: currentUser.id }, { name }));
    }

    if (Object.keys(profileFields).length > 0) {
      writes.push(
        this.profileRepository.upsert(
          { userId: currentUser.id, ...profileFields },
          ["userId"],
        ),
      );
    }

    await Promise.all(writes);

    const profile = await this.profileRepository.findOneBy({
      userId: currentUser.id,
    });

    if (profile && !profile.onboardingCompletedAt && this.isComplete(profile)) {
      const onboardingCompletedAt = new Date();
      await this.profileRepository.update(
        { userId: currentUser.id },
        { onboardingCompletedAt },
      );
      profile.onboardingCompletedAt = onboardingCompletedAt;
    }

    return this.toSummary(
      { ...currentUser, name: name ?? currentUser.name },
      profile,
    );
  }

  async updateProfile(
    currentUser: AuthenticatedUser,
    input: ProfileUpdateInput,
  ): Promise<ProfileSummary> {
    const { name, ...profileFields } = input;
    const writes: Promise<unknown>[] = [];

    if (name !== undefined && name !== currentUser.name) {
      writes.push(
        this.userRepository.update({ id: currentUser.id }, { name }),
      );
    }

    if (Object.keys(profileFields).length > 0) {
      writes.push(
        this.profileRepository.upsert(
          { userId: currentUser.id, ...profileFields },
          ["userId"],
        ),
      );
    }

    await Promise.all(writes);

    const profile = await this.profileRepository.findOneBy({
      userId: currentUser.id,
    });

    return this.toSummary(
      { ...currentUser, name: name ?? currentUser.name },
      profile,
    );
  }

  async updateNotificationPreferences(
    currentUser: AuthenticatedUser,
    input: NotificationPreferencesInput,
  ): Promise<ProfileSummary> {
    await this.profileRepository.upsert(
      { userId: currentUser.id, ...input },
      ["userId"],
    );

    const profile = await this.profileRepository.findOneBy({
      userId: currentUser.id,
    });

    return this.toSummary(currentUser, profile);
  }

  async updateThemePreference(
    currentUser: AuthenticatedUser,
    input: ThemePreferenceInput,
  ): Promise<ProfileSummary> {
    await this.profileRepository.upsert(
      { userId: currentUser.id, themePreference: input.theme },
      ["userId"],
    );

    const profile = await this.profileRepository.findOneBy({
      userId: currentUser.id,
    });

    return this.toSummary(currentUser, profile);
  }

  async uploadAvatar(
    currentUser: AuthenticatedUser,
    file: AvatarUpload,
  ): Promise<ProfileSummary> {
    const stored = await this.avatarStore.save({
      bytes: file.buffer,
      contentType: file.mimetype,
      userId: currentUser.id,
    });

    await Promise.all([
      this.userRepository.update({ id: currentUser.id }, { image: stored.url }),
      this.discardLegacyObject(currentUser.id),
    ]);

    const profile = await this.profileRepository.findOneBy({
      userId: currentUser.id,
    });

    return this.toSummary({ ...currentUser, image: stored.url }, profile);
  }

  /** The bytes behind the URL on the user row, for the image endpoint. */
  async findAvatar(userId: string): Promise<StoredAvatar | null> {
    return this.avatarStore.find(userId);
  }

  /**
   * Clears an S3 object left by the pre-database avatar path.
   *
   * Runs on the two occasions the user's avatar changes anyway, so the bucket
   * drains as people touch their profile rather than needing a sweep. Failure
   * is ignored: the object may already be gone, and no user action should fail
   * because a superseded file could not be deleted.
   */
  private async discardLegacyObject(userId: string): Promise<void> {
    const profile = await this.profileRepository.findOneBy({ userId });

    if (!profile?.avatarKey) {
      return;
    }

    try {
      await this.storageService.deleteObject(profile.avatarKey);
    } catch {
      // Intentionally ignored, see above.
    }

    await this.profileRepository.upsert({ userId, avatarKey: null }, [
      "userId",
    ]);
  }

  async removeAvatar(
    currentUser: AuthenticatedUser,
  ): Promise<ProfileSummary> {
    await this.avatarStore.remove(currentUser.id);

    await Promise.all([
      this.userRepository.update({ id: currentUser.id }, { image: null }),
      this.discardLegacyObject(currentUser.id),
    ]);

    const profile = await this.profileRepository.findOneBy({
      userId: currentUser.id,
    });

    return this.toSummary({ ...currentUser, image: null }, profile);
  }

  private isComplete(profile: UserProfileEntity): boolean {
    return (
      Boolean(profile.userType) &&
      Boolean(profile.region) &&
      Boolean(profile.timezone) &&
      Boolean(profile.platforms?.length) &&
      Boolean(profile.experienceLevel) &&
      Boolean(profile.postingFrequency) &&
      Boolean(profile.mainGoal) &&
      Boolean(profile.biggestChallenge)
    );
  }

  private toSummary(
    user: Pick<AuthenticatedUser, "email" | "id" | "image" | "name">,
    profile: UserProfileEntity | null,
  ): ProfileSummary {
    return {
      onboardingCompleted: Boolean(profile?.onboardingCompletedAt),
      notifications: {
        dailyTaskNotice: profile?.dailyTaskNotice ?? true,
        badgeEarned: profile?.badgeEarned ?? true,
        streakAtRisk: profile?.streakAtRisk ?? true,
        milestoneReached: profile?.milestoneReached ?? true,
      },
      preferences: {
        theme: profile?.themePreference ?? "system",
      },
      user: {
        id: user.id,
        email: user.email,
        image: user.image,
        name: user.name,
      },
      stage1: {
        name: user.name,
        userType: profile?.userType ?? null,
        region: profile?.region ?? null,
        timezone: profile?.timezone ?? null,
        platforms: profile?.platforms ?? null,
        experienceLevel: profile?.experienceLevel ?? null,
        postingFrequency: profile?.postingFrequency ?? null,
        mainGoal: profile?.mainGoal ?? null,
        biggestChallenge: profile?.biggestChallenge ?? null,
        bio: profile?.bio ?? null,
      },
    };
  }
}
