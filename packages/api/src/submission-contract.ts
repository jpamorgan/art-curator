import { canonicalArtifactSourceUrl } from "@art/db/artifacts";
import { z } from "zod";

export const submissionKinds = ["artwork", "artist", "collection"] as const;
export const submissionStatuses = ["pending", "reviewing", "accepted", "rejected"] as const;

export type SubmissionKind = (typeof submissionKinds)[number];
export type SubmissionStatus = (typeof submissionStatuses)[number];

const publicHttpsUrl = z
  .string()
  .trim()
  .min(1)
  .max(2_048)
  .transform((value, context) => {
    try {
      return canonicalSubmissionUrl(value);
    } catch {
      context.addIssue({ code: "custom", message: "Use a public HTTPS URL." });
      return z.NEVER;
    }
  });

export const createSubmissionSchema = z
  .object({
    kind: z.enum(submissionKinds),
    url: publicHttpsUrl,
  })
  .strict();

export const resolveSubmissionSchema = z
  .object({
    expectedStatus: z.enum(submissionStatuses),
    expectedUpdatedAt: z.iso.datetime({ offset: true }),
    status: z.enum(submissionStatuses),
    reviewNote: z.string().trim().min(1).max(500).nullable().optional(),
    resolvedArtworkId: z
      .string()
      .trim()
      .min(1)
      .max(96)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .nullable()
      .optional(),
  })
  .strict();

export function canonicalSubmissionUrl(value: string): string {
  const url = new URL(canonicalArtifactSourceUrl(value.trim()));
  const hostname = url.hostname.toLowerCase();
  for (const key of Array.from(url.searchParams.keys())) {
    const normalizedKey = key.toLowerCase();
    const isSocialShareParameter =
      ((hostname === "x.com" || hostname === "www.x.com" || hostname.endsWith(".twitter.com")) &&
        ["s", "t"].includes(normalizedKey)) ||
      (hostname.endsWith("instagram.com") && normalizedKey === "igsh");
    if (
      normalizedKey.startsWith("utm_") ||
      ["fbclid", "gclid"].includes(normalizedKey) ||
      isSocialShareParameter
    ) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}
