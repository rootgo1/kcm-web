import { useRef, type KeyboardEvent } from 'react';

interface TabOption<T extends string> { id: T; label: string }
interface TabsProps<T extends string> {
  id: string;
  label: string;
  tabs: readonly TabOption<T>[];
  active: T;
  onChange: (value: T) => void;
}
/** 화면 전환 전용. 방향키/Home/End로 이동하며 외부 작업은 실행하지 않습니다. */
export function Tabs<T extends string>({ id, label, tabs, active, onChange }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  };
  return <div className="section-tabs" role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button
      key={tab.id} type="button" role="tab"
      id={`${id}-tab-${tab.id}`} aria-controls={`${id}-panel-${tab.id}`}
      aria-selected={active === tab.id} tabIndex={active === tab.id ? 0 : -1}
      ref={element => { refs.current[index] = element; }}
      className={active === tab.id ? 'section-tab active' : 'section-tab'}
      onClick={() => onChange(tab.id)} onKeyDown={event => onKeyDown(event, index)}
    >{tab.label}</button>)}
  </div>;
}
