# TB-303 Live Mode 수정 작업 계획

## 1. 목표
- `acidBros`의 TB-303 Note Editor에 **Live Mode**를 추가한다.
- Live Mode는 **실제 패턴 데이터를 변경하지 않고**, 재생 중 스텝에 대해 **임시(오버레이) 변형**을 적용한다.
- 라이브 연주 시 입력은 "다음 재생 스텝 전에 입력"을 가정하여 스텝 단위로 양자화된 결과를 낸다.

## 2. 요구사항 매핑
1. 사전 조건
- TB-303 유닛에서 Note Editor가 열린 상태에서, 기존 Preview 토글 오른쪽에 추가한 Live 토글 버튼(`song.svg`)으로 ON/OFF.

2. 제약 조건
- Live 동작은 오버레이 처리로만 반영하고 `Data.getSequence(...)`의 원본 스텝은 수정하지 않는다.

3. Live ON 시 동작
- Step navigator(`prev/next`) 숨김.
- Step indicator는 재생 중 스텝을 실시간 추적.
- `DN/UP`은 누르는 동안 현재 스텝 옥타브를 강제(가감산 아님, hold 기반).
- `AC/SL`은 누르는 동안만 강제 적용.
- `Off`는 누르는 동안만 Rest 강제 적용.
- 피아노 키는 누르는 동안 C 기준 반음 오프셋으로 transpose 적용(옥타브 hold와 동시 적용 가능).

4. Live OFF 시 동작
- UI/사운드 처리 모두 기존 Note Editor 동작으로 복귀.

## 3. 구현 전략
- UI 계층(`js/ui/UI.js`)
  - 유닛별 Live 상태(`liveEnabled`)와 hold 입력 상태를 분리 저장.
  - 원본 스텝 + hold 입력을 합성해 **Live 오버레이 스텝**을 계산하는 함수 추가.
  - Draw playhead 시점에 Live ON 유닛의 step indicator를 현재 재생 스텝으로 동기화.

- 오디오 스케줄 계층(`js/audio/AudioEngine.js`, `js/audio/TB303.js`)
  - 스텝 스케줄링 때 UI가 제공하는 오버레이 스텝(`step`, `prevStep`)을 TB303 처리에 주입.
  - 패턴 데이터는 읽기만 하고 수정하지 않는다.

- 마크업/스타일 계층(`index.html`, `css/machines.css`)
  - Live 토글 버튼 추가.
  - Live ON 상태의 컬러 변경, step navigator 숨김, Live 버튼 활성 시각화.

## 4. 개발 순서
1. 문서 작성(본 문서)
2. Note Editor 헤더에 Live 토글 버튼 추가
3. UI Live 상태/hold 입력/오버레이 계산 로직 추가
4. AudioEngine 스케줄 시 TB303 Live 오버레이 반영
5. Live ON/OFF 시 UI 상태 전환 스타일 적용
6. 수동 검증(재생/정지, Live ON/OFF, hold 입력, 패턴 불변 확인)

## 5. 검증 체크리스트
- [ ] Live ON/OFF 토글이 각 유닛별로 독립 동작한다.
- [ ] Live ON에서 prev/next가 숨겨지고 step indicator가 재생 스텝을 따라간다.
- [ ] `DN/UP`, `AC/SL`, `Off`가 hold 동안만 반영되고 release 시 원복된다.
- [ ] 피아노 키 hold transpose가 실시간 반영된다.
- [ ] Live 중 연주 후에도 패턴 데이터(노트/옥타브/AC/SL/active)가 변하지 않는다.
- [ ] Live OFF 시 기존 Note Editor 입력 동작(스텝 편집)이 그대로 동작한다.
