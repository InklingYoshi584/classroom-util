import { useState, useEffect, useCallback, useRef } from 'react';
import { createMqttClient, MqttClientHandle, MqttStatus, CallMessage } from './lib/mqtt';
import { buildCallMessage } from './lib/template';
import { loadClassId, saveClassId, loadStudents, saveStudents } from './lib/store';
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

  const mqttRef = useRef<MqttClientHandle | null>(null);

  useEffect(() => {
    const mqtt = createMqttClient();
    mqttRef.current = mqtt;
    mqtt.onStatusChange(setStatus);

    if (classId) {
      mqtt.connect(classId);
      setStudents(loadStudents(classId));
    }

    return () => {
      mqtt.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = useCallback(() => {
    const trimmed = classId.trim();
    if (!trimmed) return;
    saveClassId(trimmed);
    setStudents(loadStudents(trimmed));
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

  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleClassKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConnect();
  };

  const handleStudentClick = (name: string) => {
    setConfirmStudent(name);
  };

  const handleConfirmSend = () => {
    if (!confirmStudent) return;
    const raw = buildCallMessage(confirmStudent);
    const msg: CallMessage = JSON.parse(raw);
    const ok = mqttRef.current?.publish(msg);
    if (ok) {
      setToast({ msg: `已发送: ${confirmStudent}` });
      setHistory((h) => [{ name: confirmStudent, time: msg.time }, ...h].slice(0, 20));
    } else {
      setToast({ msg: '发送失败，检查连接状态', error: true });
    }
    setConfirmStudent(null);
  };

  const handleCancelConfirm = () => {
    setConfirmStudent(null);
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
      </div>

      <div className={`connection-bar ${status}`}>
        <span className="status-dot" />
        <span>{statusLabel[status]}</span>
      </div>

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

      {confirmStudent && (
        <div className="overlay" onClick={handleCancelConfirm}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>确认呼叫</h2>
            <div className="student-name-highlight">{confirmStudent}</div>
            <div className="preview-text">请 {confirmStudent} 同学到前台</div>
            <div className="buttons">
              <button className="cancel-btn" onClick={handleCancelConfirm}>
                取消
              </button>
              <button
                className="confirm-btn"
                onClick={handleConfirmSend}
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
