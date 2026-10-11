import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useOnline } from './online/useOnline';
import './styles.css';
import './ui/configuration.css';

function ConnectedGame() { const online = useOnline(); return <App online={online} />; }
createRoot(document.getElementById('root')!).render(<StrictMode><ConnectedGame /></StrictMode>);
