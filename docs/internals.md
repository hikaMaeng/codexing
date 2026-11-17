# Internals

| 경로 | 역할 |
| --- | --- |
| bin/codexing.js | prefix parsing, 읽기/선택, 버전 검사, MCP 충돌 조회, spawn |
| lib/config.js | UTF-8/BOM JSON, exclusive init, 모델 검증, URL 정규화 |
| lib/models.js | 단일/wrapped schema, selector, TTY readline menu/cancel |
| lib/arguments.js | 폴더 grammar, native conflict guard, config/profile hoist |
| lib/executable.js | Windows native/npm backing entry 및 POSIX PATH 탐색 |
| lib/provider.js | TOML inline serializer, unique provider, child-only env |
| lib/mcp.js | 제한 native MCP schema 및 namespaced CLI override |
| lib/lifecycle.js | 신호 전달·grace escalation·종료 코드·listener cleanup |

설정과 MCP는 매 실행 읽는다. 전역 상태·runtime deps·임시 인증파일·user Codex 파일 patch는 없다. init만 launcher 설정 파일을 만들며 chmod mode 0600은 POSIX에서 적용된다. Windows ACL은 OS/사용자가 관리한다.

버전/MCP 조회 subprocess는 최대 15초, buffer 4 MiB이다. JSON 진단은 내부 검증에만 쓰고 provider/MCP 값이나 토큰을 출력하지 않는다. native child stdout/stderr는 그대로 연결되므로 Codex/서버 자체 출력은 런처의 redaction 대상이 아니다.
