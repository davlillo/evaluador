import { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGlobalEvaluation } from '@/context/GlobalEvaluationContext';
import { DownloadBatchReportsZipButton } from '@/components/report/DownloadBatchReportsZipButton';
import { percentToNota } from '@/lib/rubric';
import { downloadBatchNotasCsv } from '@/lib/batch-csv';
import type { BatchStudentResult } from '@/types/evaluation-session';

type SortKey = 'student' | 'score';

export default function BatchResultsPage() {
  const navigate = useNavigate();
  const { batchResult, setReportReturn } = useGlobalEvaluation();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortAsc, setSortAsc] = useState(false);

  const rows = useMemo(() => {
    const list = batchResult?.results ?? [];
    const filtered = query
      ? list.filter((r) => r.student_id.toLowerCase().includes(query.toLowerCase()))
      : list;
    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === 'student') return a.student_id.localeCompare(b.student_id);
      return a.final_score - b.final_score;
    });
    return sortAsc ? sorted : sorted.reverse();
  }, [batchResult, query, sortKey, sortAsc]);

  if (!batchResult) {
    return <Navigate to="/" replace />;
  }

  const openStudent = (student: BatchStudentResult) => {
    setReportReturn({ path: '/lote', studentId: student.student_id });
    navigate('/lote/desglose', { state: { studentId: student.student_id } });
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(key === 'student');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mb-2 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Nueva evaluación
          </Button>
          <h2 className="text-2xl font-bold">Evaluación por lote</h2>
          <p className="text-sm text-muted-foreground">
            {batchResult.students_total} estudiante(s) · {batchResult.students_complete} completo(s)
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => downloadBatchNotasCsv(batchResult)}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Exportar CSV de notas
          </Button>
          <DownloadBatchReportsZipButton />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-base">Resultados por estudiante</CardTitle>
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por carné…"
              className="w-full border rounded-md pl-8 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 px-2">
                    <button className="font-semibold" onClick={() => toggleSort('student')}>
                      Carné
                    </button>
                  </th>
                  <th className="py-2 px-2">
                    <button className="font-semibold" onClick={() => toggleSort('score')}>
                      Similitud
                    </button>
                  </th>
                  <th className="py-2 px-2">Nota</th>
                  <th className="py-2 px-2">Estado</th>
                  <th className="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student_id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="py-2 px-2 font-medium">{r.student_id}</td>
                    <td className="py-2 px-2">
                      {r.status === 'error' ? '—' : `${r.final_score.toFixed(1)}%`}
                    </td>
                    <td className="py-2 px-2 font-semibold">
                      {r.status === 'error' ? '—' : (r.nota ?? percentToNota(r.final_score)).toFixed(1)}
                    </td>
                    <td className="py-2 px-2">
                      {r.status === 'error' ? (
                        <Badge variant="destructive">Error</Badge>
                      ) : r.complete ? (
                        <Badge variant="secondary">Completo</Badge>
                      ) : (
                        <Badge variant="outline">Incompleto</Badge>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {r.status !== 'error' && (
                        <Button variant="ghost" size="sm" onClick={() => openStudent(r)}>
                          Ver desglose
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      Sin resultados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
