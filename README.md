# K-에듀파인 협의체 안건 찾기

시·도 업무협의체의 과거 안건을 검색하고, 비슷한 안건과 당시 검토 결과를 확인하는 챗봇형 웹 시제품입니다.

현재는 `app/page.tsx`에 들어 있는 예시 데이터로 동작합니다. 실제 협의체 문서 연동 전까지는 화면과 검색 흐름을 검토하는 용도로 사용할 수 있습니다.

## 로컬 실행

### 준비물

- Node.js `22.13.0` 이상
- Git

### 실행 방법

```bash
git clone <내 GitHub 저장소 주소>
cd k-edu-agenda-finder
npm install
npm run dev
```

터미널에 표시되는 로컬 주소를 브라우저에서 열면 됩니다. 종료할 때는 터미널에서 `Ctrl+C`를 누르세요.

## GitHub에 처음 올리기

GitHub에서 빈 저장소를 만든 뒤 이 프로젝트 폴더에서 실행합니다.

```bash
git remote rename origin sites
git remote add origin https://github.com/<아이디>/<저장소명>.git
git push -u origin main
```

기존 `origin`은 ChatGPT Sites 소스 저장소를 가리키므로 `sites`라는 이름으로 보존합니다. 이후 작업은 보통 아래 순서로 관리할 수 있습니다.

```bash
git add .
git commit -m "변경 내용 설명"
git push origin main
```

## 주요 수정 위치

- `app/page.tsx`: 화면, 예시 안건 데이터, 검색 로직
- `app/globals.css`: 색상과 공통 스타일
- `app/layout.tsx`: 사이트 제목과 메타데이터
- `public/favicon.svg`: 브라우저 아이콘
- `.openai/hosting.json`: ChatGPT Sites 프로젝트 연결 정보(비밀키는 아님)

## 배포용 빌드 확인

```bash
npm run build
```

`npm run build`는 Linux/macOS 또는 GitHub Actions 같은 Linux 환경에서 실행하는 것을 권장합니다. Windows에서는 로컬 개발용 `npm run dev`를 사용할 수 있습니다.

## 현재 검색 방식

사용자가 입력한 문장과 각 안건의 제목, 요약, 키워드를 단순 비교해 유사한 순서로 최대 3건을 보여줍니다. 실제 운영용으로 확장하려면 문서 업로드, 데이터베이스 저장, 의미 기반 검색을 별도로 연결해야 합니다.

---

## Sites 개발 참고

## Sites Lifecycle

The Sites lifecycle CLI runs the locked dependency install before returning this checkout. Edit the source under `app/`, then checkpoint when a coherent milestone is ready to inspect or share. The remote Sites builder runs `npm run build` against the pushed commit. Do not repeat install or build as a normal pre-checkpoint step.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from `oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build and verify the rendered development-preview metadata
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
