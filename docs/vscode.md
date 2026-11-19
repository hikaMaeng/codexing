# 공식 Codex VS Code 확장 연동

Codexing은 OpenAI가 게시한 **`openai.chatgpt` 확장의 기존 Codex 그래픽 채팅**에 연결한다. 확장 파일을 패치하거나 별도 VSIX를 설치하지 않는다. 공식 확장의 개발용 `chatgpt.cliExecutable` 설정으로 작은 stdio 어댑터를 등록하고, 그 확장이 번들한 실제 Codex app-server를 실행한다.

이 설정은 OpenAI가 일반 사용자용 안정 API로 보장한 확장 지점이 아니다. 공식 문서도 개발용이라고 경고한다. 검증 버전은 확장 **26.1111.21308**, 번들 **0.169.0-alpha.11.1**, Windows 로컬 VS Code다. 확장 업데이트 후에는 재등록하고 짧은 응답을 다시 확인한다.

## 지원하는 선택 방식

| 선택 | 동작 | 적용 시점 |
| --- | --- | --- |
| 공식 채팅의 모델 선택기 | 같은 API base URL·인증 토큰·contextTokens를 공유하는 모델 선택 | 해당 provider의 새 대화/네이티브 모델 변경 |
| `codexing /vscode on --select-model 2` | 다른 연결 그룹을 포함해 config.json의 두 번째 항목 선택 | 다음 app-server 시작 이후 |
| `codexing /vscode off` | 기존 OpenAI 계정·모델·Codex 홈을 쓰는 네이티브 실행 | 다음 app-server 시작 이후 |
| `codexing /vscode on` | Codexing 모드 등록/재활성화 | 다음 app-server 시작 이후 |
| `codexing /vscode uninstall` | 실행파일 등록을 해제하고 이전 설정 복원 | 대상 창 재로드 이후 |

공식 패널 안에 Codexing ON/OFF 버튼을 추가하지 않는다. OpenAI와 Codexing을 한 모델 목록에 섞거나 provider가 다른 대화를 실행 중에 교체하지 않는다. **모드나 연결 그룹을 바꾼 뒤 대상 VS Code 창에서 `Developer: Reload Window`를 실행하고 새 채팅을 시작한다.** 실행 중인 대화와 이전 provider의 기록을 자동으로 재라우팅하지 않는다.

## 공식 그래픽 채팅에서 on/off 시작

첫 등록은 터미널에서 `codexing /vscode on`으로 한다. 재로드한 공식 Codex의 설정에서 **Hooks / Review Hooks**를 열고, 세션 플래그 출처의 **Checking Codexing mode command** 항목에 표시된 실행 경로·정의를 검토한 뒤 신뢰한다. 이 승인은 공식 확장이 `hooks/list`와 `config/batchWrite`로 처리하며 Codexing이 대신 승인하지 않는다.

그다음 **Codex 그래픽 채팅 입력란**에 다음 중 한 줄 전체를 정확히 입력해 전송한다.

```text
codexing /vscode on
codexing /vscode off
```

한 번에 한 줄만 보낸다. 앞뒤 공백, 추가 설명, `--select-model`, `uninstall`은 채팅 명령으로 처리하지 않는다. 선두 `/`의 사용자 정의 슬래시 명령을 등록하는 기능은 쓰지 않는다. 공식 `UserPromptSubmit` 훅이 모델 호출 전에 이 두 문자열만 식별하고 등록된 모드를 저장한 뒤 `decision=block`과 재로드 안내를 반환한다. 성공·실패 모두 해당 명령을 모델에 전달하지 않는다. 일반 메시지는 그대로 처리하며 프롬프트를 셸 명령으로 평가하지 않는다.

안내가 나오면 `Developer: Reload Window`를 실행하고 **새 대화**를 연다. 새 대화만 여는 것으로 기존 app-server의 provider가 바뀌지는 않는다. 현재 대화의 provider 변경·자동 재로드·기존 창 종료는 하지 않는다.

훅은 로컬/OpenAI 양쪽 어댑터 프로세스에 추가된다. **신뢰는 각 Codex 홈에서 별도**이므로 처음 OpenAI 모드로 돌아왔을 때도 같은 공식 검토가 필요하다. 훅 정의나 설치 경로가 바뀌면 다시 검토한다. `features.hooks=false`, 관리형 훅 전용 정책, 미신뢰·비활성화 상태에서는 채팅 전환이 작동하지 않아 일반 메시지로 모델에 전달될 수 있다. 훅 프로세스의 실행 실패·60초 시간 초과도 네이티브의 차단 보장 밖이다. 전환 안내가 없으면 성공으로 간주하지 말고 터미널의 `/vscode --status`로 확인한다. 먼저 Hooks 화면의 활성화·신뢰 상태를 확인하거나 터미널 명령을 사용한다. Codexing은 기능 플래그나 정책을 강제 변경하지 않는다.

이는 모델에게 셸 실행을 요청하는 스킬이 아니라 공식 훅 경로다. VS Code의 단축키·명령 팔레트·통합 터미널에서 전환하는 것을 인채팅 기능이라고 부르지 않는다. app-server의 실제 프롬프트 처리·차단은 통합 검사로 검증하며, 그래픽 화면의 최종 클릭 확인 범위는 아래에 구분한다.

## 설치와 첫 연결

1. VS Code 확장 화면에서 게시자가 OpenAI인 **Codex – OpenAI's coding agent** (`openai.chatgpt`)를 설치한다. CLI로는 `code --install-extension openai.chatgpt`를 사용할 수 있다.
2. Node.js 22 이상과 Git을 준비하고 Codexing을 전역 설치한다.

```sh
npm install -g github:hikaMaeng/codexing
codexing --init http://127.0.0.1:1234/v1 your-model-id
codexing /vscode on
```

3. 등록 출력의 모델·설정 경로·백업 경로를 확인한다.
4. 대상 VS Code 창을 재로드하고 Codex 사이드바에서 새 대화를 연다.
5. 모델 선택기에 **`Codexing · your-model-id`**가 표시되는지 확인하고 `안녕하세요 한 단어로 답해 주세요`처럼 짧게 요청한다.

PowerShell 실행 정책에 걸리면 `npm.cmd`, `codexing.cmd`, `code.cmd`를 사용한다. 실행 정책을 바꾸지 않는다. IDE 연동은 PATH의 별도 npm Codex 대신 **해당 공식 확장에 동봉된 app-server**를 사용한다. CLI의 `codexing` 실행은 기존 PATH 탐색 방식을 유지한다.

## OpenAI 로그인 없이 사용

Codexing 모드는 실제 provider를 `wire_api="responses"`, `requires_openai_auth=false`로 구성한다. app-server가 반환하는 `account/read`의 `requiresOpenaiAuth=false`를 그대로 공식 확장에 전달한다. 로그인 완료 응답이나 OpenAI 인증을 만들어 내지 않는다.

API 서버에 자체 인증이 필요하면 `~/.codexing/config.json`의 `authToken`을 설정한다. 이 토큰은 자식 환경변수로 전달하며 명령행 인자에 넣지 않는다. **OpenAI 계정 없이 사용 가능하다는 말은 타사 서버 인증도 생략한다는 뜻이 아니다.** 서버는 Codex 호환 Responses API와 SSE를 지원해야 한다.

설치된 버전과 서버가 호환되면 OpenAI 로그인 화면 없이 로컬 모델 대화를 시작할 수 있다. 계속 로그인 화면이 뜨면 먼저 `/vscode --status`, 재로드 여부, 실행파일 경로와 확장 로그를 확인한다. 로그인 화면을 가짜로 닫거나 공식 확장 UI를 패치하지 않는다.

## 여러 모델

CLI와 같은 파일·같은 스키마를 쓴다. URL은 API base이며 `/responses`까지 넣지 않는다.

```json
{
  "models": [
    { "baseUrl": "http://127.0.0.1:1234/v1", "model": "coder-small", "contextTokens": 65536 },
    { "baseUrl": "http://127.0.0.1:1234/v1", "model": "coder-large", "contextTokens": 65536 },
    { "baseUrl": "https://your-gateway.example/v1", "model": "team-coder", "authToken": "your-token" }
  ]
}
```

```sh
codexing /vscode on --select-model 1
```

`coder-small`과 `coder-large`는 같은 연결 그룹이므로 공식 모델 선택기에 함께 나온다. `team-coder`는 다른 연결이므로 다음처럼 선택한 뒤 재로드·새 대화를 사용한다.

```sh
codexing /vscode on --select-model team-coder
```

모델 ID가 중복이면 번호를 쓴다. 첫 등록 시 여러 모델이 있고 선택을 지정하지 않으면 터미널 메뉴를 사용한다. 파이프·자동화에서는 `--select-model`을 명시한다. 확장 프로토콜에는 터미널 메뉴나 상태 문구를 출력하지 않는다. 모든 항목을 검증한 다음 선택하므로 다른 항목의 오류도 수정해야 한다.

네이티브 `model_catalog_json`에는 선택한 그룹의 모델만 넣는다. 모델 ID·표시명·선택적 컨텍스트를 제공하고 텍스트 입력만 선언한다. 이미지 입력·추론 강도·클라우드 기능을 임의로 지원한다고 표시하지 않는다. 선택기에 나온다고 해당 서버가 Codex의 모든 도구를 구현한다는 뜻은 아니다.

## 기존 OpenAI 연결로 전환

```sh
codexing /vscode off
```

대상 창을 재로드하고 새 대화를 시작한다. 이 모드의 어댑터는 채팅 전환용 세션 훅·환경 표시자를 추가하고, 원래 provider 설정·`CODEX_HOME`·로그인 상태를 사용한다. Codexing provider·모델 카탈로그·추가 MCP를 붙이지 않는다. 기존 계정이 없다면 공식 로그인 흐름을 사용한다. 계정이나 토큰을 대신 생성하거나 로그인하지 않는다.

다시 로컬 연결을 쓰려면 `codexing /vscode on [--select-model <번호>]` 후 재로드한다. `off`는 어댑터를 남긴 모드 변경이고, `uninstall`은 이전 실행파일 설정으로 돌아가는 등록 해제다. 등록 전 다른 사용자 지정 실행파일이 있었다면 그 **정확한 설정 값**을 `uninstall`에서 복구한다. 호환성을 위해 인자 없는 `/vscode`·`--on`은 `on`, `--openai`는 `off`, **기존 `--off`는 `uninstall`**로 유지한다. `unregister`도 등록 해제다.

## 기존 설정·인증·작업 보존

- 등록은 VS Code 사용자 설정의 `chatgpt.cliExecutable` 한 키만 바꾼다. 원본 바이트를 `~/.codexing/vscode/backups/`에 저장하고 JSONC 주석·다른 키를 보존한다.
- 설정·등록 상태·모드 파일 쓰기가 실패하면 이번 변경의 이전 바이트로 롤백한다. 동시 편집된 파일은 덮어쓰지 않고 오류와 백업 위치를 안내한다.
- 해제 때 설정 전체가 등록 당시와 같으면 원본 바이트를 복원한다. 다른 키를 편집했다면 이 키만 복구한다. 실행파일 키 자체가 외부에서 바뀌었으면 자동 복원을 중단한다.
- 원래 Codex의 `config.toml`이나 인증파일을 덮어쓰지 않는다. 모델 선택기가 기본값을 저장할 수 있어 **Codexing 모드는 전용 Codex 홈**을 사용한다. 위치는 `~/.codexing/vscode/codex-home-<namespace>-<source-hash>/`다.
- 전용 홈의 최초 준비에서 원래 `CODEX_HOME`(기본 `~/.codex`)의 `config.toml`, `hooks.json`, `AGENTS.md`, `AGENTS.override.md`, `rules/*.rules` 중 없는 파일을 스냅샷으로 가져온다. **인증파일·키체인 자격증명은 복사하지 않는다.** 이후 원본의 변경 사항을 자동 동기화하지 않으며 기존 스냅샷을 덮어쓰지 않는다. 사용자 훅 스냅샷도 전용 홈에서 공식 신뢰 검토를 따른다.
- 원래 홈 안의 skills·플러그인 캐시·세션 전체를 복제하지 않는다. 프로젝트 지침과 `~/.agents/skills` 등은 실제 Codex의 탐색 규칙에 따른다. 전용 홈에서 GUI가 저장하는 환경설정·세션·로그는 원래 홈과 별개다.
- OpenAI 모드는 전용 홈을 적용하지 않는다. 기존 인증과 설정을 그대로 사용한다. CLI의 일반 `codexing` 실행도 이 IDE 전용 홈을 사용하지 않는다.
- 등록·모드 변경·해제는 사용자 창·실행 중인 app-server·모델 서버를 종료하지 않는다. 사용자가 대상 창의 재로드 시점을 정한다.

Windows에서는 .NET Framework의 C# 컴파일러로 로컬 exe 진입점을 만든다. 설치된 Node와 런처를 연결하며 stdin/stdout/stderr를 바이트 단위로 전달한다. 어댑터가 종료되면 그 Windows Job의 자식도 정리한다. POSIX는 `exec` shim을 사용하지만 실제 IDE 그래픽 검증은 Windows 범위다.

Windows 훅은 설치된 Node 디렉터리를 자식 PATH 맨 앞에 고정하고 `NoDefaultCurrentDirectoryInExePath=1`로 cmd의 작업 폴더 검색을 끈다. 프로젝트의 동명 `node.exe`·`node.cmd`가 훅 실행파일을 대체하지 못하도록 실제 통합 검사에 이 항목들을 둔다. 훅 스크립트 경로는 절대 경로이며 셸 메타문자가 있는 설치 경로는 오류로 중단한다. Node 설치 위치를 바꾸면 재등록 후 훅 정의를 다시 검토한다.

## Codexing 추가 MCP

기존 `~/.codexing/mcp.json`을 같은 형식 그대로 읽는다. 별도 MCP 파일이나 토큰을 다시 입력할 필요가 없다. `mcpServers.name`은 실제 native `codexing_name`으로 변환하고 원래 설정 스냅샷의 다른 MCP도 유지한다. 충돌이나 조회 실패는 서버 실행 전에 중단한다.

지원하는 stdio/Streamable HTTP 필드와 환경변수 참조는 [API](api.md)에 있다. CLI 전용 실행파일만 있는 MCP라면 VS Code 프로세스의 PATH와 실행 경로도 확인한다. OpenAI 모드에서는 Codexing 추가 MCP를 붙이지 않으며 원래 Codex MCP를 사용한다. 자체 MCP 서버의 로그인·권한과 초기화 오류는 별도로 해결해야 한다.

## 등록 상태·다른 설치 경로·해제

```sh
codexing /vscode --status
codexing /vscode --help
codexing /vscode uninstall
```

기본 탐색은 로컬 안정판 VS Code의 사용자 확장 디렉터리이며, `extensions.json`의 활성 `openai.chatgpt`와 그 manifest를 확인한다. 별도 `--user-data-dir`나 설치 디렉터리를 쓰는 경우 경로를 명시한다.

```sh
codexing /vscode on --settings "/path/to/custom-user-data/User/settings.json" --extension "/path/to/openai.chatgpt-version"
```

`--settings`는 **사용자 데이터 디렉터리의 사용자 설정**을 뜻한다. 확장의 application-scope 설정이므로 프로젝트 `.vscode/settings.json`에 넣지 않는다. WSL·Remote SSH·다른 에디터로 자동 등록하지 않는다. 기존 Windows의 WSL 실행 모드가 켜져 있으면 이를 변경하지 않고 등록을 중단한다.

한 사용자 홈에서 자동 등록 대상은 한 settings.json이다. 대상 변경 전에 `uninstall`한다. 백업·카탈로그·전용 Codex 홈은 해제해도 남아 있으며 원래 Codex 실행에 영향을 주지 않는다. 필요할 때 사용자가 확인 후 보관·정리한다.

## 문제 해결

| 증상 | 확인 |
| --- | --- |
| 공식 확장을 찾지 못함 | `openai.chatgpt` 설치 및 `--extension` 경로 확인. 비공식 확장 manifest는 사용하지 않음 |
| 개발용 CLI 경고 | 공식 `chatgpt.cliExecutable` 옵션 자체의 경고. 이 통합은 해당 옵션에 의존함 |
| 로컬 ID가 모델 목록에 없음 | 등록 후 재로드했는지, `Codexing · ...` 표시명과 생성 카탈로그 존재 여부 확인. 모델 기본값만 바꿔서는 목록에 추가되지 않음 |
| 모델을 바꿨는데 서버가 그대로임 | 선택기는 같은 연결 그룹만 표시. 다른 서버·인증·컨텍스트는 `/vscode on --select-model` 후 재로드·새 채팅 |
| OpenAI 인증 화면만 보임 | `/vscode --status`가 Codexing인지, 공식 확장 Output 로그의 어댑터 오류와 계정 요구 상태 확인 |
| CLI에서는 되는데 IDE에서 실패 | IDE는 번들 app-server와 전용 홈 사용. 버전·스냅샷 설정·MCP PATH·서버 Responses 호환성 차이를 확인 |
| 확장 업데이트 후 실행파일 없음 | `codexing /vscode`를 다시 실행해 새 번들 경로로 재등록 |
| `OPENAI_BASE_URL`/`CODEX_API_KEY` 충돌 | Codexing 모드가 값 없이 오류로 중단. 해당 프로세스 환경을 확인한 뒤 재실행 |
| 해제가 동시 편집 충돌로 중단 | 다른 편집을 보존한 상태. registration.json과 출력된 백업을 대조해 해당 설정 키만 수동 복원 |
| 원래 환경설정 변경이 반영 안 됨 | 전용 홈은 스냅샷. 원래 환경을 그대로 쓰려면 `/vscode off`로 전환. 기존 전용 홈의 사용자 편집을 검토 없이 덮어쓰지 않음 |

## 검증과 한계

2026-11-19 기준, 단위 검사와 실제 번들 app-server로 다음을 확인했다.

- JSONC 설정 보존·해제·동시 편집 거부·쓰기 실패 롤백, 빈 인자/따옴표/한글 경로와 바이트 입출력.
- OpenAI 로그인 없는 `account=null`, `requiresOpenaiAuth=false`; 같은 연결의 두 모델이 native `model/list`에 표시됨.
- 두 모델 각각의 mock `/v1/responses` 요청, MCP 설정 유지, 선택기 기본값 저장이 원래 config.toml/auth.json을 변경하지 않음.
- 실제 사용자 서버의 `qwen36-35b`가 `CODEXING_VSCODE_OK` 응답; 추가 `websearch` 도구 발견.
- 원래 OpenAI 계정의 `gpt-6.2-sol`이 `OPENAI_VSCODE_OK` 응답; 원래 Codex 설정·인증파일 해시 보존.
- 공식 `hooks/list`에서 미신뢰 세션 훅을 확인하고 격리 홈에서 공식 설정 API로 승인한 뒤 `turn/start`의 정확한 on/off 명령 세 번이 모드 변경·모델 요청 0건·재로드 안내를 반환함. 두 홈의 신뢰는 독립적이며 현재 프로세스의 provider는 유지됨.
- 격리 VS Code 프로필에서 공식 확장이 어댑터를 실행하고 app-server initialize까지 진행한 로그 확인. **그래픽 채팅의 클릭·응답 표시는 별도 Windows 보안창이 화면을 막아 미검증**이며, 그 보안창을 조작하지 않고 화면 제어를 해제함.

마지막 두 실제 응답은 **app-server 프로토콜 검증**이며 GUI에서 보았다고 표시하지 않는다. 서버/모델 품질, 관리형 provider 강제 정책, 이미지·클라우드 기능, 다른 IDE 버전·원격 호스트의 전체 기능은 보장하지 않는다.

근거: [공식 IDE 설정](https://developers.openai.com/codex/ide/settings), [공식 app-server 프로토콜](https://developers.openai.com/codex/app-server), [공식 Hooks](https://learn.chatgpt.com/docs/hooks#userpromptsubmit), [공식 설정 참조](https://developers.openai.com/codex/config-reference), 설치된 확장 manifest와 번들 app-server의 생성 TypeScript 스키마. 실행 검사는 `npm test`, `npm run test:vscode`, `npm run test:native`, `npm pack --dry-run`이다.
