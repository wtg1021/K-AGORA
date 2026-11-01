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

## 로컬 PC 세팅 가이드

### 1. 준비물 설치

- **Python 3.12 이상**: [Python 다운로드](https://www.python.org/downloads/). Windows 설치 화면에 `Add python.exe to PATH`가 나오면 선택합니다.
- **Git**: [Git 다운로드](https://git-scm.com/downloads). 이미 설치되어 있다면 다시 설치하지 않아도 됩니다.
- Chrome, Edge 등 최신 웹 브라우저

기본 앱 실행에는 Node.js, npm, pip 패키지 설치, 외부 API 키, 별도 DB 설치가 필요하지 않습니다. SQLite는 Python에 포함되어 있습니다. 아래 예제는 Python 3.12 기준이며 설치한 버전이 다르면 해당 버전을 사용하세요.

### 2. 소스 내려받기

Windows PowerShell, macOS 터미널 또는 Linux 터미널에서 작업할 폴더로 이동한 뒤 실행합니다.

```bash
git clone https://github.com/wtg1021/K-AGORA.git
cd K-AGORA
```

이미 내려받은 저장소가 있다면 해당 폴더에서 `git status`로 수정사항을 확인하고 `git pull --ff-only`로 갱신하세요. 로컬 수정사항이 있으면 먼저 보관하세요. 이후 모든 명령은 `README.md`와 `agora` 폴더가 있는 **저장소 루트**에서 실행합니다.

### 3. 예시 데이터로 실행

**Windows PowerShell**

```powershell
py -3.12 --version
py -3.12 -m agora.server
```

`py`가 없지만 `python --version`에서 3.12 이상이 확인되면 `python -m agora.server`를 사용해도 됩니다.

**macOS / Linux**

```bash
python3 --version
python3 -m agora.server
```

터미널에 `K-AGORA listening on ...`이 표시되면 브라우저 주소창에 **http://127.0.0.1:8000** 을 입력하세요. 처음 실행할 때 가상 안건 8건이 생성됩니다. ‘법인카드 일괄 등록’ 예시 질문을 눌러 검색 결과와 상세정보를 확인할 수 있습니다.

실행 중인 터미널을 열어 두어야 합니다. 종료는 **Ctrl+C**, 재실행은 같은 명령을 입력합니다. 종료·재실행해도 저장된 안건은 유지됩니다. 기본 실행은 검색 전용이며 등록·수정·삭제 기능은 다음 단계에서 활성화합니다.

### 4. 안건 등록·수정 기능 활성화

먼저 서버를 Ctrl+C로 종료합니다. 아래 방식으로 관리자 키를 설정하고 같은 터미널에서 다시 실행합니다. 키는 직접 정해 입력하며, 명령 기록에 남지 않도록 대화형 입력을 사용합니다.

**Windows PowerShell**

```powershell
$agoraSecureKey = Read-Host "사용할 관리자 키 입력 (충분히 긴 임의 문자열)" -AsSecureString
$env:ADMIN_TOKEN = [System.Net.NetworkCredential]::new('', $agoraSecureKey).Password
Remove-Variable agoraSecureKey
py -3.12 -m agora.server
```

**macOS / Linux (Bash)**

macOS 기본 셸이 zsh인 경우 먼저 `bash`를 실행한 후 아래 명령을 입력하세요.

```bash
read -r -s -p "사용할 관리자 키 입력 (충분히 긴 임의 문자열): " ADMIN_TOKEN
printf '\n'
export ADMIN_TOKEN
python3 -m agora.server
```

브라우저에서 **‘안건 등록·관리’ → ‘관리자 키’에 방금 입력한 키 입력 → 안건 작성 → ‘안건 저장’** 순서로 사용합니다. 수정은 검색 결과의 **‘안건 자세히 보기’ → ‘이 안건 수정’**을 선택합니다.

화면의 관리자 키는 새로고침하면 다시 입력해야 합니다. 서버 환경변수는 현재 터미널 세션에만 적용되므로 새 터미널에서는 다시 설정하세요. 서버는 `.env` 파일을 자동으로 읽지 않습니다. 관리자 키를 소스나 Git에 저장하지 마세요.

검색 전용으로 되돌리려면 서버를 종료하고 PowerShell에서 `Remove-Item Env:ADMIN_TOKEN -ErrorAction SilentlyContinue`, Bash에서 `unset ADMIN_TOKEN`을 실행한 다음 재시작합니다.

### 5. 실제 자료용 빈 DB로 시작하기

예시용 DB는 유지하고 별도의 빈 DB를 만드는 방법입니다. 서버를 먼저 종료하고 다음 설정으로 실행하세요. 관리 기능도 필요하면 4단계의 관리자 키를 같은 터미널에서 먼저 설정합니다.

**Windows PowerShell**

```powershell
$env:SEED_DEMO = "false"
$env:DATABASE_PATH = "data/local-agendas.sqlite3"
py -3.12 -m agora.server
```

**macOS / Linux**

```bash
SEED_DEMO=false DATABASE_PATH=data/local-agendas.sqlite3 python3 -m agora.server
```

이후 실제 자료를 계속 사용하려면 실행할 때마다 같은 DB 경로를 지정하세요. `SEED_DEMO=false`는 기존 DB의 예시 데이터를 삭제하지 않습니다. 이미 존재하는 `local-agendas.sqlite3`가 있다면 해당 자료를 그대로 불러옵니다. 삭제한 예시 데이터는 재시작해도 자동 복원되지 않습니다.

### 6. 데이터 저장·백업

- 기본 데이터 파일: `data/agora.sqlite3` (별도 경로를 지정했다면 해당 파일)
- 간단한 백업: 관리 화면에서 관리자 키 입력 후 **‘전체 JSON 내보내기’**
- JSON 복구: 빈 DB로 실행한 다음 **‘JSON 가져오기’**. 안건번호가 겹치면 전체 취소되므로 기존 DB에 그대로 복구하지 마세요.
- DB 파일 자체를 복사하려면 **서버를 먼저 종료**한 뒤 복사합니다. 복구도 서버를 종료한 상태에서 진행하세요.
- DB 파일과 `.env`는 Git 추적 대상에서 제외됩니다. 로컬 검색 기록은 DB가 아니라 해당 브라우저의 localStorage에 저장되며 ‘최근 검색 → 지우기’로 삭제합니다.

### 환경변수 참고

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | 현재 PC에서만 접근하는 기본 바인딩 |
| `PORT` | `8000` | 서버 포트 |
| `DATABASE_PATH` | `data/agora.sqlite3` | SQLite 파일 위치. 상대 경로는 실행 폴더 기준 |
| `SEED_DEMO` | `true` | 첫 초기화 때 가상 예시 8건 추가 |
| `ADMIN_TOKEN` | 미설정 | 없으면 관리 API 사용 불가 |

### 자주 생기는 문제

| 증상 | 확인·해결 방법 |
| --- | --- |
| `py` / `python3` 명령을 찾을 수 없음 | Python 설치 후 터미널을 새로 여세요. Windows는 `py -3.12` 또는 버전 확인된 `python`을 사용하세요. |
| `No module named agora` | `cd K-AGORA`로 저장소 루트에 들어왔는지 확인하세요. |
| `Address already in use` / 포트 사용 오류 | 기존 서버를 종료하거나 아래처럼 포트를 바꾸세요. |
| 브라우저 연결 실패 | 서버 터미널의 오류를 확인하고 실제 포트와 브라우저 주소가 같은지 확인하세요. |
| 관리 기능 사용 불가 / 관리자 키 오류 | 서버 시작 전에 `ADMIN_TOKEN`을 설정했는지, 화면에 같은 키를 입력했는지 확인하세요. |
| 실제 자료 대신 예시 데이터가 보임 | 실행 시 `DATABASE_PATH`를 실제 자료 DB 경로로 지정했는지 확인하세요. |
| JSON 가져오기 실패 | JSON 배열·필수 필드·안건번호 중복·500건/2MB 제한을 확인하세요. |

포트를 8001로 바꾸려면 PowerShell에서 `$env:PORT = "8001"`을 설정한 후 서버를 실행하거나, macOS/Linux에서 `PORT=8001 python3 -m agora.server`를 실행합니다. 브라우저 주소도 `http://127.0.0.1:8001`로 바꾸세요.

## 테스트

Windows PowerShell에서는 다음 명령을 사용합니다.

```powershell
py -3.12 -m unittest discover -s tests -v
```

macOS / Linux에서는 다음 명령을 사용합니다.

```bash
python3 -m unittest discover -s tests -v
```

GitHub push/PR에서도 같은 테스트를 실행하도록 Actions 워크플로를 포함했습니다.

서버·DB 임시 생성 후 검색, 무관한 질문, 필터, CRUD, 재연결 영속성, 입력 검증, 관리 인증, JSON 입출력, 중복 시 전체 롤백 등 **11개 테스트**를 실행합니다.

### 선택: 브라우저 자동 테스트 (macOS / Linux)

일반 사용에는 필요하지 않으며, 이 단계에만 Node.js와 npm이 추가로 필요합니다.

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
