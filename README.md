# VirtuTrade — 가상 암호화폐 거래소

업비트/바이낸스 수준의 가상 암호화폐 거래소입니다. 실시간 바이낸스 가격 데이터를 기반으로 가상 거래를 할 수 있습니다.

## 주요 기능

- 🔐 **Google 로그인** (Firebase Auth) + 데모 모드
- 💰 **₩1억 / $70,000** 가상 시드머니
- 📊 **TradingView 차트** (캔들스틱, 볼륨, 시간프레임)
- 📋 **실시간 호가창** (바이낸스 기반)
- 💱 **시장가/지정가 주문** (슬리피지 구현)
- 🌐 **한국어/영어** 전환 (원화/달러)
- 📱 **PWA** (모바일 홈화면 추가 가능)

## 시작하기

### 프론트엔드

```bash
cd virtutrade
npm install
npm run dev
# http://localhost:3000
```

### 백엔드 (Optional)

```bash
cd backend
pip install -r requirements.txt
python main.py
# http://localhost:8000
```

> **참고:** 프론트엔드만으로도 Binance WebSocket에 직접 연결하여 완전히 작동합니다.

### Firebase 설정 (Optional)

Firebase 미설정 시 자동으로 **Demo Mode**로 동작합니다.

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
```
