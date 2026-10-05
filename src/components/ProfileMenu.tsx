import { useEffect, useRef, useState } from 'react';
import type { WorkspaceEmployee } from '../types';
import { avatarLabel, avatarTone, formatReviewScore } from '../lib/profile';
import { Icon } from './Icon';
import { Modal } from './Modal';

function EmployeeAvatar({ employee, large = false }: { employee: WorkspaceEmployee; large?: boolean }) {
  return <span className={`avatar workspace-avatar workspace-avatar-${avatarTone(employee.gender)} ${large ? 'workspace-avatar-large' : ''}`} aria-hidden="true">{avatarLabel(employee.givenName)}</span>;
}

/** 비모달 프로필 정보창입니다. 로그아웃은 UI 예시이며 인증 API를 호출하지 않습니다. */
export function ProfileMenu({ employee, store, open, onOpenChange }: {
  employee: WorkspaceEmployee; store: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [logoutNotice, setLogoutNotice] = useState(false);
  const score = formatReviewScore(employee.reviewScore);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onOpenChange(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); onOpenChange(false); triggerRef.current?.focus();
      }
    };
    const focusOutside = (event: FocusEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focusOutside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', focusOutside);
    };
  }, [open, onOpenChange]);

  const close = () => { onOpenChange(false); triggerRef.current?.focus(); };
  return <>
    <div className="profile-shell" ref={rootRef}>
      <button ref={triggerRef} className={`profile-trigger ${open ? 'is-active' : ''}`} type="button"
        aria-label={`${employee.name} ${employee.position} 프로필 열기`}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'workspace-profile-panel' : undefined}
        onClick={() => onOpenChange(!open)}>
        <EmployeeAvatar employee={employee}/>
        <span className="profile-text"><strong>{employee.name} <span>{employee.position}</span></strong>
          <span className="profile-rating" aria-label={`직원 리뷰 평점 ${score}`}><Icon name="star" size={12}/>{score}</span>
        </span>
        <Icon name="chevronDown" size={13} className="profile-chevron"/>
      </button>
      {open && <div ref={panelRef} id="workspace-profile-panel" className="profile-panel" role="dialog" aria-modal="false" aria-labelledby="workspace-profile-title" tabIndex={-1}>
        <div className="profile-panel-heading"><h2 id="workspace-profile-title">내 프로필</h2><button className="icon-button" onClick={close} aria-label="프로필 닫기"><Icon name="close" size={16}/></button></div>
        <div className="profile-panel-identity"><EmployeeAvatar employee={employee} large/><div><strong>{employee.name} <span>{employee.position}</span></strong><p>{store}</p><span className="profile-rating" aria-label={`직원 리뷰 평점 ${score}`}><Icon name="star" size={13}/>{score}<small>직원 리뷰</small></span></div></div>
        <dl className="profile-facts"><div><dt>이름</dt><dd>{employee.name}</dd></div><div><dt>직급</dt><dd>{employee.position}</dd></div><div><dt>전문분야</dt><dd>{employee.specialty}</dd></div><div><dt>상담 스타일</dt><dd>{employee.style}</dd></div></dl>
        <div className="profile-panel-actions"><button className="profile-logout" onClick={() => { close(); setLogoutNotice(true); }}><Icon name="logout" size={17}/>로그아웃<Icon name="chevron" size={13}/></button></div>
      </div>}
    </div>
    {logoutNotice && <Modal title="로그아웃 안내" onClose={() => setLogoutNotice(false)}><p className="modal-lead">현재는 별도의 로그인 없이 이용하는 화면입니다.</p><p className="muted-text">종료할 로그인 세션이 없습니다. 이용을 마치려면 브라우저 탭을 닫아 주세요.</p><div className="modal-actions"><button className="button button-primary" onClick={() => setLogoutNotice(false)}>확인</button></div></Modal>}
  </>;
}
