import { useState, useEffect, useCallback, useRef } from 'react';
import { createMqttClient, MqttClientHandle, MqttStatus, CallMessage } from './lib/mqtt';
import { renderTemplate, previewTemplate } from './lib/template';
import { loadTtsSettings, saveTtsSettings, TtsSettings, DEFAULT_TTS } from './lib/store';
import { ttsEngine } from './lib/tts';
import { getPinStatus, verifyPin } from './lib/pin';
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
      if (seenIdsRef.current.has(msg.id)) return;
      seenIdsRef.current.add(msg.id);

      setCurrentCall(msg);
      setHistory((h) => [msg, ...h].slice(0, 50));

      const vars = { name: msg.name, message: msg.message, time: msg.time };
      const text = renderTemplate(ttsSettingsRef.current.template || DEFAULT_TTS.template, vars);
      ttsEngine.speak(text, { ...ttsSettingsRef.current, enabled: true });
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

  const handleConnect = useCallback(() => {
    const trimmed = classId.trim();
    if (!trimmed) return;
    localStorage.setItem(CLASS_KEY, trimmed);
    mqttRef.current?.connect(trimmed, serverHost.trim() || undefined);
  }, [classId, serverHost]);

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
    connected: '已连接 | 等待呼叫...',
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

      <div className="server-host">
        <input
          type="text"
          placeholder="服务器地址 (留空=本机)"
          value={serverHost}
          onChange={(e) => {
            setServerHost(e.target.value);
            localStorage.setItem(SERVER_HOST_KEY, e.target.value);
          }}
          onKeyDown={handleClassKeyDown}
        />
        <span className="server-host-hint">
          例: 192.168.1.5
        </span>
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
          {status === 'connecting' ? '...' : '订阅'}
        </button>
      </div>

      {!ttsEngine.isAvailable() && (
        <div className="audio-warning">您的浏览器不支持语音合成，部分功能不可用。</div>
      )}

      <div className="top-actions">
        {!audioUnlocked && (
          <button className="audio-enable-btn" onClick={handleEnableAudio}>
            启用语音
          </button>
        )}
        <button className="settings-toggle-btn" onClick={handleToggleSettings}>
          {showSettings ? '收起设置' : 'TTS 设置'}
        </button>
      </div>

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

      {history.length > 0 && (
        <div className="receiver-history">
          <div className="receiver-history-header">
            <h3>呼叫记录</h3>
            <button className="clear-btn" onClick={handleClearHistory}>
              清空
            </button>
          </div>
          {history.map((h) => (
            <div key={h.id} className="history-item">
              <span className="dot" />
              <span>{h.name}</span>
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
              type="text"
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
    </div>
  );
}
