import { useState, useRef } from 'react';
import { searchStudents } from './lib/pinyin-search';
import './SeatingChart.css';

export interface SeatLayout {
  rows: number;
  cols: number;
  seats: Record<string, string | null>; // "r-c" -> studentName | null
}

interface Props {
  students: string[];
  classId: string;
  initial?: SeatLayout | null;
  onPublish: (layout: SeatLayout) => void;
  onClose: () => void;
}

function cellKey(r: number, c: number) {
  return `${r}-${c}`;
}

export function SeatingChart({ students, classId, initial, onPublish, onClose }: Props) {
  const [rows, setRows] = useState(initial?.rows ?? 5);
  const [cols, setCols] = useState(initial?.cols ?? 6);
  const [seats, setSeats] = useState<Record<string, string | null>>(initial?.seats ?? {});
  const [dragStudent, setDragStudent] = useState<string | null>(null);
  const [dragOverCell, setDragOverCell] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = search ? searchStudents(search, students) : students;
  const unassigned = filtered.filter((s) => !Object.values(seats).includes(s));

  const handleCellClick = (r: number, c: number) => {
    const key = cellKey(r, c);
    setSeats((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleDragStart = (name: string) => {
    setDragStudent(name);
  };

  const handleDragOver = (e: React.DragEvent, r: number, c: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCell(cellKey(r, c));
  };

  const handleDragLeave = () => {
    setDragOverCell(null);
  };

  const handleDrop = (r: number, c: number) => {
    setDragOverCell(null);
    if (!dragStudent) return;
    const key = cellKey(r, c);
    setSeats((prev) => {
      const next = { ...prev };
      // Remove student from old seat if re-dropping
      for (const k of Object.keys(next)) {
        if (next[k] === dragStudent) delete next[k];
      }
      next[key] = dragStudent;
      return next;
    });
    setDragStudent(null);
  };

  const handleDragEnd = () => {
    setDragStudent(null);
    setDragOverCell(null);
  };

  const handlePublish = () => {
    onPublish({ rows, cols, seats });
  };

  const handleClear = () => {
    setSeats({});
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="seating-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="seating-header">
          <h3>座位表 — {classId}</h3>
          <button className="close-btn" onClick={onClose}>&#10005;</button>
        </div>

        <div className="seating-body">
          {/* ── Left: student list ── */}
          <div className="seating-left">
            <input
              type="text"
              className="seating-search"
              placeholder="搜索学生 (拼音/汉字)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="seating-student-list">
              {unassigned.map((name) => (
                <div
                  key={name}
                  className={`seating-student-item ${dragStudent === name ? 'dragging' : ''}`}
                  draggable
                  onDragStart={() => handleDragStart(name)}
                  onDragEnd={handleDragEnd}
                >
                  {name}
                </div>
              ))}
              {unassigned.length === 0 && (
                <div className="seating-empty-hint">所有学生已安排到座位</div>
              )}
            </div>
          </div>

          {/* ── Right: seat grid ── */}
          <div className="seating-right">
            <div className="seating-grid-config">
              <label>行: <input type="number" min={1} max={20} value={rows} onChange={(e) => setRows(Number(e.target.value) || 1)} /></label>
              <label>列: <input type="number" min={1} max={20} value={cols} onChange={(e) => setCols(Number(e.target.value) || 1)} /></label>
              <button className="seating-clear-btn" onClick={handleClear}>清空</button>
            </div>

            <div
              className="seating-grid"
              style={{
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gridTemplateRows: `repeat(${rows}, 1fr)`,
              }}
            >
              {Array.from({ length: rows }, (_, r) =>
                Array.from({ length: cols }, (_, c) => {
                  const key = cellKey(r, c);
                  const name = seats[key] || null;
                  return (
                    <div
                      key={key}
                      className={`seating-cell ${name ? 'occupied' : ''} ${dragOverCell === key ? 'drag-over' : ''}`}
                      onDragOver={(e) => handleDragOver(e, r, c)}
                      onDragLeave={handleDragLeave}
                      onDrop={() => handleDrop(r, c)}
                      onClick={() => name && handleCellClick(r, c)}
                      title={name ? `${name} (点击清空)` : '拖入学生'}
                    >
                      {name || ''}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="seating-footer">
          <button className="seating-publish-btn" onClick={handlePublish}>
            发布座位表
          </button>
        </div>
      </div>
    </div>
  );
}
