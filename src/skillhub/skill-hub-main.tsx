import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import SkillHubApp from './SkillHubApp';

import '@shared/styles/reset.css';
import '@shared/styles/tokens.css';
import '@shared/styles/markdown.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/skill-hub">
      <SkillHubApp />
    </BrowserRouter>
  </React.StrictMode>,
);
