import { useState, useEffect, useCallback, useRef } from 'react';
import { electronApi, HomeworkDayData, HomeworkTask, HomeworkStatus } from './lib/electronApi';
import './HomeworkTracker.css';

interface Props {
  classId: string;
  serverHost: string;
}

const STATUS_LABELS: Record<HomeworkStatus, string> = {
  'not-submitted': '未交',
  'submitted': '已交',
  'leave': '请假',
};

const STATUS_CYCLE: HomeworkStatus[] = ['not-submitted', 'submitted', 'leave'];

function getWeekDates(offset = 0) {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function formatDisplayDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${d.getMonth() + 1}/${d.getDate()} ${weekNames[d.getDay()]}`;
}

export function HomeworkTracker({ classId, serverHost }: Props) {
  const [students, setStudents] = useState<string[]>([]);
  const [allData, setAllData] = useState<Record<string, HomeworkDayData>>({});
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weekOffset, setWeekOffset] = useState(0);
  const [dataChanged, setDataChanged] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskNameInput, setTaskNameInput] = useState('');
  const [editingTask, setEditingTask] = useState<HomeworkTask | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dayData = allData[currentDate] || { tasks: [], taskStatuses: {}, todayTaskContent: '' };

  // Load students from server
  useEffect(() => {
    const apiBase = serverHost ? `http://${serverHost}:8787` : '';
    fetch(`${apiBase}/api/students?class=${encodeURIComponent(classId)}`)
      .then((r) => r.json())
      .then((d) => setStudents(d.students || []))
      .catch(() => setToast({ msg: '无法加载学生名单', error: true }));
  }, [classId, serverHost]);

  // Load data from D drive
  useEffect(() => {
    electronApi.loadData(classId).then((data: Record<string, HomeworkDayData>) => {
      setAllData(data || {});
      const today = new Date().toISOString().slice(0, 10);
      if (!data[today]) {
        setAllData((prev) => ({
          ...prev,
          [today]: { tasks: [], taskStatuses: {}, todayTaskContent: '' },
        }));
      }
    });
  }, [classId]);

  // Auto-save when data changes
  useEffect(() => {
    if (!dataChanged) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      electronApi.saveData(classId, allData).then((r) => {
        if (!r.ok) setToast({ msg: '保存失败', error: true });
      });
      setDataChanged(false);
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [dataChanged, allData, classId]);

  const updateDay = useCallback((date: string, updater: (d: HomeworkDayData) => HomeworkDayData) => {
    setAllData((prev) => {
      const current = prev[date] || { tasks: [], taskStatuses: {}, todayTaskContent: '' };
      return { ...prev, [date]: updater(current) };
    });
    setDataChanged(true);
  }, []);

  // ── Task management ──
  const handleAddTask = () => {
    const name = taskNameInput.trim();
    if (!name) return;
    const maxId = dayData.tasks.reduce((m: number, t: HomeworkTask) => Math.max(m, t.id), 0);
    const newTask: HomeworkTask = { id: maxId + 1, name };
    updateDay(currentDate, (d) => ({
      ...d,
      tasks: [...d.tasks, newTask],
    }));
    setTaskNameInput('');
    setShowTaskModal(false);
  };

  const handleEditTask = () => {
    const name = taskNameInput.trim();
    if (!name || !editingTask) return;
    updateDay(currentDate, (d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === editingTask.id ? { ...t, name } : t)),
    }));
    setTaskNameInput('');
    setEditingTask(null);
    setShowTaskModal(false);
  };

  const handleDeleteTask = (taskId: number) => {
    updateDay(currentDate, (d) => {
      const newStatuses = { ...d.taskStatuses };
      delete newStatuses[taskId];
      return {
        ...d,
        tasks: d.tasks.filter((t) => t.id !== taskId),
        taskStatuses: newStatuses,
      };
    });
  };

  // ── Status toggle ──
  const handleStatusToggle = (taskId: number, studentIdx: number) => {
    updateDay(currentDate, (d) => {
      const current = (d.taskStatuses[taskId] || {})[studentIdx] || 'not-submitted';
      const nextIdx = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
      const newStatuses = { ...d.taskStatuses };
      newStatuses[taskId] = { ...newStatuses[taskId], [studentIdx]: STATUS_CYCLE[nextIdx] };
      return { ...d, taskStatuses: newStatuses };
    });
  };

  // ── Submit all ──
  const handleSubmitAll = (taskId: number) => {
    updateDay(currentDate, (d) => {
      const newStatuses: Record<string, HomeworkStatus> = {};
      students.forEach((_, i) => {
        const cur = (d.taskStatuses[taskId] || {})[i];
        newStatuses[i] = cur === 'leave' ? 'leave' : 'submitted';
      });
      return { ...d, taskStatuses: { ...d.taskStatuses, [taskId]: newStatuses } };
    });
  };

  // ── Content ──
  const handleContentChange = (text: string) => {
    updateDay(currentDate, (d) => ({ ...d, todayTaskContent: text }));
  };

  // ── Export ──
  const handleExportImage = () => {
    if (dayData.tasks.length === 0 || students.length === 0) {
      setToast({ msg: '当前日期无任务', error: true });
      return;
    }
    renderToImage(classId, currentDate, students, dayData);
    setToast({ msg: '已导出图片' });
  };

  const handleExportXlsx = () => {
    if (dayData.tasks.length === 0) {
      setToast({ msg: '当前日期无任务', error: true });
      return;
    }
    createXlsx(classId, currentDate, students, dayData);
    setToast({ msg: '已导出 XLSX' });
  };

  const handleBackup = async () => {
    const r = await electronApi.exportBackup(classId, allData);
    if (r.ok) {
      setToast({ msg: r.path ? `已备份: ${r.path}` : '已备份' });
    } else {
      setToast({ msg: '备份失败', error: true });
    }
  };

  // ── Week nav ──
  const weekDates = getWeekDates(weekOffset);

  const isCurrentDateValid = weekDates.includes(currentDate);

  return (
    <div className="hw-tracker">
      <div className="hw-week-nav">
        <button className="hw-week-btn" onClick={() => setWeekOffset((w) => w - 1)}>&#9664;</button>
        {weekDates.map((d) => (
          <button
            key={d}
            className={`hw-day-btn ${d === currentDate ? 'active' : ''}`}
            onClick={() => setCurrentDate(d)}
          >
            {formatDisplayDate(d)}
          </button>
        ))}
        <button className="hw-week-btn" onClick={() => setWeekOffset((w) => w + 1)}>&#9654;</button>
      </div>

      <div className="hw-toolbar">
        <button className="hw-btn" onClick={() => { setTaskNameInput(''); setEditingTask(null); setShowTaskModal(true); }}>
          + 添加作业
        </button>
        <button className="hw-btn" onClick={handleExportXlsx}>导出 XLSX</button>
        <button className="hw-btn" onClick={handleExportImage}>导出图片</button>
        <button className="hw-btn" onClick={handleBackup}>备份数据</button>
      </div>

      {students.length === 0 && (
        <div className="hw-empty">正在加载学生名单...</div>
      )}

      {students.length > 0 && dayData.tasks.length === 0 && (
        <div className="hw-empty">当前日期无作业任务，点击"+ 添加作业"添加</div>
      )}

      {students.length > 0 && dayData.tasks.length > 0 && (
        <div className="hw-table-wrapper">
          <table className="hw-table">
            <thead>
              <tr>
                <th className="hw-sticky-left hw-num-col">#</th>
                <th className="hw-sticky-left hw-name-col">姓名</th>
                {dayData.tasks.map((task) => (
                  <th key={task.id} className="hw-task-header">
                    <div className="hw-task-name" title={task.name}>{task.name}</div>
                    <div className="hw-task-actions">
                      <button
                        className="hw-task-edit"
                        onClick={() => { setEditingTask(task); setTaskNameInput(task.name); setShowTaskModal(true); }}
                      >&#9998;</button>
                      <button className="hw-task-del" onClick={() => handleDeleteTask(task.id)}>&#10005;</button>
                    </div>
                    <button className="hw-submit-all" onClick={() => handleSubmitAll(task.id)}>全交</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((name, idx) => (
                <tr key={idx}>
                  <td className="hw-sticky-left hw-num-col">{idx + 1}</td>
                  <td className="hw-sticky-left hw-name-col">{name}</td>
                  {dayData.tasks.map((task) => {
                    const status = (dayData.taskStatuses[task.id] || {})[idx] || 'not-submitted';
                    return (
                      <td
                        key={task.id}
                        className={`hw-cell hw-${status}`}
                        onClick={() => handleStatusToggle(task.id, idx)}
                      >
                        {STATUS_LABELS[status]}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {students.length > 0 && (
        <div className="hw-content-section">
          <label className="hw-content-label">今日作业内容</label>
          <textarea
            className="hw-content-input"
            placeholder="输入今天布置的作业内容..."
            value={dayData.todayTaskContent}
            onChange={(e) => handleContentChange(e.target.value)}
            rows={4}
          />
        </div>
      )}

      {/* ── Task Modal ── */}
      {showTaskModal && (
        <div className="hw-overlay" onClick={() => setShowTaskModal(false)}>
          <div className="hw-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingTask ? '编辑作业' : '添加作业'}</h3>
            <input
              type="text"
              className="hw-modal-input"
              placeholder="作业名称"
              value={taskNameInput}
              onChange={(e) => setTaskNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (editingTask ? handleEditTask() : handleAddTask())}
              autoFocus
            />
            <div className="hw-modal-btns">
              <button className="hw-btn" onClick={() => setShowTaskModal(false)}>取消</button>
              <button className="hw-btn hw-btn-primary" onClick={editingTask ? handleEditTask : handleAddTask}>
                {editingTask ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`hw-toast ${toast.error ? 'error' : ''}`}
          onAnimationEnd={() => setToast(null)}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── XLSX export (uses CDN-loaded SheetJS) ──
function createXlsx(className: string, date: string, students: string[], dayData: HomeworkDayData) {
  const XLSX = (window as any).XLSX;
  if (!XLSX) {
    loadXlsxScript().then(() => createXlsx(className, date, students, dayData));
    return;
  }

  const rows: any[][] = [];
  rows.push([`${className} - ${date} 作业统计`]);
  rows.push([]);

  const header = ['编号', '姓名', ...dayData.tasks.map((t) => t.name)];
  rows.push(header);

  students.forEach((name, idx) => {
    const row: any[] = [idx + 1, name];
    dayData.tasks.forEach((task) => {
      const status = (dayData.taskStatuses[task.id] || {})[idx] || 'not-submitted';
      row.push(STATUS_LABELS[status]);
    });
    rows.push(row);
  });

  if (dayData.todayTaskContent) {
    rows.push([]);
    rows.push(['作业内容:', dayData.todayTaskContent]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws['!cols'] = [{ wch: 6 }, { wch: 12 }, ...dayData.tasks.map(() => ({ wch: 10 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, date);
  XLSX.writeFile(wb, `作业统计-${className}-${date}.xlsx`);
}

let xlsxLoading = false;

function loadXlsxScript(): Promise<void> {
  const XLSX = (window as any).XLSX;
  if (XLSX) return Promise.resolve();
  if (xlsxLoading) return new Promise((resolve) => {
    const check = setInterval(() => {
      if ((window as any).XLSX) { clearInterval(check); resolve(); }
    }, 100);
  });
  xlsxLoading = true;
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => { xlsxLoading = false; resolve(); };
    script.onerror = () => { xlsxLoading = false; resolve(); };
    document.head.appendChild(script);
  });
}

// ── Image export (canvas renderer) ──
function renderToImage(className: string, date: string, students: string[], dayData: HomeworkDayData) {
  const tasks = dayData.tasks;
  const colW = 72;
  const rowH = 24;
  const numW = 32;
  const nameW = 64;
  const padX = 8;
  const padY = 6;
  const titleH = 30;

  const tableW = numW + nameW + tasks.length * colW + padX * 2;
  const contentLines = dayData.todayTaskContent ? dayData.todayTaskContent.split('\n').length : 0;
  const contentH = dayData.todayTaskContent ? (18 + contentLines * 14) : 0;
  const tableH = titleH + 28 + students.length * rowH + padY * 2 + contentH;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = tableW * scale;
  canvas.height = tableH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, tableW, tableH);

  // Title
  ctx.fillStyle = '#f9fafb';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${className} · ${date} 作业统计`, tableW / 2, titleH - 6);

  // Header row
  const headerY = titleH;
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(padX, headerY, tableW - padX * 2, 26);

  ctx.fillStyle = '#d1d5db';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';

  ctx.fillText('#', padX + numW / 2, headerY + 17);
  ctx.fillText('姓名', padX + numW + nameW / 2, headerY + 17);
  for (let ti = 0; ti < tasks.length; ti++) {
    const tx = padX + numW + nameW + ti * colW + colW / 2;
    ctx.fillText(tasks[ti].name, tx, headerY + 17);
  }

  // Data rows
  const colors: Record<HomeworkStatus, string> = {
    'not-submitted': '#fca5a5',
    'submitted': '#86efac',
    'leave': '#fde68a',
  };
  const textColors: Record<HomeworkStatus, string> = {
    'not-submitted': '#991b1b',
    'submitted': '#065f46',
    'leave': '#92400e',
  };
  const labels: Record<HomeworkStatus, string> = {
    'not-submitted': '未交',
    'submitted': '已交',
    'leave': '请假',
  };

  ctx.font = '11px system-ui, sans-serif';
  for (let si = 0; si < students.length; si++) {
    const y = headerY + 28 + si * rowH;
    const bg = si % 2 === 0 ? '#1a1a2e' : '#16213e';
    ctx.fillStyle = bg;
    ctx.fillRect(padX, y, tableW - padX * 2, rowH);

    ctx.fillStyle = '#9ca3af';
    ctx.textAlign = 'center';
    ctx.fillText(`${si + 1}`, padX + numW / 2, y + 16);

    ctx.fillStyle = '#e5e7eb';
    ctx.textAlign = 'left';
    ctx.fillText(students[si], padX + numW + 4, y + 16);

    ctx.textAlign = 'center';
    for (let ti = 0; ti < tasks.length; ti++) {
      const status = (dayData.taskStatuses[tasks[ti].id] || {})[si] || 'not-submitted';
      const cx = padX + numW + nameW + ti * colW + colW / 2;
      const rx = padX + numW + nameW + ti * colW + 2;
      const ry = y + 2;
      const rw = colW - 4;
      const rh = rowH - 4;
      const radius = 4;

      ctx.fillStyle = colors[status];
      ctx.beginPath();
      ctx.moveTo(rx + radius, ry);
      ctx.lineTo(rx + rw - radius, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + radius, radius);
      ctx.lineTo(rx + rw, ry + rh - radius);
      ctx.arcTo(rx + rw, ry + rh, rx + rw - radius, ry + rh, radius);
      ctx.lineTo(rx + radius, ry + rh);
      ctx.arcTo(rx, ry + rh, rx, ry + rh - radius, radius);
      ctx.lineTo(rx, ry + radius);
      ctx.arcTo(rx, ry, rx + radius, ry, radius);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = textColors[status];
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(labels[status], cx, y + 16);
    }
  }

  // Homework content at bottom
  if (dayData.todayTaskContent) {
    const contentY = headerY + 28 + students.length * rowH + 12;
    ctx.fillStyle = '#d1d5db';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('作业内容:', padX, contentY);

    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px system-ui, sans-serif';
    const lines = dayData.todayTaskContent.split('\n');
    for (let li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], padX, contentY + 16 + li * 14);
    }
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `作业统计-${className}-${date}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
