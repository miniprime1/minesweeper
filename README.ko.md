# Minesweeper

[English](README.md)

Windows 2000 지뢰찾기를 재현한 Electron 기반 macOS 앱입니다.

![Minesweeper](docs/screenshot.png)

## 기능

- 원본 픽셀 그래픽·아이콘·글꼴, 메뉴와 숫자 표시기.
- 초급·중급·고급·사용자 지정 보드, 깃발·물음표·주변 열기.
- 첫 번째로 여는 칸만 안전하게 보장하는 고전 규칙. 주변 3×3 안전 영역은 보장하지 않습니다.
- 최고 기록과 설정 저장, 켜고 끌 수 있는 직접 합성한 효과음.
- 드래그 가능한 Windows 제목줄, 별도로 이동하는 안내·설정 창, Dock 진행률.
- 창 크기 조절과 75–400% 확대·축소. 화면에 들어갈 수 있는 크기로 제한됩니다.
- 같은 게임 소스로 만드는 오프라인 브라우저 버전.

## 소스에서 실행

macOS 13 이상에서 Node.js 24 이상과 pnpm 11.25.0을 사용합니다.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm start
```

처음 실행할 때 Electron 런타임을 다운로드합니다. 이후 게임은 인터넷 연결 없이 실행됩니다.

브라우저 버전은 `pnpm dev:web` 실행 후 <http://localhost:8765>에서 사용할 수 있습니다.

## 빌드

```sh
pnpm package:mac
pnpm build:offline
```

macOS 빌드는 현재 Mac의 아키텍처를 따릅니다. Apple Silicon에서는 `release/Minesweeper-darwin-arm64/Minesweeper.app`과 `release/Minesweeper-macOS-arm64.zip`을 만듭니다. `pnpm package:mac --arch=x64`로 Intel용, `pnpm package:mac --arch=arm64`로 Apple Silicon용 빌드를 지정할 수 있습니다. Intel 실기기에서는 검증하지 않았습니다.

패키징에는 로컬 ad-hoc 서명과 검증이 포함되며, Apple Developer ID 서명과 공증은 적용하지 않습니다.

오프라인 빌드는 브라우저에서 바로 열 수 있는 `release/Minesweeper.html`을 만듭니다.

## 조작

| 동작 | 조작 |
| --- | --- |
| 칸 열기 | 왼쪽 클릭 |
| 깃발 → 물음표 → 해제 | 오른쪽 클릭 |
| 깃발 수가 숫자와 같을 때 주변 열기 | 양쪽 버튼 동시 클릭 또는 가운데 클릭 |
| 새 게임 | 얼굴 버튼 또는 F2 |
| 키보드 플레이 | 방향키, Space / Enter, F로 표시, Shift+Space로 주변 열기 |
| 확대·축소 | 창 크기 조절, View 메뉴, Command+플러스 / 마이너스 / 0 |
| 효과음 | Game → Sound |

터치 환경에서는 탭으로 열고, 길게 눌러 표시하고, 열린 숫자를 탭하여 주변을 엽니다. 물음표 표시는 Game → Marks (?)에서 끌 수 있습니다.

## 폴더 구성

```text
src/          브라우저 게임과 리소스
electron/     macOS 창 연동
scripts/      개발·패키징 명령
tests/        게임·데스크톱 테스트
resources/    macOS 앱 아이콘
docs/         스크린샷
```

## 라이선스와 출처

프로그램 코드와 직접 합성한 효과음: **MIT License, © 2026 Kyumin Nam**. 전문은 [LICENSE](LICENSE)에 있습니다.

Microsoft 원본 그래픽과 외부 리소스는 각각의 권리와 라이선스를 유지하며, 이 프로젝트의 MIT 라이선스에 포함되지 않습니다. 출처와 고지는 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참고하세요.

Microsoft와 제휴하지 않은 독립 재현 프로젝트입니다.
