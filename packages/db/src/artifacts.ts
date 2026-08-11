export const ARTIFACT_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const ARTIFACT_CONTENT_TYPE = "image/jpeg";
export const ARTIFACT_MINIMUM_BYTES = 1_024;
export const ARTIFACT_MAX_FULL_BYTES = 12 * 1_024 * 1_024;
export const ARTIFACT_MAX_THUMBNAIL_BYTES = 4 * 1_024 * 1_024;
export const SEED_ARTIFACT_SOURCE_VERSION = "seed-2026-08-10-v1";

export type ArtworkArtifactVariant = "full" | "thumbnail";

export type ArtworkArtifactDescriptor = {
  artworkId: string;
  variant: ArtworkArtifactVariant;
  upstreamUrl: string;
  sourceVersion: string;
};

export type ArtworkArtifactExpectation = ArtworkArtifactDescriptor & {
  canonicalUpstreamUrl: string;
  fingerprint: string;
  key: string;
};

export type ArtworkArtifactSource = {
  artworkId: string;
  fullUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  attribution: string;
};

const ARTWORK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARTIFACT_FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const SOURCE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function isSafeArtworkId(value: string): boolean {
  return value.length > 0 && value.length <= 96 && ARTWORK_ID_PATTERN.test(value);
}

export function isArtifactFingerprint(value: string): boolean {
  return ARTIFACT_FINGERPRINT_PATTERN.test(value);
}

export function isArtifactSourceVersion(value: string): boolean {
  return SOURCE_VERSION_PATTERN.test(value);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [a = 0, b = 0, c = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function canonicalArtifactSourceUrl(value: string): string {
  if (value.length === 0 || value.length > 2_048) {
    throw new Error("Artifact source URL is invalid.");
  }

  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    hostname === "" ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "home.arpa" ||
    hostname.endsWith(".home.arpa") ||
    hostname === "localdomain" ||
    hostname.endsWith(".localdomain") ||
    hostname.includes(":") ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("Artifact source URL must use a public HTTPS host.");
  }

  url.hostname = hostname;
  url.hash = "";
  return url.toString();
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function artworkArtifactFingerprint(
  descriptor: ArtworkArtifactDescriptor,
): Promise<string> {
  if (
    !isSafeArtworkId(descriptor.artworkId) ||
    !isArtifactSourceVersion(descriptor.sourceVersion)
  ) {
    throw new Error("Artifact descriptor is invalid.");
  }
  const canonicalUrl = canonicalArtifactSourceUrl(descriptor.upstreamUrl);
  const encoded = new TextEncoder().encode(
    [
      "art-curator-artifact",
      "v2",
      descriptor.artworkId,
      descriptor.variant,
      canonicalUrl,
      descriptor.sourceVersion,
    ].join("\0"),
  );
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoded));
}

export function artworkArtifactKey(
  artworkId: string,
  variant: ArtworkArtifactVariant,
  fingerprint: string,
): string {
  if (!isSafeArtworkId(artworkId) || !isArtifactFingerprint(fingerprint)) {
    throw new Error("Artwork ID cannot be used as an artifact key.");
  }
  return `artworks/v2/${artworkId}/${fingerprint}/${variant}.jpg`;
}

export function artworkArtifactPath(artworkId: string, variant: ArtworkArtifactVariant): string {
  if (!isSafeArtworkId(artworkId)) {
    throw new Error("Artwork ID cannot be used as an artifact path.");
  }
  return `/artifacts/${artworkId}/${variant}.jpg`;
}

export function artworkArtifactUrl(
  origin: string,
  artworkId: string,
  variant: ArtworkArtifactVariant,
  fingerprint: string,
): string {
  if (!isArtifactFingerprint(fingerprint)) {
    throw new Error("Artifact fingerprint cannot be used in a public URL.");
  }
  const url = new URL(artworkArtifactPath(artworkId, variant), origin);
  url.searchParams.set("v", fingerprint);
  return url.toString();
}

export async function artworkArtifactExpectation(
  descriptor: ArtworkArtifactDescriptor,
): Promise<ArtworkArtifactExpectation> {
  const canonicalUpstreamUrl = canonicalArtifactSourceUrl(descriptor.upstreamUrl);
  const fingerprint = await artworkArtifactFingerprint({
    ...descriptor,
    upstreamUrl: canonicalUpstreamUrl,
  });
  return {
    ...descriptor,
    upstreamUrl: canonicalUpstreamUrl,
    canonicalUpstreamUrl,
    fingerprint,
    key: artworkArtifactKey(descriptor.artworkId, descriptor.variant, fingerprint),
  };
}

export function artworkArtifactContentDisposition(
  expectation: Pick<ArtworkArtifactExpectation, "artworkId" | "variant">,
): string {
  return `inline; filename="${expectation.artworkId}-${expectation.variant}.jpg"`;
}

export function artworkArtifactCustomMetadata(
  expectation: ArtworkArtifactExpectation,
): Record<string, string> {
  return {
    sourceFingerprint: expectation.fingerprint,
    sourceVersion: expectation.sourceVersion,
    variant: expectation.variant,
  };
}

export function artworkArtifactMaximumBytes(variant: ArtworkArtifactVariant): number {
  return variant === "full" ? ARTIFACT_MAX_FULL_BYTES : ARTIFACT_MAX_THUMBNAIL_BYTES;
}

export function storedArtworkArtifactMatches(
  object: {
    key: string;
    size: number;
    httpMetadata?: {
      contentType?: string;
      cacheControl?: string;
      contentDisposition?: string;
    };
    customMetadata?: Record<string, string>;
  } | null,
  expectation: ArtworkArtifactExpectation,
): boolean {
  const expectedCustomMetadata = artworkArtifactCustomMetadata(expectation);
  return Boolean(
    object &&
    object.key === expectation.key &&
    object.size >= ARTIFACT_MINIMUM_BYTES &&
    object.size <= artworkArtifactMaximumBytes(expectation.variant) &&
    object.httpMetadata?.contentType === ARTIFACT_CONTENT_TYPE &&
    object.httpMetadata.cacheControl === ARTIFACT_CACHE_CONTROL &&
    object.httpMetadata.contentDisposition === artworkArtifactContentDisposition(expectation) &&
    object.customMetadata?.sourceFingerprint === expectedCustomMetadata.sourceFingerprint &&
    object.customMetadata?.sourceVersion === expectedCustomMetadata.sourceVersion &&
    object.customMetadata?.variant === expectedCustomMetadata.variant,
  );
}

// The upstream delivery URLs are import inputs only. Runtime clients receive app-controlled
// artifact URLs; source pages and license text remain here and in D1 for provenance/resync.
export const ARTWORK_ARTIFACT_SOURCES = [
  {
    artworkId: "moma-starry-night",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Van%20Gogh%20-%20Starry%20Night%20-%20Google%20Art%20Project.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Van%20Gogh%20-%20Starry%20Night%20-%20Google%20Art%20Project.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "louvre-mona-lisa",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Mona%20Lisa%2C%20by%20Leonardo%20da%20Vinci%2C%20from%20C2RMF%20retouched.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Mona%20Lisa%2C%20by%20Leonardo%20da%20Vinci%2C%20from%20C2RMF%20retouched.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "mauritshuis-girl-pearl-earring",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Meisje%20met%20de%20parel.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Meisje%20met%20de%20parel.jpg?width=843",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Meisje_met_de_parel.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "met-great-wave",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Tsunami%20by%20hokusai%2019th%20century.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Tsunami%20by%20hokusai%2019th%20century.jpg?width=843",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Tsunami_by_hokusai_19th_century.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "aic-water-lilies",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Claude%20Monet%20-%20Water%20Lilies%20-%201933.1157%20-%20Art%20Institute%20of%20Chicago.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Claude%20Monet%20-%20Water%20Lilies%20-%201933.1157%20-%20Art%20Institute%20of%20Chicago.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Claude_Monet_-_Water_Lilies_-_1933.1157_-_Art_Institute_of_Chicago.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "aic-grande-jatte",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/A%20Sunday%20on%20La%20Grande%20Jatte%2C%20Georges%20Seurat%2C%201884.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/A%20Sunday%20on%20La%20Grande%20Jatte%2C%20Georges%20Seurat%2C%201884.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:A_Sunday_on_La_Grande_Jatte,_Georges_Seurat,_1884.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "belvedere-the-kiss",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Kiss%20-%20Gustav%20Klimt%20-%20Google%20Cultural%20Institute.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Kiss%20-%20Gustav%20Klimt%20-%20Google%20Cultural%20Institute.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:The_Kiss_-_Gustav_Klimt_-_Google_Cultural_Institute.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "uffizi-birth-venus",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Sandro%20Botticelli%20-%20La%20nascita%20di%20Venere%20-%20Google%20Art%20Project%20-%20edited.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Sandro%20Botticelli%20-%20La%20nascita%20di%20Venere%20-%20Google%20Art%20Project%20-%20edited.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Sandro_Botticelli_-_La_nascita_di_Venere_-_Google_Art_Project_-_edited.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "rijksmuseum-night-watch",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Nightwatch%20by%20Rembrandt%20-%20Rijksmuseum.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Nightwatch%20by%20Rembrandt%20-%20Rijksmuseum.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:The_Nightwatch_by_Rembrandt_-_Rijksmuseum.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "rijksmuseum-milkmaid",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Johannes%20Vermeer%20-%20Het%20melkmeisje%20-%20Google%20Art%20Project.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Johannes%20Vermeer%20-%20Het%20melkmeisje%20-%20Google%20Art%20Project.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Johannes_Vermeer_-_Het_melkmeisje_-_Google_Art_Project.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "prado-las-meninas",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Las%20Meninas%2C%20by%20Diego%20Vel%C3%A1zquez%2C%20from%20Prado%20in%20Google%20Earth.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Las%20Meninas%2C%20by%20Diego%20Vel%C3%A1zquez%2C%20from%20Prado%20in%20Google%20Earth.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Las_Meninas,_by_Diego_Vel%C3%A1zquez,_from_Prado_in_Google_Earth.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "prado-third-may",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/El%20Tres%20de%20Mayo%2C%20by%20Francisco%20de%20Goya%2C%20from%20Prado%20in%20Google%20Earth.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/El%20Tres%20de%20Mayo%2C%20by%20Francisco%20de%20Goya%2C%20from%20Prado%20in%20Google%20Earth.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:El_Tres_de_Mayo,_by_Francisco_de_Goya,_from_Prado_in_Google_Earth.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "hamburg-wanderer",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Caspar%20David%20Friedrich%20-%20Wanderer%20above%20the%20sea%20of%20fog.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Caspar%20David%20Friedrich%20-%20Wanderer%20above%20the%20sea%20of%20fog.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "louvre-liberty",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Eug%C3%A8ne%20Delacroix%20-%20La%20libert%C3%A9%20guidant%20le%20peuple.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Eug%C3%A8ne%20Delacroix%20-%20La%20libert%C3%A9%20guidant%20le%20peuple.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Eug%C3%A8ne_Delacroix_-_La_libert%C3%A9_guidant_le_peuple.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "orsay-whistlers-mother",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Whistlers%20Mother%20high%20res.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Whistlers%20Mother%20high%20res.jpg?width=843",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Whistlers_Mother_high_res.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "orsay-olympia",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Edouard%20Manet%20-%20Olympia%20-%20Google%20Art%20Project%203.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Edouard%20Manet%20-%20Olympia%20-%20Google%20Art%20Project%203.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Edouard_Manet_-_Olympia_-_Google_Art_Project_3.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "orsay-moulin-galette",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Renoir%2C%20Pierre-Auguste%20-%20Dance%20at%20Le%20Moulin%20de%20la%20Galette%2C%201876.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Renoir%2C%20Pierre-Auguste%20-%20Dance%20at%20Le%20Moulin%20de%20la%20Galette%2C%201876.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Renoir,_Pierre-Auguste_-_Dance_at_Le_Moulin_de_la_Galette,_1876.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "orsay-gleaners",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Jean-Fran%C3%A7ois%20Millet%20-%20Gleaners%20-%20Google%20Art%20Project%202.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Jean-Fran%C3%A7ois%20Millet%20-%20Gleaners%20-%20Google%20Art%20Project%202.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Jean-Fran%C3%A7ois_Millet_-_Gleaners_-_Google_Art_Project_2.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "national-gallery-arnolfini",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Van%20Eyck%20-%20Arnolfini%20Portrait.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Van%20Eyck%20-%20Arnolfini%20Portrait.jpg?width=843",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Van_Eyck_-_Arnolfini_Portrait.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "national-gallery-temeraire",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Fighting%20Temeraire%2C%20JMW%20Turner%2C%20National%20Gallery.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20Fighting%20Temeraire%2C%20JMW%20Turner%2C%20National%20Gallery.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:The_Fighting_Temeraire,_JMW_Turner,_National_Gallery.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "national-gallery-hay-wain",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/John-constable-the-hay-wain.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/John-constable-the-hay-wain.jpg?width=843",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:John-constable-the-hay-wain.jpg",
    attribution: "Image via Wikimedia Commons, CC0.",
  },
  {
    artworkId: "marmottan-impression-sunrise",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Monet%20-%20Impression%2C%20Sunrise.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Monet%20-%20Impression%2C%20Sunrise.jpg?width=843",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Monet_-_Impression,_Sunrise.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "wallace-the-swing",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Joean%20Honor%C3%A9%20Fragonard%20-%20The%20Swing.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Joean%20Honor%C3%A9%20Fragonard%20-%20The%20Swing.jpg?width=843",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Joean_Honor%C3%A9_Fragonard_-_The_Swing.jpg",
    attribution: "Image via Wikimedia Commons, Public domain.",
  },
  {
    artworkId: "vatican-school-athens",
    fullUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20School%20of%20Athens-Vatican.jpg?width=1686",
    thumbnailUrl:
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/The%20School%20of%20Athens-Vatican.jpg?width=843",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:The_School_of_Athens-Vatican.jpg",
    attribution: "Photograph by Joseolgon via Wikimedia Commons, CC BY 4.0.",
  },
] as const satisfies readonly ArtworkArtifactSource[];
