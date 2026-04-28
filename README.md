# Signal Weaver — HackRF One SDR

[![TypeScript](https://img.shields.io/badge/TypeScript-98.2%25-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-Build%20Tool-purple?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![WebUSB](https://img.shields.io/badge/WebUSB-Supported-success?style=flat-square)](https://wicg.github.io/webusb/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

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