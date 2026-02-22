# Incident & Recurrence Prevention Log

## 2026-02-22 iOS 실기기 무음 장애 (v146~v150)

### 요약
- 증상: iOS **실기기**에서 RUN/STOP 및 Drum Synth Editor Preview가 동작하지 않음. UI 반응은 정상.
- 범위: `v146`부터 `v150`까지 실기기에서 재현. iOS Simulator에서는 간헐/미재현.
- 영향도: 라이브 서비스에서 오디오 재생 불가(심각).

### 타임라인
- `v146` (`dda9e0e`, 2026-02-22): 실기기 무음 증상 최초 확인.
- `v147`~`v150` (`8eb691b`~`c701b7b`): iOS unlock/SW/cache/worklet 관련 핫픽스 시도.
- `v151` (`30cc982`, 2026-02-22): 초기화 비블로킹/타임아웃 가드 도입으로 해결.

### 기술 원인 (확정)
- 공통 진입점인 `AudioEngine.init()`에서 `TR909.initBuffers()`와 Worklet 모듈 로딩을 **무기한 대기**할 수 있었음.
- iOS 실기기에서 fetch/IDB/worklet 로딩이 지연 또는 정지되면:
  - transport play가 init 완료를 기다리며 멈춤
  - Drum Synth preview도 동일 init 경로를 타서 함께 멈춤
  - 결과적으로 “UI만 반응하고 오디오는 전부 무응답” 상태 발생

### 수정 내역 (v151)
- 파일: `js/audio/AudioEngine.js`
- 조치:
  - `withTimeout()` 유틸 추가
  - `TR909.initBuffers()`에 4.5초 타임아웃 적용
  - 타임아웃 시 `tr909.initVoices()`로 폴백해 오디오 엔진 초기화는 계속 진행
  - `audioWorklet.addModule()` 각각 3초 타임아웃 적용
  - iOS session bridge play는 비동기 fire-and-forget으로 처리해 resume 경로 블로킹 방지

### 재발 방지 원칙 (필수)
1. **오디오 초기화 경로에서 무제한 await 금지**
   - 네트워크(fetch), IndexedDB, dynamic import, worklet module 로딩은 반드시 타임아웃 또는 실패 허용 경로 필요.
2. **“핵심 재생 가능 상태”와 “부가 자산 로딩” 분리**
   - 샘플/커스텀 데이터가 늦어도 transport 및 preview는 먼저 동작해야 함.
3. **실기기 우선 검증**
   - iOS Simulator 통과만으로 릴리즈 승인 금지.
4. **서비스워커/캐시 변경 시 오디오 회귀 테스트 의무화**
   - SW 전략 변경 배포에서는 iOS 실기기 오디오 테스트를 릴리즈 체크리스트에 포함.
5. **스케줄러 품질 정책 유지**
   - Worklet 사용 가능 경로에서는 런타임 강등(setTimeout)으로 자동 전환하지 않음.

### 릴리즈 체크리스트 (iOS 오디오)
- [ ] iPhone Safari: 최초 접속 후 RUN 1회 탭으로 즉시 재생
- [ ] iPhone Safari: STOP 동작 정상
- [ ] iPhone Safari: Drum Synth Editor Preview 동작
- [ ] iPhone Chrome(iOS): 위 3개 동일 확인
- [ ] 백그라운드 복귀 후 Resume Overlay 및 재생 복구 확인
- [ ] 버전 표시와 SW 캐시 키가 릴리즈 버전과 일치

