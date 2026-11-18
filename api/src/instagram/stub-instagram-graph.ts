import { Injectable } from "@nestjs/common";
import type {
  FetchInstagramAccountInput,
  InstagramGraphAccount,
  InstagramGraphPort,
} from "./instagram-graph.port";

/**
 * Internal harness stand-in for Meta's Graph API — not a real Instagram
 * integration. Deterministic and stateless: parses `credential` as `handle`
 * or `handle:followerCount`, so a demo or test can drive an exact follower
 * count without a stub that remembers state between calls.
 *
 * Both platform.connected and follower.milestone fire against real rows
 * regardless of which port implementation is bound — swapping this for a
 * real Meta OAuth adapter is the only change the real integration needs.
 */
@Injectable()
export class StubInstagramGraph implements InstagramGraphPort {
  async fetchAccount(
    input: FetchInstagramAccountInput,
  ): Promise<InstagramGraphAccount> {
    const [handle, countText] = input.credential.split(":");
    const username = handle?.trim();

    if (!username) {
      throw new Error("Instagram credential must include a handle.");
    }

    const followerCount = countText ? Number(countText) : 0;

    if (!Number.isFinite(followerCount) || followerCount < 0) {
      throw new Error(`Invalid follower count in credential: "${countText}"`);
    }

    return {
      externalAccountId: `stub:${username}`,
      username,
      followerCount,
    };
  }
}
