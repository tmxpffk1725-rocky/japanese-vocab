# CLAUDE.md

일본어 단어장 앱(語彙帳) 프로젝트 지침. 이 파일의 규칙을 우선 적용한다.

## 프로젝트 개요

- **앱**: 일본어 단어장 웹앱 (JLPT N5~N1 어휘 7,625개 내장)
- **스택**: React 19 + Vite 8, 단일 컴포넌트 구조 (`src/App.jsx`에 전체 로직)
- **배포 URL**: https://tmxpffk1725-rocky.github.io/japanese-vocab/
- **레포**: https://github.com/tmxpffk1725-rocky/japanese-vocab

## 배포 방식 (중요)

- `main`에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가 **자동으로 빌드·배포**한다.
- `npm run deploy`(gh-pages 수동 배포)는 사용하지 않는다. push만 하면 끝.
- push 후에는 `gh run list`로 워크플로 성공 여부를 확인해준다.

## 작업 규칙

1. **커밋·푸시는 매번 사용자에게 확인받고 진행한다.** 수정을 마치면 변경 내용을 요약해서 보여주고 "커밋·푸시할까?" 물어본 뒤, OK를 받으면 commit + push한다.
2. **커밋 메시지는 한글로** 작성한다. (예: `단어 추가 기능 + "추가" 레벨 카테고리 추가`)
3. **최소 수정 원칙**: 요청한 것만 고친다. 관련 없는 코드 정리·리팩토링은 발견 시 보고만 하고, 사용자가 시키면 한다.
4. 수정 후에는 `npm run build`로 빌드가 통과하는지 확인한다.
5. `npm install` 부작용으로 `package-lock.json`이 바뀌면 되돌린다(`git checkout -- package-lock.json`). 기능 변경과 무관한 파일은 커밋에 포함하지 않는다.
6. 기능을 없앨 때는 관련 함수·UI·스타일·참조를 전부 찾아서 깔끔하게 제거한다 (grep으로 잔여 참조 확인).

## 단어 데이터

- **기본 데이터**: `public/jlpt_all_fixed.json` (수정본 + 교재 신규 56개 + 누락 복원 3개, 7,625개: N5 578 / N4 877 / N3 1,255 / N2 2,242 / N1 2,673)
- **스키마**: `{ id, japanese, reading, korean, level, type, pos? }`
  - `level`: `"N5"~"N1"` 또는 `"추가"` (사용자가 직접 추가한 단어)
  - `type`: 전부 `"vocab"` 고정. 로직에서 안 읽지만 **스키마 호환용으로 유지한다** (지우지 말 것).
  - `pos`: 품사 (선택). N5~N3 단어에만 있음. 값: 명사/동사/い형용사/な형용사/부사/연체사/접속사/감동사/조사/접사/표현. 없으면 화면에 표시 안 함.
- **중복 판정 기준**: `japanese`(한자/가나)와 `reading`(히라가나)이 **둘 다 같을 때만 중복**이다.
  - 한자만 같은 경우(角 → かど/かく/つの)나 읽기만 같은 경우(あつい → 暑い/熱い/厚い)는 **정상적인 별개 단어**이므로 절대 중복으로 취급하지 않는다.
- 앱은 첫 실행 시 JSON을 fetch해서 localStorage(`jp_vocab_words`)에 캐시하고, 이후엔 localStorage만 쓴다. **번들 JSON을 고쳐도 기존 사용자에겐 반영 안 됨**을 항상 염두에 둘 것 (초기화 기능으로 되돌릴 수 있음).

## localStorage 키

| 키 | 내용 |
|----|------|
| `jp_vocab_words` | 전체 단어 배열 |
| `jp_vocab_daily_{레벨}` | 레벨별 오늘의 단어 (date, count, wordIds, usedDates) |
| `jp_vocab_daily_count` | 급수별 하루 단어 수 설정 (JSON 객체) |

## 핵심 로직 요약

- **오늘의 단어**: 급수별로 설정된 개수(기본 30, 5~100 조절 가능)를 랜덤 선택. 같은 단어는 4일(COOLDOWN_DAYS) 안에 재출제 안 됨. 날짜는 KST 기준.
- **검색**: uncontrolled input + ref 방식 (한글 IME 조합 이슈 방지). 버튼/Enter로만 검색 실행.
- **플래시카드**: 4지선다. 방향은 일→한 / 한→일 / 랜덤(카드마다 50% 확률).

## 하지 말 것

- JSON 가져오기/내보내기 기능 재추가 (의도적으로 제거함 — 기본 7,625단어가 내장돼 있어 불필요)
- `vite.config.js`의 `base: '/japanese-vocab/'` 변경 (GitHub Pages 경로 필수)
- 요청 없는 UI 스타일 변경
