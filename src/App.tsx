/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sileo';
import Portfolio from './pages/Portfolio';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NotFound from './pages/NotFound';

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
        <Routes>
          <Route path="/" element={<Portfolio />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}
