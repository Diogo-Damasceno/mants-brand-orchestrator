import { createRoot } from 'react-dom/client';
import SidepanelApp from './App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Elemento #root não encontrado em sidepanel/index.html');
}

createRoot(root).render(<SidepanelApp />);
