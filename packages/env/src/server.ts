/// <reference types="@cloudflare/workers-types" />
// For Cloudflare Workers, env is accessed via cloudflare:workers module
// Concrete runtime bindings are declared in env.d.ts without importing infrastructure code.
import { env as cloudflareEnv } from "cloudflare:workers";

import type { CloudflareEnv } from "../env";

export const env = cloudflareEnv as CloudflareEnv;
