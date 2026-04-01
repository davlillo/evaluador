import { useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import UploadPage from '@/pages/UploadPage';
import ResultsPage from '@/pages/ResultsPage';
import ReportPage from '@/pages/ReportPage';
import './App.css';

type Page = 'upload' | 'results' | 'report';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('upload');
  const [result, setResult] = useState<any>(null);

  const handleReset = () => {
    setResult(null);
    setCurrentPage('upload');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">UML Evaluator</h1>
              <p className="text-xs text-muted-foreground">Evaluación automática de diagramas UML</p>
            </div>
          </div>
          {currentPage !== 'upload' && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Reiniciar
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {currentPage === 'upload' && (
          <UploadPage onResult={setResult} onNavigate={(page) => setCurrentPage(page as Page)} />
        )}
        {currentPage === 'results' && result && (
          <ResultsPage
            result={result}
            onBack={handleReset}
            onViewReport={() => setCurrentPage('report')}
          />
        )}
        {currentPage === 'report' && result && (
          <ReportPage result={result} onBack={() => setCurrentPage('results')} />
        )}
      </main>

      <footer className="border-t mt-12 py-6">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>UML Evaluator — Sistema automático de evaluación de diagramas UML</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
