import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import './App.css';
import { preventStrayDrops } from './utils/preventStrayDrops';

// A stray drop must never open a file in the app window (C-16).
preventStrayDrops(document);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
