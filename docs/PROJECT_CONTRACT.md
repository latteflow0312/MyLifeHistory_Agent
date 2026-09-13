# MyLifeHistory Project Contract v0.1

Constitution Version: 0.2.2
Status: Frozen
Freeze Authority: Human Approved
Frozen Date: 2026-09-13

## 1. 프로젝트 정의

MyLifeHistory_Agent는
사용자가 여러 AI 도구 및 디지털 환경에 남긴 기록에서
삶의 중요한 생각, 선택, 실패, 재도전, 판단, 배움, 가치관,
가족에 대한 마음과 시대적 맥락을 장기간 축적하기 위한 시스템이다.

이 프로젝트는 단순한 일기,
업무 로그,
AI 대화 백업 시스템이 아니다.

장기적으로 다음 두 목적을 가진다.

### 목적 1. 삶의 일대기 축적

하루하루의 기록을 장기간 축적하여
인생의 중요한 전환점과 성장 과정을 보존한다.

시간이 충분히 흐른 뒤에는
중요한 모먼트를 선별하여
한 사람의 삶과 성장 과정을 담은 책으로 만들 수 있어야 한다.

### 목적 2. 가족에게 아이덴티티와 지적 유산을 남긴다

10년, 20년, 30년 뒤 가족과 자녀가 기록을 읽으며
사용자가 어떤 사람으로 살아왔는지,
무엇을 중요하게 생각했는지,
어떤 환경에서 어떤 선택을 했는지,
무엇을 배우고 남기고 싶어 했는지를 이해할 수 있어야 한다.

이 기록은 가족에게 전달되는 경험,
사고방식,
지식,
가치관,
마음의 유산이 되는 것을 목표로 한다.


## 2. 최상위 범용성 원칙

이 프로젝트는 특정 AI 개발도구에 종속되지 않는다.

Claude Code, Codex는 현재 사용할 수 있는 구현 도구일 뿐이며,
향후 Gemini CLI, 다른 Coding Agent, IDE Agent,
로컬 AI 또는 아직 등장하지 않은 새로운 AI 개발도구가
추가되거나 기존 도구를 대체할 수 있다.

따라서 다음 원칙을 반드시 지킨다.

1. 프로젝트의 진실(Source of Truth)은 AI 대화가 아니라 저장소 내부 파일이다.
2. 설계, 규칙, Contract, 테스트, 설정은 일반적인 파일 형식과 표준 기술로 보존한다.
3. 특정 AI Agent의 메모리, 세션 기록, 숨겨진 지침, 전용 Workspace 기능이 없어도 새로운 개발자가 프로젝트를 이해할 수 있어야 한다.
4. AI가 바뀌어도 실행 명령과 프로그램 구조는 유지되어야 한다.
5. Claude 전용, Codex 전용, Gemini 전용 기능을 Core Architecture의 필수 의존성으로 사용하지 않는다.
6. AI에게 전달하는 개발 지시서는 특정 제품명이 없어도 이해 가능한 형태로 작성한다.
7. 모든 중요한 판단은 코드 또는 문서로 남긴다. AI와의 대화에만 존재하는 설계 결정을 만들지 않는다.
8. 테스트가 AI의 답변보다 우선한다. 어떤 AI가 구현하더라도 동일한 테스트를 통과해야 한다.
9. 데이터 형식은 가능한 범위에서 Markdown, JSON, UTF-8 등 공개적이고 장기간 유지 가능한 형식을 사용한다.
10. 새로운 AI 도구를 도입할 때 Core를 새 도구에 맞추는 것이 아니라, 새 도구가 기존 Contract를 따르도록 한다.


## 3. 핵심 개발 원칙

이 프로젝트의 기본 원칙은 다음과 같다.

> 전체 설계는 하나로 고정하고, 구현만 쪼개서 진행한다.

따라서 전체 Architecture와 Contract를 먼저 고정하고,
구현은 모듈별로 분리하여 진행한다.

각 모듈은 가능한 범위에서 다음 조건을 만족해야 한다.

- 독립적으로 이해 가능해야 한다.
- 독립적으로 테스트 가능해야 한다.
- 특정 AI Provider에 종속되지 않아야 한다.
- 특정 Source에 종속되지 않아야 한다.
- 다른 모듈을 불필요하게 침범하지 않아야 한다.


## 4. Source of Truth

프로젝트의 기준 파일은 다음과 같다.

### 프로젝트 헌법

`docs/PROJECT_CONTRACT.md`

프로젝트 전체 Architecture,
범용성 원칙,
Contract,
데이터 안전 기준,
테스트 기준을 정의한다.

### Life History 기록 기준

`prompts/daily_summary.md`

무엇을 삶의 기록으로 남기고
무엇을 제외할지 결정하는 최상위 기록 규칙이다.

### 환경 설정

`config/settings.json`

Google Drive 경로,
저장 폴더,
Timezone 등 실행 환경 설정을 정의한다.

AI 개발도구의 대화 내용은 Source of Truth가 아니다.


## 5. 데이터 저장 원칙

개발 프로그램과 실제 Life History 데이터는 분리한다.

### 프로그램

`D:\program\MyLifeHistory_Agent`

### 실제 장기 데이터

`G:\내 드라이브\MY_LIFE_HISTORY`

Google Drive 구조:

```text
MY_LIFE_HISTSet-Location -LiteralPath 'D:\program\MyLifeHistory_Agent'

$realKey = Read-Host 'Gemini API Key' -AsSecureString

try {
    $env:MYLIFEHISTORY_GEMINI_API_KEY =
        [System.Net.NetworkCredential]::new('', $realKey).Password

    Write-Host 'Credential present: YES'
    Write-Host 'Real Production Run: START'
    Write-Host 'API Call Budget: 1'

    node scripts/run-production-real.mjs

    Write-Host "Live exit code: $LASTEXITCODE"
}
finally {
    Remove-Item Env:\MYLIFEHISTORY_GEMINI_API_KEY -ErrorAction SilentlyContinue
    $realKey.Dispose()
    Remove-Variable realKey -ErrorAction SilentlyContinue

    Write-Host "Credential present after cleanup: $(Test-Path Env:\MYLIFEHISTORY_GEMINI_API_KEY)"
}ORY
├─ 00_INBOX
├─ 01_RAW
├─ 02_DAILY
├─ 03_REVIEW
└─ 99_SYSTEM
```


## 6. Daily 날짜 기준 정책 (Timezone)

MyLifeHistory의 Daily 기준 날짜는 항상 Asia/Seoul의 달력 날짜를 사용한다.

Daily 날짜 범위:

```text
00:00:00 ~ 23:59:59 (Asia/Seoul)
```

사용자가 해외에 체류하더라도 MyLifeHistory의 Daily 분류 기준 timezone은 변경하지 않는다.

예를 들어 사용자가 프랑스 파리에 있고 현지 날짜와 한국 날짜가 서로 다르더라도, MyLifeHistory 내부 Daily 기록은 Asia/Seoul 기준 날짜로 분류한다.

이 차이는 오류가 아니라 10년 이상 장기 기록의 일관성을 유지하기 위한 의도된 시스템 정책이다.

Core는 사용자의 해외 체류 여부를 이유로 현지 timezone을 추론하거나 Daily 날짜를 현지 날짜 기준으로 재분류하지 않는다.


## 7. Daily 수집 운영 정책 (Collection Policy)

장기 운영 기준으로 Source 수집은 하루 2회(Morning Collection, Evening Collection)를 기본 방향으로 한다.

```text
Morning Collection + Evening Collection
        ↓
Same Asia/Seoul Daily Dataset
        ↓
Daily Processing
```

오전 수집과 저녁 수집은 각각 별도의 Daily Life History를 생성하기 위한 것이 아니다. 동일한 Asia/Seoul 날짜에 수집된 Source는 하나의 Daily 범위 안에서 함께 처리한다.

하루 2회 수집의 목적은 다음과 같다.

- 장시간 기록 누락 가능성 감소
- 하루 전체 처리 부담 분산
- 향후 Home PC 자동 운영 기반 마련

현재 Constitution v0.1에서는 Scheduler를 구현하지 않는다. 08:00 / 20:00 등 구체적인 실행 시간도 현재 Contract에 고정하지 않는다. 실제 Morning / Evening 실행 시각은 향후 Home PC 자동화 단계에서 settings 또는 Scheduler 설정으로 결정한다.

현재 단계에서 고정하는 것은 "하루 2회 수집을 기본 운영 방향으로 한다"는 정책뿐이다.

Daily 처리의 기본 입력 범위는 해당 Asia/Seoul(KST) 날짜에 새로 수집되고 아직 처리되지 않은 Source다. 과거에 이미 처리된 Source는 일상적인 Daily 생성의 기본 입력이 아니다.

과거 01_RAW의 본문 전체를 일상적인 Daily 생성 과정에서 반복적으로 재독해, 재정규화, AI 재투입하지 않는다. 단, 디렉터리 목록 확인, 파일 존재 여부 확인, 필요한 최소 Metadata 확인까지 금지하는 것은 아니다. 금지 대상은 과거 Source 본문 전체를 처리 파이프라인에 반복적으로 다시 넣는 방식이다.


## 8. Normalized Source 최소 Schema

Normalizer가 생성하는 Normalized Source의 최소 구조는 다음과 같다.

```json
{
  "schema_version": "0.1",
  "source_name": "...",
  "filename": "...",
  "content_hash": "...",
  "content": "..."
}
```

### schema_version

- 해당 Normalized Source가 어떤 Schema 규격으로 만들어졌는지 나타낸다.
- Constitution v0.1의 값은 "0.1"이다.
- 향후 Schema 변경 및 Migration 시 과거 데이터를 해석하기 위한 최소 Metadata다.

### source_name

- Source 종류 또는 일반적인 Source 식별 정보다.
- 특정 AI Provider나 특정 Coding Agent에 Core 구조가 종속되어서는 안 된다.

### filename

- 수집된 원본 파일의 파일명을 보존한다.
- 사람이 원본을 다시 찾을 수 있는 가장 기본적인 물리적 단서다.

### content_hash

content_hash는 다음 규칙으로 정의한다.

- Normalizer의 content 필드에 최종 저장되는 문자열을 UTF-8 bytes로 인코딩한다.
- 그 전체 bytes에 대해 SHA-256을 계산한다.
- 결과는 64자리 lowercase Hex 문자열로 저장한다.
- Hash 계산 대상과 실제 content 필드에 저장되는 문자열은 반드시 동일해야 한다.
- v0.1에서는 Hash 계산 전에 다음과 같은 추가 정규화를 임의로 수행하지 않는다.
  - CRLF → LF 변환
  - LF → CRLF 변환
  - trim
  - 공백 삭제
  - 공백 축약
  - BOM 제거를 위한 별도 후처리
  - 문자열 재구성

즉, Collector / Normalizer 과정에서 실제 content 필드에 최종 저장된 문자열을 그대로 UTF-8 bytes로 변환하여 SHA-256을 계산한다.

content_hash의 목적:

- 원본 내용의 동일성 확인
- 향후 중복 탐지 기반
- Provenance
- Source Reference
- 장기 검증

전체 64자리 SHA-256 값을 저장하는 것을 기본으로 한다. 사람에게 보여주는 화면이나 문서에서는 필요하면 일부 문자열만 축약해 표시할 수 있지만, 내부 저장값은 전체 64자리 값을 유지한다.

### content

- Collector가 읽은 원문 텍스트다.
- Normalizer 단계에서는 다음을 수행하지 않는다.
  - 요약
  - 해석
  - 감정 추론
  - 의미 판단
  - 가치 판단
  - 사실 보완
  - 시간 추정

현재 Constitution v0.1에서는 별도의 source_id 필드를 필수 Metadata로 추가하지 않는다. 향후 ChatGPT, Claude, Gemini 또는 다른 Source Export가 안정적인 conversation ID / source ID를 제공할 경우 추가 Metadata로 검토할 수 있다. 그러나 현재 Core Contract의 필수 필드에는 포함하지 않는다.


## 9. Time Metadata 최소화 원칙

MyLifeHistory는 모든 기술적 Metadata를 가능한 많이 축적하는 시스템이 아니다. 장기간 이후에도 의미 있는 삶의 기록을 단순하고 지속 가능한 형태로 보존하는 것이 우선이다.

따라서 Constitution v0.1에서는 Normalized Source의 필수 Metadata로 다음을 별도 생성하지 않는다.

- Source Time
- Capture Time

Source 원문 자체에 timestamp가 포함되어 있다면 그 timestamp가 포함된 원문은 그대로 보존한다.

그러나 Core가 다음을 수행해서는 안 된다.

- 존재하지 않는 Source Time 추론
- Source Time 새로 생성
- Capture Time을 필수 Metadata로 생성
- AI가 시간 정보를 추정하여 보완

시간 정보가 없으면 없는 상태 그대로 유지한다.


## 10. Artifact Time

장기 보존되는 Daily Artifact 또는 Review Artifact에는 Artifact가 실제 생성된 시점을 기록할 수 있다.

필드명: `artifact_created_at`

형식: ISO 8601 + Asia/Seoul timezone offset

예: `2026-09-13T20:05:12+09:00`

artifact_created_at은 다음을 의미하지 않는다.

- 실제 사건이 발생한 시간
- 대화가 이루어진 시간
- Source가 작성된 시간
- Source가 수집된 시간

오직 해당 Artifact가 생성된 시점을 의미한다.

현재 v0.1 개발 단계에서 생성할 수 있는 개발용 Prompt Package는 Production Daily Artifact와 동일한 것으로 취급하지 않는다. 따라서 개발용 Prompt Package에 Production Artifact 규칙을 임의로 강제하지 않는다.


## 11. Source Reference / Provenance 원칙

MyLifeHistory에서 생성되는 장기 기록은 가능한 범위에서 해당 기록의 근거가 된 원본 Source를 미래에 다시 찾을 수 있어야 한다.

목적:

- AI 생성 기록의 근거 확인
- 원본 재검증
- 잘못된 요약이나 환각 발견
- Book 작성 시 원자료 확인
- 월간 / 연간 Review 시 원자료 확인

Constitution v0.1에서 Source Reference의 최소 기반은 다음 두 항목이다.

- filename
- content_hash

복잡한 Database ID나 특정 Provider 전용 ID에 의존하지 않는다.

향후 안정적인 Provider Source ID가 존재하면 추가 Metadata로 확장할 수 있으나 현재 필수 Contract에는 포함하지 않는다.


## 12. Backup 정책

현재: Google Drive = Primary Repository

Constitution v0.1에서는 다음을 구현하지 않는다.

- 3-2-1 자동 Backup
- 별도 Cold Storage
- 자동 Archive
- Backup Scheduler
- Backup 전용 코드

이 결정은 Backup이 중요하지 않다는 의미가 아니다.

최소 1년 이상의 실제 운영 경험을 통해 다음을 확인한 후 별도의 Backup / Archive 전략을 검토한다.

- 실제 저장량
- Google Drive 운영 안정성
- 데이터 증가 속도
- 복구 필요성
- 장기 보관 필요성

현재 v0.1 Core 착수를 Backup 자동화가 막아서는 안 된다.


## 13. 데이터 안전 및 원본 보호 원칙

MyLifeHistory에서 가장 중요한 자산은 프로그램 코드가 아니라 사용자 원본 데이터와 장기 기록이다.

원칙:

- 원본 Source는 가능한 한 변경하지 않는다.
- 기존 RAW 데이터는 overwrite하지 않는다.
- 기존 Daily / Review Artifact는 명시적 승인 없이 삭제하거나 덮어쓰지 않는다.
- Collector는 Source를 읽기 위한 역할이며 원본을 수정하지 않는다.
- 테스트는 실제 Google Drive 데이터를 사용하지 않는다.
- 테스트는 fixtures 또는 임시 디렉터리를 사용한다.
- 개발 과정의 실험 결과를 Production 저장 영역에 기록하지 않는다.
- 파괴적 작업보다 append / new artifact 방식을 우선한다.
- 삭제, 이동, overwrite가 필요한 작업은 명시적 Human Approval 없이 수행하지 않는다.

Google Drive는 현재 Primary Repository이지만, 프로그램이 Google Drive를 임의로 정리하거나 파일을 재배치하는 권한을 기본으로 갖지 않는다.

데이터 안전은 기능 편의성보다 우선한다.


## 14. 전체 Architecture와 데이터 흐름

MyLifeHistory Core의 공식 전체 구조는 다음과 같다.

```text
Source
  ↓
Collector
  ↓
Normalizer
  ↓
Daily Package Builder
  ↓
AI Adapter
  ↓
Summarizer
  ↓
Daily Artifact
  ↓
Review Layer
```

이 Architecture는 특정 AI Provider와 무관한 논리 구조다.

각 단계는 역할을 분리하며, 하나의 모듈이 전체 책임을 임의로 흡수하지 않는다.

추가 원칙:

- 원본 수집과 의미 해석을 분리한다.
- 데이터 정규화와 요약을 분리한다.
- AI 호출과 Prompt 조립을 분리한다.
- Production Artifact 저장과 개발용 Prompt Package 출력을 구분한다.
- Review Layer는 Daily Artifact 이후의 별도 계층이다.
- v0.1 구현은 이 전체 Architecture 중 일부만 구현할 수 있지만, 구현되지 않은 단계 때문에 전체 Architecture를 변경해서는 안 된다.

> 전체 설계는 하나로 고정하고, 구현만 쪼개서 진행한다.


## 15. 모듈별 책임

### Collector

책임:

- Source를 읽는다.
- 지원되는 입력 형식을 수집한다.
- 원본 내용을 임의로 요약하거나 해석하지 않는다.
- 원본 Source를 수정하지 않는다.

하지 않는 일:

- 감정 판단
- 의미 판단
- Daily Summary 작성
- AI 호출
- Production Artifact 생성

### Normalizer

책임:

- 서로 다른 Source를 공통 최소 구조로 변환한다.
- Constitution v0.1의 Normalized Source Contract(Section 8)를 따른다.

최소 필드:

- schema_version
- source_name
- filename
- content_hash
- content

하지 않는 일:

- 원문 요약
- 감정 추론
- 의미 해석
- 없는 Metadata 생성

### Daily Package Builder

책임:

- 동일 Asia/Seoul Daily 범위에 속한 Normalized Source를 묶는다.
- daily_summary.md의 규칙을 함께 사용할 수 있는 입력 Package를 구성한다.
- 신규/미처리 Source만 Daily Package 후보로 구성한다.
- 이미 처리된 Source와 신규 Source를 구분할 수 있어야 한다.

Processing State:

- 목적은 처리된 Source와 미처리 Source를 구분하는 것이다.
- 최소한 content_hash를 활용하여 중복 여부를 식별할 수 있어야 한다.
- 저장 위치, 파일명, 파일 포맷, 생성/갱신 방식, 저장 매체는 Constitution에서 고정하지 않으며 Core 구현 단계에서 결정한다.

하지 않는 일:

- 최종 Life History 작성
- Human 생각 추론
- Production Daily 저장

### AI Adapter

책임:

- Core와 외부 AI Provider 사이의 경계를 담당한다.
- 특정 Provider의 API / CLI / Runtime 차이를 Core에서 분리한다.

원칙:

OpenAI, Anthropic, Google, Local AI, 향후 등장할 AI 중 어느 하나도 Core Contract를 변경하게 해서는 안 된다.

### Summarizer

책임:

- Daily Package와 Prompt Rule을 기반으로 Daily Life History 후보를 생성한다.

신규/미처리 Source가 없는 경우 Summarizer와 외부 AI 호출을 실행하지 않으며, 빈 Production Artifact를 생성하지 않는다.

원칙:

- Source-grounded
- Strict Evidence
- 근거 없는 감정/의도/동기 생성 금지
- Decision Context 우선
- Era Context 우선

### Artifact Writer

책임:

- 생성된 결과물을 지정된 영역에 기록한다.
- 개발 출력과 Production Artifact를 구분한다.

v0.1 개발 단계에서는 Production 02_DAILY 쓰기를 기본적으로 금지한다.

### Review Layer

책임:

향후 다음을 담당할 수 있다.

- 월간 Review
- 연간 Review
- Book Candidate 정리
- Family Legacy 정리
- Knowledge Legacy 정리
- Decision Context 연결
- Era Context 연결

월간/연간 Review는 Daily Artifact 또는 이전 Review Artifact를 우선 입력으로 사용한다. 과거 RAW 전체 재처리는 특별한 검증, 복구, 재구성 목적이 있을 때만 예외적으로 사용하며, Review의 일상적인 기본 흐름에서는 RAW 전체를 다시 AI에 투입하지 않는다.

Review Layer는 v0.1 Core 구현 범위의 필수 기능이 아니다.


## 16. Collector와 Summarizer 분리 원칙

Collector와 Summarizer는 반드시 분리한다.

Collector는 "무엇이 기록되었는가"를 다룬다.

Summarizer는 "그 기록 중 무엇이 장기적으로 의미 있는가"를 다룬다.

Collector 단계에서 Life History 가치 판단을 수행하지 않는다.

Summarizer 단계에서 원본 수집 로직을 수행하지 않는다.

이 분리를 유지하는 이유:

- 원본 무결성
- 테스트 가능성
- AI Provider 교체 가능성
- 환각 위험 감소
- 장기 유지보수
- 모듈 독립성

하나의 AI Agent 또는 하나의 파일이 Collector와 Summarizer 역할을 동시에 수행하도록 Core Architecture를 단순화하지 않는다.


## 17. 결정의 맥락 및 시대 맥락 보존 원칙

세부 작성 방법은 prompts/daily_summary.md가 담당한다. 이 Section은 "왜 이것을 보존하는가"라는 상위 원칙을 기록한다.

### Decision Context

MyLifeHistory는 결과만 기록하지 않는다.

다음 흐름을 중요 자산으로 본다.

```text
실패 → 재도전 → 다시 실패 → 계획 변경
```

가능한 경우 다음을 보존한다.

- 처음 왜 그 선택을 했는가
- 왜 다른 선택은 어려웠는가
- 어떤 제약과 책임이 있었는가
- 무엇이 실패했는가
- 왜 다시 시도했는가
- 무엇이 달라졌는가
- 왜 결국 방향을 바꿨는가
- 어떤 기준으로 최종 판단했는가
- 그 과정에서 무엇을 배웠는가

목적은 미래의 가족이나 사용자 자신이 결과만 보고 과거를 판단하지 않고, "그 상황에서 왜 그런 결정을 했는가"를 이해할 수 있게 하는 것이다.

### Era Context

개인의 삶은 시대와 분리되어 존재하지 않는다.

MyLifeHistory는 개인 기록과 함께 그 당시의 시대적 환경이 선택에 어떤 영향을 주었는지도 가능한 범위에서 남긴다.

예:

- AI 기술 변화
- 업무 환경 변화
- 경제 분위기
- 산업 변화
- 주요 기업 변화
- 사회 분위기
- 가족의 성장 단계

중요:

Era Context는 AI가 외부 사실을 임의로 창작하거나 자동으로 시대 데이터를 삽입한다는 의미가 아니다.

Source에 근거가 있거나 향후 별도 검증된 Source가 제공될 때 사용한다.

세부 출력 규칙은 daily_summary.md를 따른다.


## 18. 테스트 및 검증 원칙

테스트가 AI의 답변보다 우선한다.

AI Agent가 "정상적으로 구현했다"라고 말하는 것은 검증이 아니다.

가능한 기능은 실제 테스트 결과로 확인한다.

테스트 원칙:

- 실제 Google Drive Production 데이터 사용 금지
- fixtures / temp directory 사용
- 입력 Source 변경 여부 검증
- 허용되지 않은 파일 생성 여부 검증
- Production 저장 영역 쓰기 방지 검증
- 빈 입력 처리 검증
- 잘못된 설정 처리 검증
- Schema 검증
- content_hash 검증
- Provider 비종속성 검증 가능 구조 유지
- 동일 content_hash Source가 중복 처리되지 않는지 검증
- 신규 Source가 없을 때 AI 호출 경로가 실행되지 않는지 검증
- 빈 입력으로 인해 Production Artifact가 불필요하게 생성되지 않는지 검증
- 과거 RAW 전체 본문을 재처리하지 않고도 신규/미처리 Source를 식별할 수 있는 구조인지 검증 가능한 형태를 유지

테스트 실패를 AI의 설명으로 덮어쓰지 않는다.

테스트를 통과하지 못하면 완료로 보고하지 않는다.


## 19. 보호 영역 및 변경 통제

다음 파일을 Protected Constitution / Configuration 영역으로 정의한다.

- docs/PROJECT_CONTRACT.md
- prompts/daily_summary.md
- config/settings.json

원칙:

이 파일들은 명시적 Human Approval 없이 수정하지 않는다.

Google Drive의 기존 데이터 역시 명시적 Human Approval 없이 다음을 수행하지 않는다.

- 삭제
- 이동
- overwrite
- 이름 변경

AI Coding Agent는 자신이 더 좋은 설계를 알고 있다고 판단하더라도 Constitution을 임의로 변경하지 않는다.

새로운 AI Tool이 프로젝트를 맡아도 먼저 기존 Contract를 읽고 따라야 한다.

변경이 필요하다면 다음을 먼저 보고하고 Human Approval을 받은 뒤 진행한다.

1. 변경 이유
2. 영향 범위
3. 대안
4. 위험
5. Migration 필요 여부


## 20. 범위 통제 원칙

MyLifeHistory는 미래 기능을 미리 모두 구현하지 않는다.

현재 단계에서 필요한 최소 기능만 구현한다.

다음과 같은 이유로 미래 기능을 선구현하지 않는다.

- 언젠가 필요할 것 같아서
- AI Agent가 더 완성도 있어 보인다고 판단해서
- Framework가 있으면 편할 것 같아서
- 향후 확장 가능성을 미리 대비한다는 이유로

현재 명시적으로 요구되지 않은 기능은 기본적으로 범위 밖이다.

특히 v0.1에서는 명시적 지시 없이는 다음을 구현하지 않는다.

- Database
- Vector Database
- Web UI
- Mobile App
- Cloud Infrastructure
- Docker
- Kubernetes
- Automatic Scheduler
- Automatic Backup
- PII Masking
- Decision Thread Engine
- External Era Data Collector
- Google API Integration
- Gmail / Calendar Integration
- Production AI API
- Production 02_DAILY 자동 저장

"좋은 아이디어"와 "현재 구현 범위"를 구분한다.


## 21. 기술 기본값

Core 구현의 기본 기술값은 다음과 같다.

- Runtime: Node.js
- Module System: ES Module
- Text Encoding: UTF-8
- Long-term Document Format: Markdown
- Structured Data Format: JSON
- Test Framework: node:test
- Primary Development OS: Windows
- External Package: 최소화
- Framework: 특별한 필요가 없으면 사용하지 않음
- Path: hard-code하지 않고 settings를 통해 주입
- AI Provider: Core에서 비종속

기술 기본값은 새로운 기술이 절대 금지된다는 의미가 아니다.

변경이 필요한 경우 Constitution을 몰래 바꾸지 말고 변경 이유와 영향을 먼저 보고해야 한다.


## 22. AI 개발도구 작업 시작 규칙

Claude Code, Codex, Gemini CLI, 향후 다른 Coding Agent가 프로젝트 작업을 시작할 때는 반드시 다음 순서를 따른다.

1. docs/PROJECT_CONTRACT.md 읽기
2. prompts/daily_summary.md 읽기
3. config/settings.json 읽기
4. Repository 구조 확인
5. 기존 코드 존재 여부 확인
6. tests 존재 여부 확인
7. 현재 작업 범위 확인
8. Protected 영역 확인
9. 충돌 여부 확인
10. 구현 계획 제시

충돌이 있으면 임의로 해결하지 않고 작업 전에 보고한다.

AI의 이전 대화 기억보다 Repository의 Source of Truth를 우선한다.


## 23. 작업 완료 기준

작업 완료는 "코드를 작성했다"는 의미가 아니다.

완료로 판단하려면 작업 범위에 따라 가능한 항목을 확인한다.

- 요구된 기능 구현
- 요구하지 않은 기능 미구현
- 테스트 통과
- Source 데이터 무변경
- Protected 파일 무단 변경 없음
- Production 영역 무단 쓰기 없음
- 문서와 실제 구현 불일치 없음
- 실행 방법 확인
- 오류 발생 시 실패가 명확하게 보고됨
- Git 상태 확인 가능 시 확인
- 미구현 범위 명시

완료 조건을 충족하지 못하면 "완료"라고 보고하지 않는다.


## 24. 작업 후 표준 보고

AI Coding Agent는 작업 후 최소한 다음을 보고한다.

1. 생성한 파일
2. 수정한 파일
3. 각 파일의 역할
4. 구현한 기능
5. 구현하지 않은 기능
6. 실행 방법
7. 테스트 방법
8. 테스트 결과
9. Source 데이터 변경 여부
10. Protected 파일 변경 여부
11. Production 데이터 변경 여부
12. 발견된 위험 또는 제한
13. Git 상태
14. Commit / Branch / Push 여부

보고는 "잘 되었습니다" 같은 추상적 표현보다 검증 가능한 사실을 우선한다.


## 25. 프로젝트 핵심 문장

- "전체 설계는 하나로 고정하고, 구현만 쪼개서 진행한다."
- "AI는 교체할 수 있지만, 설계·Contract·데이터·기록 철학은 교체되지 않는다."
- "AI끼리 서로 데이터 공유를 요청하지 않는다. 사용자가 소유한 데이터 사본을 중앙에서 통합한다."
- "원본은 중앙집중, 요약은 하루 1개."
- "AI는 사람의 생각과 감정을 만들어내지 않는다. 근거가 없으면 기록하지 않는다."
- "기능보다 데이터 안전, 편의보다 장기 지속 가능성을 우선한다."


## 26. Collection과 Daily Finalization 분리 원칙

Constitution v0.2.0에서는 Collection(수집)과 Daily Finalization(하루 확정)을 명확히 구분되는 별도의 개념으로 정의한다.

Collection은 하루 중 여러 번 발생할 수 있다(Section 7의 하루 2회 수집 방향 포함). Collection 자체는 Production Daily Artifact를 생성하지 않는다.

Daily Finalization은 해당 Asia/Seoul 날짜의 Collection 결과를 모아 Production Daily Artifact를 확정하는 별도의 단계이며, 하루 1회만 수행한다.

이 분리를 통해 수집 빈도(Collection Policy)와 Production 확정 빈도(Finalization)는 서로 다른 정책으로 독립적으로 운용된다.


## 27. Production Daily 생성 원칙 (Finalization 전용)

Production Daily Artifact(02_DAILY에 저장되는 최종 산출물)는 오직 Daily Finalization 단계에서만, 하루 1회 생성한다.

Collection 횟수가 하루 2회이더라도 Production Daily Artifact는 하루 1개만 생성된다.

Constitution v0.2.0에서는 Working Draft(최종 확정 전 중간 저장본) 개념을 도입하지 않는다. Finalization은 임시본을 거치지 않고 바로 최종본을 생성하거나, 생성에 실패하면 아무것도 생성하지 않는다(Fail-Stop, Section 28).

Working Draft의 필요성은 v0.2 초기 범위 이후 실제 운영 경험을 바탕으로 재검토한다.


## 28. Production Artifact 보호 원칙 (Overwrite/Append 금지, Fail-Stop)

기존 Production Daily Artifact 또는 Review Artifact는 어떤 경우에도 overwrite 또는 append 방식으로 수정하지 않는다.

동일 날짜에 대해 이미 확정된 Production Artifact가 존재하는 상태에서 다시 Finalization이 실행되면, 그 결과를 기존 파일에 덮어쓰거나 이어붙이지 않는다.

이러한 충돌 상황이 발생하면 시스템은 Fail-Stop 한다. 처리를 중단하고 오류를 명확히 반환하며, 조용히 넘어가거나 임의로 병합/치환하지 않는다.

Fail-Stop 시 상태는 다음 신호로 표현한다.

```text
HUMAN_REVIEW_REQUIRED
```

이는 자동으로 해결하지 않고 사람이 직접 상황을 확인하고 결정해야 함을 의미한다.


## 29. Production 모듈 책임 분리 (Writer / Summarizer / State 상호 비인지, Validator 분리)

Production 단계에서도 Section 16(Collector와 Summarizer 분리 원칙)의 정신을 확장하여 다음을 명시한다.

Production Artifact Writer는 Processing State의 존재를 알지 못한다. Writer는 이미 완성된 Production Artifact 내용을 받아 정해진 위치에 안전하게 기록하는 역할만 담당하며, State 조회/기록 로직을 포함하지 않는다.

Summarizer는 Production Artifact Writer와 Processing State 양쪽 모두를 알지 못한다. Summarizer는 Prompt Package를 입력받아 요약 결과를 산출하는 역할만 담당하며, 그 결과를 어디에 어떻게 저장할지, 어떤 Source가 처리된 것으로 기록될지에는 관여하지 않는다.

Production 결과물의 유효성 검증(Schema 형식, 필수 필드 존재 등)은 Writer나 Summarizer 내부에 섞지 않고 별도의 Validator 책임으로 분리한다.

이 분리를 통해 각 모듈은 여전히 독립적으로 이해되고 테스트될 수 있다.


## 30. Production Source Reference 기준

Production 단계의 Source Reference는 Section 11(Source Reference / Provenance 원칙)의 최소 기반을 그대로 계승하여 다음 두 항목을 기준으로 사용한다.

- filename
- 전체(축약하지 않은) content_hash — 64자리 lowercase hex 전체

Production Source Reference에서도 화면 표시용으로 content_hash를 축약할 수 있으나, 내부적으로 근거를 연결할 때는 반드시 전체 64자리 값을 사용한다. 복잡한 Database ID나 Provider 전용 ID에 의존하지 않는다는 Section 11의 원칙은 Production 단계에서도 동일하게 유지된다.


## 31. Production Artifact Atomic Write

Production Daily/Review Artifact를 실제로 Google Drive에 기록할 때도 Section 13의 데이터 안전 원칙과 Phase 3/4에서 확립된 Atomic Write 방식(임시 파일 작성 후 rename)을 동일하게 적용한다.

부분적으로 손상된 Production Artifact가 남는 상황을 방지하는 것이 목적이며, 구체적인 구현 방식은 Constitution에서 고정하지 않고 Production Core 구현 단계에서 결정한다.


## 32. Production State Commit 원칙 (markProcessedBatch, Atomic Batch Commit)

Production Processing State의 기록은 개별 Source 단위가 아니라 하나의 Finalization 실행 단위로 일괄 처리한다.

이를 위해 다음 형태의 Batch 단위 기록 API를 사용한다.

```text
markProcessedBatch
```

하나의 Daily Finalization에 포함된 모든 Source의 처리 완료 기록은 하나의 Atomic Batch Commit으로 반영되며, 일부만 반영되고 나머지가 누락되는 중간 상태를 허용하지 않는다.

Processing State에 대한 Commit은 반드시 Production Artifact 저장이 성공한 이후에만 수행한다. Artifact 저장이 확인되기 전에 State를 먼저 확정하지 않는다.

Production Processing State Commit은 오직 Production Pipeline Orchestrator만 호출할 수 있다. Production Artifact Writer, Summarizer, Validator, AI Adapter는 Processing State를 직접 변경해서는 안 되며, 이 중 어느 모듈도 markProcessedBatch 또는 markProcessed를 호출하지 않는다.

하나의 Production Finalization 안에서 State Commit은 단 한 번의 Atomic Batch Commit으로만 수행하며, 개별 Source 단위로 markProcessed()를 반복 호출하는 방식은 Production Finalization에서 금지한다.

핵심 원칙: Production Orchestrator만 Artifact Write와 State Commit의 순서를 조정한다.


## 33. State Commit 실패 시 복구 원칙

Production Artifact 저장에는 성공했으나 이어지는 Processing State Batch Commit이 실패하는 경우, 다음 원칙을 따른다.

- 이미 저장된 Production Artifact는 삭제하거나 롤백하지 않고 그대로 유지한다.
- 시스템은 다음 상태로 이 상황을 명확히 표시한다.

```text
RECOVERY_REQUIRED
```

- 이 상태는 Artifact는 존재하지만 State가 아직 이를 반영하지 못했다는 불일치를 의미하며, 사람의 확인과 개입이 필요함을 나타낸다.

Constitution v0.2.0 초기 범위에서는 이 불일치를 자동으로 감지하여 복구하는 별도의 Recovery Utility를 구현하지 않는다. 복구는 v0.2 이후 실제 운영 경험을 바탕으로 별도 검토한다.

RECOVERY_REQUIRED는 Production Artifact는 성공적으로 생성되었으나 Processing State Commit이 아직 완료되지 않은 상태를 의미한다. 이 상태에서는 다음을 자동으로 수행하지 않는다.

- 자동 Retry
- 기존 Production Artifact 삭제
- 기존 Production Artifact 자동 overwrite
- Source를 자동으로 다시 AI에 전달
- 자동 State 복구

Recovery는 Human Approval 이후에만, 별도의 Recovery Utility 또는 Recovery Pipeline을 통해 수행한다. Recovery의 기본 목적은 이미 생성된 Production Artifact와 그 Provenance를 확인한 뒤 Processing State만 안전하게 동기화하는 것이다. Recovery Utility 자체는 현재 v0.2.1 구현 범위에 포함되지 않는다.

핵심 원칙: Recovery는 재생성이 아니라 기존 기록을 보존한 상태에서 State를 복구하는 작업이다.


## 34. Development / Production Pipeline 분리 원칙

Phase 5에서 만든 Development Pipeline과 향후 만들어질 Production Pipeline은 서로 다른 별도의 파이프라인으로 유지한다.

Development Pipeline은 계속해서 개발/검증 목적의 Prompt Package 생성까지만 담당하며, Production Artifact를 생성하지 않는다.

Production Pipeline은 이번 v0.2.0 Constitution 개정에서 정의하는 원칙(Section 26~33)을 따르는 별도의 흐름으로 구현하며, Development Pipeline의 코드를 확장하는 방식으로 Development와 Production의 경계를 흐리지 않는다.


## 35. Production 테스트 및 검증 원칙

Production 관련 자동 테스트는 Section 18(테스트 및 검증 원칙)을 다음과 같이 구체화한다.

- 자동 테스트는 OS temp 디렉터리와 Fake AI Adapter만 사용한다.
- npm test 실행 과정에서 실제 AI Provider 호출이나 실제 Google Drive 접근이 발생해서는 안 된다.
- 자동화된 재시도(Retry) 로직은 최소한으로 유지하며, 복잡한 Retry/Backoff 전략을 자동 테스트나 Core 로직에 기본값으로 내장하지 않는다.
- 실제 AI Provider 또는 실제 Google Drive를 사용하는 Smoke Test는 npm test와 분리된 별도 실행 경로로 존재하며, 반드시 Human Approval 이후에만 수행한다.

Phase 공통 운영 원칙(Constitution v0.2.1)은 다음과 같다.

- 각 Phase는 가능한 한 독립적으로 테스트 가능해야 한다.
- 다음 Phase는 이전 Phase의 전체 회귀 테스트가 PASS한 이후에만 시작한다.
- Protected File은 현재 Phase의 명시적 허용 범위를 벗어나 수정하지 않는다.
- Phase 완료 후 표준 완료 보고와 Self Audit을 수행한다.
- 테스트 결과가 AI의 설명보다 우선한다.
- Phase 작업 중 새로운 설계 문제가 발견되면 임의로 Scope를 확장하지 않고 Human Decision을 요청한다.
- Human Approval이 필요한 경계에서는 다음 Phase로 자동 진행하지 않는다.


## 36. Production Credential 및 Secret 취급 원칙

Production Credential(AI Provider API Key 등)은 다음 원칙을 따른다.

- 코드에 하드코딩하지 않는다.
- Git Repository에 commit하지 않는다.
- 로그에 출력하지 않는다.
- Production Artifact에 기록하지 않는다.
- 테스트 fixture에 포함하지 않는다.
- Environment Variable 또는 승인된 Secret Configuration을 통해서만 주입한다.
- Credential이 없거나 유효하지 않으면 실제 AI 호출 전에 명시적으로 실패한다. 조용히 대체 값이나 우회 Key를 사용하지 않는다.
- Credential 관련 오류 메시지에는 Credential 전체 값을 포함하지 않는다.
- Human Decision 없이 우회 Key 또는 대체 Key를 임의로 사용하지 않는다.

이 원칙은 Section 13(데이터 안전 및 원본 보호 원칙)의 정신을 Credential에도 동일하게 적용한 것이다.


## 37. Phase 9 종료 상태 (Real AI Adapter)

Phase 9(Real AI Adapter)는 다음 상태로 종료되었다.

```text
Status: COMPLETE / FROZEN
```

- OpenAI: `IMPLEMENTED / NOT LIVE VERIFIED` — 사유: DEFERRED — COST GATE. 이는 실제 Live API 호출을 수행하지 않기로 한 Human Decision이며, Phase 9 종료를 막는 Blocker가 아니다.
- Gemini: `IMPLEMENTED / LIVE VERIFIED — PASS` — Free Tier 기준 실제 1회 Live Smoke Test를 수행했다(API Call Count 1, Result type string, PASS). 세션 종료 후 Credential은 제거되었다.
- Provider Independence: `VERIFIED` — Fake, OpenAI, Gemini Adapter 모두 동일한 `execute(promptPackage) => Promise<string>` Contract를 만족하며, Provider-specific 로직은 각 Adapter 파일 내부로만 격리되어 있다.
- Production Pipeline Integration: `NOT PERFORMED BY DESIGN` — Real Adapter를 Production Pipeline에 실제로 연결하는 작업은 Phase 9 범위에 포함하지 않았다. 이는 결함이 아니라 의도된 종료 조건이며, 연결은 향후 별도 Phase에서 다룬다.


## 38. Collection 운영 규칙 (00_INBOX → 01_RAW)

Phase 12, Human Approved 2026-09-14. 다음을 Collection의 공식 최소 규칙으로 확정한다.

- `00_INBOX` = 새로 유입된, 아직 정리되지 않은 Source가 임시로 모이는 곳이다.
- `01_RAW` = Daily 생성의 근거가 되는, 정리된 보존 원본이다.
- Collection은 `00_INBOX`에 있는 대상 파일을 `01_RAW`로 옮기는 것이다.
- 대상 확장자는 `.md`, `.txt`로 한정한다.
- 이동 과정에서 파일 내용을 변경하지 않는다.
- 이동하려는 파일과 동일한 filename이 `01_RAW`에 이미 있으면 overwrite하지 않고 skip하며, 원본은 `00_INBOX`에 그대로 유지한다.
- Collection은 Gemini 등 AI Provider를 호출하지 않는다.
- Collection은 Daily Finalization을 실행하지 않는다.
- Collection은 Processing State를 변경하지 않는다.
- Collection 실패 시 자동 Retry를 수행하지 않는다.
- Collection 실행 시각은 매일 08:00, 18:00이다.