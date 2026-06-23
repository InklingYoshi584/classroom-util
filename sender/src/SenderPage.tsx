import { useState, useEffect, useCallback, useRef } from 'react';
import { createMqttClient, MqttClientHandle, MqttStatus, CallMessage } from './lib/mqtt';
import { buildCallMessage, buildCustomMessage, renderTemplate } from './lib/template';
import { loadClassId, saveClassId, loadStudents, saveStudents, loadMessageTemplate, saveMessageTemplate, loadMessageTemplates, saveMessageTemplates, DEFAULT_MSG_TEMPLATE } from './lib/store';
import { getPinStatus, verifyPin, setPin, removePin, listPins } from './lib/pin';
import { parseStudentCsv } from './lib/csv';
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
  const [confirmStudent, setConfirmStudent] = useState<string | null>(null);
  const [status, setStatus] = useState<MqttStatus>('disconnected');
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [history, setHistory] = useState<{ name: string; time: string }[]>([]);
  const [msgTemplate, setMsgTemplate] = useState(() => loadMessageTemplate());
  const [msgTemplates, setMsgTemplates] = useState<string[]>(() => loadMessageTemplates());
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState(0);
  const [editingTemplateIdx, setEditingTemplateIdx] = useState<number | null>(null);
  const [editingTemplateVal, setEditingTemplateVal] = useState('');
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
  const [activeTab, setActiveTab] = useState<'students' | 'custom' | 'homework'>('students');
  const [customText, setCustomText] = useState('');
  const [customConfirmOpen, setCustomConfirmOpen] = useState(false);
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [adminPinError, setAdminPinError] = useState('');
  const [hwReloadTrigger, setHwReloadTrigger] = useState(0);
  const [senderNickname, setSenderNickname] = useState(() => localStorage.getItem('classroom-sender-nickname') || '');
  const [scheduleText, setScheduleText] = useState('');
  const scheduleFileRef = useRef<HTMLInputElement>(null);

  const mqttRef = useRef<MqttClientHandle | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

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

  const handleStudentClick = (name: string) => {
    setConfirmStudent(name);
    setPinInput('');
    setPinError('');
  };

  const handleConfirmSend = async () => {
    if (!confirmStudent) return;
    if (pinSet) {
      const ok = await verifyPin('', pinInput);
      if (ok !== 'ok') {
        setPinError('PIN 错误');
        return;
      }
    }
    const raw = buildCallMessage(confirmStudent, msgTemplates[selectedTemplateIdx] || msgTemplate, mqttRef.current?.clientId || undefined, senderNickname || undefined);
    const msg: CallMessage = JSON.parse(raw);
    const ok = mqttRef.current?.publish(msg);
    if (ok) {
      setToast({ msg: `已发送: ${confirmStudent}` });
      setHistory((h) => [{ name: confirmStudent, time: msg.time }, ...h].slice(0, 20));
    } else {
      setToast({ msg: '发送失败，检查连接状态', error: true });
    }
    setConfirmStudent(null);
    setCustomConfirmOpen(false);
    setPinInput('');
    setPinError('');
  };

  const handleCancelConfirm = () => {
    setConfirmStudent(null);
    setCustomConfirmOpen(false);
    setPinInput('');
    setPinError('');
  };

  const handleCustomConfirm = async () => {
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
      setToast({ msg: '已发送自定义消息' });
      setHistory((h) => [{ name: '自定义', time: msg.time }, ...h].slice(0, 20));
      setCustomText('');
    } else {
      setToast({ msg: '发送失败，检查连接状态', error: true });
    }
    setCustomConfirmOpen(false);
    setPinInput('');
    setPinError('');
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && customText.trim()) {
      e.preventDefault();
      setPinInput('');
      setPinError('');
      setCustomConfirmOpen(true);
    }
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
    // admin stays if independently authed
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
        <div className="settings-panel">
          <div className="settings-panel-header">
            <h3>设置</h3>
            <button className="close-btn" onClick={() => setShowSettings(false)}>&#10005;</button>
          </div>

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

          <div className="msg-template-label">消息模板</div>
          {isAdmin ? (
            <div className="msg-templates-editor">
              {msgTemplates.map((t, i) => (
                <div key={i} className="msg-template-item">
                  {editingTemplateIdx === i ? (
                    <input
                      type="text"
                      className="msg-template-input"
                      value={editingTemplateVal}
                      onChange={(e) => setEditingTemplateVal(e.target.value)}
                      onBlur={() => {
                        if (editingTemplateVal.trim()) {
                          const next = [...msgTemplates];
                          next[i] = editingTemplateVal.trim();
                          setMsgTemplates(next);
                          saveMessageTemplates(next);
                        }
                        setEditingTemplateIdx(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setEditingTemplateIdx(null);
                      }}
                      autoFocus
                    />
                  ) : (
                    <span className="msg-template-item-text" onClick={() => { setEditingTemplateIdx(i); setEditingTemplateVal(t); }}>{t}</span>
                  )}
                  <button className="msg-template-del" onClick={() => {
                    const next = msgTemplates.filter((_, j) => j !== i);
                    setMsgTemplates(next);
                    saveMessageTemplates(next);
                    if (selectedTemplateIdx >= next.length) setSelectedTemplateIdx(Math.max(0, next.length - 1));
                  }}>&#10005;</button>
                </div>
              ))}
              <div className="msg-template-add-row">
                <input
                  type="text"
                  className="msg-template-input"
                  placeholder="新模板..."
                  value={editingTemplateIdx === -1 ? editingTemplateVal : ''}
                  onChange={(e) => { setEditingTemplateIdx(-1); setEditingTemplateVal(e.target.value); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editingTemplateVal.trim()) {
                      const next = [...msgTemplates, editingTemplateVal.trim()];
                      setMsgTemplates(next);
                      saveMessageTemplates(next);
                      setEditingTemplateIdx(null);
                      setEditingTemplateVal('');
                    }
                  }}
                />
                <button className="msg-template-add-btn" onClick={() => {
                  if (!editingTemplateVal.trim()) return;
                  const next = [...msgTemplates, editingTemplateVal.trim()];
                  setMsgTemplates(next);
                  saveMessageTemplates(next);
                  setEditingTemplateIdx(null);
                  setEditingTemplateVal('');
                }}>+</button>
              </div>
              <span className="msg-template-hint">{'{name}'} = 学生姓名</span>
            </div>
          ) : (
            <div className="msg-template-lock">
              <span className="msg-template-preview">当前: {msgTemplate}</span>
              <span className="msg-template-hint">Admin 模式可以更改</span>
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
      )}

      {showHelp && (
        <div className="overlay" onClick={() => setShowHelp(false)}>
          <div className="help-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-header">
              <h2>使用帮助</h2>
              <button className="close-btn" onClick={() => setShowHelp(false)}>&#10005;</button>
            </div>

            <div className="help-section">
              <h3>📞 呼叫学生</h3>
              <p>先输入班级 ID（如 <code>g8c</code>）点击连接，然后点击学生姓名就能发起语音呼叫。学生姓名下方的预览会显示实际播报的内容。</p>
            </div>

            <div className="help-section">
              <h3>🔒 Admin 模式（管理学生 / 消息模板）</h3>
              <p>点击⚙设置 → 输入 PIN 进入 Admin 模式。解锁后可以添加或删除学生、导入 CSV 名单、管理多条消息模板。</p>
            </div>

            <div className="help-section">
              <h3>🔑 Sudo 模式（管理 PIN / 课表）</h3>
              <p>输入 Sudo 密码进入 Sudo 模式。可以添加/删除 PIN 码，以及设置上课时间表。课表导入支持 <code>.txt</code> 文件，格式：每行一个时间段，例如 <code>10:10-10:50</code>。</p>
            </div>

            <div className="help-section">
              <h3>📝 自定义消息</h3>
              <p>在"自定义消息"标签页，输入任意文字发送到接收端。可以用作通知、提醒等。</p>
            </div>

            <div className="help-section">
              <h3>📚 作业追踪</h3>
              <p>在"作业"标签页管理每日任务。点击单元格切换未交/已交/请假状态。支持导出图片和 Excel，也可以导入之前备份的 JSON 数据。</p>
            </div>

            <div className="help-section">
              <h3>🔄 多消息模板</h3>
              <p>Admin 模式下可以添加多条消息模板，发送呼叫时可以选择用哪一条。支持添加、编辑（点击文本）、删除模板。</p>
            </div>

            <div className="help-section">
              <h3>👤 发送者昵称</h3>
              <p>设置昵称后，接收端的呼叫记录里会显示是谁发送的。</p>
            </div>

            <div className="help-section">
              <h3>🕐 上课时间表</h3>
              <p>Sudo 模式下可以设置课表。上课时段呼叫自动弹窗显示（5秒后消失），下课期间正常播放语音。仅在 Electron 桌面版弹窗窗口会置顶。</p>
            </div>

            <div className="help-section">
              <h3>📋 接收端操作</h3>
              <p>接收端也要输入同样的班级 ID 来订阅频道。在呼叫记录中可以点"呼叫老师"回呼发送端。首次使用需要先点"启用语音"解锁语音播报。</p>
            </div>

            <div className="help-section">
              <h3>💡 小提示</h3>
              <ul>
                <li>发送端页面由服务器托管，其他设备浏览器直接访问 <code>http://服务器IP:8787</code></li>
                <li>PIN 码默认不需要，首次设置后才会启用</li>
                <li>消息模板变量 <code>{'{name}'}</code> 会自动替换为学生姓名</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="class-selector">
        <input
          type="text"
          placeholder="输入班级 ID (如 math-1)"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          onKeyDown={handleClassKeyDown}
        />
        <button onClick={handleConnect} disabled={!classIdTrimmed || status === 'connecting'}>
          {status === 'connecting' ? '...' : '连接班级'}
        </button>
      </div>

      {connectedClass && (
        <>
          <div className="tab-bar">
            <button
              className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`}
              onClick={() => setActiveTab('students')}
            >
              学生呼叫
            </button>
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
          ) : activeTab === 'students' ? (
            <>
              {isAdmin && (
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
              )}

              <div className="student-list">
                  {students.length === 0 && (
                    <div className="student-list-empty">
                      {isAdmin ? '暂无学生，使用上方输入框或 CSV 导入添加' : '暂无学生，请在设置中进入 Admin 模式后添加'}
                    </div>
                  )}
                {students.map((name, idx) => (
                  <div
                    key={`${idx}-${name}`}
                    className="student-card"
                    onClick={() => handleStudentClick(name)}
                  >
                    <span className="index">{idx + 1}</span>
                    {editingIdx === idx ? (
                      <input
                        className="name-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleEditSave(idx)}
                        onKeyDown={(e) => handleEditKeyDown(e, idx)}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="name">{name}</span>
                    )}
                    <div className="actions">
                      {isAdmin && (
                        <>
                          <button
                            className="edit-btn"
                            title="编辑"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditStart(idx);
                            }}
                          >
                            &#9998;
                          </button>
                          <button
                            className="delete-btn"
                            title="删除"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(idx);
                            }}
                          >
                            &#10005;
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="custom-message-section">
              <textarea
                className="custom-textarea"
                placeholder="输入自定义消息内容..."
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                onKeyDown={handleCustomKeyDown}
                rows={4}
              />
              <button
                className="custom-send-btn"
                onClick={() => {
                  if (!customText.trim() || !isConnected) return;
                  setPinInput('');
                  setPinError('');
                  setCustomConfirmOpen(true);
                }}
                disabled={!customText.trim() || !isConnected}
              >
                {isConnected ? '发送' : '未连接'}
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

      {(confirmStudent || customConfirmOpen) && (
        <div className="overlay" onClick={handleCancelConfirm}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>确认呼叫</h2>
            <div className="student-name-highlight">{confirmStudent || '自定义消息'}</div>
            <div className="preview-text">
              {confirmStudent
                ? renderTemplate(msgTemplates[selectedTemplateIdx] || msgTemplate, { name: confirmStudent })
                : customText}
            </div>
            {confirmStudent && msgTemplates.length > 1 && (
              <div className="template-select-row">
                <select
                  className="template-select"
                  value={selectedTemplateIdx}
                  onChange={(e) => setSelectedTemplateIdx(Number(e.target.value))}
                >
                  {msgTemplates.map((t, i) => (
                    <option key={i} value={i}>{t}</option>
                  ))}
                </select>
              </div>
            )}
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
                  onKeyDown={(e) => e.key === 'Enter' && (confirmStudent ? handleConfirmSend() : handleCustomConfirm())}
                  autoFocus
                />
                {pinError && <div className="pin-error">{pinError}</div>}
              </div>
            )}
            <div className="buttons">
              <button className="cancel-btn" onClick={handleCancelConfirm}>
                取消
              </button>
              <button
                className="confirm-btn"
                onClick={confirmStudent ? handleConfirmSend : handleCustomConfirm}
                disabled={!isConnected}
              >
                {isConnected ? '确认呼叫' : '未连接'}
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
