import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from '@/components/theme-provider';
import { EvaluationResultProvider } from '@/context/EvaluationResultContext';
import { GlobalEvaluationProvider } from '@/context/GlobalEvaluationContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <BrowserRouter>
        <EvaluationResultProvider>
          <GlobalEvaluationProvider>
            <App />
          </GlobalEvaluationProvider>
        </EvaluationResultProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
