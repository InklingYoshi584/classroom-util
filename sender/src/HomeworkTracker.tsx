import { useState, useEffect, useCallback, useRef } from 'react';
import { electronApi, HomeworkDayData, HomeworkTask, HomeworkStatus } from './lib/electronApi';
import { getPinStatus, verifyPin } from './lib/pin';
import './HomeworkTracker.css';

interface Props {
  classId: string;
  serverHost: string;
  reloadTrigger?: number;
  onDataSaved?: () => void;
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

export function HomeworkTracker({ classId, serverHost, reloadTrigger, onDataSaved }: Props) {
  const [students, setStudents] = useState<string[]>([]);
  const [allData, setAllData] = useState<Record<string, HomeworkDayData>>({});
  const [currentDate, setCurrentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weekOffset, setWeekOffset] = useState(0);
  const [dataChanged, setDataChanged] = useState(false);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskNameInput, setTaskNameInput] = useState('');
  const [editingTask, setEditingTask] = useState<HomeworkTask | null>(null);
  const [adminUnlocked, setAdminUnlocked] = useState(() => localStorage.getItem(`hw-admin-${classId}`) === '1');
  const [showPinGate, setShowPinGate] = useState(false);
  const [hwPinInput, setHwPinInput] = useState('');
  const [hwPinError, setHwPinError] = useState('');

  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  const [exportDates, setExportDates] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<'table' | 'missing'>('table');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dayData = allData[currentDate] || { tasks: [], taskStatuses: {}, todayTaskContent: '' };

  const apiBase = serverHost ? `http://${serverHost}:8787` : '';

  // Load students from server
  useEffect(() => {
    fetch(`${apiBase}/api/students?class=${encodeURIComponent(classId)}`)
      .then((r) => r.json())
      .then((d) => setStudents(d.students || []))
      .catch(() => setToast({ msg: '无法加载学生名单', error: true }));
  }, [classId, apiBase]);

  // Load data — server first, upload local if server empty
  useEffect(() => {
    const serverLoad = async () => {
      try {
        const r = await fetch(`${apiBase}/api/hw/load?class=${encodeURIComponent(classId)}`);
        const d = await r.json();
        const serverData: Record<string, HomeworkDayData> = d.data || {};
        if (Object.keys(serverData).length > 0) {
          setAllData(serverData);
          return;
        }
      } catch {}
      const localData = await electronApi.loadData(classId);
      if (Object.keys(localData).length > 0) {
        setAllData(localData);
        fetch(`${apiBase}/api/hw/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ class: classId, data: localData }),
        }).catch(() => {});
        return;
      }
      setAllData(localData);
    };
    serverLoad();
  }, [classId, apiBase]);

  // Reload from server when trigger changes (MQTT sync)
  useEffect(() => {
    if (reloadTrigger === undefined || reloadTrigger === 0) return;
    fetch(`${apiBase}/api/hw/load?class=${encodeURIComponent(classId)}`)
      .then((r) => r.json())
      .then((d) => {
        setAllData(d.data || {});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadTrigger]);

  // Auto-save when data changes — save to server and local
  useEffect(() => {
    if (!dataChanged) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch(`${apiBase}/api/hw/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class: classId, data: allData }),
      }).then(() => onDataSaved?.()).catch(() => setToast({ msg: '服务器保存失败', error: true }));
      electronApi.saveData(classId, allData).then((r) => {
        if (!r.ok && (window as any).electronAPI) setToast({ msg: '本地保存失败', error: true });
      });
      setDataChanged(false);
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [dataChanged, allData, classId, apiBase]);

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

  // ── Admin lock ──
  const handleAdminUnlock = async () => {
    try {
      const r = await fetch(`${apiBase}/api/pin/status`);
      const d = await r.json();
      if (!d.set) {
        setAdminUnlocked(true);
        localStorage.setItem(`hw-admin-${classId}`, '1');
        return;
      }
    } catch {
      setToast({ msg: '无法连接到服务器', error: true });
      return;
    }
    setShowPinGate(true);
    setHwPinInput('');
    setHwPinError('');
  };

  const handleHwPinSubmit = async () => {
    try {
      const res = await fetch(`${apiBase}/api/pin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: hwPinInput }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminUnlocked(true);
        localStorage.setItem(`hw-admin-${classId}`, '1');
        setShowPinGate(false);
        setHwPinInput('');
        setHwPinError('');
      } else {
        setHwPinError('PIN 错误');
      }
    } catch {
      setHwPinError('无法连接到服务器');
    }
  };

  const handleAdminLock = () => {
    setAdminUnlocked(false);
    localStorage.removeItem(`hw-admin-${classId}`);
  };

  // ── Export ──
  const handleExportImage = () => {
    if (students.length === 0) {
      setToast({ msg: '无学生数据', error: true });
      return;
    }
    setSelectedStudents(new Set(students.map((_, i) => i)));
    setExportDates(new Set([currentDate]));
    setShowExportModal(true);
  };

  const handleConfirmExport = () => {
    if (selectedStudents.size === 0) {
      setToast({ msg: '请选择至少一名学生', error: true });
      return;
    }
    if (exportDates.size === 0) {
      setToast({ msg: '请选择至少一天', error: true });
      return;
    }
    const dates = [...exportDates].sort();
    const selectedIndices = [...selectedStudents].sort((a, b) => a - b);
    const filteredStudents = selectedIndices.map((i) => students[i]);
    if (exportFormat === 'table') {
      renderMultiDayImage(classId, dates, filteredStudents, allData);
    } else {
      renderMissingListImage(classId, dates, filteredStudents, allData);
    }
    setShowExportModal(false);
    setToast({ msg: `已导出 ${dates.length} 天的图片` });
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
        {adminUnlocked ? (
          <>
            <button className="hw-btn" onClick={() => { setTaskNameInput(''); setEditingTask(null); setShowTaskModal(true); }}>
              + 添加作业
            </button>
            <button className="hw-btn hw-lock-btn" onClick={handleAdminLock}>锁定编辑</button>
          </>
        ) : (
          <button className="hw-btn hw-unlock-btn" onClick={handleAdminUnlock}>解锁编辑</button>
        )}
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
                    {adminUnlocked && (
                      <>
                        <div className="hw-task-actions">
                          <button
                            className="hw-task-edit"
                            onClick={() => { setEditingTask(task); setTaskNameInput(task.name); setShowTaskModal(true); }}
                          >&#9998;</button>
                          <button className="hw-task-del" onClick={() => handleDeleteTask(task.id)}>&#10005;</button>
                        </div>
                        <button className="hw-submit-all" onClick={() => handleSubmitAll(task.id)}>全交</button>
                      </>
                    )}
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
                        className={`hw-cell hw-${status}${adminUnlocked ? '' : ' hw-cell-locked'}`}
                        onClick={adminUnlocked ? () => handleStatusToggle(task.id, idx) : undefined}
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
            placeholder={adminUnlocked ? "输入今天布置的作业内容..." : "编辑已锁定"}
            value={dayData.todayTaskContent}
            onChange={(e) => handleContentChange(e.target.value)}
            readOnly={!adminUnlocked}
            rows={4}
          />
        </div>
      )}

      {/* ── Export Modal ── */}
      {showExportModal && (
        <div className="hw-overlay" onClick={() => setShowExportModal(false)}>
          <div className="hw-export-modal" onClick={(e) => e.stopPropagation()}>
            <h3>导出图片</h3>

            <div className="hw-export-section">
              <label className="hw-export-label">导出格式</label>
              <div className="hw-export-format">
                <button
                  className={`hw-export-chip ${exportFormat === 'table' ? 'active' : ''}`}
                  onClick={() => setExportFormat('table')}
                >表格</button>
                <button
                  className={`hw-export-chip ${exportFormat === 'missing' ? 'active' : ''}`}
                  onClick={() => setExportFormat('missing')}
                >未交列表</button>
              </div>
            </div>

            <div className="hw-export-section">
              <label className="hw-export-label">选择日期</label>
              <div className="hw-export-chips">
                {weekDates.map((d) => (
                  <button
                    key={d}
                    className={`hw-export-chip ${exportDates.has(d) ? 'active' : ''}`}
                    onClick={() => {
                      setExportDates((prev) => {
                        const next = new Set(prev);
                        if (next.has(d)) next.delete(d);
                        else next.add(d);
                        return next;
                      });
                    }}
                  >
                    {formatDisplayDate(d)}
                  </button>
                ))}
              </div>
            </div>

            <div className="hw-export-section">
              <label className="hw-export-label">选择学生</label>
              <div className="hw-export-actions">
                <button className="hw-export-all-btn" onClick={() => {
                  if (selectedStudents.size === students.length) {
                    setSelectedStudents(new Set());
                  } else {
                    setSelectedStudents(new Set(students.map((_, i) => i)));
                  }
                }}>
                  {selectedStudents.size === students.length ? '取消全选' : '全选'}
                </button>
                <span className="hw-export-count">{selectedStudents.size}/{students.length}</span>
              </div>
              <div className="hw-export-student-list">
                {students.map((name, idx) => (
                  <label key={idx} className="hw-export-student">
                    <input
                      type="checkbox"
                      checked={selectedStudents.has(idx)}
                      onChange={() => {
                        setSelectedStudents((prev) => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx);
                          else next.add(idx);
                          return next;
                        });
                      }}
                    />
                    <span>{name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="hw-modal-btns">
              <button className="hw-btn" onClick={() => setShowExportModal(false)}>取消</button>
              <button className="hw-btn hw-btn-primary" onClick={handleConfirmExport}>导出 ({exportDates.size}天, {selectedStudents.size}人)</button>
            </div>
          </div>
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

      {/* ── Admin PIN Gate ── */}
      {showPinGate && (
        <div className="hw-overlay" onClick={() => setShowPinGate(false)}>
          <div className="hw-modal" onClick={(e) => e.stopPropagation()}>
            <h3>需要 PIN 验证</h3>
            <p className="hw-pin-hint">请输入 PIN 以解锁编辑权限</p>
            <input
              type="password"
              className="hw-modal-input"
              placeholder="输入 PIN"
              value={hwPinInput}
              onChange={(e) => {
                setHwPinInput(e.target.value);
                setHwPinError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleHwPinSubmit()}
              autoFocus
            />
            {hwPinError && <div className="hw-pin-error-msg">{hwPinError}</div>}
            <div className="hw-modal-btns">
              <button className="hw-btn" onClick={() => setShowPinGate(false)}>取消</button>
              <button className="hw-btn hw-btn-primary" onClick={handleHwPinSubmit}>确认</button>
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

// ── Multi-day image export ──
function renderMultiDayImage(className: string, dates: string[], students: string[], allData: Record<string, HomeworkDayData>) {
  const colW = 72;
  const rowH = 24;
  const numW = 32;
  const nameW = 64;
  const padX = 8;
  const padY = 6;
  const titleH = 24;
  const dayGap = 20;

  let totalH = padY;

  const sections: { date: string; dayData: HomeworkDayData; yStart: number; yEnd: number }[] = [];

  for (const date of dates) {
    const dayData = allData[date];
    if (!dayData || dayData.tasks.length === 0) continue;
    const tasks = dayData.tasks;
    const contentLines = dayData.todayTaskContent ? dayData.todayTaskContent.split('\n').length : 0;
    const contentH = dayData.todayTaskContent ? (14 + contentLines * 12) : 0;
    const h = titleH + 26 + students.length * rowH + contentH;
    sections.push({ date, dayData, yStart: totalH, yEnd: totalH + h });
    totalH += h + dayGap;
  }

  if (sections.length === 0) return;

  const maxTasks = Math.max(...sections.map((s) => s.dayData.tasks.length));
  const tableW = numW + nameW + maxTasks * colW + padX * 2;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = Math.max(tableW, 300) * scale;
  canvas.height = (totalH + padY) * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, tableW, totalH + padY);

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

  for (const section of sections) {
    const { date, dayData, yStart } = section;
    const tasks = dayData.tasks;

    // Date title
    ctx.fillStyle = '#f9fafb';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${className} · ${date} 作业统计`, tableW / 2, yStart + titleH - 6);

    // Header row
    const headerY = yStart + titleH;
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
    ctx.font = '11px system-ui, sans-serif';
    for (let si = 0; si < students.length; si++) {
      const y = headerY + 26 + si * rowH;
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

    // Content at bottom
    if (dayData.todayTaskContent) {
      const contentY = headerY + 26 + students.length * rowH + 10;
      ctx.fillStyle = '#d1d5db';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('作业内容:', padX, contentY);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '9px system-ui, sans-serif';
      const lines = dayData.todayTaskContent.split('\n');
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], padX, contentY + 14 + li * 12);
      }
    }
  }

  const exportLabel = dates.length === 1 ? dates[0] : `${dates[0]}-${dates[dates.length - 1]}`;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `作业统计-${className}-${exportLabel}.png`;
    a.click();
    URL.revokeObjectURL(url);
   }, 'image/png');
}

// ── Missing list export (grouped by student, lists dates + unsubmitted tasks) ──
function renderMissingListImage(className: string, dates: string[], students: string[], allData: Record<string, HomeworkDayData>) {
  const padX = 12;
  const padY = 8;
  const titleH = 24;
  const nameRowH = 22;
  const dateRowH = 18;
  const indentX = 24;
  const dateW = 50;
  const totalW = Math.max(300, dateW + 260 + padX * 2 + indentX);
  const contentW = totalW - padX * 2;
  const studentGap = 6;

  const sortedDates = [...dates].sort();

  const entries: { name: string; items: { date: string; missing: string }[] }[] = [];

  for (const name of students) {
    const items: { date: string; missing: string }[] = [];
    for (const date of sortedDates) {
      const dayData = allData[date];
      if (!dayData || dayData.tasks.length === 0) continue;
      const si = students.indexOf(name);
      const missingTasks: string[] = [];
      for (const task of dayData.tasks) {
        const status = (dayData.taskStatuses[task.id] || {})[si] || 'not-submitted';
        if (status === 'not-submitted') missingTasks.push(task.name);
      }
      if (missingTasks.length > 0) {
        items.push({ date, missing: missingTasks.join('、') });
      }
    }
    if (items.length > 0) {
      entries.push({ name, items });
    }
  }

  if (entries.length === 0) return;

  let totalH = padY + titleH + padY;
  for (const entry of entries) {
    totalH += nameRowH + entry.items.length * dateRowH + studentGap;
  }
  totalH += padY;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = totalW * scale;
  canvas.height = totalH * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, totalW, totalH);

  const exportLabel = sortedDates.length === 1 ? sortedDates[0] : `${sortedDates[0]}-${sortedDates[sortedDates.length - 1]}`;

  ctx.fillStyle = '#f9fafb';
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${className} · ${exportLabel} 未交作业统计`, totalW / 2, padY + titleH - 6);

  let cy = padY + titleH + padY;

  for (let ei = 0; ei < entries.length; ei++) {
    const { name, items } = entries[ei];

    ctx.fillStyle = '#1f2937';
    ctx.fillRect(padX, cy, contentW, nameRowH);

    ctx.fillStyle = '#f9fafb';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(name, padX + 8, cy + 15);

    cy += nameRowH;

    for (let di = 0; di < items.length; di++) {
      const { date, missing } = items[di];
      const d = new Date(date + 'T00:00:00');
      const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
      const bg = di % 2 === 0 ? '#1a1a2e' : '#16213e';

      ctx.fillStyle = bg;
      ctx.fillRect(padX, cy, contentW, dateRowH);

      ctx.fillStyle = '#9ca3af';
      ctx.font = '9px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(dateLabel, padX + indentX, cy + 13);

      ctx.fillStyle = '#fca5a5';
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(missing, padX + indentX + dateW, cy + 13);

      cy += dateRowH;
    }

    cy += studentGap;
  }

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `未交统计-${className}-${exportLabel}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
