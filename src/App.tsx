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
    <>
      <Toaster
        position={isSmallScreen ? 'top-center' : 'bottom-right'}
        offset={isSmallScreen ? { top: 72 } : { bottom: 18, right: 18 }}
        theme="system"
        options={{
          roundness: 16,
          fill: '#3a261c',
          styles: {
            title: 'text-[#fff6ed]!',
            description: 'text-[#f4dfcf]!',
            badge: 'bg-[#d8b39a]! text-[#3a261c]!',
            button: 'bg-[#5b3b2a]! hover:bg-[#7a5038]! text-[#fff6ed]!'
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
    </>
  );
}
