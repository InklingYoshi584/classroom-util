import { useState, useEffect, useCallback, useRef } from 'react';
import { createMqttClient, MqttClientHandle, MqttStatus, CallMessage } from './lib/mqtt';
import { buildCustomMessage, renderTemplate } from './lib/template';
import { loadClassId, saveClassId, loadStudents, saveStudents, loadSavedTemplates, saveSavedTemplates } from './lib/store';
import { getPinStatus, verifyPin, setPin, removePin, listPins } from './lib/pin';
import { parseStudentCsv } from './lib/csv';
import { searchStudents, toPinyin } from './lib/pinyin-search';
import { HomeworkTracker } from './HomeworkTracker';
import './SenderPage.css';

export function SenderPage() {
  const initialClassId = loadClassId();
  const [classId, setClassId] = useState(initialClassId);
  const [connectedClass, setConnectedClass] = useState(initialClassId);
  const [students, setStudents] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [status, setStatus] = useState<MqttStatus>('disconnected');
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [history, setHistory] = useState<{ name: string; time: string }[]>([]);
  const [pinSet, setPinSet] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [sudoAuthed, setSudoAuthed] = useState(false);
  const [sudoPassword, setSudoPassword] = useState('');
  const [sudoNewPin, setSudoNewPin] = useState('');
  const [sudoError, setSudoError] = useState('');
  const [pinList, setPinList] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'custom' | 'homework'>('custom');
  const [customText, setCustomText] = useState('');
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminPinError, setAdminPinError] = useState('');
  const [hwReloadTrigger, setHwReloadTrigger] = useState(0);
  const [senderNickname, setSenderNickname] = useState(() => localStorage.getItem('classroom-sender-nickname') || '');
  const [scheduleText, setScheduleText] = useState('');
  const [showConnectOverlay, setShowConnectOverlay] = useState(true);

  // ── New state for custom message flow ──
  const [savedTemplates, setSavedTemplates] = useState<string[]>(() => loadSavedTemplates());
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [studentPickerMode, setStudentPickerMode] = useState<'insert' | 'send'>('insert');
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [showTemplateConfirm, setShowTemplateConfirm] = useState(false);

  const scheduleFileRef = useRef<HTMLInputElement>(null);
  const mqttRef = useRef<MqttClientHandle | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const mqtt = createMqttClient();
    mqttRef.current = mqtt;
    mqtt.onStatusChange(setStatus);

    mqtt.onMessage((msg) => {
      if (msg.type === 'hw-sync') {
        setHwReloadTrigger((n) => n + 1);
      }
      if (msg.type === 'call-sender' && msg.targetClientId === mqttRef.current?.clientId) {
        const text = `${msg.nickname || msg.classId || '接收端'} 呼叫了你`;
        setToast({ msg: text });
        for (let i = 0; i < 3; i++) {
          setTimeout(() => {
            try {
              const u = new SpeechSynthesisUtterance(text);
              u.lang = 'zh-CN';
              speechSynthesis.speak(u);
            } catch {}
          }, i * 1500);
        }
      }
    });

    if (classId) {
      mqtt.connect(classId);
      setConnectedClass(classId);
      loadStudents(classId).then(setStudents);
    }

    return () => {
      mqtt.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getPinStatus().then((r) => setPinSet(r === 'set'));
  }, []);

  useEffect(() => {
    if (connectedClass || status === 'connected') setShowConnectOverlay(false);
  }, [connectedClass, status]);

  const handleConnect = useCallback(() => {
    const trimmed = classId.trim();
    if (!trimmed) return;
    saveClassId(trimmed);
    setConnectedClass(trimmed);
    setStudents([]);
    loadStudents(trimmed).then(setStudents);
    mqttRef.current?.connect(trimmed);
  }, [classId]);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    const updated = [...students, name];
    setStudents(updated);
    saveStudents(connectedClass, updated);
    setNewName('');
  };

  const handleEditStart = (idx: number) => {
    setEditingIdx(idx);
    setEditingName(students[idx]);
  };

  const handleEditSave = (idx: number) => {
    const name = editingName.trim();
    if (!name) {
      setEditingIdx(null);
      return;
    }
    const updated = [...students];
    updated[idx] = name;
    setStudents(updated);
    saveStudents(connectedClass, updated);
    setEditingIdx(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') handleEditSave(idx);
    if (e.key === 'Escape') setEditingIdx(null);
  };

  const handleDelete = (idx: number) => {
    const updated = students.filter((_, i) => i !== idx);
    setStudents(updated);
    saveStudents(connectedClass, updated);
  };

  const handleCsvImport = () => {
    const file = csvInputRef.current?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const names = parseStudentCsv(reader.result as string);
      if (names.length === 0) {
        setToast({ msg: 'CSV 文件中未找到学生姓名', error: true });
        return;
      }
      const updated = [...students, ...names];
      setStudents(updated);
      saveStudents(connectedClass, updated);
      setToast({ msg: `已导入 ${names.length} 名学生` });
    };
    reader.onerror = () => {
      setToast({ msg: 'CSV 文件读取失败', error: true });
    };
    reader.readAsText(file);
    csvInputRef.current.value = '';
  };

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleClassKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConnect();
  };

  // ── Custom message send flow ──
  const handleSendClick = () => {
    const text = customText.trim();
    if (!text || !isConnected) return;
    if (text.includes('{name}')) {
      setPendingTemplate(text);
      setStudentPickerMode('send');
      setStudentSearchQuery('');
      setShowStudentPicker(true);
    } else {
      setPinInput('');
      setPinError('');
      setShowTemplateConfirm(true);
    }
  };

  const handleTemplateClick = (template: string) => {
    if (template.includes('{name}')) {
      setPendingTemplate(template);
      setStudentPickerMode('send');
      setStudentSearchQuery('');
      setShowStudentPicker(true);
    } else {
      setCustomText(template);
    }
  };

  const handleInsertStudentName = () => {
    setStudentPickerMode('insert');
    setStudentSearchQuery('');
    setShowStudentPicker(true);
  };

  const handleStudentPickerSelect = (name: string) => {
    if (studentPickerMode === 'insert') {
      const ta = textareaRef.current;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = customText.slice(0, start);
        const after = customText.slice(end);
        const newText = before + '{name}' + after;
        setCustomText(newText);
        // Restore cursor after the inserted text
        requestAnimationFrame(() => {
          ta.focus();
          ta.selectionStart = ta.selectionEnd = start + '{name}'.length;
        });
      } else {
        setCustomText(customText + '{name}');
      }
      setShowStudentPicker(false);
      setStudentSearchQuery('');
    } else {
      // mode === 'send'
      const rendered = renderTemplate(pendingTemplate || '', { name });
      setCustomText(rendered);
      setShowStudentPicker(false);
      setStudentSearchQuery('');
      setPendingTemplate(null);
      // Auto-open confirm
      setPinInput('');
      setPinError('');
      setShowTemplateConfirm(true);
    }
  };

  const handleConfirmSendCustom = async () => {
    const text = customText.trim();
    if (!text) return;
    if (pinSet) {
      const ok = await verifyPin('', pinInput);
      if (ok !== 'ok') {
        setPinError('PIN 错误');
        return;
      }
    }
    const raw = buildCustomMessage(text, mqttRef.current?.clientId || undefined, senderNickname || undefined);
    const msg: CallMessage = JSON.parse(raw);
    const ok = mqttRef.current?.publish(msg);
    if (ok) {
      setToast({ msg: '已发送' });
      setHistory((h) => [{ name: msg.message, time: msg.time }, ...h].slice(0, 20));
    } else {
      setToast({ msg: '发送失败', error: true });
    }
    setShowTemplateConfirm(false);
    setCustomText('');
    setPinInput('');
    setPinError('');
  };

  const handleCancelTemplateConfirm = () => {
    setShowTemplateConfirm(false);
    setPinInput('');
    setPinError('');
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && customText.trim()) {
      e.preventDefault();
      handleSendClick();
    }
  };

  const handleSaveTemplate = () => {
    const text = customText.trim();
    if (!text) return;
    const next = [...savedTemplates, text];
    setSavedTemplates(next);
    saveSavedTemplates(next);
    setToast({ msg: '已保存模板' });
  };

  const handleDeleteTemplate = (idx: number) => {
    const next = savedTemplates.filter((_, i) => i !== idx);
    setSavedTemplates(next);
    saveSavedTemplates(next);
  };

  // ── Sudo flow ──
  const refreshPinInfo = async () => {
    setPinSet((await getPinStatus()) === 'set');
    if (sudoAuthed) {
      setPinList(await listPins(sudoPassword));
    }
  };

  const handleSudoVerify = async () => {
    try {
      const res = await fetch('/api/sudo/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sudo: sudoPassword }),
      });
      const data = await res.json();
      if (data.ok) {
        setSudoAuthed(true);
        setAdminAuthed(true);
        setSudoError('');
        const list = await listPins(sudoPassword);
        setPinList(list);
        setPinSet(list.length > 0);

        const scheduleRes = await fetch(`/api/schedule`);
        const scheduleData = await scheduleRes.json();
        if (scheduleData.schedule && scheduleData.schedule.length > 0) {
          setScheduleText(scheduleData.schedule.map((s: { start: string; end: string }) => `${s.start}-${s.end}`).join('\n'));
        } else {
          setScheduleText('');
        }
      } else {
        setSudoError('Sudo 密码错误');
      }
    } catch {
      setSudoError('网络错误');
    }
  };

  const handleAddPin = async () => {
    if (!sudoNewPin.trim()) return;
    const result = await setPin(sudoPassword, sudoNewPin.trim());
    if (result.ok) {
      setSudoNewPin('');
      setSudoError('');
      await refreshPinInfo();
    } else {
      setSudoError(result.error || '添加失败');
    }
  };

  const handleDeletePin = async (pin: string) => {
    const result = await removePin(sudoPassword, pin);
    if (result.ok) {
      setSudoError('');
      await refreshPinInfo();
    } else {
      setSudoError(result.error || '删除失败');
    }
  };

  const handleSudoLogout = () => {
    setSudoAuthed(false);
    setSudoPassword('');
    setSudoNewPin('');
    setSudoError('');
    setPinList([]);
    refreshPinInfo();
  };

  const handleAdminVerify = async () => {
    const ok = await verifyPin('', adminPin);
    if (ok === 'ok') {
      setAdminAuthed(true);
      setAdminPin('');
      setAdminPinError('');
    } else {
      setAdminPinError('PIN 错误');
    }
  };

  const handleAdminLogout = () => {
    setAdminAuthed(false);
    setAdminPin('');
    setAdminPinError('');
  };

  const isAdmin = adminAuthed || sudoAuthed;

  const statusLabel: Record<MqttStatus, string> = {
    disconnected: '未连接',
    connecting: '连接中...',
    connected: '已连接',
    error: '连接错误',
  };

  const isConnected = status === 'connected';
  const classIdTrimmed = classId.trim();

  const filteredStudents = studentSearchQuery.trim()
    ? searchStudents(studentSearchQuery, students)
    : students;

  return (
    <div className="sender-page">
      <div className="sender-header">
        <h1>Classroom Caller · 发送端</h1>
        <div className="sender-actions">
          <button className="help-btn" onClick={() => setShowHelp(true)} title="帮助" aria-label="帮助">?</button>
          <button className="settings-gear-btn" onClick={() => { setAdminPin(''); setAdminPinError(''); setShowSettings(!showSettings); }} title="设置" aria-label="设置">
            &#9881;
          </button>
        </div>
      </div>

      <div className={`connection-bar ${status}`}>
        <span className="status-dot" />
        <span>{statusLabel[status]}</span>
      </div>

      {showSettings && (
        <div className="overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-dialog" onClick={(e) => e.stopPropagation()}>
          <div className="settings-panel-header">
            <h3>设置</h3>
            <button className="close-btn" onClick={() => setShowSettings(false)}>&#10005;</button>
          </div>

          <div className="settings-section">
            <h4>班级连接</h4>
            <label className="config-label">
              班级 ID
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input
                  type="text"
                  className="msg-template-input"
                  placeholder="输入班级 ID (如 math-1)"
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                  style={{ flex: 1 }}
                />
                <button
                  className="msg-unlock-btn"
                  onClick={handleConnect}
                  disabled={!classIdTrimmed || status === 'connecting'}
                >
                  {status === 'connecting' ? '...' : '连接'}
                </button>
              </div>
            </label>
          </div>

          {/* ── Student management (admin only) ── */}
          {isAdmin && (
            <div className="settings-section student-mgmt-section">
              <h4>学生管理</h4>
              <div className="add-student">
                <input
                  type="text"
                  placeholder="新增学生姓名"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={handleAddKeyDown}
                />
                <button onClick={handleAdd} disabled={!newName.trim()}>
                  + 添加
                </button>
                <button className="csv-import-btn" onClick={() => csvInputRef.current?.click()} title="CSV 导入">
                  CSV
                </button>
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,.txt"
                  style={{ display: 'none' }}
                  onChange={handleCsvImport}
                />
              </div>
              {students.length === 0 ? (
                <div className="student-list-empty">暂无学生，使用上方输入框或 CSV 导入添加</div>
              ) : (
                <div className="student-list">
                  {students.map((name, idx) => (
                    <div key={`${idx}-${name}`} className="student-card-settings">
                      <span className="index">{idx + 1}</span>
                      {editingIdx === idx ? (
                        <input
                          className="name-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => handleEditSave(idx)}
                          onKeyDown={(e) => handleEditKeyDown(e, idx)}
                          autoFocus
                        />
                      ) : (
                        <span className="name">{name}</span>
                      )}
                      <div className="actions">
                        <button
                          className="edit-btn"
                          title="编辑"
                          onClick={() => handleEditStart(idx)}
                        >
                          &#9998;
                        </button>
                        <button
                          className="delete-btn"
                          title="删除"
                          onClick={() => handleDelete(idx)}
                        >
                          &#10005;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pin-status-row">
            <span>PIN 数量:</span>
            <span className={pinSet ? 'pin-active' : 'pin-inactive'}>
              {pinList.length} 个
            </span>
          </div>

          {!sudoAuthed && (
            <div className="admin-section">
              {adminAuthed ? (
                <div className="sudo-authed-header">
                  <span className="sudo-authed-badge" style={{ background: 'var(--primary)' }}>Admin</span>
                  <button className="logout-btn" onClick={handleAdminLogout}>退出</button>
                </div>
              ) : (
                <>
                  <div className="msg-template-unlock-row">
                    <input
                      type="password"
                      className="msg-pin-input"
                      placeholder="输入 PIN 以进入 Admin 模式"
                      value={adminPin}
                      onChange={(e) => {
                        setAdminPin(e.target.value);
                        setAdminPinError('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdminVerify()}
                    />
                    <button className="msg-unlock-btn" onClick={handleAdminVerify}>
                      验证
                    </button>
                  </div>
                  {adminPinError && <div className="msg-pin-error">{adminPinError}</div>}
                </>
              )}
            </div>
          )}

          {!sudoAuthed ? (
            <div className="sudo-section">
              <label>Sudo 密码</label>
              <input
                type="password"
                placeholder="输入 Sudo 密码"
                value={sudoPassword}
                onChange={(e) => {
                  setSudoPassword(e.target.value);
                  setSudoError('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSudoVerify()}
              />
              {sudoError && <div className="sudo-error">{sudoError}</div>}
              <button className="sudo-btn" onClick={handleSudoVerify}>
                验证
              </button>
            </div>
          ) : (
            <div className="sudo-authed-section">
              <div className="sudo-authed-header">
                <span className="sudo-authed-badge">Sudo</span>
                <button className="logout-btn" onClick={handleSudoLogout}>
                  退出
                </button>
              </div>

              <div className="add-pin-row">
                <input
                  type="password"
                  placeholder="输入新 PIN"
                  value={sudoNewPin}
                  onChange={(e) => setSudoNewPin(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddPin()}
                />
                <button onClick={handleAddPin} disabled={!sudoNewPin.trim()}>
                  + 添加
                </button>
              </div>
              {sudoError && <div className="sudo-error">{sudoError}</div>}

              <div className="pin-list-label">已有 PIN</div>
              {pinList.length === 0 ? (
                <div className="pin-list-empty">暂无 PIN，验证 Sudo 密码后可添加</div>
              ) : (
                <div className="pin-list">
                  {pinList.map((pin) => (
                    <div key={pin} className="pin-list-item">
                      <span className="pin-value">{pin}</span>
                      <button
                        className="delete-pin-btn"
                        onClick={() => handleDeletePin(pin)}
                      >
                        &#10005;
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="msg-template-label" style={{ marginTop: 8 }}>课堂时间表</div>
              <div className="schedule-import-row">
                <textarea
                  className="schedule-textarea"
                  rows={3}
                  placeholder={`格式: 每行一个时间段\n10:10-10:50\n13:30-15:00`}
                  value={scheduleText}
                  onChange={(e) => setScheduleText(e.target.value)}
                />
                <div className="schedule-import-actions">
                  <input
                    ref={scheduleFileRef}
                    type="file"
                    accept=".txt"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        setScheduleText(reader.result as string);
                        setToast({ msg: '已导入课表文件' });
                      };
                      reader.readAsText(file);
                      e.target.value = '';
                    }}
                  />
                  <button className="csv-import-btn" onClick={() => scheduleFileRef.current?.click()}>
                    导入文件
                  </button>
                  <button className="schedule-save-btn" onClick={async () => {
                    const lines = scheduleText.split('\n')
                      .map((l) => l.trim())
                      .filter((l) => l.length > 0);
                    const schedule: { start: string; end: string }[] = [];
                    const timeRe = /^\d{1,2}:\d{2}$/;
                    for (const line of lines) {
                      const parts = line.replace(/\s/g, '').replace(/[–—]/g, '-').split('-');
                      const zeroPad = (s: string) => s.padStart(5, '0');
                      if (parts.length === 2 && timeRe.test(parts[0]) && timeRe.test(parts[1])) {
                        schedule.push({ start: zeroPad(parts[0]), end: zeroPad(parts[1]) });
                      }
                    }
                    if (schedule.length === 0 && lines.length > 0) {
                      setToast({ msg: '格式错误，请使用 HH:MM-HH:MM 每行一个', error: true });
                      return;
                    }
                    try {
                      const r = await fetch('/api/schedule/set', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ schedule, sudo: sudoPassword }),
                      });
                      const d = await r.json();
                      if (d.ok) {
                        setToast({ msg: schedule.length === 0 ? '已清空课表' : `已保存 ${schedule.length} 个时间段` });
                      } else {
                        setToast({ msg: d.error || '保存失败', error: true });
                      }
                    } catch {
                      setToast({ msg: '网络错误', error: true });
                    }
                  }}>
                    保存课表
                  </button>
                  {scheduleText.trim() && (
                    <button className="schedule-clear-btn" onClick={() => setScheduleText('')}>清空</button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="msg-template-label">发送者昵称</div>
          <input
            type="text"
            className="msg-template-input"
            placeholder="如: 王老师"
            value={senderNickname}
            onChange={(e) => {
              setSenderNickname(e.target.value);
              localStorage.setItem('classroom-sender-nickname', e.target.value);
            }}
          />
          <span className="msg-template-hint">接收端可以看到此昵称</span>
        </div>
        </div>
      )}

      {showHelp && (
        <div className="overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-header">
              <h2>使用帮助</h2>
              <button className="close-btn" onClick={() => setShowHelp(false)}>&#10005;</button>
            </div>

            <div className="help-section">
              <h3>📝 自定义消息</h3>
              <p>输入任意文字发送到接收端。支持插入学生姓名占位符 <code>{'{name}'}</code>，发送时会自动替换为选中的学生姓名。</p>
            </div>

            <div className="help-section">
              <h3>💾 消息模板</h3>
              <p>将常用消息保存为模板，后续可一键复用。含 <code>{'{name}'}</code> 的模板点击后需要先选择学生。</p>
            </div>

            <div className="help-section">
              <h3>🔒 管理设置（设置 → Admin / Sudo）</h3>
              <p>点击⚙设置进入管理面板。Admin 模式可管理学生名单；Sudo 模式可管理 PIN 码和课表。</p>
            </div>

            <div className="help-section">
              <h3>📚 作业追踪</h3>
              <p>在"作业"标签页管理每日任务。点击单元格切换未交/已交/请假状态。支持导出图片和 Excel。</p>
            </div>

            <div className="help-section">
              <h3>👤 发送者昵称</h3>
              <p>设置昵称后，接收端的呼叫记录里会显示是谁发送的。</p>
            </div>

            <div className="help-section">
              <h3>🕐 上课时间表</h3>
              <p>Sudo 模式下可以设置课表。上课时段呼叫自动弹窗显示（5秒后消失），下课期间正常播放语音。</p>
            </div>

            <div className="help-section">
              <h3>📋 接收端操作</h3>
              <p>接收端也要输入同样的班级 ID 来订阅频道。首次使用需要先点"启用语音"解锁语音播报。</p>
            </div>

            <div className="help-section">
              <h3>💡 小提示</h3>
              <ul>
                <li>发送端页面由服务器托管，其他设备浏览器直接访问 <code>http://服务器IP:8787</code></li>
                <li>PIN 码默认不需要，首次设置后才会启用</li>
                <li>学生姓名支持中文、拼音全拼、拼音首字母搜索</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {showConnectOverlay && (
        <div className="overlay" onClick={() => setShowConnectOverlay(false)}>
          <div className="connect-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>连接班级</h3>
            <p>请输入班级 ID 以开始发送呼叫</p>
            <div className="connect-dialog-fields">
              <input
                type="text"
                placeholder="班级 ID (如 math-1)"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && classIdTrimmed && handleConnect()}
              />
            </div>
            <button
              className="config-reconnect-btn"
              onClick={handleConnect}
              disabled={!classIdTrimmed || status === 'connecting'}
            >
              {status === 'connecting' ? '连接中...' : '连接班级'}
            </button>
            <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <button
                onClick={() => setShowConnectOverlay(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}
              >
                稍后设置
              </button>
            </div>
          </div>
        </div>
      )}

      {connectedClass && (
        <>
          <div className="tab-bar">
            <button
              className={`tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
              onClick={() => setActiveTab('custom')}
            >
              自定义消息
            </button>
            <button
              className={`tab-btn ${activeTab === 'homework' ? 'active' : ''}`}
              onClick={() => setActiveTab('homework')}
            >
              作业
            </button>
          </div>

          {activeTab === 'homework' ? (
            <HomeworkTracker
              classId={connectedClass}
              serverHost=""
              reloadTrigger={hwReloadTrigger}
              onDataSaved={() => {
                mqttRef.current?.publish({ type: 'hw-sync', classId: connectedClass, timestamp: Date.now() });
              }}
            />
          ) : (
            <div className="custom-message-section">
              <textarea
                ref={textareaRef}
                className="custom-textarea"
                placeholder="输入自定义消息内容... (使用 {name} 代表学生姓名)"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={handleCustomKeyDown}
                rows={4}
              />
              <div className="custom-msg-buttons">
                <button
                  className="insert-student-btn"
                  onClick={handleInsertStudentName}
                  disabled={!isConnected}
                >
                  &#128101; 插入学生姓名
                </button>
                <button
                  className="save-template-btn"
                  onClick={handleSaveTemplate}
                  disabled={!customText.trim()}
                >
                  &#128190; 保存模板
                </button>
              </div>
              {savedTemplates.length > 0 && (
                <div className="template-list">
                  {savedTemplates.map((t, i) => (
                    <div key={i} className="template-list-item">
                      <span className="template-list-item-text" onClick={() => handleTemplateClick(t)}>
                        {t}
                      </span>
                      <button
                        className="template-list-item-del"
                        onClick={() => handleDeleteTemplate(i)}
                      >
                        &#10005;
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                className="custom-send-btn"
                onClick={handleSendClick}
                disabled={!customText.trim() || !isConnected}
              >
                {isConnected ? '发送消息' : '未连接'}
              </button>
            </div>
          )}
        </>
      )}

      {history.length > 0 && (
        <div className="sender-history">
          <h3>发送记录</h3>
          {history.map((h, i) => (
            <div key={i} className="history-item">
              <span className="check">&#10003;</span>
              <span>{h.name}</span>
              <span className="time">{h.time}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Student picker overlay ── */}
      {showStudentPicker && (
        <div className="overlay" onClick={() => { setShowStudentPicker(false); setStudentSearchQuery(''); }}>
          <div className="student-picker" onClick={(e) => e.stopPropagation()}>
            <div className="student-picker-header">
              <h3>选择学生</h3>
              <button className="close-btn" onClick={() => { setShowStudentPicker(false); setStudentSearchQuery(''); }}>&#10005;</button>
            </div>
            <input
              type="text"
              className="student-picker-search"
              placeholder="搜索姓名 / 拼音..."
              value={studentSearchQuery}
              onChange={(e) => setStudentSearchQuery(e.target.value)}
              autoFocus
            />
            <div className="student-picker-list">
              {filteredStudents.length === 0 ? (
                <div className="student-list-empty">
                  {students.length === 0 ? '暂无学生，请先在设置中添加' : '无匹配学生'}
                </div>
              ) : (
                filteredStudents.map((name) => (
                  <div
                    key={name}
                    className="student-picker-item"
                    onClick={() => handleStudentPickerSelect(name)}
                  >
                    <span className="student-picker-name">{name}</span>
                    <span className="student-picker-pinyin">{toPinyin(name)}</span>
                  </div>
                ))
              )}
            </div>
            <div className="student-picker-footer">
              <button
                className="cancel-btn"
                onClick={() => { setShowStudentPicker(false); setStudentSearchQuery(''); }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send confirmation overlay ── */}
      {showTemplateConfirm && (
        <div className="overlay" onClick={handleCancelTemplateConfirm}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>确认发送</h2>
            <div className="preview-text">{customText}</div>
            {pinSet && (
              <div className="pin-row">
                <input
                  type="password"
                  className="pin-input"
                  placeholder="输入 PIN"
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    setPinError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfirmSendCustom()}
                  autoFocus
                />
                {pinError && <div className="pin-error">{pinError}</div>}
              </div>
            )}
            <div className="buttons">
              <button className="cancel-btn" onClick={handleCancelTemplateConfirm}>
                取消
              </button>
              <button
                className="confirm-btn"
                onClick={handleConfirmSendCustom}
                disabled={!isConnected}
              >
                {isConnected ? '确认发送' : '未连接'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`send-toast ${toast.error ? 'error' : ''}`}
          onAnimationEnd={() => setToast(null)}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
