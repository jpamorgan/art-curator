import { toORPCError } from "@orpc/client";

import {
  getAgentFacingResponse,
  type MarkdownCatalog,
  type MarkdownEntity,
} from "@/lib/agent-responses";
import { agentCatalogClient } from "@/lib/server-agent-catalog";

const markdownCatalog: MarkdownCatalog = {
  async listEntities(kind) {
    if (kind === "artists") return (await agentCatalogClient.artists.list()).items;
    if (kind === "galleries") return (await agentCatalogClient.galleries.list()).items;
    return (await agentCatalogClient.styles.list()).items;
  },

  async getArtwork(slug) {
    return findOptional(async () => (await agentCatalogClient.artworks.bySlug({ slug })).artwork);
  },

  async getEntity(kind, slug) {
    if (kind === "artists") {
      return findOptional(async () => (await agentCatalogClient.artists.bySlug({ slug })).artist);
    }
    if (kind === "galleries") {
      return findOptional(
        async () => (await agentCatalogClient.galleries.bySlug({ slug })).gallery,
      );
    }
    return findOptional(async () => (await agentCatalogClient.styles.bySlug({ slug })).style);
  },

  async listSitemapEntries() {
    return (await agentCatalogClient.artworks.sitemap()).entries;
  },
};

async function findOptional(load: () => Promise<MarkdownEntity>): Promise<MarkdownEntity | null>;
async function findOptional<T>(load: () => Promise<T>): Promise<T | null>;
async function findOptional<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    if (toORPCError(error).code === "NOT_FOUND") return null;
    throw error;
  }
}

export function handleAgentRepresentation(request: Request) {
  return getAgentFacingResponse(request, markdownCatalog);
}
