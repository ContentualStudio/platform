import { Inject, Injectable } from "@nestjs/common";
import {
  INSTAGRAM_API,
  type InstagramApiPort,
} from "./instagram-api.port";
import type {
  FetchInstagramAccountInput,
  InstagramGraphAccount,
  InstagramGraphPort,
} from "./instagram-graph.port";
import { InstagramTokenService } from "./instagram-token.service";

/**
 * Adapts the real Graph API up to the port `InstagramService` already calls.
 *
 * This exists so `instagram.service.ts` does not change at all. Every emit
 * gate, stable event id and conditional write in that file is load-bearing and
 * already tested; the real integration is a different implementation behind the
 * same seam, which is exactly what the seam was built for.
 *
 * `credential` carries a meaning it did not have under the stub, and the reason
 * is a genuine ordering problem rather than a convenience:
 *
 *   - **During connect**, the token has just been minted by the OAuth callback
 *     and cannot be stored yet — storing it needs a `connectionId`, and the
 *     connection row is created by `InstagramService.connect()`, which is the
 *     very call that is about to run. So the callback passes the fresh token
 *     through as `credential` and stores it once the row exists.
 *   - **Afterwards** (follower sync, daily pull) there is no token to hand in,
 *     `credential` is empty, and the stored one is used.
 *
 * Either way the plaintext never leaves this class or the token service.
 */
@Injectable()
export class TokenBackedInstagramGraph implements InstagramGraphPort {
  constructor(
    @Inject(INSTAGRAM_API) private readonly api: InstagramApiPort,
    private readonly tokens: InstagramTokenService,
  ) {}

  async fetchAccount(
    input: FetchInstagramAccountInput,
  ): Promise<InstagramGraphAccount> {
    const passedThrough = input.credential?.trim();

    if (passedThrough) {
      return this.readAccount(passedThrough);
    }

    return this.tokens.withAccessToken(input.userId, (accessToken) =>
      this.readAccount(accessToken),
    );
  }

  private async readAccount(accessToken: string): Promise<InstagramGraphAccount> {
    const result = await this.api.fetchAccount(accessToken);

    if (!result.ok) {
      // The port's contract is to throw, because that is what the existing
      // service expects. The classification is preserved in the message so the
      // caller can still tell a dead token from a flaky network.
      throw new InstagramGraphError(result.kind, result.error);
    }

    return {
      externalAccountId: result.value.externalAccountId,
      username: result.value.username,
      followerCount: result.value.followerCount,
    };
  }
}

export class InstagramGraphError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = "InstagramGraphError";
  }
}
