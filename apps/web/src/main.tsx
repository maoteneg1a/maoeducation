import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app'
import { Capacitor } from '@capacitor/core'
import { MobilePolicyGate } from './features/mobile/MobilePolicyGate'
import { NativePushSetup } from './features/mobile/NativePushSetup'
import './globals.css'

if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MobilePolicyGate><NativePushSetup /><App /></MobilePolicyGate>
  </React.StrictMode>,
)
