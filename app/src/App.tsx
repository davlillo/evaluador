import { Routes, Route, Navigate, Outlet, Link } from 'react-router-dom';
import { ModeToggle } from '@/components/mode-toggle';
import UploadPage from '@/pages/UploadPage';
import ResultsPage from '@/pages/ResultsPage';
import ReportPage from '@/pages/ReportPage';
import BatchResultsPage from '@/pages/BatchResultsPage';
import GlobalStudentBreakdownPage from '@/pages/GlobalStudentBreakdownPage';
import './App.css';

/**
 * Franja lateral institucional roja UES. Reproduce el panel del mockup.
 * Cuando exista `public/images/minerva.png` se muestra la estatua; mientras tanto
 * cae con elegancia al escudo UES sobre el degradado rojo + textura de puntos.
 */
function UesSidebar() {
  return (
    <aside className="sticky top-0 hidden lg:flex h-screen w-60 shrink-0 flex-col overflow-hidden bg-gradient-to-b from-primary via-primary to-[hsl(0_72%_22%)] text-primary-foreground print:hidden">
      {/* Textura de puntos de fondo */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      />

      {/* Arriba: logo UES + nombre de la universidad */}
      <div className="relative z-20 flex flex-col items-center gap-3 px-4 pt-6 text-center shrink-0">
        <img
          src={`${import.meta.env.BASE_URL}images/logoUES.png`}
          alt="Universidad de El Salvador"
          className="w-20 opacity-95 brightness-0 invert"
        />
        <p className="text-sm font-bold leading-tight tracking-wide">
          UNIVERSIDAD DE<br />EL SALVADOR
        </p>
      </div>

      {/* Centro: estatua de Minerva (crece para llenar y se ancla abajo) */}
      <div className="relative z-10 flex-1 min-h-0 mt-3">
        <img
          src={`${import.meta.env.BASE_URL}images/minerva.png`}
          alt=""
          aria-hidden
          className="absolute inset-x-0 bottom-0 mx-auto h-full w-auto max-w-full object-contain object-bottom"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* Degradado inferior para fundir la base de la estatua con el lema */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[hsl(0_72%_22%)] to-transparent" />
      </div>

      {/* Abajo: lema institucional */}
      <div className="relative z-20 px-4 pb-5 text-center shrink-0">
        <div className="mx-auto mb-2 h-px w-10 bg-primary-foreground/40" />
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] opacity-90">
          Hacia la libertad<br />por la cultura
        </p>
      </div>
    </aside>
  );
}

function AppShell() {
  return (
    <div className="min-h-screen flex bg-gradient-to-br from-background via-background to-muted/20">
      <UesSidebar />
      <div className="flex flex-1 flex-col min-w-0">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50 shrink-0 print:hidden">
        <div className="w-full px-3 sm:px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}images/logoUES.png`}
              alt="Universidad de El Salvador"
              className="h-10 w-auto object-contain lg:hidden"
            />
            <div className="border-l pl-3 lg:border-l-0 lg:pl-0">
              <h1 className="text-lg font-bold leading-tight">
                UML <span className="text-primary">Evaluador</span>
              </h1>
              <p className="text-xs text-muted-foreground leading-tight">
                Evaluación Inteligente de Diagramas UML
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <ModeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t pt-6 pb-3 shrink-0 print:hidden">
        <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4 text-muted-foreground text-xs leading-tight">
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <img
              src={`${import.meta.env.BASE_URL}images/logoUES.png`}
              alt="Universidad de El Salvador"
              className="h-12 w-auto object-contain"
            />
            <img
              src={`${import.meta.env.BASE_URL}images/eisi-ues.png`}
              alt="Escuela de Sistemas Informáticos — UES"
              className="h-10 w-auto max-w-[220px] object-contain object-left"
            />
          </div>
          <div className="text-left sm:text-right min-w-0 flex-1 sm:max-w-xl sm:ml-auto">
            <p className="font-medium text-foreground">Universidad de El Salvador</p>
            <p>Facultad de Ingeniería y Arquitectura</p>
            <p>Escuela de Sistemas Informáticos</p>
            <p className="text-muted-foreground/90 pt-0.5">© 2026. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<UploadPage />} />
        <Route path="/resultados" element={<ResultsPage />} />
        <Route path="/reporte" element={<ReportPage />} />
        <Route path="/lote" element={<BatchResultsPage />} />
        <Route path="/lote/desglose" element={<GlobalStudentBreakdownPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
