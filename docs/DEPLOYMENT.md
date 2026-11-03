# 학교·집에서 사용하는 사이트 연결

배포와 OAuth 등록은 선생님 계정에서 진행합니다. 비밀키는 채팅이나 GitHub 파일에 붙여 넣지 않고 Vercel의 환경 변수 설정에서 입력합니다.

## 1. Private 저장소에 코드 준비

GitHub에서 `changmin0722zv-hash/teacher-s-helper`가 **Private**인지 확인합니다. `main` 브랜치에 이 프로젝트 파일들이 있어야 합니다. `package.json`, `app/`, `data/planner.json`이 저장소 최상위에 위치해야 합니다.

GitHub 웹 업로드를 사용한다면 프로젝트 폴더 자체보다 폴더 안의 파일들을 업로드합니다. `node_modules`, `.next`, `.local`, `.env.local`은 업로드하지 않습니다. `.env.example`에는 빈 설정 예시만 있습니다. 파일 수가 많으면 Git을 이용하는 편이 편리합니다.

## 2. Vercel 프로젝트 만들기

1. [Vercel](https://vercel.com/)에서 GitHub 계정으로 로그인합니다.
2. 새 프로젝트를 만들고 이 Private 저장소만 연결합니다.
3. 프레임워크는 **Next.js**, 저장소 루트는 기본값, Node.js는 **24.x**를 선택합니다.
4. 첫 배포를 합니다. 아직 자격증명이 없으므로 초기 연결 안내만 표시되고 수업 데이터에는 접근할 수 없습니다.
5. 고정 운영 주소를 확인합니다. 예: `https://내프로젝트.vercel.app`. 이후에는 이 주소를 학교·집에서 동일하게 사용합니다.

코드에는 데이터만 바뀐 커밋에서 불필요한 빌드를 건너뛰는 설정이 포함됩니다. DB 전환 후 앱은 PostgreSQL에서 데이터를 읽고 변경분을 저장하므로 수업 저장마다 커밋·새 배포가 필요하지 않습니다.

## 3. GitHub OAuth App 등록

GitHub의 **Settings → Developer settings → OAuth Apps → New OAuth App**으로 이동합니다.

| 항목                       | 입력                                               |
| -------------------------- | -------------------------------------------------- |
| Application name           | 수업의 결                                          |
| Homepage URL               | 위의 고정 운영 주소                                |
| Authorization callback URL | 고정 운영 주소 뒤에 `/api/auth/callback`을 붙인 값 |

Client ID를 확인하고 Client Secret을 생성합니다. 앱은 개인 Private 저장소에 읽고 쓰기 위해 OAuth의 `repo` 권한을 요청합니다. 이 OAuth 권한은 특정 저장소 하나로 한정되지 않습니다. 앱 자체의 저장 대상은 환경 변수에 지정한 한 저장소로 고정됩니다. 향후 저장소 단위로 권한을 제한하려면 GitHub App 인증으로 전환해야 합니다.

## 4. Vercel 환경 변수 등록

Vercel 프로젝트의 **Settings → Environment Variables**에서 아래 항목을 Production 환경에 등록합니다. 실제 운영 자격증명을 불필요하게 Preview나 다른 프로젝트에 공유하지 마세요.

| 이름                     | 값                                                |
| ------------------------ | ------------------------------------------------- |
| `DATABASE_URL` | Vercel Marketplace의 Neon 통합에서 연결한 서버 전용 PostgreSQL URL |
| `APP_URL`                | 고정 운영 주소. HTTPS이며 경로를 붙이지 않음      |
| `GITHUB_CLIENT_ID`       | OAuth App의 Client ID                             |
| `GITHUB_CLIENT_SECRET`   | OAuth App의 Client Secret. 민감정보로 저장        |
| `GITHUB_ALLOWED_USER_ID` | `342810672` (현재 저장소 소유자 계정)             |
| `SESSION_SECRET`         | 충분히 긴 임의 문자열, 최소 32자. 민감정보로 저장 |
| `GITHUB_OWNER`           | `changmin0722zv-hash`                             |
| `GITHUB_REPO`            | `teacher-s-helper`                                |
| `GITHUB_DATA_BRANCH`     | `main`                                            |

숫자 ID는 브라우저에서 `https://api.github.com/users/changmin0722zv-hash`를 열고 `id` 항목으로 확인합니다. 사용자명이나 `node_id`가 아닙니다. 이 숫자 ID가 일치하는 계정만 로그인할 수 있습니다.

`SESSION_SECRET`은 비밀번호 관리자에서 생성한 임의 문자열을 사용하거나 본인 컴퓨터의 Node.js에서 다음 명령으로 만들 수 있습니다. 결과는 본인이 직접 환경 변수 설정에 입력하고 공유하지 않습니다.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`LOCAL_DEMO`는 운영 설정에 추가하지 않습니다. 환경 변수를 저장한 뒤 Vercel에서 **Redeploy**합니다. OAuth 앱 주소와 `APP_URL`은 같은 운영 주소여야 합니다.

## 5. 실제 연결 확인

1. 운영 주소를 열고 GitHub로 로그인합니다. 다른 계정은 거절되어야 합니다.
2. 첫 로그인 후 앱이 기존 GitHub 원본을 DB에 보관하고, 파일 SHA를 비교해 원본에 동결 표시를 넣은 뒤 레코드 내용·개수를 확인하고 DB를 활성화합니다. 하단 저장 경로가 클라우드 DB인지 확인합니다.
3. 테스트 수업 또는 자료실 초안을 저장하고 새로고침하여 남아 있는지 확인합니다. 이후 일상 저장은 GitHub 커밋을 만들지 않습니다.
4. 다른 컴퓨터에서 로그인해 새로고침하고 같은 수업이 보이는지 확인합니다.
5. 수업 상태를 변경해 첫 컴퓨터에서도 최신 내용을 불러옵니다.
6. 확인용 수업을 삭제합니다. 이전 버전은 DB에 보존됩니다.

## 문제 해결

- **설정 필요 안내:** 필수 환경 변수를 등록한 뒤 재배포합니다.
- **로그인 실패:** OAuth 콜백 주소와 `APP_URL`, Client Secret, 허용된 숫자 사용자 ID를 확인합니다.
- **저장소/파일 없음:** Private 저장소 접근 권한, `main` 존재 여부, `data/planner.json` 경로를 확인합니다.
- **403 저장 실패:** OAuth의 저장소 권한, 조직의 앱 제한, API 사용 한도, 브랜치 보호 규칙을 확인합니다. 규칙을 무작정 해제하지 말고 개인 데이터 브랜치 등 적합한 운영 방식을 선택합니다.
- **충돌 안내:** 편집한 초안을 내려받고 최신 내용을 불러온 뒤 다시 편집합니다. 다른 컴퓨터나 Codex가 같은 파일을 먼저 저장한 경우입니다.
- **로그인 만료:** 로그인은 8시간 유지됩니다. 다시 로그인합니다.

클라우드 개발 환경에서 실제 GitHub API를 호출하려면 `github.com`과 `api.github.com` 접근이 필요합니다. Git 프록시를 통한 저장소 읽기가 된다고 OAuth·GitHub API 연결까지 되는 것은 아닙니다.

## 학교 행사 API 연결 (선택)

1. [나이스 교육정보 개방 포털](https://open.neis.go.kr/portal/guide/apiGuidePage.do)에서 로그인 후 인증키를 발급받습니다.
2. Vercel → teacher-s-helper → Settings → Environment Variables에서 `NEIS_API_KEY`를 만들고 발급받은 키를 Value로 저장합니다. Production 환경을 선택합니다.
3. 재배포 후 로그인한 앱의 ‘학교·기초시간표’에서 ‘학교 일정 새로고침’을 누릅니다.
4. 연결 성공 시 ‘최근 확인’ 시각이 나타납니다. 실제 학교 행사와 날짜·대상 학년을 대조합니다. 빈 응답과 연결 실패는 별도로 표시됩니다.

인증키는 서버에서만 사용합니다. 학교 일정 API도 기존 로그인이 필요하며 키나 원본 요청 URL을 응답에 노출하지 않습니다. 외부 인증키가 없는 자동화 테스트는 나이스 응답을 모의 처리하므로 실제 인증키 연결 성공을 보장하지 않습니다. 초기 연결 전에도 기초시간표·주별 일괄 등록을 사용할 수 있습니다.

## Neon 연결과 이전·복구

운영 빌드는 DB 연결과 추가 테이블/함수 생성을 검증하고 `CLOUD_DATABASE_CHECK_OK`를 남깁니다. pg_trgm 지원 시 본문 부분 검색 인덱스도 생성합니다. 빌드는 수업 기록을 이전하지 않습니다. 실제 이전은 소유자가 로그인한 운영 앱의 `/api/cloud` POST에서 진행합니다. 공개 GET은 내용·개수·ID 없이 `ready` / `awaiting-sign-in` / `unavailable` 상태만 반환합니다.

이전은 DB의 변경 불가 원본 스냅샷 준비 → GitHub 파일 SHA 기반 동결 → 레코드 삽입·원문/개수 대조·활성화 순서입니다. 중단되면 같은 원본에서 재개하며, 활성화 후 과거 파일로 DB를 덮어쓰지 않습니다. DB 연결이 끊겨도 GitHub 백업으로 조용히 되돌아가지 않습니다. DB 이전 이후 구버전 코드로 되돌리면 동결 표시 때문에 동작하지 않을 수 있으므로, 복구는 새 저장 경로를 유지하는 수정 배포로 진행합니다.

운영 DB와 Preview 환경변수가 공유되어 있어도 Preview 배포에서 조회·수정·이전을 거절합니다. 이 버전의 인증된 데이터 확인은 고정 운영 주소에서 수행합니다. 향후 별도 Preview DB를 운영하려면 독립 데이터·인증 경로를 먼저 마련해야 합니다.

기존 GitHub 원본은 이전 당시 백업입니다. 이후 자료 변경 버전은 DB에 보존되지만, 이것은 외부 백업이나 제공자의 복구 보장을 대신하지 않습니다. 요금제의 복구 보존 기간을 확인하고 PostgreSQL 전체 백업을 별도로 관리하세요. 새 DB로 연결을 바꿔 예전 GitHub 파일을 재수입하지 말고 실제 운영 DB를 복원해야 합니다.

Codex 실행 환경에 DB 자격증명이 설정되지 않았다면 Vercel 연결만으로 직접 데이터 수정 권한이 생기는 것은 아닙니다. 인증된 앱을 이용하거나 실행 환경의 비밀 설정으로 연결하고, 비밀번호/URL을 채팅·명령 인수·커밋에 남기지 않습니다.
