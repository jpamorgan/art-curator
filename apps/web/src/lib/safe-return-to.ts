const DEFAULT_RETURN_TO = "/favorites";
const RETURN_TO_BASE = "https://art.jpamorgan.com";

function hasControlOrBackslash(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return character === "\\" || code <= 31 || code === 127;
  });
}

function hasEncodedRedirectSeparator(value: string) {
  let normalized = value;
  let previous: string;

  do {
    previous = normalized;
    normalized = normalized.replaceAll(/%25/gi, "%");
  } while (normalized !== previous);

  const path = normalized.split(/[?#]/u, 1)[0] ?? normalized;
  return /^\/%2f/iu.test(path) || /%5c/iu.test(normalized);
}

function isSafeLocalPath(value: string) {
  if (
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    hasControlOrBackslash(value) ||
    hasEncodedRedirectSeparator(value)
  ) {
    return false;
  }

  try {
    return new URL(value, RETURN_TO_BASE).origin === RETURN_TO_BASE;
  } catch {
    return false;
  }
}

export function getSafeReturnTo(value: string | undefined) {
  return value && isSafeLocalPath(value) ? value : DEFAULT_RETURN_TO;
}
