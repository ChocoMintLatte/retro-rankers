# 🕹️ RETRO RANKERS (CSE FESTIVAL ARCADE BOOTH)

> **컴퓨터공학과 학과 축제 아케이드 부스를 위한 올인원 웹 레트로 오락실 플랫폼**  
> 전자오락수호대 **'패치(Patch)'** 테마의 파스텔 픽셀 아트와 아케이드 CRT 모니터 감성을 담은 5종 미니게임 컬렉션입니다.

---

## 📌 1. 프로젝트 소개 (Overview)

**RETRO RANKERS**는 대학 축제 아케이드 게임 부스 운영을 위해 설계된 독립형 웹 오락실 플랫폼입니다.

- **Zero-Dependency & 순수 바닐라 웹 기술**:
  - `Node.js`, `npm`, 번들러(Webpack/Vite) 등 별도의 빌드 과정이나 외부 라이브러리 설치가 전혀 필요하지 않습니다.
  - 브라우저만 있으면 로컬 파일(`file://`) 형태로 더블 클릭 즉시 실행되며, 정적 웹서버(`GitHub Pages`, `Vercel`, `Nginx`, `Apache` 등)와 100% 호환됩니다.
- **전자오락수호대 '패치' 파스텔 레트로 감성**:
  - 슬레이트 네이비(`#1C2947`), 로즈 크림슨(`#F2546D`), 스카이 블루(`#6EC6E6`), 민트 그린(`#7BE092`), 머스터드 골드(`#F4C552`)의 소프트 네온 팔레트를 채택하였습니다.
- **완벽한 아케이드 CRT 모니터 연출**:
  - 레트로 브라운관 배럴 왜곡 섀도우, 은은한 스캔라인 오버레이, 미세 CRT 플리커링 효과를 순수 CSS로 구현하였습니다.
- **올인원 3단 캐비닛 레이아웃**:
  - 좌측: 게임 카트리지 선택기 & 통합 조작 가이드
  - 중앙: 4:5 화면비의 CRT 모니터 게임 스크린
  - 우측: 실시간 TOP 10 명예의 전당(Hall of Fame) 및 라이브 피드(Live Feed)

---

## 🎮 2. 수록 게임 5종 및 조작법 (5 Arcade Cartridges)

| 번호 | 게임명 | 장르 | 핵심 특징 | 조작키 |
|:---:|:---|:---|:---|:---|
| `01` | **NEON TETRIS** | 클래식 테트리스 | 홀드, 고스트 블록, T-Spin, 백투백 콤보 시스템 | `←/→` 이동<br>`↑/Z` 회전<br>`↓` 소프트 드롭<br>`SPACE` 하드 드롭<br>`C/SHIFT` 홀드 |
| `02` | **CYBER DODGE** | 360° 탄막 회피 | 시간 경과에 따른 3단계 탄막 가속, 코어 수집 및 EMP 충격파 방출 | `방향키` 또는 `WASD` 이동 |
| `03` | **MATH RUNNER** | 수학 슈팅 러너 | 사칙연산(`+`, `-`, `×`, `÷`) 게이트 통과, 분대 화력 배분, 적 블록 및 보스 격파 | `←/→` 또는 마우스/터치 좌우 드래그 |
| `04` | **PIXEL STACK** | 타워 스태킹 | 정밀 타이밍 블록 쌓기, 칼같은 슬라이싱, 연속 퍼펙트 성공 시 블록 크기 복구 | `SPACE`, `↓`, `S`, `ENTER`, 화면 터치/클릭 |
| `05` | **VAMP SURVIVOR** | 탄막 서바이벌 | 5400x5400 확장 아레나, 4종 자동 무기, 패시브 레벨업, 30초 주기 엘리트 보스전 | `방향키` 또는 `WASD` 이동<br>`1/2/3` 카드 선택<br>`ENTER/SPACE` 결정 |

---

### 🕹️ 게임별 상세 설명

### 01. NEON TETRIS (`js/games/tetris.js`)
- **게임성**: 가이드라인 표준 SRS(Super Rotation System) 회전 룰을 준수하는 정통 아케이드 테트리스.
- **시스템**: 7-Bag 무작위 생성 알고리즘, 고스트 피스(Ghost Piece), 1회 홀드 슬롯, 하드 드롭 쇼크웨이브.
- **점수 체계**: 싱글/더블/트리플/테트리스 라인 클리어, T-Spin 판정, 연속 콤보 보너스 배점.

### 02. CYBER DODGE (`js/games/dodge.js`)
- **게임성**: 사방에서 쏟아지는 유도탄과 가속 탄막 속에서 살아남는 극도의 집중력 회피 액션.
- **시스템**: 네온 코어 5개를 수집할 때마다 화면 내 모든 총알을 일소하고 추가 점수를 획득하는 **EMP 펄스** 발동.
- **난이도 곡선**: 15초(초속 30발) ➔ 30초(스프레드 탄막) ➔ 45초 이상(고속 저격탄)으로 페이즈 전환.

### 03. MATH RUNNER (`js/games/mathRunner.js`)
- **게임성**: 광고에서 보던 그 게임을 완벽한 아케이드 조작감으로 재탄생시킨 하이퍼캐주얼 슈팅 러너.
- **시스템**:
  - 좌/우로 쏟아지는 수학 연산 게이트를 순간적으로 계산하여 분대 파워(Power)를 극대화.
  - 파워 수치에 따라 단발 ➔ 2열 ➔ 3열 ➔ 4열 스트림 탄환으로 공격 형태 진화.
  - 웨이브 끝마다 등장하는 거대 보스 게이트 격파 시 대량 득점.

### 04. PIXEL STACK (`js/games/stack.js`)
- **게임성**: 좌우로 왕복 이동하는 파스텔 큐브를 아래 블록과 완벽하게 일치시켜 가장 높은 타워를 세우는 타이밍 게임.
- **시스템**:
  - **오차 ±6px 이내**: 퍼펙트 판정(스냅 배치, 화면 진동, 골드 스파크 이펙트).
  - **연속 3회 이상 퍼펙트**: 깎여나간 블록 폭이 `+16px` 복구되는 'SIZE UP' 콤보 혜택.
  - **일반 착지**: 겹치지 않은 잔여 영역이 물리 엔진에 의해 아래로 낙하하며 블록 축소.

### 05. VAMP SURVIVOR (`js/games/survivor.js`)
- **게임성**: 뱀파이어 서바이벌 류의 로그라이트 탄막 액션 오토 배틀러.
- **시스템**:
  - **5400x5400 초대형 360° 가상 스크롤 아레나**: 자유로운 카이팅과 전략적 몬스터 몰이.
  - **4대 시그니처 무기**: 매직 대거(최단거리 저격), 회전 성서(밀착 방어), 마늘 오라(AoE 넉백), 번개 반지(원거리 낙뢰).
  - **패시브 특성 밸런스**:
    - **자석 부츠**: 이동 속도 및 경험치 보석 흡수 반경 대폭 확장.
    - **파워 앰프**: 무기 공격력 증폭 (최대 20레벨 제한으로 과도한 파워 인플레 방지).
    - **응급 처치 & 활력**: 체력 회복 및 최대 체력 증가 (Lv.30 달성 시 최대 체력 증가는 상한에 도달하며, 20% 즉시 회복 카드로 전환).
  - **30초 주기 엘리트 보스전**: 30초마다 왕관을 쓴 엘리트 보스가 등장하며, 처치 시 대량 점수와 확정 하트 회복 드롭.

---

## ⚡ 3. 주요 기술 및 아키텍처 (Key Features)

### 🏆 1. 실시간 랭킹 시스템 & 멀티 PC 클라우드 동기화 (`js/ranking.js`)
- **로컬 우선 영구 저장**: LocalStorage(`RETRO_RANKERS_DB_V3`)를 기본 스토리지로 사용하여 오프라인 환경에서도 모든 기록이 안전하게 보존됩니다.
- **Firebase Realtime Database REST 동기화**:
  - 학과 축제에서 2대 이상의 부스 PC를 운영할 때, 각 PC에서 획득한 점수가 클라우드를 통해 4초 주기로 자동 상호 동기화됩니다.
  - 복잡한 SDK 설치 없이 순수 REST API(`fetch`)로 통신하여 어떤 브라우저 환경에서도 끊김 없이 작동합니다.

### 🛡️ 2. 스마트 안티 치트(Anti-Cheat) 검증 엔진
축제 현장에서의 비정상적인 점수 조작이나 메모리 변조를 방지하기 위해 다계층 유효성 검사를 수행합니다:
- **게임별 점수 상한 필터링**:
  - 극한 스케일 게임(`mathRunner`, `survivor`): 최대 `99,999,999`점 지원.
  - 정밀 아케이드 게임(`tetris`, `dodge`, `stack`): 최대 `999,999`점 제한.
- **비정상 득점 속도 차단**:
  - 플레이 시작 2초 미만에 대량 득점 시 즉시 치트 감지 및 무효 처리.
  - 초당 득점 비율(Score/Sec Rate Limit)을 분석하여 메모리 해킹성 점수 주입 원천 차단.

### 🔊 3. 100% 무외부파일 Web Audio 신디사이저 (`js/sound.js`)
- mp3, wav 같은 무거운 외부 오디오 에셋을 일절 사용하지 않습니다.
- 브라우저 내장 **Web Audio API**의 오실레이터(Oscillator: Square, Sawtooth, Triangle)와 게인 노드(GainNode)를 프로그래밍하여 발사음, 회전음, 파워업 차임, 폭발음, 게임오버 징글을 8-bit 레트로 음색으로 실시간 합성합니다.

### 📐 4. 반응형 해상도 비례 스케일링 (`style.css`)
- **Fluid Root Scaler**: `html { font-size: clamp(13px, min(1.05vw, 1.75vh), 18px); }`
- **Flexbox 오버플로우 방지**: 모든 레이아웃 컨테이너에 `min-width: 0; min-height: 0;`을 적용하여 화면이 작아져도 스크롤바가 생기거나 요소가 화면 밖으로 밀려나지 않습니다.
- **해상도별 적응형 미디어 쿼리**:
  - Full HD(`1920x1080`)는 물론, 학과 공용 노트북 및 저해상도 모니터(`1366x768`, `1280x720`, `1024x768`), 고배율(125%/150%) 윈도우 디스플레이 설정에서도 베젤과 여백을 자동으로 압축하여 게임 화면을 최대 크기로 유지합니다.

### ⌨️ 5. 아케이드 3자리 이니셜 등록 다이얼
- 모바일 가상 키보드가 팝업되어 몰입감을 해치지 않도록 `<input>` 태그를 배제했습니다.
- 오락실 기통 방식 그대로 `←/→` 키로 슬롯을 이동하고, `↑/↓` 키 또는 알파벳 직접 입력으로 3자리 이니셜(`AAA` ~ `ZZZ`)을 맞춘 뒤 `ENTER`로 등록합니다.

---

## 📂 4. 프로젝트 폴더 구조 (Project Structure)

```text
retro-rankers/
├── index.html              # 아케이드 메인 프레임워크 (단일 진입점)
├── style.css               # 캐비닛 레이아웃, CRT 필터, 반응형 스타일시트
├── README.md               # 프로젝트 매뉴얼 및 가이드 문서
└── js/
    ├── app.js              # 통합 컨트롤러 (카트리지 전환, 게임 루프 관리)
    ├── ranking.js          # LocalStorage & Firebase 실시간 랭킹 / 안티 치트 엔진
    ├── sound.js            # Web Audio API 8-bit 프로그래머블 사운드 신디사이저
    └── games/
        ├── tetris.js       # [Cartridge 01] NEON TETRIS
        ├── dodge.js        # [Cartridge 02] CYBER DODGE
        ├── mathRunner.js   # [Cartridge 03] MATH RUNNER
        ├── stack.js        # [Cartridge 04] PIXEL STACK
        └── survivor.js     # [Cartridge 05] VAMP SURVIVOR
```

---

## 🚀 5. 실행 및 운영 가이드 (Getting Started)

### 1. 로컬 단독 실행 (가장 간편한 방법)
1. `retro-rankers` 폴더의 [`index.html`](file:///C:/Users/Hansung/Desktop/retro-rankers/index.html) 파일을 Chrome, Edge 등 모던 웹 브라우저로 더블 클릭하여 엽니다.
2. 인터넷 연결 없이도 즉시 모든 게임과 로컬 랭킹 시스템이 작동합니다.

### 2. 로컬 웹 서버로 실행 (권장)
동일 네트워크의 다른 기기(태블릿, 모바일)에서 접속 테스트를 하거나 웹 서버 환경에서 구동하려면 아래 명령어를 사용합니다:

```bash
# Node.js npx 사용 시
npx serve .

# 또는 Python 3 내장 서버 사용 시
python -m http.server 8080
```
실행 후 브라우저에서 `http://localhost:8080` (또는 포트에 맞는 주소)으로 접속합니다.

---

### 🌐 3. 학과 축제 다중 부스 PC 실시간 연동 (Firebase Realtime Database)

축제 부스에서 2대 이상의 컴퓨터를 두고 참가자들의 최고 기록을 실시간으로 하나의 전광판처럼 공유하려면 Firebase Realtime Database를 연동할 수 있습니다.

#### [설정 단계]
1. [Firebase Console](https://console.firebase.google.com/)에서 새 프로젝트를 생성하고 **Realtime Database**를 추가합니다.
2. 보안 규칙(Rules) 탭에서 읽기/쓰기 권한을 허용합니다:
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
3. 생성된 데이터베이스 URL을 복사합니다.  
   *(예: `https://my-festival-arcade-default-rtdb.firebaseio.com`)*
4. 각 부스 PC의 브라우저에서 URL 뒤에 `?db=` 파라미터를 붙여 **최초 1회 접속**합니다:
   ```text
   http://localhost:8080/?db=https://my-festival-arcade-default-rtdb.firebaseio.com
   ```
   *(로컬 파일인 경우: `file:///.../index.html?db=https://my-festival-arcade-default-rtdb.firebaseio.com`)*
5. **동기화 완료**: 브라우저의 LocalStorage에 데이터베이스 주소가 영구 저장되므로, 이후에는 파라미터 없이 실행해도 모든 부스 PC 간에 실시간 랭킹과 라이브 피드가 자동 동기화됩니다!

---

## 👥 6. 라이선스 및 크레딧 (License & Credits)

- **디자인 모티브**: NAVER 웹툰 *전자오락수호대 (Guardians of the Video Game)* - '패치(Patch)' 팀 컬러 테마
- **폰트 라이선스**:
  - `Press Start 2P`: Google Fonts (SIL Open Font License 1.1)
  - `DungGeunMo (둥근모꼴)`: 김동선 님 제작 (SIL Open Font License 1.1)
- **개발 & 기획**: 컴퓨터공학과 학생회 축제 준비위원회 (CSE Festival Committee)
- **License**: MIT License
