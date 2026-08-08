import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const isRehearsal = window.location.pathname.replace(/\/$/, '') === '/rehearsal';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isRehearsal ? (
      <App />
    ) : (
      <iframe
        title="NudgeOn 실행 지원 여정"
        src="/home.html"
        style={{ width: '100%', height: '100dvh', border: 0, display: 'block' }}
      />
    )}
  </StrictMode>
);
