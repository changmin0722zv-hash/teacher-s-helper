import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_PLANNER } from "../lib/planner";
import { readPlanner, savePlanner, StorageError } from "../lib/storage";

test("GitHub read and write preserve base64 UTF-8 and pass the exact revision", async () => {
  const originalFetch = globalThis.fetch;
  const originalDemo = process.env.LOCAL_DEMO;
  process.env.LOCAL_DEMO = "false";
  const sha = "a".repeat(40);
  let called = 0;
  try {
    globalThis.fetch = async (input, init) => {
      called++;
      assert.match(String(input), /\/contents\/data\/planner\.json/);
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer test-token",
      );
      if (init?.method === "PUT") {
        const body = JSON.parse(init.body as string);
        assert.equal(body.sha, sha);
        assert.deepEqual(
          JSON.parse(Buffer.from(body.content, "base64").toString("utf8")),
          EMPTY_PLANNER,
        );
        return Response.json({ content: { sha: "b".repeat(40) } });
      }
      return Response.json({
        sha,
        encoding: "base64",
        content: Buffer.from(JSON.stringify(EMPTY_PLANNER)).toString("base64"),
      });
    };
    const initial = await readPlanner("test-token");
    const saved = await savePlanner("test-token", initial.data, initial.sha);
    assert.equal(saved.sha, "b".repeat(40));
    assert.equal(called, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDemo === undefined) delete process.env.LOCAL_DEMO;
    else process.env.LOCAL_DEMO = originalDemo;
  }
});
test("stale GitHub writes return a conflict and never retry by overwriting", async () => {
  const originalFetch = globalThis.fetch;
  const originalDemo = process.env.LOCAL_DEMO;
  process.env.LOCAL_DEMO = "false";
  let called = 0;
  try {
    globalThis.fetch = async () => {
      called++;
      return new Response(null, { status: 409 });
    };
    await assert.rejects(
      savePlanner("test-token", EMPTY_PLANNER, "a".repeat(40)),
      (error: unknown) => error instanceof StorageError && error.status === 409,
    );
    assert.equal(called, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDemo === undefined) delete process.env.LOCAL_DEMO;
    else process.env.LOCAL_DEMO = originalDemo;
  }
});
