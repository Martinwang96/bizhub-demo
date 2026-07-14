import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// 全局样式顺序：reset → tokens → markdown（顺序不可更改）
import '@shared/styles/reset.css';
import '@shared/styles/tokens.css';
import '@shared/styles/markdown.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
