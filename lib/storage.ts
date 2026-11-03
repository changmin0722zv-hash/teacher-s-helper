import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  EMPTY_PLANNER,
  plannerSchema,
  type Planner,
  type Snapshot,
} from "./planner";
import { isDemo } from "./auth";

import { StorageError } from "./storage-error";
export { StorageError } from "./storage-error";
import { dbConfigured } from "./cloud-db";
import { readCloud, saveCloud, type ImportSource } from "./cloud-storage";
export const MAX_DATA_BYTES = 900000;
function githubPath() {
  const owner = process.env.GITHUB_OWNER || "changmin0722zv-hash";
  const repo = process.env.GITHUB_REPO || "teacher-s-helper";
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/data/planner.json`;
}
export async function githubFetch(
  url: string,
  token: string,
  init: RequestInit = {},
) {
  return fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}
function handleFailure(status: number): never {
  if (status === 409 || status === 422)
    throw new StorageError(
      409,
      "다른 곳에서 변경된 내용이 있습니다. 최신 내용을 불러온 뒤 다시 저장해 주세요.",
    );
  if (status === 401)
    throw new StorageError(
      401,
      "GitHub 인증이 만료되었습니다. 다시 로그인해 주세요.",
    );
  if (status === 403)
    throw new StorageError(
      403,
      "GitHub 저장소 접근 권한 또는 API 사용 한도를 확인해 주세요.",
    );
  if (status === 404)
    throw new StorageError(
      404,
      "저장소 또는 data/planner.json 파일을 찾을 수 없습니다. 배포 안내를 확인해 주세요.",
    );
  throw new StorageError(
    502,
    "GitHub에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  );
}
const demoFile = () => path.join(process.cwd(), ".local", "planner.json");
async function readDemo(): Promise<Snapshot> {
  let text: string;
  try {
    text = await readFile(demoFile(), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    text = JSON.stringify(EMPTY_PLANNER, null, 2) + "\n";
  }
  return {
    data: plannerSchema.parse(JSON.parse(text)),
    sha: createHash("sha256").update(text).digest("hex"),
  };
}
export async function readPlanner(token: string): Promise<Snapshot> {
  if (isDemo()) return readDemo();
  if (dbConfigured()) return readCloud();
  const result = await readGitHubSource(token);
  if (result.marker)
    throw new StorageError(
      503,
      "기록은 DB로 이전되었습니다. DATABASE_URL 연결을 복구해 주세요.",
    );
  return { data: result.data, sha: result.sha, backend: "github" };
}
export async function readGitHubSource(token: string): Promise<ImportSource> {
  const response = await githubFetch(
    githubPath() +
      "?ref=" +
      encodeURIComponent(process.env.GITHUB_DATA_BRANCH || "main"),
    token,
  );
  if (!response.ok) handleFailure(response.status);
  const body = await response.json();
  if (body.encoding !== "base64" || typeof body.content !== "string")
    throw new StorageError(422, "수업 데이터 형식을 읽을 수 없습니다.");
  const { storageMigration, ...data } = JSON.parse(
    Buffer.from(body.content, "base64").toString("utf8"),
  );
  const parsed = plannerSchema.safeParse(data);
  if (!parsed.success)
    throw new StorageError(
      422,
      "저장소 데이터 형식이 올바르지 않습니다. Codex에서 validate:data로 확인해 주세요.",
    );
  return { data: parsed.data, sha: body.sha, marker: storageMigration };
}
export async function freezeGitHub(
  token: string,
  state: { data: Planner; sha: string; id: string },
) {
  const content =
    JSON.stringify(
      {
        ...state.data,
        storageMigration: {
          id: state.id,
          sourceSha: state.sha,
          backend: "database",
          frozenAt: new Date().toISOString(),
        },
      },
      null,
      2,
    ) + "\n";
  const response = await githubFetch(githubPath(), token, {
    method: "PUT",
    body: JSON.stringify({
      message: "수업의 결: 클라우드 DB 이전 원본 보존",
      sha: state.sha,
      content: Buffer.from(content).toString("base64"),
      branch: process.env.GITHUB_DATA_BRANCH || "main",
    }),
  });
  if (!response.ok) handleFailure(response.status);
}
let demoQueue: Promise<unknown> = Promise.resolve();
export async function savePlanner(
  token: string,
  data: Planner,
  sha: string,
): Promise<Snapshot> {
  if (!isDemo() && dbConfigured()) return saveCloud(data, sha);
  const content = JSON.stringify(plannerSchema.parse(data), null, 2) + "\n";
  if (Buffer.byteLength(content) > MAX_DATA_BYTES)
    throw new StorageError(
      413,
      "수업 데이터가 저장 한도(900KB)를 넘었습니다. 이전 학년도 기록을 분리해 주세요.",
    );
  if (isDemo()) {
    const task = demoQueue.then(async () => {
      const current = await readDemo();
      if (current.sha !== sha) handleFailure(409);
      await mkdir(path.dirname(demoFile()), { recursive: true });
      const temporary = demoFile() + ".tmp";
      await writeFile(temporary, content, "utf8");
      await rename(temporary, demoFile());
      return { data, sha: createHash("sha256").update(content).digest("hex") };
    });
    demoQueue = task.catch(() => {});
    return task;
  }
  const response = await githubFetch(githubPath(), token, {
    method: "PUT",
    body: JSON.stringify({
      message: "수업 도우미: 수업 및 단원 계획 저장",
      content: Buffer.from(content).toString("base64"),
      sha,
      branch: process.env.GITHUB_DATA_BRANCH || "main",
    }),
  });
  if (!response.ok) handleFailure(response.status);
  const body = await response.json();
  return { data, sha: body.content.sha };
}
