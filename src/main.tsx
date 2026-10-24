import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import ReviewWorkspace from './review-workspace';
import {loadReviewConfig} from './review-api';
import {applyTextSize, readTextSize} from './text-size';
import './globals.css';
import './text-size-control.css';
import './mobile-layout.css';

function App() {
  const [state, setState] = useState<'loading'|'ready'|'setup'>('loading');
  useEffect(() => {
    let active = true;
    loadReviewConfig().then(() => { if (active) setState('ready'); }).catch(() => {
      if (!active) return;
      setState('setup');
    });
    return () => { active = false; };
  }, []);
  if (state === 'ready') return <ReviewWorkspace/>;
  return <main className="review-app"><section className="loading-screen" role="status" aria-live="polite">
    <div className="law-logo"><img src="./korea-law-logo.svg" alt="고대법대 KU Law" width="244" height="100"/></div>
    <h1>LAWINUS · 논문 심사실</h1>
    <h2>{state === 'setup' ? '심사 자료를 불러오지 못했습니다.' : '심사 자료를 불러오는 중…'}</h2>
    {state === 'setup' ? <>
      <button className="primary" onClick={() => window.location.reload()}>다시 불러오기</button>
    </> : null}
  </section></main>;
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('화면을 표시할 영역이 없습니다.');
applyTextSize(readTextSize(), false);
createRoot(rootElement).render(<App/>);
