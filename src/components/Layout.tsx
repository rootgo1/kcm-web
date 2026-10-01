import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { DashboardData, PageId } from '../types';
import { pageLabels } from '../lib/domain';
import { navigationGroups } from '../lib/navigation';
import { workspaceMock } from '../data/workspaceMockData';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';
import { ProfileMenu } from './ProfileMenu';

const pageIcons: Record<PageId, IconName> = {
  home: 'home', appointments: 'calendar', customers: 'users',
  support: 'message', products: 'box', inventory: 'box',
  marketing: 'megaphone', stores: 'store',
};
export function Layout({ data, page, navigate, children }: {
  data: DashboardData | null; page: PageId; navigate: (page: PageId, openStoreInfo?: boolean) => void; children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const handleProfileOpen = useCallback((open: boolean) => { setProfileOpen(open); if (open) setNotifications(false); }, []);
  const store = data?.store ?? workspaceMock.store;
  const employee = data?.employee ?? workspaceMock.employee;
  useEffect(() => { setProfileOpen(false); setNotifications(false); setMobileOpen(false); }, [page]);
  const navItem = (id: PageId) => <a
    href={`#/${id}`} key={id}
    className={`nav-item ${page === id ? 'active' : ''}`}
    aria-current={page === id ? 'page' : undefined}
    onClick={event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(id); setMobileOpen(false); setNotifications(false); setProfileOpen(false); }}
  ><Icon name={pageIcons[id]}/><span>{pageLabels[id]}</span>{page === id && <i className="nav-dot"/>}</a>;
  const nav = <nav aria-label="주 메뉴" className="kcm-navigation">
    <div className="nav-home">{navItem('home')}</div>
    {navigationGroups.map(group => <div className="nav-group" key={group.label}>
      <p className="nav-label">{group.label}</p>
      {group.pages.map(navItem)}
    </div>)}
  </nav>;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>본문 바로가기</a>
    <aside className="sidebar">
      <a className="brand" href="#/home" aria-label="KCM 홈" onClick={event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate('home'); }}><span className="brand-word">KCM<span>.</span></span><span className="brand-sub">KT Copilot Manager</span></a>
      <div className="workspace"><span className="workspace-icon"><Icon name="store" size={18}/></span><div><strong>워크스페이스</strong><small>{store}</small></div></div>
      {nav}
      <div className="sidebar-bottom"><div className="sidebar-version">KCM PROJECT <span>v0.3</span></div></div>
    </aside>
    <div className="app-body">
      <header className="topbar">
        <div className="topbar-leading">
          <button className="icon-button mobile-toggle" aria-label="메뉴 열기" onClick={() => { setProfileOpen(false); setNotifications(false); setMobileOpen(true); }}><Icon name="menu"/></button>
          <div className="breadcrumbs"><span>KCM 워크스페이스</span><Icon name="chevron" size={13}/>{page !== 'home' && <strong>{pageLabels[page]}</strong>}</div>
        </div>
        <div className="topbar-trailing">
          <a className="store-label" href="#/stores" aria-label={`${store} 매장정보 보기`} onClick={event => { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate('stores', true); setNotifications(false); setProfileOpen(false); }}><Icon name="store" size={17}/><span>{store}</span></a>
          <div className="notification-wrap">
            <button className={`icon-button notification-button ${notifications ? 'is-active' : ''}`} aria-label="샘플 알림 보기" aria-expanded={notifications} onClick={() => { setProfileOpen(false); setNotifications(!notifications); }}><Icon name="bell"/><span className="notification-dot"/></button>
            {notifications && <div className="notification-panel"><strong>확인할 사항 <span className="small-badge">샘플</span></strong><button onClick={() => { navigate('inventory'); setNotifications(false); }}><Icon name="box"/><span>재고와 반납 예정 내역 확인<small>스마트 재고 화면으로 이동</small></span><Icon name="chevron" size={14}/></button><p>실시간 알림 수신 기능은 아직 연결 전입니다.</p></div>}
          </div>
          <ProfileMenu employee={employee} store={store} open={profileOpen} onOpenChange={handleProfileOpen}/>
        </div>
      </header>
      <main id="main-content" className="main-content" tabIndex={-1}>{children}</main>
      <footer className="app-footer"><span>KCM <b>·</b> 예약부터 사후관리까지</span><span>모든 고객·예약·재고는 가상 데이터입니다.</span></footer>
    </div>
    {mobileOpen && <Modal title="메뉴" onClose={() => setMobileOpen(false)}>{nav}</Modal>}
  </div>;
}
