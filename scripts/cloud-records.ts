import { readFile, writeFile } from "node:fs/promises";
import { readCloud, saveCloud } from "../lib/cloud-storage";
import { dbConfigured } from "../lib/cloud-db";
import { plannerSchema } from "../lib/planner";
import { z } from "zod";

// Credentials must be supplied by a configured execution environment. Never put
// DATABASE_URL in a command argument, commit, or chat message.
async function main() {
  if (!dbConfigured()) throw new Error("configured DB connection required");
  const [action, file] = process.argv.slice(2);
  if (!file || !["export", "apply"].includes(action)) throw new Error("usage");
  if (action === "export") {
    const snapshot = await readCloud();
    await writeFile(file, JSON.stringify(snapshot, null, 2) + "\n", {
      mode: 0o600,
    });
    console.log(
      "클라우드 수업 기록과 충돌 검사 버전을 지정 파일에 저장했습니다.",
    );
  } else {
    const parsed = z
      .object({
        data: plannerSchema,
        sha: z.string().regex(/^[a-f0-9]{40,64}$/),
      })
      .passthrough()
      .parse(JSON.parse(await readFile(file, "utf8")));
    await saveCloud(parsed.data, parsed.sha);
    console.log(
      "클라우드 DB에 저장했습니다. GitHub 데이터 파일은 수정하지 않았습니다.",
    );
  }
}
main().catch(() => {
  console.error(
    "작업을 완료하지 못했습니다. 설정된 DB 연결, 파일 형식, 최신 버전을 확인하세요. 사용법: npm run cloud:records -- export|apply <파일>",
  );
  process.exitCode = 1;
});
