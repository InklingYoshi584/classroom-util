import React from 'react';
import ReactDOM from 'react-dom/client';
import { HomeworkTracker } from './HomeworkTracker';
import './App.css';
import './HomeworkTracker.css';

function HomeworkPage() {
  const params = new URLSearchParams(window.location.search);
  const classId = params.get('classId') || '';
  const serverHost = params.get('serverHost') || '';

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto', minHeight: '100dvh' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 12, color: '#3730a3' }}>
        作业追踪 {classId ? `— ${classId}` : ''}
      </h2>
      {classId ? (
        <HomeworkTracker
          classId={classId}
          serverHost={serverHost}
          reloadTrigger={0}
          onDataSaved={() => {}}
        />
      ) : (
        <p style={{ color: '#6b7280' }}>未指定班级 ID，请从接收端主页打开作业。</p>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HomeworkPage />
  </React.StrictMode>
);
