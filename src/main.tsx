import React from 'react';
import { createRoot } from 'react-dom/client';
import EntryRouter from './EntryRouter';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('KCM: root 요소를 찾을 수 없습니다.');
createRoot(root).render(<React.StrictMode><EntryRouter /></React.StrictMode>);
