import * as assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthenticatedUser } from "../auth/guards/session.guard";
import { ProfileService } from "./profile.service";

const user: AuthenticatedUser = {
  id: "user-1",
  email: "creator@example.com",
  image: "https://cdn.example.com/users/user-1/avatar/old.png",
  name: "Creator",
  onboardingCompleted: true,
};

function createHarness() {
  const profile = {
    userId: user.id,
    onboardingCompletedAt: new Date(),
    userType: "Independent Creator",
    region: "Nigeria",
    timezone: "Africa/Lagos",
    platforms: ["Instagram"],
    experienceLevel: "Intermediate",
    postingFrequency: "Daily",
    mainGoal: "Grow my audience",
    biggestChallenge: "Staying consistent",
    bio: null as string | null,
    avatarKey: "users/user-1/avatar/old.png" as string | null,
    dailyTaskNotice: true,
    badgeEarned: true,
    streakAtRisk: true,
    milestoneReached: true,
    themePreference: "system" as "light" | "dark" | "system",
  };
  const userWrites: Record<string, unknown>[] = [];
  const profileWrites: Record<string, unknown>[] = [];
  const replacedAvatars: Record<string, unknown>[] = [];
  const savedAvatars: Record<string, unknown>[] = [];
  const removedAvatars: string[] = [];
  const deletedKeys: string[] = [];
  let failAvatarUpload = false;

  const profileRepository = {
    findOneBy: async () => profile,
    upsert: async (values: Record<string, unknown>) => {
      profileWrites.push(values);
      Object.assign(profile, values);
    },
    update: async (_criteria: unknown, values: Record<string, unknown>) => {
      profileWrites.push(values);
      Object.assign(profile, values);
    },
  };
  const userRepository = {
    update: async (_criteria: unknown, values: Record<string, unknown>) => {
      userWrites.push(values);
    },
  };
  const storage = {
    replaceAvatar: async (input: Record<string, unknown>) => {
      if (failAvatarUpload) {
        throw new Error("storage unavailable");
      }

      replacedAvatars.push(input);
      return {
        bucket: "media",
        key: "users/user-1/avatar/new.png",
        url: "https://cdn.example.com/users/user-1/avatar/new.png",
        contentType: "image/png",
        sizeBytes: 3,
      };
    },
    deleteObject: async (key: string) => {
      deletedKeys.push(key);
    },
  };
  const avatarStore = {
    save: async (input: Record<string, unknown>) => {
      if (failAvatarUpload) {
        throw new Error("the avatar store is unavailable");
      }

      savedAvatars.push(input);
      return {
        url: "http://localhost:3001/profile/me/avatar?v=newetag",
        etag: "newetag",
      };
    },
    remove: async (userId: string) => {
      removedAvatars.push(userId);
    },
    find: async () => null,
  };
  const service = new ProfileService(
    profileRepository as never,
    userRepository as never,
    storage as never,
    avatarStore as never,
  );

  return {
    deletedKeys,
    profile,
    profileWrites,
    removedAvatars,
    replacedAvatars,
    savedAvatars,
    service,
    setAvatarUploadFailure(value: boolean) {
      failAvatarUpload = value;
    },
    userWrites,
  };
}

test("updateProfile persists editable identity and profile fields", async () => {
  const harness = createHarness();

  const result = await harness.service.updateProfile(user, {
    name: "James Creator",
    bio: "I teach creators.",
    region: "United Kingdom",
    timezone: "Europe/London",
  });

  assert.deepEqual(harness.userWrites, [{ name: "James Creator" }]);
  assert.deepEqual(harness.profileWrites[0], {
    userId: user.id,
    bio: "I teach creators.",
    region: "United Kingdom",
    timezone: "Europe/London",
  });
  assert.equal(result.user.name, "James Creator");
  assert.equal(result.stage1.bio, "I teach creators.");
});

test("updateNotificationPreferences persists and returns all preferences", async () => {
  const harness = createHarness();
  const preferences = {
    dailyTaskNotice: false,
    badgeEarned: true,
    streakAtRisk: false,
    milestoneReached: true,
  };

  const result = await harness.service.updateNotificationPreferences(
    user,
    preferences,
  );

  assert.deepEqual(harness.profileWrites[0], {
    userId: user.id,
    ...preferences,
  });
  assert.deepEqual(result.notifications, preferences);
});

test("updateThemePreference persists and returns the selected theme", async () => {
  const harness = createHarness();

  const result = await harness.service.updateThemePreference(user, {
    theme: "dark",
  });

  assert.deepEqual(harness.profileWrites[0], {
    userId: user.id,
    themePreference: "dark",
  });
  assert.equal(result.preferences.theme, "dark");
});

test("uploadAvatar stores the bytes and persists the served URL", async () => {
  const harness = createHarness();

  const result = await harness.service.uploadAvatar(user, {
    buffer: Buffer.from("new"),
    mimetype: "image/png",
    originalname: "avatar.png",
    size: 3,
  });

  assert.equal(harness.savedAvatars[0]?.userId, "user-1");
  assert.equal(harness.savedAvatars[0]?.contentType, "image/png");
  assert.deepEqual(harness.userWrites, [
    { image: "http://localhost:3001/profile/me/avatar?v=newetag" },
  ]);
  assert.equal(
    result.user.image,
    "http://localhost:3001/profile/me/avatar?v=newetag",
  );
});

test("uploadAvatar drains the object an earlier S3-backed avatar left behind", async () => {
  const harness = createHarness();

  await harness.service.uploadAvatar(user, {
    buffer: Buffer.from("new"),
    mimetype: "image/png",
    originalname: "avatar.png",
    size: 3,
  });

  assert.deepEqual(harness.deletedKeys, ["users/user-1/avatar/old.png"]);
  assert.ok(harness.profileWrites.some((write) => write.avatarKey === null));
});

test("a failed avatar upload preserves the prior profile image", async () => {
  const harness = createHarness();
  harness.setAvatarUploadFailure(true);

  await assert.rejects(
    () =>
      harness.service.uploadAvatar(user, {
        buffer: Buffer.from("new"),
        mimetype: "image/png",
        originalname: "avatar.png",
        size: 3,
      }),
    /the avatar store is unavailable/,
  );
  assert.deepEqual(harness.userWrites, []);
  assert.deepEqual(harness.profileWrites, []);
});

test("removeAvatar clears the stored bytes, the image and any legacy object", async () => {
  const harness = createHarness();

  const result = await harness.service.removeAvatar(user);

  assert.deepEqual(harness.removedAvatars, ["user-1"]);
  assert.deepEqual(harness.deletedKeys, ["users/user-1/avatar/old.png"]);
  assert.deepEqual(harness.userWrites, [{ image: null }]);
  assert.ok(harness.profileWrites.some((write) => write.avatarKey === null));
  assert.equal(result.user.image, null);
});
