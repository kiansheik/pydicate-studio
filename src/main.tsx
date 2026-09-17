import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './authoring.css';
import './theme.css';
import { installUsageReporting } from './domain/usage';

installUsageReporting();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
