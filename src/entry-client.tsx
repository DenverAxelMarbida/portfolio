import { hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './app/AppRoutes';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('The prerendered application root is missing.');

hydrateRoot(
  root,
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>,
);
