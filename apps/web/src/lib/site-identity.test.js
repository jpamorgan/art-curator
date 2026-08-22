import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  SiteIdentityScript,
  serializeJsonLd,
  siteIdentityJsonLdText,
} from "./site-identity";

const webRoot = new URL("../../", import.meta.url);

async function readWebFile(path) {
  return Bun.file(new URL(path, webRoot)).text();
}

describe("crawler-visible site identity", () => {
  test("publishes a connected Person, WebSite, and WebApplication graph", () => {
    const identity = JSON.parse(siteIdentityJsonLdText);
    const entities = identity["@graph"];
    const person = entities.find((entity) => entity["@type"] === "Person");
    const website = entities.find((entity) => entity["@type"] === "WebSite");
    const application = entities.find((entity) => entity["@type"] === "WebApplication");

    expect(identity["@context"]).toBe("https://schema.org");
    expect(person).toMatchObject({
      name: "John Philip Morgan",
      alternateName: "jpamorgan",
      sameAs: ["https://jpamorgan.com", "https://github.com/jpamorgan"],
    });
    expect(website).toMatchObject({
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      author: { "@id": person["@id"] },
      creator: { "@id": person["@id"] },
    });
    expect(application).toMatchObject({
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      author: { "@id": person["@id"] },
      creator: { "@id": person["@id"] },
      isPartOf: { "@id": website["@id"] },
    });
  });

  test("renders parseable JSON-LD in a server-rendered script", () => {
    const markup = renderToStaticMarkup(React.createElement(SiteIdentityScript));
    const scriptContent = markup.match(
      /^<script type="application\/ld\+json">([\s\S]+)<\/script>$/u,
    )?.[1];

    expect(scriptContent).toBeDefined();
    expect(JSON.parse(scriptContent)).toEqual(JSON.parse(siteIdentityJsonLdText));
  });

  test("escapes closing-script payloads without changing their JSON value", () => {
    const maliciousIdentity = {
      description: '</script><script>alert("json-ld injection")</script>',
    };
    const serialized = serializeJsonLd(maliciousIdentity);

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<script>");
    expect(JSON.parse(serialized)).toEqual(maliciousIdentity);
  });

  test("includes JSON-LD in the SSR document and canonical homepage metadata", async () => {
    const [rootRoute, homeRoute] = await Promise.all([
      readWebFile("src/routes/__root.tsx"),
      readWebFile("src/routes/index.tsx"),
    ]);

    expect(rootRoute).toContain("<SiteIdentityScript />");
    expect(homeRoute).toContain("Art by John Philip Morgan — Personal Art Discovery");
    expect(homeRoute).toContain('rel: "canonical", href: "https://art.jpamorgan.com/"');
    expect(homeRoute).toContain('{ name: "robots", content: "index, follow" }');
  });

  test("serves specific agent guidance and permits crawling", async () => {
    const [instructions, robots] = await Promise.all([
      readWebFile("public/llms.txt"),
      readWebFile("public/robots.txt"),
    ]);

    expect(instructions).toContain("## When to use Art");
    expect(instructions).toContain("https://api.art.jpamorgan.com/mcp");
    expect(instructions).toContain("`browse_art` tool");
    expect(instructions).toContain("individual John Philip Morgan");
    expect(robots).toBe("User-agent: *\nAllow: /\n");
  });
});
