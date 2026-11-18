"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const node_crypto_1 = require("node:crypto");
const data_source_1 = require("./src/database/data-source");
async function main() {
    await data_source_1.default.initialize();
    const userId = "GmLTu0kIY1JzaGrlZPqpVr1mNsxhscAN";
    const rows = (await data_source_1.default.query(`SELECT "token" FROM "session" WHERE "userId" = $1 AND "expiresAt" > now() ORDER BY "createdAt" DESC LIMIT 1`, [userId]));
    if (!rows[0]) {
        console.log("no live session for this user; sign in first");
        await data_source_1.default.destroy();
        return;
    }
    const token = rows[0].token;
    const secret = process.env.BETTER_AUTH_SECRET ?? "contentual-development-better-auth-secret-change-before-prod";
    const signature = (0, node_crypto_1.createHmac)("sha256", secret).update(token).digest("base64");
    const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${signature}`)}`;
    const response = await fetch("http://localhost:3001/challenge-setup/stage2", {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ primaryPlatform: "YouTube" }),
    });
    console.log("POST /challenge-setup/stage2 ->", response.status);
    const body = (await response.json());
    console.log("answers.primaryPlatform in response:", JSON.stringify(body.answers?.primaryPlatform));
    const after = (await data_source_1.default.query(`SELECT "primaryPlatform" FROM challenge_setup WHERE "userId" = $1`, [userId]));
    console.log("column after request:", JSON.stringify(after[0]?.primaryPlatform));
    await data_source_1.default.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=tmp-e2e-probe.js.map