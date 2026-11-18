import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { ContentEngineModule } from "../content-engine/content-engine.module";
import { GraphInstagramApi } from "./graph-instagram-api";
import { INSTAGRAM_API, type InstagramApiPort } from "./instagram-api.port";
import { INSTAGRAM_GRAPH } from "./instagram-graph.port";
import { InstagramTokenService } from "./instagram-token.service";
import { InstagramConnectService } from "./instagram-connect.service";
import { InstagramDailyPullJob } from "./instagram-daily-pull.job";
import { InstagramDataPurgeService } from "./instagram-data-purge.service";
import { InstagramOauthController } from "./instagram-oauth.controller";
import { InstagramOauthService } from "./instagram-oauth.service";
import { MetaDeauthorizeService } from "./meta-deauthorize.service";
import { MetaDeletionController } from "./meta-deletion.controller";
import { MetaDeletionService } from "./meta-deletion.service";
import { InstagramController } from "./instagram.controller";
import { InstagramService } from "./instagram.service";
import { StubInstagramApi } from "./stub-instagram-api";
import { StubInstagramGraph } from "./stub-instagram-graph";
import { TokenBackedInstagramGraph } from "./token-backed-instagram-graph";

/**
 * The one switch that decides whether this app talks to Meta at all.
 *
 * Exported so the wiring test asserts *this* function rather than a copy of it
 * — a test that restates the factory proves only that two copies agree.
 */
export function selectInstagramApi(
  config: ConfigService,
  graph: GraphInstagramApi,
  stub: StubInstagramApi,
): InstagramApiPort {
  return config.get<boolean>("instagram.configured") ? graph : stub;
}

export function selectInstagramGraph(
  config: ConfigService,
  tokenBacked: TokenBackedInstagramGraph,
  stub: StubInstagramGraph,
) {
  return config.get<boolean>("instagram.configured") ? tokenBacked : stub;
}

// Which implementation binds is decided by configuration, not by environment
// name: `instagram.configured` is true only when an app id, an app secret and a
// valid encryption key are all present. Anything less keeps the stubs, because
// a half-configured integration would authorise a user and then fail to store
// the token it was granted.
@Module({
  imports: [AuthModule, ContentEngineModule],
  controllers: [
    InstagramController,
    InstagramOauthController,
    MetaDeletionController,
  ],
  providers: [
    InstagramService,
    InstagramTokenService,
    InstagramOauthService,
    InstagramConnectService,
    InstagramDataPurgeService,
    MetaDeletionService,
    MetaDeauthorizeService,
    InstagramDailyPullJob,
    StubInstagramGraph,
    StubInstagramApi,
    GraphInstagramApi,
    {
      provide: INSTAGRAM_API,
      inject: [ConfigService, GraphInstagramApi, StubInstagramApi],
      useFactory: selectInstagramApi,
    },
    TokenBackedInstagramGraph,
    {
      provide: INSTAGRAM_GRAPH,
      inject: [ConfigService, TokenBackedInstagramGraph, StubInstagramGraph],
      useFactory: selectInstagramGraph,
    },
  ],
  exports: [
    InstagramService,
    InstagramTokenService,
    InstagramConnectService,
    InstagramDataPurgeService,
    MetaDeletionService,
    MetaDeauthorizeService,
    InstagramDailyPullJob,
  ],
})
export class InstagramModule {}
