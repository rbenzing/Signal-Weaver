# Signal Weaver — HackRF One SDR

Browser-based Software Defined Radio interface for the HackRF One device. Receives and demodulates FM, WFM, AM, USB, LSB, CW, and RAW signals using WebUSB + Web Audio API — no native plugins required.

## Requirements

- Chrome or Edge (WebUSB support required)
- HackRF One with WinUSB driver installed via [Zadig](https://zadig.akeo.ie/)
- Node.js & npm

## Setup

```sh
git clone <YOUR_GIT_URL>
cd signal-weaver
npm install
npm run dev
```

## Commands

```sh
npm run dev        # Start dev server (Vite, port 8080)
npm run build      # Production build
npm run lint       # ESLint
npm run test       # Run tests (Vitest)
```

## Tech Stack

- Vite + React 18 + TypeScript 5
- Tailwind CSS + shadcn-ui
- WebUSB (HackRF One protocol)
- Web Audio API (48 kHz, low-latency live playback)
- Vitest
