import { useState, useEffect, useCallback, useRef } from 'react';
import { createMqttClient, MqttClientHandle, MqttStatus, CallMessage } from './lib/mqtt';
import { buildCallMessage, buildCustomMessage, renderTemplate } from './lib/template';
import { loadClassId, saveClassId, loadStudents, saveStudents, loadMessageTemplate, saveMessageTemplate, DEFAULT_MSG_TEMPLATE } from './lib/store';
import { getPinStatus, verifyPin, setPin, removePin, listPins } from './lib/pin';
import { parseStudentCsv } from './lib/csv';
import './SenderPage.css';

export function SenderPage() {
  const [classId, setClassId] = useState(() => loadClassId());
  const [students, setStudents] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmStudent, setConfirmStudent] = useState<string | null>(null);
  const [status, setStatus] = useState<MqttStatus>('disconnected');
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [history, setHistory] = useState<{ name: string; time: string }[]>([]);
  const [msgTemplate, setMsgTemplate] = useState(() => loadMessageTemplate());
  const [pinSet, setPinSet] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [sudoAuthed, setSudoAuthed] = useState(false);
  const [sudoPassword, setSudoPassword] = useState('');
  const [sudoNewPin, setSudoNewPin] = useState('');
  const [sudoError, setSudoError] = useState('');
  const [pinList, setPinList] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'students' | 'custom'>('students');
  const [customText, setCustomText] = useState('');
  const [customConfirmOpen, setCustomConfirmOpen] = useState(false);

  const mqttRef = useRef<MqttClientHandle | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mqtt = createMqttClient();
    mqttRef.current = mqtt;
    mqtt.onStatusChange(setStatus);

    if (classId) {
      mqtt.connect(classId);
      loadStudents(classId).then(setStudents);
    }

    return () => {
      mqtt.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getPinStatus().then(setPinSet);
  }, []);

  const handleConnect = useCallback(() => {
    const trimmed = classId.trim();
    if (!trimmed) return;
    saveClassId(trimmed);
    loadStudents(trimmed).then(setStudents);
    mqttRef.current?.connect(trimmed);
  }, [classId]);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    const updated = [...students, name];
    setStudents(updated);
    saveStudents(classId.trim() || 'default', updated);
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
    saveStudents(classId.trim() || 'default', updated);
    setEditingIdx(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Enter') handleEditSave(idx);
    if (e.key === 'Escape') setEditingIdx(null);
  };

  const handleDelete = (idx: number) => {
    const updated = students.filter((_, i) => i !== idx);
    setStudents(updated);
    saveStudents(classId.trim() || 'default', updated);
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
      saveStudents(classIdTrimmed, updated);
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
      const ok = await verifyPin(pinInput);
      if (!ok) {
        setPinError('PIN 错误');
        return;
      }
    }
    const raw = buildCallMessage(confirmStudent, msgTemplate);
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
      const ok = await verifyPin(pinInput);
      if (!ok) {
        setPinError('PIN 错误');
        return;
      }
    }
    const raw = buildCustomMessage(text);
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
    setPinSet(await getPinStatus());
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
        setSudoError('');
        const list = await listPins(sudoPassword);
        setPinList(list);
        setPinSet(list.length > 0);
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
        <button className="settings-gear-btn" onClick={() => setShowSettings(!showSettings)} title="设置">
          &#9881;
        </button>
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
                <span className="sudo-authed-badge">Sudo 模式</span>
                <button className="logout-btn" onClick={handleSudoLogout}>
                  退出
                </button>
              </div>

              <div className="add-pin-row">
                <input
                  type="text"
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
                <div className="pin-list-empty">暂无 PIN</div>
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

              <div className="msg-template-label">消息模板</div>
              <input
                type="text"
                className="msg-template-input"
                placeholder={DEFAULT_MSG_TEMPLATE}
                value={msgTemplate}
                onChange={(e) => {
                  setMsgTemplate(e.target.value);
                  saveMessageTemplate(e.target.value);
                }}
              />
              <span className="msg-template-hint">{'{name}'} = 学生姓名</span>
            </div>
          )}
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
          {status === 'connecting' ? '...' : '连接'}
        </button>
      </div>

      {classIdTrimmed && (
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
          </div>

          {activeTab === 'students' ? (
            <>
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

              <div className="student-list">
                {students.length === 0 && (
                  <div className="student-list-empty">暂无学生，请先添加</div>
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
                ? renderTemplate(msgTemplate, { name: confirmStudent })
                : customText}
            </div>
            {pinSet && (
              <div className="pin-row">
                <input
                  type="text"
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
