import { Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { BarChart3, LogOut } from 'lucide-react';
import { ModeToggle } from '@/components/mode-toggle';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useEvaluationWizard } from '@/context/EvaluationWizardContext';
import { useEvaluationResult } from '@/context/EvaluationResultContext';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import EvaluationModePage from '@/pages/EvaluationModePage';
import DiagramTypePage from '@/pages/DiagramTypePage';
import GlobalEvaluationPlaceholderPage from '@/pages/GlobalEvaluationPlaceholderPage';
import UploadPage from '@/pages/UploadPage';
import ResultsPage from '@/pages/ResultsPage';
import ReportPage from '@/pages/ReportPage';
import './App.css';

function ProtectedLayout() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

function AppShell() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { resetWizard } = useEvaluationWizard();
  const { clearResult } = useEvaluationResult();

  const handleLogout = () => {
    logout();
    clearResult();
    resetWizard();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted/20">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50 shrink-0">
        <div className="w-full px-2 sm:px-3 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">UML Evaluator</h1>
              <p className="text-xs text-muted-foreground">Evaluación automática de diagramas UML</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <ModeToggle />
            {user && (
              <span className="text-sm text-muted-foreground max-w-[200px] truncate" title={user.email}>
                {user.name}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t pt-8 pb-2 sm:pb-2.5 shrink-0">
        <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 px-2 sm:px-3 md:px-4 lg:px-5 text-muted-foreground text-xs leading-tight">
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}images/logoUES.png`}
              alt="Universidad de El Salvador"
              className="h-14 w-auto object-contain sm:h-[3.75rem]"
            />
            <img
              src={`${import.meta.env.BASE_URL}images/eisi-ues.png`}
              alt="Escuela de Sistemas Informáticos — UES"
              className="h-12 w-auto max-w-[min(100%,220px)] object-contain object-left sm:h-[3.35rem]"
            />
          </div>
          <div className="text-left sm:text-right min-w-0 flex-1 space-y-0 sm:max-w-xl sm:ml-auto">
            <p className="font-medium text-foreground">Universidad de El Salvador</p>
            <p>Facultad de Ingeniería y Arquitectura</p>
            <p>Escuela de Sistemas Informáticos</p>
            <p className="text-muted-foreground/90 pt-0.5">© 2026. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? '/evaluar/modo' : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="/" element={<HomeRedirect />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<AppShell />}>
          <Route path="/evaluar/modo" element={<EvaluationModePage />} />
          <Route path="/evaluar/tipo" element={<DiagramTypePage />} />
          <Route path="/evaluar/subir" element={<UploadPage />} />
          <Route path="/evaluar/resultados" element={<ResultsPage />} />
          <Route path="/evaluar/reporte" element={<ReportPage />} />
          <Route path="/evaluar/global" element={<GlobalEvaluationPlaceholderPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
