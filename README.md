# K-AGORA · K-에듀파인 업무협의체 안건 검색

기획서의 1단계 시제품을 구현한 내부 검토용 웹 애플리케이션입니다. 자연어 형태의 질문으로 협의체 안건을 검색하고 당시 요구사항과 답변을 함께 확인합니다.

## 구현 범위

- 챗봇형 질문 입력, 결과에 근거한 답변 요약, 검색 근거와 관련도 순위
- 협의체명·회차·일자·시도·업무 분야·요구사항·기대효과·검토 의견·답변·반영 상태 상세 보기
- 연도·분기·지역·업무 분야·반영 상태 복합 필터
- 실제 등록 건수, 새 검색, 브라우저별 최근 검색 8개 및 기록 삭제
- 관리자 키로 보호한 안건 등록·수정·삭제, JSON 일괄 가져오기·내보내기
- SQLite 영구 저장, 안건번호 중복 방지, 일괄 가져오기 트랜잭션
- 데스크톱·모바일 반응형 화면

**데이터는 가상 예시 8건입니다. 실제 교육청의 회의·검토 결과가 아닙니다.** 검색은 한국어 동의어 확장과 텍스트 관련도 계산입니다. 임베딩·LLM 기반 의미 검색이나 생성형 AI는 사용하지 않습니다. 점수는 정확도 백분율이 아니며 낮은 점수의 결과는 담당자가 확인해야 합니다. 답변은 검색 1위 안건의 저장된 내용을 조합합니다.

## 로컬 실행

Python **3.12 이상**만 필요하며 서버 실행에 외부 Python 패키지나 Node.js 설치가 필요 없습니다.

```bash
python3 -m agora.server
```

기본 포트는 8000이며 기본 바인딩은 로컬입니다. 실행 시 처음 한 번 예시 데이터가 생성됩니다. 관리 기능은 기본적으로 잠겨 있습니다. 관리가 필요하면 충분히 긴 무작위 키를 안전한 환경변수 주입 방식으로 `ADMIN_TOKEN`에 설정하고 서버를 시작하세요. 화면의 ‘안건 등록·관리’에서 같은 키를 입력합니다. Python 직접 실행은 `.env`를 자동 로드하지 않습니다.

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Python 직접 실행 바인딩 |
| `PORT` | `8000` | 서버 포트 |
| `DATABASE_PATH` | `data/agora.sqlite3` | SQLite 파일 위치 |
| `SEED_DEMO` | `true` | 첫 초기화 때 가상 예시 8건 추가 |
| `ADMIN_TOKEN` | 미설정 | 없으면 관리 API 사용 불가 |

실데이터를 등록할 때는 **첫 실행 전에 `SEED_DEMO=false`**를 설정해 빈 DB로 시작하세요. 기존 DB의 예시 데이터는 이 설정만으로 삭제되지 않습니다. 관리 화면에서 삭제할 수 있으며 재시작해도 삭제한 예시가 되살아나지 않습니다. 최근 검색은 브라우저 localStorage에 저장됩니다.

## 테스트

```bash
python3 -m unittest discover -s tests -v
```

GitHub push/PR에서도 같은 테스트를 실행하도록 Actions 워크플로를 포함했습니다.

서버·DB 임시 생성 후 검색, 무관한 질문, 필터, CRUD, 재연결 영속성, 입력 검증, 관리 인증, JSON 입출력, 중복 시 전체 롤백 등 **11개 테스트**를 실행합니다.

선택적으로 실제 브라우저를 검증하려면 테스트 전용 DB와 관리자 키로 서버를 띄우세요. 이 스크립트는 예시 8건 상태를 기대하며 테스트 안건을 생성·수정·삭제하므로 운영 DB에서는 실행하지 마세요.

```bash
# 터미널 1: 버전 관리에서 제외되는 테스트 DB를 사용
DATABASE_PATH=.test-artifacts/browser.sqlite3 ADMIN_TOKEN=ui-test-only python3 -m agora.server

# 터미널 2: 별도 임시 디렉터리에 Playwright 설치
npm install --prefix /tmp/k-agora-browser-tools playwright@1.62.0
/tmp/k-agora-browser-tools/node_modules/.bin/playwright install chromium
NODE_PATH=/tmp/k-agora-browser-tools/node_modules node scripts/browser-smoke.cjs
```

시스템 Chromium을 쓰면 `CHROMIUM_PATH=/usr/bin/chromium`을 지정할 수 있습니다. `BASE_URL`, `TEST_ADMIN_TOKEN`으로 테스트 대상과 키를 변경할 수 있습니다. 화면 캡처는 `.test-artifacts/`에 생성됩니다.

## 데이터 가져오기

관리 화면에서 JSON 배열 파일을 선택합니다. 전체 JSON 내보내기로 데이터를 백업할 수 있습니다. 백업에는 안건의 내부 내용이 포함되므로 안전하게 보관하세요. 전체 필드는 [data/sample-agendas.json](data/sample-agendas.json)을 참고하세요. ID·연도·분기는 서버가 생성합니다. 같은 안건번호가 있거나 한 건이라도 형식이 잘못되면 **전체 취소**됩니다. 파일당 최대 500건 / 2MB입니다.

필수 문자열: `number`, `meeting`, `date`(YYYY-MM-DD), `region`, `field`, `title`, `request`, `status`.

상태 값: `검토 중`, `일부 반영`, `반영 완료`, `미반영`. 선택 필드: `organization`, `situation`, `problem`, `effect`, `review`, `answer`, `department`, `implemented_at`, `keywords`, `source`(http/https 원문 URL).

JSON 가져오기는 신규 등록 방식입니다. 기존 안건 수정은 상세 화면의 ‘이 안건 수정’을 사용하세요. HWP·PDF·DOCX·Excel 원문 자동 파싱, 파일 보관, 원문 인증은 아직 구현하지 않았습니다.

## 운영 적용 전 남은 범위

현재 서버는 Python 표준 라이브러리 HTTP 서버 기반의 **내부 시제품**입니다. 사용자별 로그인·열람 권한·감사 로그·로그인 시도 제한·대용량 검색·문서 자동 추출·실제 임베딩 검색은 후속 단계입니다. 읽기 API는 인증 없이 접근 가능하므로 내부 문서를 넣기 전에 네트워크 제한과 인증 프록시를 적용해야 합니다. 관리자 키는 쓰기 작업용이며 사용자 계정 체계를 대신하지 않습니다. 외부 공개 운영은 별도의 운영 서버 구성과 보안 검토 후 진행하세요.
