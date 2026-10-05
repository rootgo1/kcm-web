import { lazy, Suspense, useEffect, useState } from 'react';
import App from './App';

const RetellTestPage = lazy(() => import('./dev/RetellTestPage'));

export default function EntryRouter() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    document.title = hash === '#/retell-test' ? 'KCM · 고객용 AI 상담' : 'KCM · 직원용 통합 대시보드';
  }, [hash]);
  useEffect(() => {
    const change = () => setHash(window.location.hash);
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  if (hash === '#/retell-test') return <Suspense fallback={<p role="status">AI 상담 화면을 준비하고 있습니다.</p>}><RetellTestPage /></Suspense>;
  return <App />;
}
