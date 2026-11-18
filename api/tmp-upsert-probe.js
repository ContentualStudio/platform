"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const data_source_1 = require("./src/database/data-source");
const challenge_setup_entity_1 = require("./src/challenge-setup/entities/challenge-setup.entity");
async function main() {
    await data_source_1.default.initialize();
    const userId = "GmLTu0kIY1JzaGrlZPqpVr1mNsxhscAN";
    await data_source_1.default.manager.upsert(challenge_setup_entity_1.ChallengeSetupEntity, { userId, primaryPlatform: "Instagram" }, ["userId"]);
    const row = await data_source_1.default.manager.findOneBy(challenge_setup_entity_1.ChallengeSetupEntity, { userId });
    console.log("primaryPlatform after upsert:", JSON.stringify(row?.primaryPlatform));
    await data_source_1.default.query('UPDATE challenge_setup SET "primaryPlatform" = NULL WHERE "userId" = $1', [userId]);
    await data_source_1.default.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=tmp-upsert-probe.js.map