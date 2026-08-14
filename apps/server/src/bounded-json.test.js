import { describe, expect, test } from "bun:test";

import { BoundedJsonError, readBoundedJson } from "./bounded-json";

function request(body, headers = {}) {
  return new Request("https://api.art.jpamorgan.com/internal/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

async function rejection(body, headers, maximumBytes = 64) {
  try {
    await readBoundedJson(request(body, headers), maximumBytes);
    throw new Error("expected bounded JSON rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(BoundedJsonError);
    return error;
  }
}

describe("bounded JSON reader", () => {
  test("accepts strict JSON media types and reconstructs multiple stream chunks once", async () => {
    for (const contentType of [
      "application/json",
      "APPLICATION/JSON; CHARSET=UTF-8",
      'application/json; charset="utf-8"',
    ]) {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"url":"https://'));
          controller.enqueue(new TextEncoder().encode('example.com"}'));
          controller.close();
        },
      });
      await expect(
        readBoundedJson(request(stream, { "Content-Type": contentType }), 64),
      ).resolves.toEqual({ url: "https://example.com" });
    }
  });

  test("rejects ambiguous media types and invalid declared lengths", async () => {
    for (const contentType of ["text/plain", "application/jsonp", "application/json; profile=x"]) {
      const error = await rejection("{}", { "Content-Type": contentType });
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "media_type",
        status: 415,
      });
    }
    for (const length of ["-1", "1.5", "not-a-number"]) {
      const error = await rejection("{}", { "Content-Length": length });
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "content_length",
        status: 400,
      });
    }
  });

  test("enforces both declared and streamed byte limits and cancels an oversized stream", async () => {
    const declared = await rejection("{}", { "Content-Length": "65" });
    expect({ reason: declared.reason, status: declared.status }).toEqual({
      reason: "too_large",
      status: 413,
    });

    let cancelled = false;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(65));
      },
      cancel() {
        cancelled = true;
      },
    });
    const streamed = await rejection(stream, {}, 64);
    expect({ reason: streamed.reason, status: streamed.status }).toEqual({
      reason: "too_large",
      status: 413,
    });
    expect(cancelled).toBe(true);
  });

  test("rejects malformed JSON and invalid UTF-8 with the same bounded error", async () => {
    for (const body of ["", "{", new Uint8Array([0xff, 0xfe])]) {
      const error = await rejection(body, {});
      expect({ reason: error.reason, status: error.status }).toEqual({
        reason: "invalid_json",
        status: 400,
      });
    }
  });
});
