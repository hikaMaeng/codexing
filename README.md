설치된 Codex CLI를 로컬·자체 호스팅 Responses API 모델로 실행하는 작은 npm 런처입니다.

# Codexing

`codexing`은 평소 사용하는 Codex CLI에 **서버 주소, 모델, 컨텍스트 크기, 인증과 추가 MCP**를 연결합니다. 설정을 한 번 저장하면 어느 폴더에서든 `codexing`으로 시작할 수 있습니다. 여러 서버나 모델을 등록하면 실행할 때 번호로 고를 수 있습니다.

Codex CLI와 모델 서버는 사용자가 별도로 설치하고 실행합니다. 이 패키지에는 Codex, 모델, 추론 서버가 포함되지 않으며 실행 의존성도 없습니다. [Clauding](https://github.com/hikaMaeng/clauding)과 비슷한 사용 흐름을 제공하되, Codex의 네이티브 provider 설정과 Responses API를 사용합니다.

| Goal | File |
| --- | --- |
| 역할과 사용 대상 | [overview](docs/overview.md) |
| 설정·명령 API | [api](docs/api.md) |
| 제약과 인증 경계 | [constraints](docs/constraints.md) |
| 테스트와 검증 범위 | [testing](docs/testing.md) |
| 단계별 사용 예 | [usage](docs/usage.md) |
| 설정 전달 구조 | [architecture](docs/architecture.md) |
| 코드 흐름 | [internals](docs/internals.md) |

## 무엇이 편해지나요?

- **프로젝트마다 같은 명령:** 현재 폴더에서 `codexing`, 다른 작업 폴더는 `codexing "F:\dev\my-project"`로 실행합니다.
- **여러 모델 선택:** 서버 주소가 다른 모델도 한 파일에 등록하고 실행할 때 선택합니다. 자동화에서는 번호나 고유 모델 ID를 지정합니다.
- **기존 Codex 환경 활용:** Codex 사용자·프로젝트 설정, AGENTS.md, 스킬, 기존 MCP는 네이티브 Codex의 로딩 규칙을 따릅니다.
- **Codexing 전용 MCP 추가:** 별도 JSON 파일을 네이티브 MCP 설정으로 변환해 해당 실행에만 추가합니다.
- **원본 설정 보존:** `~/.codex/config.toml`과 인증파일을 덮어쓰지 않습니다. 선택한 연결 설정은 자식 프로세스의 CLI 옵션과 환경변수로 전달합니다.
- **터미널 그대로 사용:** Codex의 화면·입출력을 그대로 연결하고 종료 코드를 반환합니다. 기본 승인 정책이나 샌드박스 정책을 변경하지 않습니다.

## 1. 준비와 설치

필요한 것은 **Node.js 22 이상**, PATH에서 찾을 수 있는 **공식 Codex CLI 0.163.0 이상**, 그리고 **Responses API와 스트리밍을 지원하는 모델 서버**입니다. 현재 네이티브 통합 검증 버전은 Codex 0.163.0입니다. 다른 버전은 옵션·설정 동작이 달라질 수 있습니다.

```sh
node --version
codex --version
npm install -g github:hikaMaeng/codexing
codexing --help
```

GitHub 설치에는 Git이 필요합니다. npm 레지스트리에 게시한 패키지가 아니므로 위 GitHub 주소를 사용하세요. 소스에서 설치하려면 다음과 같이 실행합니다.

```sh
git clone https://github.com/hikaMaeng/codexing.git
cd codexing
npm install -g .
```

Windows PowerShell에서 실행 정책 때문에 npm 스크립트가 차단되면 `npm.cmd`, `codex.cmd`, `codexing.cmd`를 사용하세요. 시스템 실행 정책을 바꿀 필요는 없습니다.

## 2. 연결 정보 저장

서버가 `/v1/responses`를 제공한다면 **API base URL은 `/v1`까지** 지정합니다. `/responses` 자체를 넣지 마세요. 서버가 다른 API 경로를 사용한다면 그 경로에 맞춰 입력하세요. 런처는 `/v1`을 자동으로 추가하거나 Anthropic URL을 변환하지 않습니다.

```sh
codexing --init http://127.0.0.1:1234/v1 openai/gpt-oss-20b
```

사용자 홈의 `~/.codexing/config.json`을 만듭니다. 인자 없이 `codexing --init`을 실행해도 위 예시를 생성합니다. **기존 파일이 있으면 수정하지 않습니다.** 예시 모델 ID는 실제 서버가 제공하는 모델 ID로 바꾸세요.

```json
{
  "baseUrl": "http://127.0.0.1:1234/v1",
  "model": "openai/gpt-oss-20b",
  "contextTokens": 131072
}
```

인증이 필요한 서버에는 `"authToken": "your-server-token"`을 추가합니다. 생략하면 API 인증 헤더를 추가하지 않습니다. `contextTokens`는 Codex의 `model_context_window`로 전달되며, 서버의 실제 컨텍스트 한도를 늘리는 기능은 아닙니다.

`authToken`은 로컬 JSON에 평문으로 저장되므로 파일 접근 권한을 관리하고 저장소에 커밋하지 마세요. 토큰 값은 Codex 실행 인자에 넣지 않습니다. 기존 OpenAI 로그인이나 `OPENAI_API_KEY`를 선택한 서버의 인증으로 재사용하지 않습니다.

## 3. 원하는 폴더에서 실행

```sh
codexing
codexing "F:\dev\my-project"
codexing "F:\dev\my-project" --no-alt-screen
codexing -- "이 저장소의 구조를 설명해 줘"
codexing -- exec "이 저장소의 구조를 설명해 줘"
codexing "F:\dev\my-project" -- exec --json "변경 사항을 요약해 줘"
```

첫 번째 일반 인자는 **폴더**입니다. Codex의 서브커맨드나 시작 프롬프트를 바로 전달하려면 먼저 `--`를 넣으세요. `codexing exec`는 `exec` 폴더를 찾고, `codexing -- exec`는 Codex의 비대화 실행입니다. 폴더 뒤에서는 `--`를 생략해 옵션을 전달할 수도 있습니다.

| 명령 | 동작 |
| --- | --- |
| `codexing --help` | 런처 도움말, 설정 불필요 |
| `codexing -- --help` | 설정을 적용한 Codex 도움말 |
| `codexing -- --version` | 선택된 설치본의 버전 |
| `codexing --init [base-url model-id]` | 설정 파일 최초 생성 |
| `codexing [folder]` | 해당 폴더에서 대화형 Codex 실행 |
| `codexing --select-model 2 [folder]` | 두 번째 모델로 실행 |
| `codexing -- exec [options] "prompt"` | 비대화 실행 |

네이티브 `-c`/`--config`와 `--profile`은 루트로 모아 전달합니다. Codex 0.163.0에서 루트와 서브커맨드 양쪽의 `-c`가 충돌하는 것을 방지하기 위한 처리입니다. 프롬프트와 나머지 인자는 셸로 재조합하지 않고 배열 그대로 전달합니다.

`--model`, `--oss`, `--local-provider`, `--remote`, `-C` 및 provider·모델·컨텍스트·인증·MCP를 바꾸는 `-c`는 충돌 오류로 중단합니다. 승인·샌드박스 옵션은 사용자가 지정한 그대로 네이티브 Codex에 전달합니다. 로그인·로그아웃·MCP 관리 등 관리 명령은 `codex`로 직접 실행하세요.

## 여러 모델 등록

단일 객체 대신 `models` 배열로 저장합니다. 배열과 단일 모델 필드를 섞지 마세요.

```json
{
  "models": [
    {
      "baseUrl": "http://127.0.0.1:1234/v1",
      "model": "openai/gpt-oss-20b",
      "contextTokens": 131072
    },
    {
      "baseUrl": "https://your-gateway.example/v1",
      "model": "team-coder",
      "contextTokens": 65536,
      "authToken": "your-gateway-token"
    }
  ]
}
```

터미널에서는 모델 ID와 서버 주소가 표시됩니다. 번호를 입력하고 Enter를 누르며, 빈 입력은 1번입니다. 입력·출력이 터미널이 아닌 환경에서는 자동 선택하지 않으므로 다음처럼 명시하세요.

```sh
codexing --select-model 2 -- exec "저장소를 요약해 줘"
codexing --select-model team-coder "F:\dev\my-project"
```

같은 모델 ID를 여러 서버에 등록했다면 번호를 사용하세요. 숫자로만 된 ID도 번호로 해석합니다. 모든 모델 설정을 먼저 검증하므로 선택하지 않은 항목에 오류가 있어도 실행을 중단합니다.

## Codexing 전용 MCP

`~/.codexing/mcp.json`을 직접 만드세요. 파일이 없으면 기존 Codex MCP만 사용합니다. 지원하는 형식은 다음과 같습니다.

```json
{
  "mcpServers": {
    "files": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server.js"],
      "env_vars": ["PROJECT_ROOT"]
    },
    "team": {
      "url": "https://your-mcp.example/mcp",
      "bearer_token_env_var": "TEAM_MCP_TOKEN"
    }
  }
}
```

`files`는 네이티브 이름 `codexing_files`, `team`은 `codexing_team`으로 추가됩니다. 기존 MCP는 유지합니다. 같은 이름이 이미 존재하면 네이티브 `mcp list --json`으로 감지하고 실행을 중단합니다. 설정 조회에 실패해도 덮어쓰지 않고 중단합니다.

stdio와 Streamable HTTP를 지원하며 `type: "sse"`, 인라인 `env`·`http_headers`·토큰 필드는 지원하지 않습니다. 비밀값은 환경변수에 두고 `env_vars`, `bearer_token_env_var`, `env_http_headers`로 참조하세요. 명령·인자·URL에는 토큰을 넣지 마세요. MCP 실행파일과 서버는 따로 준비해야 합니다. 전체 필드는 [API 문서](docs/api.md)에 있습니다.

## 기존 Codex 설정은 어떻게 되나요?

Codexing은 `CODEX_HOME`을 변경하지 않습니다. 지정돼 있으면 해당 Codex 홈을 그대로 쓰고, 지정하지 않으면 네이티브 기본 홈을 사용합니다. 사용자·신뢰된 프로젝트 설정과 AGENTS·스킬·플러그인도 Codex 자체 규칙을 따릅니다. `~/.codexing`은 일반 사용자 홈에 고정되며 `CODEX_HOME`과 별개입니다.

선택한 모델과 provider, 지정한 컨텍스트 크기는 CLI 설정으로 기존 기본값보다 우선합니다. 기타 설정은 상속됩니다. 시스템·조직 강제 정책은 CLI보다 우선할 수 있습니다. **관리형 환경에서 provider 강제 정책이 있으면 Codexing으로 라우팅을 보장할 수 없으므로 사용하지 마세요.** 네이티브 Codex는 세션·로그·캐시 등 정상 상태 파일을 기록할 수 있습니다. 런처가 전체 Codex 홈을 읽기 전용으로 만드는 것은 아닙니다.

실행마다 새로운 provider ID를 사용해 기존 provider의 인증·헤더가 합쳐지지 않도록 합니다. 이 때문에 이전 세션은 다른 provider로 인식될 수 있습니다. `resume`/`fork`에서는 명시적인 세션 ID와 Codex의 `--all` 등 조회 옵션을 사용하세요. `--last`나 기본 picker에서의 재발견은 보장하지 않습니다. 선택한 연결 보장은 시작 시점 기준이며, 세션 안에서 사용자가 바꾸는 설정은 Codex가 처리합니다.

## 문제 해결

| 증상 | 확인할 내용 |
| --- | --- |
| Codex를 찾지 못함 | 공식 Codex를 설치하고 `codex --version` 확인. Windows는 PATH 순서대로 `.exe` 또는 공식 npm 설치의 backing entry를 탐색하며 사용자 PowerShell shim은 실행하지 않음 |
| 설정 파일 없음 | `codexing --init` 실행 후 모델 ID·API base 수정 |
| 404 또는 스트림 종료 | 서버가 `/responses`와 Codex 호환 SSE를 지원하는지 확인. Chat Completions·Anthropic 전용 서버는 불가 |
| 인증 오류 | 해당 서버의 `authToken` 확인. ChatGPT 로그인은 타사 서버 인증을 대신하지 않음 |
| 환경변수 충돌 | 오류에 나온 `OPENAI_BASE_URL`·`CODEX_API_KEY`를 현재 셸에서 해제하고 재실행. 런처가 값을 출력하지 않음 |
| 여러 모델로 자동화 실패 | `--select-model`을 폴더보다 앞에 지정 |
| MCP 이름 충돌 | 기존 네이티브 `codexing_...` 이름 또는 추가 항목 이름 변경 |
| 모델 metadata 경고·도구 실패 | 서버·모델의 Codex 도구 호출/Responses 지원 범위 확인. API 호환성과 모델의 작업 품질은 별개 |

검증하려면 소스 폴더에서 `npm test`, 실제 설치 Codex와 모의 로컬 서버 통합 검사는 `npm run test:native`를 실행하세요. 테스트는 실제 모델 품질이나 사용자 서버 가용성을 판정하지 않습니다. [검증 기록과 한계](docs/testing.md)를 확인하세요.
