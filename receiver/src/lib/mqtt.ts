import mqtt, { MqttClient } from 'mqtt';

export type MqttStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface CallMessage {
  type: 'call-student';
  id: string;
  name: string;
  message: string;
  time: string;
  timestamp: number;
  senderId?: string;
  nickname?: string;
}

export interface HwSyncMessage {
  type: 'hw-sync';
  classId: string;
  timestamp: number;
}

export interface CallSenderMessage {
  type: 'call-sender';
  id: string;
  targetClientId: string;
  message: string;
  time: string;
  timestamp: number;
  nickname?: string;
  classId?: string;
}

export type MqttMessage = CallMessage | HwSyncMessage | CallSenderMessage;

type MessageHandler = (msg: MqttMessage) => void;
type StatusHandler = (status: MqttStatus) => void;

export function createMqttClient() {
  let client: MqttClient | null = null;
  let status: MqttStatus = 'disconnected';
  let currentClassId: string | null = null;
  let serverHost: string | null = null;
  let onMessage: MessageHandler | null = null;
  let onStatusChange: StatusHandler | null = null;

  const MQTT_PORT = 8787;

  function getBrokerUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = serverHost || window.location.hostname;
    return `${protocol}//${hostname}:${MQTT_PORT}`;
  }

  function setStatus(s: MqttStatus) {
    status = s;
    onStatusChange?.(s);
  }

  function connect(classId: string, host?: string) {
    if (host) serverHost = host;
    if (client) {
      client.end(true);
      client = null;
    }

    currentClassId = classId;
    setStatus('connecting');

    const url = getBrokerUrl();
    client = mqtt.connect(url, {
      clientId: `receiver-${classId}-${Math.random().toString(36).slice(2, 8)}`,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 10000,
    });

    client.on('connect', () => {
      setStatus('connected');
      const topic = `classroom/${currentClassId}`;
      client?.subscribe(topic, (err) => {
        if (err) {
          console.error('Subscribe error:', err);
          setStatus('error');
        }
      });
    });

    client.on('message', (_topic: string, payload: Buffer) => {
      try {
        const msg: MqttMessage = JSON.parse(payload.toString());
        onMessage?.(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    client.on('error', (err: Error) => {
      console.error('MQTT error:', err);
      setStatus('error');
    });

    client.on('close', () => {
      setStatus('disconnected');
    });

    client.on('reconnect', () => {
      setStatus('connecting');
    });

    client.on('offline', () => {
      setStatus('disconnected');
    });
  }

  function disconnect() {
    if (client) {
      client.end(true);
      client = null;
    }
    currentClassId = null;
    setStatus('disconnected');
  }

  function publish(message: MqttMessage): boolean {
    if (!client || status !== 'connected' || !currentClassId) {
      return false;
    }
    const topic = `classroom/${currentClassId}`;
    client.publish(topic, JSON.stringify(message), { qos: 0 });
    return true;
  }

  return {
    get status() {
      return status;
    },
    get classId() {
      return currentClassId;
    },
    connect,
    disconnect,
    publish,
    onMessage(handler: MessageHandler) {
      onMessage = handler;
    },
    onStatusChange(handler: StatusHandler) {
      onStatusChange = handler;
    },
  };
}

export type MqttClientHandle = ReturnType<typeof createMqttClient>;
