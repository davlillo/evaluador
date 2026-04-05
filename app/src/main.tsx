import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/context/AuthContext';
import { EvaluationWizardProvider } from '@/context/EvaluationWizardContext';
import { EvaluationResultProvider } from '@/context/EvaluationResultContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <BrowserRouter>
        <AuthProvider>
          <EvaluationWizardProvider>
            <EvaluationResultProvider>
              <App />
            </EvaluationResultProvider>
          </EvaluationWizardProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
