# Usage

설치와 JSON 예제는 [README](../README.md)에 있다.

```sh
codexing --init http://127.0.0.1:1234/v1 your-loaded-model-id
codexing
codexing "F:\dev\project"
codexing --select-model 2 "F:\dev\project" -- exec --json "구조를 설명해 줘"
codexing -- exec --sandbox read-only "구조를 설명해 줘"
codexing -- exec -c 'model_reasoning_effort="low"' "구조를 설명해 줘"
codexing -- --help
codexing -- exec --help
```

Codex 옵션은 설치 CLI의 help를 기준으로 선택한다. 저장소 밖의 exec에는 네이티브 `--skip-git-repo-check`가 필요할 수 있다. 시작 프롬프트가 폴더로 해석되지 않도록 `--`를 사용한다. 자동화에서는 여러 모델 선택을 명시한다. 전역 설치를 업데이트하려면 같은 GitHub 설치 명령을 다시 실행한다.

`authToken`은 선택한 모델 항목에서만 읽는다. 인증 없이 시작하려면 필드를 지운다. 빈 문자열이나 null을 넣지 않는다. URL은 API base 경로이며 `/v1`을 자동 보정하지 않는다. Responses API base와 Anthropic API origin을 동일하게 가정하지 않는다.

PowerShell에서 MCP용 환경변수는 `$env:TEAM_MCP_TOKEN = '...'`처럼 현재 셸에 설정한다. URL/command args에 비밀값을 넣지 않는다. `OPENAI_BASE_URL`·`CODEX_API_KEY` 충돌은 현재 셸에서 `Remove-Item Env:OPENAI_BASE_URL` 등으로 해제할 수 있다. 런처는 영구 환경변수나 설정파일을 고치지 않는다.

사용자·프로젝트 AGENTS와 스킬은 Codex 표준 위치에 둔다. Codexing 전용 AGENTS/skills 디렉터리를 새로 만드는 기능은 없다. MCP 추가만 `~/.codexing/mcp.json`으로 분리한다. 기존 설정을 확인·관리할 때는 `codex mcp list`, `codex login` 등 네이티브 명령을 사용한다.
