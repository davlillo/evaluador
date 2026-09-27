// SPDX-FileCopyrightText: 2026 davlillos
// SPDX-License-Identifier: MIT

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { ThemeProvider } from '@/components/theme-provider';
import { EvaluationResultProvider } from '@/context/EvaluationResultContext';
import { GlobalEvaluationProvider } from '@/context/GlobalEvaluationContext';
import { GradingSheetProvider } from '@/context/GradingSheetContext';

// firma del equipo, visible en las herramientas de desarrollador del navegador
console.info(
  '%cUML Evaluador%c desarrollado por davlillos · Licencia MIT',
  'color:#921a1a;font-weight:bold;font-size:14px',
  'color:inherit;font-size:12px',
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <BrowserRouter>
        <EvaluationResultProvider>
          <GlobalEvaluationProvider>
            <GradingSheetProvider>
              <App />
            </GradingSheetProvider>
          </GlobalEvaluationProvider>
        </EvaluationResultProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
