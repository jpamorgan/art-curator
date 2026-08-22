import {
  createStartHandler,
  defaultStreamHandler,
  type RequestHandler,
} from "@tanstack/react-start/server";
import { createServerEntry } from "@tanstack/react-start/server-entry";
import type { Register } from "@tanstack/react-router";

import { handleAgentRepresentation } from "@/middleware/agent-representations";

const startFetch = createStartHandler(defaultStreamHandler);

const fetch: RequestHandler<Register> = async (request, options) => {
  const agentResponse = await handleAgentRepresentation(request);
  return agentResponse ?? startFetch(request, options);
};

export default createServerEntry({ fetch });
