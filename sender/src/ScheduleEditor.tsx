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
  const [saving, setSaving] = useState(false);

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

  const handleConfigSave = () => {
    const times = generateTimes(cfgPeriods, cfgDuration, cfgFirstStart);
    const pc: PeriodConfig = {
      periodsPerDay: cfgPeriods,
      periodDuration: cfgDuration,
      firstStart: cfgFirstStart,
      periodTimes: times,
    };
    setPeriodConfig(pc);
    setStep('grid');
    // Save to server
    fetch('/api/schedule/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodConfig: pc, sudo: sudoPassword }),
    }).catch(() => {});
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

  const handlePasteClick = (day: string, periodIdx: number) => {
    if (!pasteSlot) {
      const arr = classSchedule[day as keyof ClassSchedule] as (string | null)[];
      const name = arr[periodIdx] || '';
      if (name) setPasteSlot(name);
    } else {
      handleCourseChange(day, periodIdx, pasteSlot);
      setPasteSlot(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (periodConfig) {
        await fetch('/api/schedule/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ periodConfig, sudo: sudoPassword }),
        });
      }
      await fetch('/api/schedule/class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class: classId, schedule: classSchedule, sudo: sudoPassword }),
      });
    } catch {}
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
            <button className="sch-save-btn" onClick={handleConfigSave}>确认配置</button>
          </div>
        )}

        {step === 'grid' && periodConfig && (
          <div className="sch-grid-wrap">
            {pasteSlot && (
              <div className="sch-paste-banner">
                粘贴模式: <strong>{pasteSlot}</strong>
                <button onClick={() => setPasteSlot(null)}>取消</button>
              </div>
            )}
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
                      const isPasteTarget = !!pasteSlot;
                      return (
                        <td
                          key={d}
                          className={`sch-cell ${name ? 'filled' : ''} ${isPasteTarget ? 'paste-target' : ''}`}
                          onClick={() => handlePasteClick(d, i)}
                        >
                          {isPasteTarget ? (
                            <span className="sch-cell-hint">粘贴</span>
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
