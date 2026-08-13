import { canonicalArtifactSourceUrl } from "@art/db/artifacts";
import { z } from "zod";

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
    url: publicHttpsUrl,
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
