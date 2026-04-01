/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sileo';
import { UnifiedLoadingScreen } from './components/UnifiedLoadingScreen';

const Portfolio = lazy(() => import('./pages/Portfolio'));
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const NotFound = lazy(() => import('./pages/NotFound'));

export default function App() {
  return (
    <>
      <Toaster
        position="bottom-right"
        offset={{ bottom: 18, right: 18 }}
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
