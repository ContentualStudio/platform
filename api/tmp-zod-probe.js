"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const field = zod_1.z.enum(["Instagram", "YouTube"]).nullable().default(null);
console.log("optional(), key absent:", JSON.stringify(zod_1.z.object({ primaryPlatform: field.optional() }).parse({})));
console.log("partial(), key absent:", JSON.stringify(zod_1.z.object({ primaryPlatform: field }).partial().parse({})));
const bare = zod_1.z.enum(["Instagram", "YouTube"]).nullable();
console.log("no default, key absent:", JSON.stringify(zod_1.z.object({ primaryPlatform: bare.optional() }).parse({})));
//# sourceMappingURL=tmp-zod-probe.js.map