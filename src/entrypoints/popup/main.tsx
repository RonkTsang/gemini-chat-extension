import React from 'react';
import ReactDOM from 'react-dom/client';
// import { PopupProvider } from './popup-provider';
import { Provider } from '@/components/ui/provider';
import App from './App.tsx';
import './style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider enableSystem>
      <App />
    </Provider>
  </React.StrictMode>,
);
