import { useState, useEffect, useCallback, useRef } from 'react';
import { createMqttClient, MqttClientHandle, MqttStatus, CallMessage } from './lib/mqtt';
import { renderTemplate, previewTemplate } from './lib/template';
import { loadTtsSettings, saveTtsSettings, TtsSettings, DEFAULT_TTS } from './lib/store';
import { ttsEngine } from './lib/tts';
import { getPinStatus, verifyPin } from './lib/pin';
import { HomeworkTracker } from './HomeworkTracker';
import { electronApi } from './lib/electronApi';
import './ReceiverPage.css';

const CLASS_KEY = 'classroom-receiver-class';
const SERVER_HOST_KEY = 'classroom-receiver-server-host';

export function ReceiverPage() {
  const [serverHost, setServerHost] = useState(() => localStorage.getItem(SERVER_HOST_KEY) || '');
  const [classId, setClassId] = useState(() => localStorage.getItem(CLASS_KEY) || '');
  const [status, setStatus] = useState<MqttStatus>('disconnected');
  const [currentCall, setCurrentCall] = useState<CallMessage | null>(null);
  const [history, setHistory] = useState<CallMessage[]>([]);
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(() => loadTtsSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [gatePinInput, setGatePinInput] = useState('');
  const [gatePinError, setGatePinError] = useState('');
  const [activeTab, setActiveTab] = useState<'receive' | 'homework'>('receive');
  const [configLocked, setConfigLocked] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [configUnlockPin, setConfigUnlockPin] = useState('');
  const [configPinError, setConfigPinError] = useState('');
  const [hwReloadTrigger, setHwReloadTrigger] = useState(0);
  const [schedule, setSchedule] = useState<{ start: string; end: string }[]>([]);
  const [scheduleActive, setScheduleActive] = useState(false);
  const [receiverNickname, setReceiverNickname] = useState(() => localStorage.getItem('classroom-receiver-nickname') || '');

  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleActiveRef = useRef(false);
  scheduleActiveRef.current = scheduleActive;

  const mqttRef = useRef<MqttClientHandle | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const ttsSettingsRef = useRef<TtsSettings>(ttsSettings);
  const serverHostRef = useRef(serverHost);
  ttsSettingsRef.current = ttsSettings;
  serverHostRef.current = serverHost;

  useEffect(() => {
    const mqtt = createMqttClient();
    mqttRef.current = mqtt;
    mqtt.onStatusChange(setStatus);

    mqtt.onMessage((msg) => {
      if (msg.type === 'hw-sync') {
        setHwReloadTrigger((n) => n + 1);
        return;
      }
      if (msg.type === 'call-student') {
        if (seenIdsRef.current.has(msg.id)) return;
        seenIdsRef.current.add(msg.id);

        setHistory((h) => [msg, ...h].slice(0, 50));

        if (schedule.length > 0) {
          if (scheduleActiveRef.current) {
            setCurrentCall(msg);
            if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
            popupTimerRef.current = setTimeout(() => setCurrentCall(null), 5000);
            return;
          }
        }

        setCurrentCall(msg);

        const vars = { name: msg.name, message: msg.message, time: msg.time };
        const text = renderTemplate(ttsSettingsRef.current.template || DEFAULT_TTS.template, vars);
        ttsEngine.speak(text, { ...ttsSettingsRef.current, enabled: true });
      }
      if (msg.type === 'call-sender' && !msg.targetClientId) {
        if (seenIdsRef.current.has(msg.id)) return;
        seenIdsRef.current.add(msg.id);
        const callText = msg.nickname ? `${msg.nickname} 呼叫了你` : '发送端呼叫';
        ttsEngine.speak(callText, { ...ttsSettingsRef.current, enabled: true });
        const historyEntry: CallMessage = { type: 'call-student', id: msg.id, name: callText, message: callText, time: msg.time, timestamp: msg.timestamp };
        setCurrentCall(historyEntry);
        setHistory((h) => [historyEntry, ...h].slice(0, 50));
      }
    });

    ttsEngine.getVoices().then((v) => setVoices(v));

    if (classId) {
      mqtt.connect(classId, serverHostRef.current || undefined);
    }

    return () => {
      mqtt.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch schedule and check status
  useEffect(() => {
    if (!classId.trim()) return;
    const apiBase = serverHost ? `http://${serverHost}:8787` : '';
    const checkSchedule = () => {
      fetch(`${apiBase}/api/schedule?class=${encodeURIComponent(classId.trim())}`)
        .then((r) => r.json())
        .then((d) => {
          const s = d.schedule || [];
          setSchedule(s);
          const now = new Date();
          const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          const active = s.some((slot: { start: string; end: string }) => time >= slot.start && time <= slot.end);
          setScheduleActive(active);
        })
        .catch(() => {});
    };
    checkSchedule();
    const interval = setInterval(checkSchedule, 60000);
    return () => clearInterval(interval);
  }, [classId, serverHost]);

  // Toggle always-on-top when popup shows
  useEffect(() => {
    const shouldFloat = currentCall && schedule.length > 0 && scheduleActive;
    electronApi.setAlwaysOnTop(!!shouldFloat);
  }, [currentCall, schedule, scheduleActive]);

  const handleConnect = useCallback(() => {
    const trimmed = classId.trim();
    if (!trimmed) return;
    localStorage.setItem(CLASS_KEY, trimmed);
    mqttRef.current?.connect(trimmed, serverHost.trim() || undefined);
    setConfigLocked(true);
    setShowConfigPanel(false);
  }, [classId, serverHost]);

  const handleConfigUnlockRequest = async () => {
    const host = serverHostRef.current.trim();
    const result = await getPinStatus(host);
    if (result === 'set') {
      setConfigUnlockPin('');
      setConfigPinError('');
      return;
    }
    setConfigLocked(false);
  };

  const handleConfigPinSubmit = async () => {
    const host = serverHostRef.current.trim();
    const result = await verifyPin(host, configUnlockPin);
    if (result === 'ok') {
      setConfigLocked(false);
      setConfigUnlockPin('');
      setConfigPinError('');
    } else if (result === 'wrong') {
      setConfigPinError('PIN 错误');
    } else {
      setConfigPinError('无法连接到服务器，请检查服务器地址');
    }
  };

  const handleConfigLock = () => {
    setConfigLocked(true);
    setConfigUnlockPin('');
    setConfigPinError('');
  };

  const handleClassKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConnect();
  };

  const handleEnableAudio = async () => {
    setAudioUnlocked(true);
    setTtsSettings((prev) => {
      const next = { ...prev, enabled: true };
      saveTtsSettings(next);
      return next;
    });
    await ttsEngine.speak('音频已启用', { ...ttsSettingsRef.current, enabled: true, repeat: 1 });
  };

  const handleDismiss = () => {
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    ttsEngine.cancel();
    setCurrentCall(null);
  };

  const handleReplay = () => {
    if (!currentCall) return;
    const vars = { name: currentCall.name, message: currentCall.message, time: currentCall.time };
    const text = renderTemplate(ttsSettingsRef.current.template || DEFAULT_TTS.template, vars);
    ttsEngine.cancel();
    ttsEngine.speak(text, { ...ttsSettingsRef.current, enabled: true });
  };

  const handleReplayHistory = (msg: CallMessage) => {
    const vars = { name: msg.name, message: msg.message, time: msg.time };
    const text = renderTemplate(ttsSettingsRef.current.template || DEFAULT_TTS.template, vars);
    ttsEngine.cancel();
    ttsEngine.speak(text, { ...ttsSettingsRef.current, enabled: true });
  };

  const handleClearHistory = () => {
    seenIdsRef.current = new Set();
    setHistory([]);
  };

  const handleSaveSettings = () => {
    saveTtsSettings(ttsSettings);
  };

  const handleTestSpeak = () => {
    const text = previewTemplate(ttsSettingsRef.current.template || DEFAULT_TTS.template);
    ttsEngine.cancel();
    ttsEngine.speak(text, { ...ttsSettingsRef.current, enabled: true });
  };

  const handleToggleSettings = async () => {
    if (showSettings) {
      setShowSettings(false);
      return;
    }
    const host = serverHostRef.current.trim();
    const result = await getPinStatus(host);
    if (result === 'error') {
      setGatePinError('无法连接到服务器，请检查服务器地址');
      setPinRequired(true);
      return;
    }
    if (result === 'set' && !pinVerified) {
      setPinRequired(true);
      setGatePinInput('');
      setGatePinError('');
      return;
    }
    setShowSettings(true);
  };

  const handleGatePinSubmit = async () => {
    const host = serverHostRef.current.trim();
    const result = await verifyPin(host, gatePinInput);
    if (result === 'ok') {
      setPinVerified(true);
      setPinRequired(false);
      setShowSettings(true);
      setGatePinInput('');
      setGatePinError('');
    } else if (result === 'wrong') {
      setGatePinError('PIN 错误');
    } else {
      setGatePinError('无法连接到服务器，请检查服务器地址');
    }
  };

  const handleGatePinCancel = () => {
    setPinRequired(false);
    setGatePinInput('');
    setGatePinError('');
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
    <div className="receiver-page">
      <div className="receiver-header">
        <h1>Classroom Caller · 接收端</h1>
      </div>

      <div className={`connection-bar ${status}`}>
        <span className="status-dot" />
        <span>{statusLabel[status]}</span>
      </div>

      {!classIdTrimmed ? (
        <div className="class-selector">
          <input
            type="text"
            placeholder="输入班级 ID (如 math-1)"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            onKeyDown={handleClassKeyDown}
          />
          <button onClick={handleConnect} disabled={status === 'connecting'}>
            {status === 'connecting' ? '...' : '订阅班级'}
          </button>
        </div>
      ) : (
        <div className="config-bar">
          <span className="config-class-label">{classIdTrimmed}</span>
          <span className="config-status-label">{statusLabel[status]}</span>
          <button
            className="config-expand-btn"
            onClick={() => setShowConfigPanel(!showConfigPanel)}
            title="连接设置"
          >
            {showConfigPanel ? '收起设置' : '连接设置'} {configLocked ? '🔒' : '🔓'}
          </button>
        </div>
      )}

      {classIdTrimmed && showConfigPanel && (
        <div className="config-panel">
          <div className="config-panel-header">
            <h4>连接设置</h4>
            {configLocked ? (
              <div className="config-unlock-row">
                <input
                  type="password"
                  className="config-pin-input"
                  placeholder="输入 PIN 解锁"
                  value={configUnlockPin}
                  onChange={(e) => {
                    setConfigUnlockPin(e.target.value);
                    setConfigPinError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleConfigPinSubmit()}
                />
                <button className="config-unlock-btn" onClick={handleConfigPinSubmit}>
                  解锁
                </button>
                {configPinError && <div className="config-pin-error">{configPinError}</div>}
              </div>
            ) : (
              <button className="config-lock-btn" onClick={handleConfigLock}>
                锁定
              </button>
            )}
          </div>

          <label className="config-label">
            服务器地址
            <input
              type="text"
              className={`config-input ${configLocked ? 'locked' : ''}`}
              placeholder="留空=本机"
              value={serverHost}
              onChange={(e) => {
                setServerHost(e.target.value);
                localStorage.setItem(SERVER_HOST_KEY, e.target.value);
              }}
              onKeyDown={handleClassKeyDown}
              disabled={configLocked}
            />
          </label>

          <label className="config-label">
            频道 (班级 ID)
            <input
              type="text"
              className={`config-input ${configLocked ? 'locked' : ''}`}
              placeholder="输入班级 ID"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              onKeyDown={handleClassKeyDown}
              disabled={configLocked}
            />
          </label>

          {!configLocked && (
            <button className="config-reconnect-btn" onClick={handleConnect} disabled={status === 'connecting'}>
              {status === 'connecting' ? '...' : '重新连接'}
            </button>
          )}
        </div>
      )}

      {classIdTrimmed && (
        <div className="tab-bar">
          <button className={`tab-btn ${activeTab === 'receive' ? 'active' : ''}`} onClick={() => setActiveTab('receive')}>
            接收
          </button>
          <button className={`tab-btn ${activeTab === 'homework' ? 'active' : ''}`} onClick={() => setActiveTab('homework')}>
            作业
          </button>
        </div>
      )}

      <div className="tab-content">
        {activeTab === 'receive' ? (
          <>
            {!ttsEngine.isAvailable() && (
              <div className="audio-warning">您的浏览器不支持语音合成，部分功能不可用。</div>
            )}

      <div className="top-actions">
        {!audioUnlocked && schedule.length === 0 && (
          <button className="audio-enable-btn" onClick={handleEnableAudio}>
            启用语音
          </button>
        )}
        <button className="settings-toggle-btn" onClick={handleToggleSettings}>
          {showSettings ? '收起设置' : 'TTS 设置'}
        </button>
      </div>

      {schedule.length > 0 && (
        <div className="schedule-status">
          <span className={scheduleActive ? 'schedule-active-badge' : 'schedule-idle-badge'}>
            {scheduleActive ? '课堂中' : '休息中'}
          </span>
          <span className="schedule-slots">{schedule.map((s) => `${s.start}-${s.end}`).join(' ')}</span>
        </div>
      )}

      {showSettings && (
        <div className="settings-panel">
          <label>
            朗读模板
            <span className="vars">变量: {'{name}'} {'{message}'} {'{time}'}</span>
            <input
              type="text"
              value={ttsSettings.template}
              onChange={(e) => setTtsSettings((p) => ({ ...p, template: e.target.value }))}
            />
          </label>

          <label>
            语音
            <select
              value={ttsSettings.voiceName || ''}
              onChange={(e) => setTtsSettings((p) => ({ ...p, voiceName: e.target.value || null }))}
            >
              <option value="">默认</option>
              {voices
                .filter((v) => v.lang.includes('zh'))
                .map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
            </select>
          </label>

          <label>
            语速: {ttsSettings.rate.toFixed(1)}
            <div className="range-row">
              <span>0.5</span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={ttsSettings.rate}
                onChange={(e) => setTtsSettings((p) => ({ ...p, rate: parseFloat(e.target.value) }))}
              />
              <span>2.0</span>
            </div>
          </label>

          <label>
            音量: {ttsSettings.volume.toFixed(1)}
            <div className="range-row">
              <span>0</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={ttsSettings.volume}
                onChange={(e) => setTtsSettings((p) => ({ ...p, volume: parseFloat(e.target.value) }))}
              />
              <span>1</span>
            </div>
          </label>

          <label>
            重复次数: {ttsSettings.repeat}
            <div className="range-row">
              <span>1</span>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={ttsSettings.repeat}
                onChange={(e) => setTtsSettings((p) => ({ ...p, repeat: parseInt(e.target.value) }))}
              />
              <span>5</span>
            </div>
          </label>

          <div className="preview-text">
            预览: {previewTemplate(ttsSettings.template || DEFAULT_TTS.template)}
          </div>

          <label>
            接收端昵称
            <input
              type="text"
              placeholder="如: 教室前端"
              value={receiverNickname}
              onChange={(e) => {
                setReceiverNickname(e.target.value);
                localStorage.setItem('classroom-receiver-nickname', e.target.value);
              }}
            />
          </label>

          <div className="settings-actions">
            <button className="test-btn" onClick={handleTestSpeak}>
              测试朗读
            </button>
            <button className="save-btn" onClick={handleSaveSettings}>
              保存设置
            </button>
          </div>
        </div>
      )}

      {(schedule.length === 0 || !scheduleActive) && (
        <div className={`call-display ${currentCall ? 'active' : 'idle'}`}>
          {currentCall ? (
            <>
              <div className="call-text">{currentCall.message}</div>
              <div className="call-time">{currentCall.time}</div>
              <div className="call-actions">
                <button className="replay-btn" onClick={handleReplay}>
                  重播
                </button>
                <button className="dismiss-btn" onClick={handleDismiss}>
                  关闭
                </button>
              </div>
            </>
          ) : (
            <div>
              <span className="idle-icon">📢</span>
              {classIdTrimmed && isConnected ? '等待呼叫...' : '请先订阅班级'}
            </div>
          )}
        </div>
      )}

      {schedule.length > 0 && scheduleActive && currentCall && (
        <div className="call-popup">
          <div className="call-popup-name">{currentCall.name}</div>
          <div className="call-popup-msg">{currentCall.message}</div>
          <button className="call-popup-close" onClick={handleDismiss}>&#10005;</button>
        </div>
      )}

      {history.length > 0 && (
        <div className="receiver-history">
          <div className="receiver-history-header">
            <h3>呼叫记录</h3>
            <button className="clear-btn" onClick={handleClearHistory}>
              清空
            </button>
          </div>
          <div className="callback-row">
            <select
              className="callback-select"
              value=""
              onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                mqttRef.current?.publish({
                  type: 'call-sender',
                  id: crypto.randomUUID?.() ?? `${Date.now()}`,
                  targetClientId: val,
                  message: '接收端呼叫',
                  time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
                  timestamp: Date.now(),
                  nickname: receiverNickname || undefined,
                  classId: classIdTrimmed,
                });
                e.target.value = '';
              }}
            >
              <option value="">呼叫老师...</option>
              {(() => {
                const seen = new Map<string, string>();
                history.forEach((h) => {
                  if (h.senderId && h.nickname && !seen.has(h.senderId)) {
                    seen.set(h.senderId, h.nickname);
                  }
                });
                return [...seen].map(([id, nick]) => (
                  <option key={id} value={id}>{nick}</option>
                ));
              })()}
            </select>
          </div>
          {history.map((h) => (
            <div key={h.id} className="history-item">
              <span className="dot" />
              <span>{h.name}</span>
              {h.nickname && <span className="sender-nick">{h.nickname}</span>}
              <span className="time">{h.time}</span>
              <button className="replay-sm" onClick={() => handleReplayHistory(h)}>
                重播
              </button>
            </div>
          ))}
        </div>
      )}

      {pinRequired && (
        <div className="overlay" onClick={handleGatePinCancel}>
          <div className="pin-gate-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>需要 PIN 验证</h3>
            <p>请输入 PIN 以访问设置</p>
            <input
              type="password"
              className="pin-gate-input"
              placeholder="输入 PIN"
              value={gatePinInput}
              onChange={(e) => {
                setGatePinInput(e.target.value);
                setGatePinError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleGatePinSubmit()}
              autoFocus
            />
            {gatePinError && <div className="pin-gate-error">{gatePinError}</div>}
            <div className="pin-gate-buttons">
              <button className="cancel-btn" onClick={handleGatePinCancel}>取消</button>
              <button className="confirm-btn" onClick={handleGatePinSubmit}>确认</button>
            </div>
          </div>
        </div>
      )}
        </>
      ) : (
        <HomeworkTracker
          classId={classIdTrimmed}
          serverHost={serverHost.trim()}
          reloadTrigger={hwReloadTrigger}
          onDataSaved={() => {
            mqttRef.current?.publish({ type: 'hw-sync', classId: classIdTrimmed, timestamp: Date.now() });
          }}
        />
      )}
      </div>
    </div>
  );
}
