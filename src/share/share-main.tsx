import React from 'react';
import ReactDOM from 'react-dom/client';
import SharePage from './SharePage';

import '@shared/styles/reset.css';
import '@shared/styles/tokens.css';
import '@shared/styles/markdown.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SharePage />
  </React.StrictMode>,
);
