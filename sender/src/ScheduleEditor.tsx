import { useState, useEffect } from 'react';
import { getPinStatus, verifyPin } from './lib/pin';
import './ScheduleEditor.css';

interface PeriodConfig {
  periodsPerDay: number;
  periodDuration: number;
  firstStart: string;
  periodTimes: { start: string; end: string }[];
}

interface ClassSchedule {
  mon: (string | null)[];
  tue: (string | null)[];
  wed: (string | null)[];
  thu: (string | null)[];
  fri: (string | null)[];
}

interface Props {
  classId: string;
  sudoPassword: string;
  onClose: () => void;
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
const DAY_LABELS: Record<string, string> = { mon: '一', tue: '二', wed: '三', thu: '四', fri: '五' };

function padTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function addMinutes(t: string, mins: number) {
  const [h, m] = t.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

export function ScheduleEditor({ classId, sudoPassword, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<'pin' | 'config' | 'grid'>('config');
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [periodConfig, setPeriodConfig] = useState<PeriodConfig | null>(null);
  const [classSchedule, setClassSchedule] = useState<ClassSchedule>(() => ({
    mon: [], tue: [], wed: [], thu: [], fri: [],
  }));
  const [pasteSlot, setPasteSlot] = useState<string | null>(null);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [clipMode, setClipMode] = useState<'copy' | 'paste' | 'swap' | null>(null);
  const [swapSource, setSwapSource] = useState<{ day: string; periodIdx: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [localSudo, setLocalSudo] = useState(sudoPassword);

  // Config step fields
  const [cfgPeriods, setCfgPeriods] = useState(8);
  const [cfgDuration, setCfgDuration] = useState(45);
  const [cfgFirstStart, setCfgFirstStart] = useState('08:00');

  useEffect(() => {
    fetch('/api/schedule/config')
      .then(r => r.json())
      .then(async d => {
        if (d.periodConfig) {
          setPeriodConfig(d.periodConfig);
          const sc = d.classSchedules?.[classId];
          if (sc) setClassSchedule(sc);
          setStep('grid');
        } else {
          // No config — check if PIN required
          const ps = await getPinStatus();
          if (ps === 'set') {
            setStep('pin');
          } else {
            setStep('config');
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [classId]);

  const generateTimes = (periods: number, duration: number, firstStart: string) => {
    const times: { start: string; end: string }[] = [];
    let current = firstStart;
    for (let i = 0; i < periods; i++) {
      const end = addMinutes(current, duration);
      times.push({ start: current, end });
      current = end;
    }
    return times;
  };

  const handleConfigSave = async () => {
    setSaveError('');
    const times = generateTimes(cfgPeriods, cfgDuration, cfgFirstStart);
    const pc: PeriodConfig = {
      periodsPerDay: cfgPeriods,
      periodDuration: cfgDuration,
      firstStart: cfgFirstStart,
      periodTimes: times,
    };
    try {
      const r = await fetch('/api/schedule/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodConfig: pc, sudo: localSudo }),
      });
      const d = await r.json();
      if (!d.ok) { setSaveError(d.error || '权限不足，请在设置中输入 Sudo 密码'); return; }
    } catch {
      setSaveError('网络错误');
      return;
    }
    setPeriodConfig(pc);
    setStep('grid');
  };

  const handlePinSubmit = async () => {
    const result = await verifyPin('', pinInput);
    if (result === 'ok') {
      setStep('config');
      setPinError('');
    } else {
      setPinError('PIN 错误');
    }
  };

  const handleTimeChange = (idx: number, field: 'start' | 'end', value: string) => {
    if (!periodConfig) return;
    const raw = value.replace(/[^\d:]/g, '');
    const times = periodConfig.periodTimes.map((t, i) =>
      i === idx ? { ...t, [field]: raw } : t
    );
    setPeriodConfig({ ...periodConfig, periodTimes: times });
  };

  const handleTimeBlur = (idx: number, field: 'start' | 'end') => {
    if (!periodConfig) return;
    const raw = periodConfig.periodTimes[idx][field];
    // Parse hh:mm or hhmm
    let val = raw.replace(/[^\d]/g, '');
    if (val.length === 3) val = '0' + val;
    if (val.length >= 4) {
      val = val.slice(0, 2) + ':' + val.slice(2, 4);
    } else if (val.length === 2) {
      val = val + ':00';
    } else {
      return;
    }
    const final = padTime(val);
    const times = periodConfig.periodTimes.map((t, i) =>
      i === idx ? { ...t, [field]: final } : t
    );
    if (field === 'start') {
      // Auto-fill end from duration
      times[idx].end = addMinutes(final, periodConfig.periodDuration);
    }
    setPeriodConfig({ ...periodConfig, periodTimes: times });
  };

  const handleCourseChange = (day: string, periodIdx: number, value: string) => {
    setClassSchedule(prev => {
      const arr = [...(prev[day as keyof ClassSchedule] as (string | null)[])];
      while (arr.length <= periodIdx) arr.push(null);
      arr[periodIdx] = value || null;
      return { ...prev, [day]: arr };
    });
  };

  const handleCellClick = (day: string, periodIdx: number) => {
    if (clipMode === 'copy') {
      const arr = classSchedule[day as keyof ClassSchedule] as (string | null)[];
      const name = arr[periodIdx] || '';
      if (name) {
        setPasteSlot(name);
        setCopiedFrom(`${day}-${periodIdx}`);
        setClipMode('paste');
      }
    } else if (clipMode === 'paste' && pasteSlot) {
      handleCourseChange(day, periodIdx, pasteSlot);
    } else if (clipMode === 'swap') {
      if (!swapSource) {
        setSwapSource({ day, periodIdx });
      } else if (swapSource.day !== day || swapSource.periodIdx !== periodIdx) {
        const arr1 = classSchedule[swapSource.day as keyof ClassSchedule] as (string | null)[];
        const arr2 = classSchedule[day as keyof ClassSchedule] as (string | null)[];
        const val1 = arr1[swapSource.periodIdx] || null;
        const val2 = arr2[periodIdx] || null;
        handleCourseChange(swapSource.day, swapSource.periodIdx, val2 || '');
        handleCourseChange(day, periodIdx, val1 || '');
        setSwapSource(null);
      } else {
        setSwapSource(null);
      }
    }
  };

  const handleEnterCopyMode = () => {
    setClipMode('copy');
    setPasteSlot(null);
    setCopiedFrom(null);
  };

  const handleEnterPasteMode = () => {
    if (pasteSlot) setClipMode('paste');
  };

  const handleCancelClipMode = () => {
    setClipMode(null);
    setPasteSlot(null);
    setCopiedFrom(null);
    setSwapSource(null);
  };

  const handleEnterSwapMode = () => {
    setClipMode('swap');
    setSwapSource(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      if (periodConfig) {
        const r1 = await fetch('/api/schedule/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periodConfig, sudo: localSudo }),
        });
        const d1 = await r1.json();
        if (!d1.ok) { setSaveError(d1.error || '权限不足，请在设置中输入 Sudo 密码'); setSaving(false); return; }
      }
      const r2 = await fetch('/api/schedule/class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class: classId, schedule: classSchedule, sudo: localSudo }),
      });
      const d2 = await r2.json();
      if (!d2.ok) { setSaveError(d2.error || '权限不足，请在设置中输入 Sudo 密码'); setSaving(false); return; }
    } catch {
      setSaveError('网络错误');
      setSaving(false);
      return;
    }
    setSaving(false);
    onClose();
  };

  if (loading) {
    return <div className="overlay" onClick={onClose}><div className="sch-editor"><p>加载中...</p></div></div>;
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sch-editor" onClick={e => e.stopPropagation()}>
        <div className="sch-header">
          <h3>课表 — {classId}</h3>
          <button className="close-btn" onClick={onClose}>&#10005;</button>
        </div>

        {step === 'pin' && (
          <div className="sch-config">
            <h4>需要 PIN 验证</h4>
            <p className="sch-pin-hint">请输入 PIN 以配置课表</p>
            <input
              type="password"
              placeholder="输入 PIN"
              value={pinInput}
              onChange={e => { setPinInput(e.target.value); setPinError(''); }}
              onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
              className="sch-pin-input"
              autoFocus
            />
            {pinError && <div className="sch-pin-error">{pinError}</div>}
            <button className="sch-save-btn" onClick={handlePinSubmit}>确认</button>
          </div>
        )}

        {step === 'config' && (
          <div className="sch-config">
            <h4>首次配置</h4>
            <label>每天节数 <input type="number" min={1} max={12} value={cfgPeriods} onChange={e => setCfgPeriods(Number(e.target.value) || 1)} /></label>
            <label>每节课时长(分钟) <input type="number" min={10} max={120} value={cfgDuration} onChange={e => setCfgDuration(Number(e.target.value) || 10)} /></label>
            <label>第一节上课时间 <input type="text" placeholder="08:00" value={cfgFirstStart} onChange={e => setCfgFirstStart(e.target.value)} /></label>
            {!sudoPassword && (
              <label>Sudo 密码 <input type="password" placeholder="输入 Sudo 密码" value={localSudo} onChange={e => setLocalSudo(e.target.value)} /></label>
            )}
            {saveError && <div className="sch-pin-error">{saveError}</div>}
            <button className="sch-save-btn" onClick={handleConfigSave}>确认配置</button>
          </div>
        )}

        {step === 'grid' && periodConfig && (
          <div className="sch-grid-wrap">
            <div className="sch-toolbar">
              {!clipMode && (
                <>
                  <span className="sch-toolbar-hint">点击格子直接编辑课程名</span>
                  <div className="sch-toolbar-btns">
                    <button className="sch-toolbar-btn" onClick={handleEnterCopyMode} title="复制课程名到其他格子">复制</button>
                    <button className="sch-toolbar-btn" onClick={handleEnterSwapMode}>换课</button>
                    {pasteSlot && <button className="sch-toolbar-btn paste" onClick={handleEnterPasteMode}>粘贴已复制的内容</button>}
                  </div>
                </>
              )}
              {clipMode === 'copy' && (
                <>
                  <span className="sch-toolbar-label">复制模式 — 点击已填课程格子进行复制</span>
                  <button className="sch-toolbar-btn cancel" onClick={handleCancelClipMode}>取消</button>
                </>
              )}
              {clipMode === 'paste' && (
                <>
                  <span className="sch-toolbar-label">粘贴模式 — 已复制 <strong>{pasteSlot}</strong>，点击任意格子粘贴</span>
                  <button className="sch-toolbar-btn cancel" onClick={handleCancelClipMode}>取消</button>
                </>
              )}
              {clipMode === 'swap' && (
                <>
                  <span className="sch-toolbar-label">
                    {swapSource ? `已选择课程，点击另一个格子进行互换` : `换课模式 — 点击第一个课程格子`}
                  </span>
                  <button className="sch-toolbar-btn cancel" onClick={handleCancelClipMode}>取消</button>
                </>
              )}
            </div>
            <table className="sch-grid">
              <thead>
                <tr>
                  <th></th>
                  {DAYS.map(d => <th key={d}>星期{DAY_LABELS[d]}</th>)}
                </tr>
              </thead>
              <tbody>
                {periodConfig.periodTimes.map((pt, i) => (
                  <tr key={i}>
                    <td className="sch-time-cell">
                      <input
                        value={pt.start}
                        onChange={e => handleTimeChange(i, 'start', e.target.value)}
                        onBlur={() => handleTimeBlur(i, 'start')}
                        className="sch-time-input"
                      />
                      <span className="sch-time-sep">-</span>
                      <input
                        value={pt.end}
                        onChange={e => handleTimeChange(i, 'end', e.target.value)}
                        onBlur={() => handleTimeBlur(i, 'end')}
                        className="sch-time-input"
                      />
                    </td>
                    {DAYS.map(d => {
                      const arr = (classSchedule[d] as (string | null)[]) || [];
                      const name = arr[i] || '';
                      const isClipTarget = clipMode === 'copy' || (clipMode === 'paste' && !!pasteSlot);
                      const isSwapTarget = clipMode === 'swap';
                      const isSwapSource = isSwapTarget && swapSource?.day === d && swapSource?.periodIdx === i;
                      return (
                        <td
                          key={d}
                          className={`sch-cell ${name ? 'filled' : ''} ${isClipTarget ? 'clip-target' : ''} ${isSwapTarget ? 'swap-target' : ''} ${isSwapSource ? 'swap-source' : ''}`}
                          onClick={() => handleCellClick(d, i)}
                        >
                          {clipMode ? (
                            <span className={`sch-cell-text ${name ? '' : 'empty'}`}>{name || '—'}</span>
                          ) : (
                            <input
                              value={name}
                              onChange={e => handleCourseChange(d, i, e.target.value)}
                              className="sch-cell-input"
                              placeholder=""
                              onClick={e => e.stopPropagation()}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sch-footer">
              {saveError && <span className="sch-pin-error" style={{marginRight:'auto'}}>{saveError}</span>}
              <button className="sch-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存并推送到接收端'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
