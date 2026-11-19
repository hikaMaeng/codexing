# Architecture

`argv → launcher prefix → config/model selection → child provider env → optional MCP preflight → installed Codex → exit status`

Windows에서는 PATH 각 디렉터리를 순서대로 확인한다. `codex.exe`, 공식 `@openai/codex` npm shim의 backing native optional package, backing JS/EXE entry 순으로 찾는다. `.cmd`/`.ps1` 텍스트를 셸로 실행하지 않는다. POSIX에서는 PATH의 executable `codex`를 직접 실행한다. 런처는 Codex 설치본을 내려받거나 수정하지 않는다.

CLI `-c model_providers.<random-id>={...}`로 실행마다 새로운 provider를 만든다. `wire_api=responses`, `requires_openai_auth=false`, `supports_websockets=false`, 선택 base_url과 optional env_key를 명시한다. 이어 model_provider/model/review_model, optional model_context_window를 설정한다. 기존 provider의 auth·headers와의 테이블 merge를 회피한다.

`--no-daemon`으로 공유 데몬 재사용을 피한다. `CODEX_HOME`은 보존한다. OPENAI_API_KEY와 기존 CODEXING_AUTH_TOKEN은 child에서 제거한다. nonempty OPENAI_BASE_URL/CODEX_API_KEY가 있으면 값을 숨긴 충돌 오류로 중단한다. authToken만 child CODEXING_AUTH_TOKEN에 넣고 argv·로그에 넣지 않는다. 사용자 셸 환경은 수정하지 않는다.

루트와 서브커맨드 양쪽의 -c를 쓰면 0.163.0에서 루트 overrides가 사라지는 동작이 관찰되어 모든 허용된 -c/profile을 루트로 모은다. 보호 대상 키와 native route flags는 거절한다. 네이티브 관리 명령도 직접 codex를 사용한다.

MCP가 있으면 같은 cwd/env/CLI overrides/profile로 `mcp list --json`을 실행한다. 이 조회는 MCP 서버를 시작하지 않는다. 기존 이름 충돌/조회 실패 시 중단하고, 성공하면 namespaced MCP 설정을 coding child에 추가한다. 조회와 launch 사이의 config 변경은 원자적으로 잠그지 않는다.

설정 우선순위: Codex CLI overrides > trusted project config > selected profile > user config > 기타 네이티브 기본값. 단, 관리형 requirements는 더 높은 강제 권한이며 런처는 이를 우회·완전 검증하지 않는다. AGENTS·스킬·플러그인·기존 MCP는 네이티브 discovery와 trust 규칙에 따르며 복사하지 않는다.

근거: [설정 우선순위](https://developers.openai.com/codex/config-basic), [provider 구성](https://developers.openai.com/codex/config-advanced), [설정 키](https://developers.openai.com/codex/config-reference), [MCP](https://developers.openai.com/codex/mcp). 확인 기준: 2026-11-17, 설치 CLI 0.163.0; [같은 버전 소스](https://github.com/openai/codex/tree/rust-v0.163.0).

IDE 경로는 [VS Code](vscode.md) 문서를 따른다. 공식 확장의 cliExecutable → 로컬 stdio 어댑터 → 해당 확장의 번들 app-server다. 두 모드 모두 공식 UserPromptSubmit 세션 훅으로 정확한 채팅 on/off 명령을 처리하며 네이티브 신뢰 승인을 따른다. OpenAI 모드는 원래 provider/홈/인증을 유지한다. Codexing 모드는 동일 연결의 카탈로그와 provider/MCP를 설정하며, 네이티브 설정 저장은 전용 CODEX_HOME에 격리한다. 원래 config/hooks/guidance/rules는 최초 스냅샷이고 인증은 복사하지 않는다. 지원되지 않는 app-server --profile을 사용하거나 JSON-RPC 로그인 응답을 흉내 내지 않는다.
