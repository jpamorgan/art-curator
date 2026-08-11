import type { BucketProps } from "alchemy/cloudflare";

export const ARTWORK_BUCKET_RESOURCE_ID = "artwork-artifacts";
export const PRODUCTION_STAGE = "production";

export function artworkBucketName(stage: string): string {
  if (stage === PRODUCTION_STAGE) {
    return "art-curator-artifacts";
  }

  const safeStage = stage
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return `art-curator-${safeStage || "local"}-artifacts`;
}

export function artworkBucketProps(stage: string): BucketProps {
  return {
    name: artworkBucketName(stage),
    storageClass: "Standard",
    devDomain: false,
    adopt: stage === PRODUCTION_STAGE,
    delete: stage !== PRODUCTION_STAGE,
    empty: false,
  };
}
