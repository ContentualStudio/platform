import "reflect-metadata";
import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import instagramConfig from "../config/instagram.config";
import { GraphInstagramApi } from "./graph-instagram-api";
import { INSTAGRAM_API } from "./instagram-api.port";
import { INSTAGRAM_GRAPH } from "./instagram-graph.port";
import { InstagramTokenService } from "./instagram-token.service";
import { selectInstagramApi, selectInstagramGraph } from "./instagram.module";
import { StubInstagramApi } from "./stub-instagram-api";
import { StubInstagramGraph } from "./stub-instagram-graph";
import { TokenBackedInstagramGraph } from "./token-backed-instagram-graph";

// Which implementation binds is the single switch that decides whether this
// app talks to Meta at all, so it is asserted by building the real container
// rather than by reading the factory. A wiring mistake here is invisible until
// runtime otherwise — which is exactly how a stub reaches production.
const validKey = Buffer.alloc(32, 1).toString("base64");
const originalEnv = { ...process.env };

async function bindings(env: Record<string, string | undefined>) {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("INSTAGRAM_")) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, env);

  const moduleRef = await Test.createTestingModule({
    // ignoreEnvFile: each case sets INSTAGRAM_* itself; reading the developer's
    // .env would put real credentials back and bind the real adapters.
    imports: [
      ConfigModule.forRoot({ load: [instagramConfig], isGlobal: true, ignoreEnvFile: true }),
    ],
    providers: [
      // The token service needs a DataSource it never touches on this path.
      { provide: DataSource, useValue: { query: async () => [] } },
      StubInstagramGraph,
      StubInstagramApi,
      GraphInstagramApi,
      InstagramTokenService,
      TokenBackedInstagramGraph,
      // The module's own factories, not a restatement of them.
      {
        provide: INSTAGRAM_API,
        inject: [ConfigService, GraphInstagramApi, StubInstagramApi],
        useFactory: selectInstagramApi,
      },
      {
        provide: INSTAGRAM_GRAPH,
        inject: [ConfigService, TokenBackedInstagramGraph, StubInstagramGraph],
        useFactory: selectInstagramGraph,
      },
    ],
  }).compile();

  return {
    api: moduleRef.get(INSTAGRAM_API),
    graph: moduleRef.get(INSTAGRAM_GRAPH),
    close: () => moduleRef.close(),
  };
}

test.afterEach(() => {
  process.env = { ...originalEnv };
});

test("with no meta app the stubs bind, so the app still runs", async () => {
  const { api, graph, close } = await bindings({});

  assert.ok(api instanceof StubInstagramApi);
  assert.ok(graph instanceof StubInstagramGraph);

  await close();
});

test("with a full configuration the real adapters bind", async () => {
  const { api, graph, close } = await bindings({
    INSTAGRAM_APP_ID: "app-id",
    INSTAGRAM_APP_SECRET: "app-secret",
    INSTAGRAM_TOKEN_ENCRYPTION_KEY: validKey,
  });

  assert.ok(api instanceof GraphInstagramApi);
  assert.ok(graph instanceof TokenBackedInstagramGraph);

  await close();
});

// The dangerous middle: credentials present but no key to seal the token with.
// Binding the real adapter here would authorise a user and then fail to store
// the token it was granted.
test("a half-configured app keeps the stubs rather than half-connecting", async () => {
  const { api, graph, close } = await bindings({
    INSTAGRAM_APP_ID: "app-id",
    INSTAGRAM_APP_SECRET: "app-secret",
  });

  assert.ok(api instanceof StubInstagramApi);
  assert.ok(graph instanceof StubInstagramGraph);

  await close();
});
