import { createRoot } from 'react-dom/client';
import PopupApp from './App';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Elemento #root não encontrado em popup/index.html');
}

createRoot(root).render(<PopupApp />);
