# Overview

Codexing은 공식 Codex CLI를 재사용하는 독립 Node.js 런처다. 로컬/자체 호스팅 Responses 서버를 쓰면서 Codex의 터미널·작업 도구·지침 로딩을 유지하려는 사용자를 위한 패키지다.

| 소유자 | 책임 |
| --- | --- |
| Codexing | JSON 검증, 모델 선택, 작업 폴더, provider/MCP CLI 설정, 자식 환경·종료 코드 |
| Codex CLI | Responses 클라이언트, AGENTS/스킬/설정 로딩, 권한·도구 실행, 세션/캐시 |
| 모델 서버 | API·SSE·도구 호출 호환성, 모델 실행, 실제 컨텍스트 한도·품질 |
| 사용자 | Codex/서버 설치, 토큰·MCP 실행파일, 네이티브 권한 정책 |

Codex·모델·서버를 묶어 배포하지 않는다. 원본 Clauding 저장소와 독립적이며 Anthropic 환경변수를 사용하지 않는다. npm 레지스트리 게시 없이 GitHub 설치와 npm pack을 지원한다.
