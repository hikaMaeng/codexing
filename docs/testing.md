# Testing

```sh
npm test
npm run test:native
npm pack --dry-run
```

`npm test`는 네트워크/실제 모델 없이 임시 홈과 fake official npm Codex로 설정·선택·CLI/env·MCP·종료 경계를 검사한다. native integration 파일은 일반 test glob에 포함하지 않아 Codex 미설치 환경에서도 기본 검사가 가능하다.

`npm run test:native`는 PATH의 설치 Codex를 사용한다. 임시 HOME/USERPROFILE/CODEX_HOME과 localhost 임의 포트 Responses SSE fixture를 만들며 사용자 설정·기존 세션을 건드리지 않는다. 무인증과 선택 Bearer 인증을 각각 요청하고 URL/model/auth header, 사용자·프로젝트 AGENTS 상속, 기존 config/auth 원바이트 보존을 확인한다. fixture 인증은 가짜 토큰이다. 실제 모델 서버·모델 품질 검사가 아니다.

## 2026-11-17 검증

- 기본 검사 17개 중 16개 통과, POSIX 전용 1개 skip. native integration 1개 통과(무인증/인증 두 실행).
- npm pack: runtime dependency/bundled dependency 없음, bin/lib/docs/README/package만 포함. tarball을 별도 prefix에 전역 설치하고 다른 폴더에서 init 및 native --help 실행 성공.
- Windows native Node v26.4.0, Codex CLI 0.163.0. PATH 첫 공식 npm 설치의 backing native binary를 선택. Desktop bundled CLI 0.169.0-alpha.11.1과 구분.
- CLI `--help`, `exec --help`, 설치 npm manifest/entry 및 같은 버전 공개 소스를 확인.
- 최초 native 검사에서 root/subcommand -c 혼합 시 provider routing 소실을 발견. 허용된 -c를 모두 root로 hoist한 후 loopback integration으로 회귀 검증.
- 인증·무인증 각각 `/v1/responses` 한 요청에서 fixture 모델과 기대 헤더 확인. 실제 서버 응답/도구 실행 품질은 검증하지 않음.
- POSIX parent-only signal process 검사는 Windows에서 skip. 단위 signal forwarding/escalation 및 실제 child 숫자 exit 검사는 Windows에서 실행.

README의 명령/API/보안 경계는 테스트와 함께 유지한다. 네이티브 옵션·schema·policy 변경 후에는 설치 CLI와 native integration을 다시 확인한다. npm pack에는 bin/lib/docs와 자동 포함 README/package.json만 들어가며 테스트·임시 홈·토큰을 배포하지 않는다.
