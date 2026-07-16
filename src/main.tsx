import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { App } from './App.tsx';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
