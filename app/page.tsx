import {
  BookOpen,
  ArrowRight,
  CalendarDays,
  Layers3,
  LockKeyhole,
} from "lucide-react";
import PlannerApp from "@/components/planner-app";
import { getSession, isDemo, missingConfig } from "@/lib/auth";

export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (session) return <PlannerApp login={session.login} demo={isDemo()} />;
  const missing = missingConfig();
  const params = await searchParams;
  return (
    <main className="welcome">
      <div className="brand">
        <span className="brand-icon">
          <BookOpen size={23} />
        </span>
        <strong>수업의 결</strong>
      </div>
      <div className="welcome-grid">
        <section>
          <span className="eyebrow">MY TEACHING JOURNAL</span>
          <h1>
            좋은 수업은
            <br />
            차곡차곡 쌓이니까.
          </h1>
          <p>
            단원의 큰 그림부터 오늘의 한 차시까지.
            <br />
            선생님의 생각과 기록이 이어지는 개인 수업 계획 공간입니다.
          </p>
          {params.auth_error && (
            <p className="error" role="alert">
              로그인하지 못했습니다. 허용된 GitHub 계정인지 확인하고 다시 시도해
              주세요.
            </p>
          )}
          {missing.length ? (
            <div className="setup-note">
              <strong>첫 사용을 위한 연결이 필요해요</strong>
              <p>
                프로젝트의 배포 안내에 따라 GitHub 로그인과 개인 저장소를 연결해
                주세요.
              </p>
              <small>설정 필요: {missing.join(", ")}</small>
            </div>
          ) : (
            <a className="button primary" href="/api/auth/login">
              GitHub로 내 공간 열기 <ArrowRight size={18} />
            </a>
          )}
          <p className="privacy">
            <LockKeyhole size={14} /> 허용된 선생님 계정만 접근할 수 있습니다.
          </p>
        </section>
        <aside className="welcome-paper">
          <span className="eyebrow">LESSON BY LESSON</span>
          <h2>
            내일의 수업을
            <br />
            조금 더 가볍게.
          </h2>
          <div>
            <CalendarDays />
            <p>
              <strong>날짜로 살펴보기</strong>
              <span>월간·주간 달력으로 수업의 흐름을 확인해요.</span>
            </p>
          </div>
          <div>
            <Layers3 />
            <p>
              <strong>준비상태로 정리하기</strong>
              <span>계획부터 수업 완료까지 한눈에 모아봐요.</span>
            </p>
          </div>
          <div>
            <BookOpen />
            <p>
              <strong>단원에서 차시로 이어가기</strong>
              <span>큰 계획을 학급별 수업으로 구체화해요.</span>
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
