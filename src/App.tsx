/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sileo';
import { UnifiedLoadingScreen } from './components/UnifiedLoadingScreen';

const Portfolio = lazy(() => import('./pages/Portfolio'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const NotFound = lazy(() => import('./pages/NotFound'));

export default function App() {
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');

    const applyMediaState = (eventOrList: MediaQueryListEvent | MediaQueryList) => {
      setIsSmallScreen(eventOrList.matches);
    };

    applyMediaState(mediaQuery);

    const listener = (event: MediaQueryListEvent) => applyMediaState(event);
    mediaQuery.addEventListener('change', listener);

    return () => {
      mediaQuery.removeEventListener('change', listener);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="fixed inset-0 pointer-events-none z-[1] overflow-hidden">
        <div className="ambient-blob ambient-blob-1"></div>
        <div className="ambient-blob ambient-blob-2"></div>
        <div className="ambient-blob ambient-blob-3"></div>
      </div>
      <div className="relative z-10 font-body text-on-surface">
        <Toaster
          position={isSmallScreen ? 'top-center' : 'bottom-right'}
          offset={isSmallScreen ? { top: 72 } : { bottom: 18, right: 18 }}
          theme="system"
          options={{
            roundness: 16,
            fill: '#1a1a1a',
            styles: {
              title: 'text-[#eeeeee]!',
              description: 'text-[#bbbbbb]!',
              badge: 'bg-[#282828]! text-[#eeeeee]!',
              button: 'bg-[#404040]! hover:bg-[#666666]! text-[#eeeeee]!'
            }
          }}
        />
        <Router>
          <Suspense
            fallback={
              <UnifiedLoadingScreen
                title="Loading page"
                subtitle="Composing sections and transitions..."
              />
            }
          >
            <Routes>
              <Route path="/" element={<Portfolio />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Router>
      </div>
    </div>
  );
}
