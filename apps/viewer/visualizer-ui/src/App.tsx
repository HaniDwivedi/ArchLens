import { useEffect, useState } from 'react';
import { GraphVisualizer, type GraphData } from './GraphVisualizer';

const fallbackData: GraphData = {
  'src/index.ts': [{ url: 'src/routes.ts', method: 'IMPORT' }],
  'src/routes.ts': [{ url: 'src/controller.ts', method: 'CALL' }],
  'src/controller.ts': [{ url: 'src/db.ts', method: 'QUERY' }],
};

function App() {
  // Empty object `{}` pass karne ke bajaye `{} as GraphData` likhein
  const [graphData, setGraphData] = useState<GraphData>({} as GraphData);
  const [viewMode, setViewMode] = useState<'beginner' | 'pro'>('beginner');

  useEffect(() => {
    fetch('/output.json')
      .then((res) => {
        if (!res.ok) throw new Error('File not found');
        return res.json();
      })
      .then((data: unknown) => {
        if (data && typeof data === 'object' && Object.keys(data).length > 0) {
          setGraphData(data as GraphData);
        } else {
          setGraphData(fallbackData);
        }
      })
      .catch(() => setGraphData(fallbackData));
  }, []);

  return (
    <div>
      <GraphVisualizer jsonData={graphData} />
    </div>
  );
}

export default App;