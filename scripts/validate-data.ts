import { readFile } from "node:fs/promises";
import { plannerSchema } from "../lib/planner";

async function main() {
  const raw=JSON.parse(await readFile(new URL("../data/planner.json", import.meta.url), "utf8"));
  const {storageMigration,...records}=raw;
  const data=plannerSchema.safeParse(records);
  if(storageMigration)console.log('이 파일은 DB 이전 당시 보존본입니다. 최신 운영 기록은 클라우드 DB에서 읽으세요.');
  if (!data.success) {
    console.error(
      data.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("\n"),
    );
    process.exitCode = 1;
  } else
    console.log(
      `수업 ${data.data.lessons.length}개, 단원 ${data.data.units.length}개: 데이터 검증 통과`,
    );
}
main().catch(() => {
  console.error("data/planner.json을 읽거나 JSON으로 해석하지 못했습니다.");
  process.exitCode = 1;
});
