import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AvatarStoreService } from "../profile/avatar-store.service";
import { BetterAuthUserEntity } from "./entities";

/**
 * Copies a social provider's profile picture into our own storage.
 *
 * Better Auth writes the provider's URL straight onto `user.image`, which
 * leaves every avatar in the product pointing at a third party: Google rotates
 * those URLs, never tells us when, and the picture is captured once and never
 * refreshed. Importing the bytes at signup makes a Google avatar exactly the
 * same object as an uploaded one — ours, in our database, served by our own
 * endpoint.
 *
 * Every failure is silent by design. This runs inside account creation, and a
 * missing avatar is not a reason to fail a signup; the provider URL simply
 * stays on the user, which is the behaviour we had before.
 */

const AVATAR_FETCH_TIMEOUT_MS = 5_000;

// The URL arrives inside a Google-signed id token, so it is not attacker
// controlled today. The allow-list is what keeps that true if a second
// provider is added later: without it, this method is a fetch to whatever
// host an identity provider names, issued from inside our network.
const ALLOWED_AVATAR_HOST_SUFFIXES = [".googleusercontent.com"] as const;

export interface SocialAvatarUser {
  id: string;
  image?: string | null;
}

@Injectable()
export class SocialAvatarService {
  private readonly logger = new Logger(SocialAvatarService.name);

  constructor(
    @InjectRepository(BetterAuthUserEntity)
    private readonly userRepository: Repository<BetterAuthUserEntity>,
    private readonly avatarStore: AvatarStoreService,
  ) {}

  /**
   * Imports the picture a newly created user arrived with, if any.
   *
   * Returns the stored URL, or `null` when there was nothing to import or the
   * import could not be completed — the caller has no decision to make either
   * way, so nothing is thrown.
   */
  async importForNewUser(user: SocialAvatarUser): Promise<string | null> {
    try {
      return await this.importAvatar(user);
    } catch (error) {
      this.logger.warn(
        `Could not import the social avatar for ${user.id}: ${String(error)}`,
      );
      return null;
    }
  }

  private async importAvatar(user: SocialAvatarUser): Promise<string | null> {
    const source = this.importableUrl(user.image);

    if (!source) {
      return null;
    }

    const downloaded = await this.download(source);

    if (!downloaded) {
      return null;
    }

    const stored = await this.avatarStore.save({
      bytes: downloaded.body,
      contentType: downloaded.contentType,
      userId: user.id,
    });

    // Written only after the bytes are safely stored: a user row pointing at
    // our endpoint before the endpoint has anything to serve would render as
    // a broken image, which is worse than the provider URL it replaces.
    await this.userRepository.update({ id: user.id }, { image: stored.url });

    return stored.url;
  }

  private importableUrl(image: string | null | undefined): URL | null {
    if (!image) {
      return null;
    }

    let url: URL;

    try {
      url = new URL(image);
    } catch {
      return null;
    }

    if (url.protocol !== "https:") {
      return null;
    }

    const host = url.hostname.toLowerCase();
    const allowed = ALLOWED_AVATAR_HOST_SUFFIXES.some(
      (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
    );

    return allowed ? url : null;
  }

  private async download(source: URL): Promise<{
    body: Buffer;
    contentType: string;
  } | null> {
    const response = await fetch(source, {
      redirect: "follow",
      signal: AbortSignal.timeout(AVATAR_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!this.avatarStore.accepts(contentType)) {
      return null;
    }

    const body = Buffer.from(await response.arrayBuffer());

    // Checked here as well as inside the store, because the store throws the
    // BadRequestException an upload endpoint returns to the user. Here an
    // oversized picture is a reason to skip the import, not to raise.
    if (body.byteLength > this.avatarStore.maxSizeBytes) {
      return null;
    }

    return { body, contentType };
  }
}
