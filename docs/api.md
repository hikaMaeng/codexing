# API

`codexing [--select-model <1-based index|unique model-id>] [folder] [--] [Codex args]`

`codexing --init [base-url model-id]` / `codexing --help`

첫 일반 인자는 폴더다. 서브커맨드/시작 프롬프트 앞에 런처 `--`를 둔다. 폴더 뒤 `--`도 소비한다. 이후의 네이티브 `--`는 그대로 보존한다. `--select-model`은 맨 앞에만 인식한다. `--init`은 인자 0개 또는 2개만 허용하며 `wx`로 기존 바이트를 보존한다.

## ~/.codexing/config.json

단일 모델 객체 또는 `{ "models": [model, ...] }`. wrapper에는 다른 필드를 허용하지 않는다.

| 필드 | 형식 | 전달 |
| --- | --- | --- |
| baseUrl | 필수 absolute HTTP(S), credentials/query/fragment 불가 | provider.base_url, trailing slash만 제거 |
| model | 필수 nonempty string, control 문자 불가 | model + review_model |
| contextTokens | 선택 positive safe integer | model_context_window; 생략 시 Codex 설정 상속 |
| authToken | 선택 nonempty printable ASCII string | child CODEXING_AUTH_TOKEN → provider.env_key |

다른 필드/null은 거절한다. HTTP는 평문 전송이므로 원격 네트워크에서는 HTTPS를 사용한다.

## ~/.codexing/mcp.json

`{ "mcpServers": { "name": { ...native fields } } }`. 이름은 `[A-Za-z0-9_-]+`; 네이티브 이름은 `codexing_<name>`이다.

| 전송 | 필드 |
| --- | --- |
| stdio | command(string), args(string[]), cwd(string), env_vars(string[]) |
| Streamable HTTP | url(HTTP(S), credentials/query/fragment 불가), bearer_token_env_var(string), env_http_headers(header → env-name map) |
| 공통 | enabled/required(boolean), startup_timeout_sec/tool_timeout_sec(positive number), enabled_tools/disabled_tools(string[]) |

command/url은 정확히 하나가 필요하다. 상대 MCP 경로는 선택한 작업 폴더를 기준으로 네이티브 Codex가 처리한다. 전송별 필드 혼합과 알 수 없는 필드는 거절한다. SSE/type/env/http_headers/인라인 토큰, OAuth 관리, remote execution 추가 옵션은 지원하지 않는다. 기존 네이티브 MCP 설정에는 이러한 제한을 적용하지 않는다.

## 네이티브 옵션

허용된 `-c`와 profile 옵션은 루트로 모으고 나머지 인자는 배열 순서를 보존한다. `--config` 키는 unquoted dotted ASCII key만 허용한다. model/review_model/model_provider/model_providers/model_context_window/mcp_servers/profile(s)/forced_login_method/forced_chatgpt_workspace_id/cli_auth_credentials_store/chatgpt_base_url/openai_base_url 및 하위 키는 거절한다. `--model`/`-m`, `--oss`, `--local-provider`, `--remote`, `--remote-auth-token-env`, `--cd`/`-C`도 거절한다.

네이티브 관리 명령은 `codex` 직접 실행 대상이다. 일반 대화와 exec/review/resume/fork/help를 위한 런처다. 유효하지 않은 나머지 옵션은 Codex가 판정한다. 자식 숫자 종료 코드는 그대로 반환하며 런처 오류는 1이다.

## VS Code 진입점

`codexing /vscode [--select-model <index|id> | --openai | --off | --status] [--settings <User/settings.json>] [--extension <official-extension-directory>]`

`/vscode`는 첫 인자일 때만 관리 명령으로 처리한다. `--on`은 기본 동작의 명시형이다. 모드 변경은 다음 app-server에 적용되며 CLI 실행의 모델/환경은 바꾸지 않는다. `~/.codexing/vscode.json`에 enabled/modelSelector/nativeExecutable/extensionPath/providerNamespace를 저장한다. 상세 동작·스냅샷·지원 버전은 [vscode.md](vscode.md)를 따른다.
