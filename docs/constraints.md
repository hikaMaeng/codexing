# Constraints

- Node >=22, official Codex >=0.163.0. 실제 통합 검사 0.163.0/Windows. 다른 플랫폼·향후 CLI 호환성은 별도 확인 필요.
- Responses API + Codex 호환 SSE/도구 지원 필요. Chat Completions/Anthropic 전용 API 자동 변환, 서버 시작, 모델 다운로드 기능 없음.
- 로컬 모델 품질·모든 Codex 기능 호환성·서버 한도는 보장하지 않음. contextTokens는 클라이언트 힌트이며 서버 메모리 할당 기능이 아님.
- 기존 사용자/project/AGENTS/skills/MCP는 네이티브 규칙으로 상속. Codexing이 config/auth 파일을 덮어쓰지 않지만 Codex 자체 세션·로그·캐시 기록은 가능.
- 관리자 requirements가 provider를 강제하는 환경은 지원 범위 밖. 그런 환경에서는 런처를 사용하지 말 것. 런처는 native 전체 effective-policy resolver를 재구현하지 않음.
- 시작 시 CLI/env 충돌만 통제. 세션 내부 모델 변경, resume 상태 복원, 동적으로 바뀐 policy/config, 외부 프록시/리다이렉트 정책은 보장 범위 밖.
- 매 실행 provider ID가 달라 native picker/--last로 이전 세션을 찾지 못할 수 있음. 명시적 ID 및 native --all 조회 사용. resume/fork 전체 행동은 모델 요청 통합 검사 대상이 아님.
- 토큰은 config.json 평문과 child 환경에 존재. OS 관리자·같은 사용자 프로세스, 사용자 플러그인/MCP/도구가 접근할 수 있음. 이 런처는 비밀 저장소/격리 경계가 아님. 네이티브 shell environment policy를 덮어쓰지 않음.
- MCP 추가는 stdio/Streamable HTTP 제한 schema. 기존 Codex MCP는 그대로 유지. namespaced 이름 충돌 사전 조회는 config hot reload와 원자적이지 않음.
- 기본 승인/샌드박스 우회 없음. 명시적 사용자 옵션 및 기존 네이티브 정책이 적용됨.
- caught signal은 direct child에 전달하며 2초 후 강제 종료. foreground terminal Ctrl+C는 중복 전송하지 않음. Windows TerminateProcess/부모 강제 종료는 JS로 잡을 수 없으며, 전체 후손 프로세스 정리는 보장하지 않음. 테스트가 사용자 프로세스를 종료하지 않음.

IDE 연동은 별도 [제약](vscode.md)을 따른다. 개발용 공식 cliExecutable에 의존하고, 같은 연결 그룹만 native catalog에 제공한다. OpenAI/다른 provider 전환은 프로세스 재시작·새 대화가 필요하다. custom IDE 홈은 config/guidance/rules 스냅샷이며 auth·전체 skills/플러그인/기록을 복제하지 않는다. 원래 홈의 변경을 자동 동기화하지 않는다. 공식 확장 그래픽 응답은 2026-11-19 보안창으로 미검증; 실제 번들 app-server 응답과 구분한다.
