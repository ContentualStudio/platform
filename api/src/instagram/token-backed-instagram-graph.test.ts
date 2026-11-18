import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  apiFailure,
  apiSuccess,
  type InstagramApiPort,
} from "./instagram-api.port";
import type { InstagramTokenService } from "./instagram-token.service";
import {
  InstagramGraphError,
  TokenBackedInstagramGraph,
} from "./token-backed-instagram-graph";

const account = {
  externalAccountId: "ig-1",
  username: "creator",
  followerCount: 1200,
  accountType: "professional" as const,
};

function build(options: { failWith?: ReturnType<typeof apiFailure> } = {}) {
  const seenTokens: string[] = [];
  const storedToken = "stored-long-lived-token";

  const api = {
    fetchAccount: async (accessToken: string) => {
      seenTokens.push(accessToken);
      return options.failWith ?? apiSuccess(account);
    },
  } as unknown as InstagramApiPort;

  const tokens = {
    withAccessToken: async <T>(
      _userId: string,
      work: (token: string) => Promise<T>,
    ) => work(storedToken),
  } as unknown as InstagramTokenService;

  return {
    graph: new TokenBackedInstagramGraph(api, tokens),
    seenTokens,
    storedToken,
  };
}

// The connect path: the token has just been minted and cannot be stored yet,
// because storing it needs a connectionId that InstagramService.connect() is
// about to create.
test("a passed-through credential is used as the access token", async () => {
  const { graph, seenTokens } = build();

  await graph.fetchAccount({ userId: "user-1", credential: "fresh-token" });

  assert.deepEqual(seenTokens, ["fresh-token"]);
});

// Every path afterwards: sync and the daily pull hand in nothing.
test("an empty credential falls back to the stored token", async () => {
  const { graph, seenTokens, storedToken } = build();

  await graph.fetchAccount({ userId: "user-1", credential: "" });

  assert.deepEqual(seenTokens, [storedToken]);
});

test("whitespace is not mistaken for a token", async () => {
  const { graph, seenTokens, storedToken } = build();

  await graph.fetchAccount({ userId: "user-1", credential: "   " });

  assert.deepEqual(seenTokens, [storedToken]);
});

// The old port's shape is what InstagramService reads, and it has no
// accountType field — that is recorded by the connect flow, not here.
test("the result is narrowed to the existing port's shape", async () => {
  const { graph } = build();

  const result = await graph.fetchAccount({
    userId: "user-1",
    credential: "fresh-token",
  });

  assert.deepEqual(result, {
    externalAccountId: "ig-1",
    username: "creator",
    followerCount: 1200,
  });
});

// The port's contract is to throw; the classification has to survive so the
// caller can still tell a dead token from a flaky network.
test("a failure throws while preserving its classification", async () => {
  const { graph } = build({ failWith: apiFailure("auth", "Session expired") });

  await assert.rejects(
    () => graph.fetchAccount({ userId: "user-1", credential: "dead-token" }),
    (error: unknown) => {
      assert.ok(error instanceof InstagramGraphError);
      assert.equal(error.kind, "auth");
      assert.equal(error.message, "Session expired");
      return true;
    },
  );
});
