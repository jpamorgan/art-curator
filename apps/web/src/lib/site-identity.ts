import { createElement } from "react";

export const SITE_URL = "https://art.jpamorgan.com/";
export const SITE_NAME = "Art by John Philip Morgan";
export const SITE_DESCRIPTION =
  "A personal catalog for discovering and saving physical art, artists, galleries, and styles curated by John Philip Morgan.";

const CREATOR_ID = `${SITE_URL}#creator`;
const WEBSITE_ID = `${SITE_URL}#website`;

export const siteIdentityJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": CREATOR_ID,
      name: "John Philip Morgan",
      alternateName: "jpamorgan",
      url: "https://jpamorgan.com",
      sameAs: ["https://jpamorgan.com", "https://github.com/jpamorgan"],
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      url: SITE_URL,
      name: SITE_NAME,
      alternateName: "Art",
      description: SITE_DESCRIPTION,
      author: { "@id": CREATOR_ID },
      creator: { "@id": CREATOR_ID },
      publisher: { "@id": CREATOR_ID },
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}#application`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      applicationCategory: "MultimediaApplication",
      isAccessibleForFree: true,
      author: { "@id": CREATOR_ID },
      creator: { "@id": CREATOR_ID },
      isPartOf: { "@id": WEBSITE_ID },
    },
  ],
} as const;

// Keep future content changes from turning an inline JSON-LD script into executable markup.
export function serializeJsonLd(value: object) {
  return JSON.stringify(value).replace(/</gu, "\\u003c");
}

export const siteIdentityJsonLdText = serializeJsonLd(siteIdentityJsonLd);

export function SiteIdentityScript() {
  return createElement("script", {
    type: "application/ld+json",
    dangerouslySetInnerHTML: { __html: siteIdentityJsonLdText },
  });
}
