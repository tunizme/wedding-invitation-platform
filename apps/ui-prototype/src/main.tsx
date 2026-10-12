import { createRoot } from 'react-dom/client';
import App from './App';
import '../../web/src/ui/platform/tokens.css';
import '../../web/src/features/invitation-builder/renderer/fonts.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
