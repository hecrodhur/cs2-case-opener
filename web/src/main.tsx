import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Navbar from './components/Navbar';
import LiveTicker from './components/LiveTicker';
import './styles.css';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
});

const Home = lazy(() => import('./pages/Home'));
const CasePage = lazy(() => import('./pages/CasePage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const MarketPage = lazy(() => import('./pages/MarketPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const BattlesPage = lazy(() => import('./pages/BattlesPage'));
const FriendsPage = lazy(() => import('./pages/FriendsPage'));
const InboxPage = lazy(() => import('./pages/InboxPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const AuthPage = lazy(() => import('./pages/AuthPage'));

function Page({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="page-loading">Loading...</div>}>{children}</Suspense>;
}

function Shell() {
  return (
    <div className="app-shell">
      <Navbar />
      <div className="app-main">
        <LiveTicker />
        <Routes>
          <Route index element={<Home />} />
          <Route path="case/:id" element={<Page><CasePage /></Page>} />
          <Route path="inventory" element={<Page><InventoryPage /></Page>} />
          <Route path="market" element={<Page><MarketPage /></Page>} />
          <Route path="history" element={<Page><HistoryPage /></Page>} />
          <Route path="leaderboard" element={<Page><LeaderboardPage /></Page>} />
          <Route path="battles" element={<Page><BattlesPage /></Page>} />
          <Route path="friends" element={<Page><FriendsPage /></Page>} />
          <Route path="inbox" element={<Page><InboxPage /></Page>} />
          <Route path="profile" element={<Page><ProfilePage /></Page>} />
          <Route path="admin" element={<Page><AdminPage /></Page>} />
          <Route path="auth" element={<Page><AuthPage /></Page>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
