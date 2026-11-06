
import { Device, DowntimeLog, SystemStats, AppSettings, DeviceStatus } from '../types';

const API_URL = '/api';

// --- UTILITIES ---

export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const getLocalIP = async (): Promise<string> => {
  try {
    if (cachedHostStats?.hostIp) {
      return cachedHostStats.hostIp;
    }
    const res = await fetch(`${API_URL}/system-stats`, {
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
        const data = await res.json();
        if (data.hostIp) {
          cachedHostStats = { ...(cachedHostStats || {}), hostIp: data.hostIp };
          return data.hostIp;
        }
    }
  } catch (e) {}
  return cachedHostStats?.hostIp || '127.0.0.1';
};

// --- API CLIENT WITH RESILIENT CACHING & 429 BACKOFF ---

export const DEFAULT_SETTINGS: AppSettings = {
  systemName: 'E-Board',
  pingInterval: 5,
  timeoutThreshold: 2000,
  warningThreshold: 200,
  simulateNetwork: false,
  logRetentionDays: 30,
  maxLogEntries: 500,
  enableAutoDelete: true,
  enableSoundAlerts: false,
  alertSoundUrl: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
  adminPin: '',
  enableScheduledReports: false,
  reportScheduleTime: '08:00'
};

const safeGetStorage = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

const safeSetStorage = (key: string, value: any) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

let cachedDevices: Device[] = safeGetStorage('ns_cached_devices', []);
let cachedLogs: DowntimeLog[] = safeGetStorage('ns_cached_logs', []);
let cachedSettings: AppSettings = safeGetStorage('ns_cached_settings', DEFAULT_SETTINGS);
let cachedHostStats: Partial<SystemStats> | null = null;

// Resilient fetch helper with retry on 429 rate limit
const fetchWithRetry = async (url: string, options: RequestInit = {}, maxRetries = 1): Promise<Response> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 && attempt < maxRetries) {
        // Wait a short moment before retrying
        await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  return fetch(url, options);
};

export const getDevices = async (): Promise<Device[]> => {
  try {
    const res = await fetchWithRetry(`${API_URL}/devices`, {
      headers: { 'Accept': 'application/json' }
    });
    if (res.status === 429) {
      console.warn('[monitorService] 429 Rate limit on /api/devices - serving cached devices');
      return cachedDevices;
    }
    if (!res.ok) {
      if (cachedDevices.length > 0 || res.status >= 500 || res.status === 429) {
        return cachedDevices;
      }
      return cachedDevices;
    }
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        cachedDevices = data;
        safeSetStorage('ns_cached_devices', data);
      }
      return data;
    } catch (e) {
      console.error(`Failed to parse devices JSON. Response starts with: ${text.substring(0, 100)}`);
      return cachedDevices;
    }
  } catch (err: any) {
    console.warn('[monitorService] getDevices fallback to cache:', err?.message || err);
    return cachedDevices;
  }
};

export const getDevicesLiveStatus = async (): Promise<{
  id: string;
  ip?: string;
  status: DeviceStatus;
  latency: number;
  packetLoss: number;
  lastSeen: string;
  lastStatusChange: string;
  uptimePercentage?: number;
  isMonitored?: boolean;
  isMaintenance?: boolean;
  remarks?: string;
  statusReason?: string;
}[] | null> => {
  try {
    const res = await fetchWithRetry(`${API_URL}/devices/live-status`, {
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {}
  return null;
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  try {
    const res = await fetch(`${API_URL}/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    return res.ok;
  } catch (e) {
    return false;
  }
};

export const addDevice = async (device: Device, pin?: string): Promise<Device> => {
  const res = await fetch(`${API_URL}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, device })
  });
  if (res.status === 401) throw new Error('Unauthorized: Invalid PIN');
  if (!res.ok) throw new Error('Failed to add device');
  const created = await res.json();
  cachedDevices = [...cachedDevices, created];
  safeSetStorage('ns_cached_devices', cachedDevices);
  return created;
};

export const importDevicesBulk = async (
  devices: Partial<Device>[],
  mode: 'replace' | 'merge' = 'replace',
  pin?: string
): Promise<{ success: boolean; importedCount: number; count: number; devices: Device[] }> => {
  const res = await fetch(`${API_URL}/devices/bulk-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, devices, mode })
  });
  if (res.status === 401) throw new Error('Unauthorized: Invalid PIN');
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to import devices');
  }
  const data = await res.json();
  if (Array.isArray(data.devices)) {
    cachedDevices = data.devices;
    safeSetStorage('ns_cached_devices', data.devices);
  }
  return data;
};

export const updateDevice = async (device: Device, pin?: string): Promise<Device> => {
  const res = await fetch(`${API_URL}/devices/${device.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, device })
  });
  if (res.status === 401) throw new Error('Unauthorized: Invalid PIN');
  if (!res.ok) throw new Error('Failed to update device');
  const updated = await res.json();
  cachedDevices = cachedDevices.map(d => d.id === updated.id ? updated : d);
  safeSetStorage('ns_cached_devices', cachedDevices);
  return updated;
};

export const deleteDevice = async (id: string, pin?: string): Promise<void> => {
  const res = await fetch(`${API_URL}/devices/${id}`, { 
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  if (res.status === 401) throw new Error('Unauthorized: Invalid PIN');
  if (!res.ok) throw new Error('Failed to delete device');
  cachedDevices = cachedDevices.filter(d => d.id !== id);
  safeSetStorage('ns_cached_devices', cachedDevices);
};

export const deleteDevicesBulk = async (ids: string[], pin?: string): Promise<void> => {
  const res = await fetch(`${API_URL}/devices/bulk`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, ids })
  });
  if (res.status === 401) throw new Error('Unauthorized: Invalid PIN');
  if (!res.ok) throw new Error('Failed to delete devices');
  cachedDevices = cachedDevices.filter(d => !ids.includes(d.id));
  safeSetStorage('ns_cached_devices', cachedDevices);
};

export const updateDevicesBulk = async (ids: string[], updates: Partial<Device>, pin?: string): Promise<{ success: boolean; count: number }> => {
  const res = await fetch(`${API_URL}/devices/bulk-update`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, ids, updates })
  });
  if (res.status === 401) throw new Error('Unauthorized: Invalid PIN');
  if (!res.ok) throw new Error('Failed to bulk update devices');
  const result = await res.json();
  cachedDevices = cachedDevices.map(d => ids.includes(d.id) ? { ...d, ...updates } : d);
  safeSetStorage('ns_cached_devices', cachedDevices);
  return result;
};

// --- SETTINGS API ---
export const getSettings = async (): Promise<AppSettings> => {
  try {
    const res = await fetchWithRetry(`${API_URL}/settings`, {
      headers: { 'Accept': 'application/json' }
    });
    if (res.status === 429) {
      console.warn('[monitorService] 429 Rate limit on /api/settings - serving cached settings');
      return cachedSettings || DEFAULT_SETTINGS;
    }
    if (!res.ok) {
      console.warn(`[monitorService] Settings fetch status ${res.status} - serving cached settings`);
      return cachedSettings || DEFAULT_SETTINGS;
    }
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      cachedSettings = data;
      safeSetStorage('ns_cached_settings', data);
      return data;
    } catch (e) {
      console.error(`Failed to parse settings JSON. Response starts with: ${text.substring(0, 100)}`);
      return cachedSettings || DEFAULT_SETTINGS;
    }
  } catch (err: any) {
    console.warn('[monitorService] getSettings fallback to cache:', err?.message || err);
    return cachedSettings || DEFAULT_SETTINGS;
  }
};

export const saveSettings = async (settings: AppSettings, pin?: string): Promise<AppSettings> => {
  const res = await fetch(`${API_URL}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, ...settings })
  });
  if (!res.ok) throw new Error('Failed to save settings');
  const saved = await res.json();
  cachedSettings = saved;
  safeSetStorage('ns_cached_settings', saved);
  return saved;
};

export const restoreConfig = async (data: { settings: AppSettings, devices: Device[] }, pin?: string): Promise<void> => {
  const res = await fetch(`${API_URL}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin, settings: data.settings, devices: data.devices })
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to restore configuration');
  }
  cachedSettings = data.settings;
  cachedDevices = data.devices;
  safeSetStorage('ns_cached_settings', data.settings);
  safeSetStorage('ns_cached_devices', data.devices);
};

// --- LOGS API ---
export const getLogs = async (): Promise<DowntimeLog[]> => {
  try {
    const res = await fetchWithRetry(`${API_URL}/logs`, {
      headers: { 'Accept': 'application/json' }
    });
    if (res.status === 429) {
      console.warn('[monitorService] 429 Rate limit on /api/logs - serving cached logs');
      return cachedLogs;
    }
    if (!res.ok) {
      return cachedLogs;
    }
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        cachedLogs = data;
        safeSetStorage('ns_cached_logs', data);
      }
      return data;
    } catch (e) {
      console.error(`Failed to parse logs JSON. Response starts with: ${text.substring(0, 100)}`);
      return cachedLogs;
    }
  } catch (err: any) {
    console.warn('[monitorService] getLogs fallback to cache:', err?.message || err);
    return cachedLogs;
  }
};

export const addLog = async (log: DowntimeLog): Promise<DowntimeLog> => {
  const res = await fetch(`${API_URL}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(log)
  });
  if (!res.ok) throw new Error('Failed to add log');
  return res.json();
};

export const clearLogs = async (pin?: string): Promise<{ success: boolean; devices?: Device[] }> => {
  const res = await fetch(`${API_URL}/logs`, { 
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  if (res.status === 401) throw new Error('Unauthorized: Invalid PIN');
  if (!res.ok) throw new Error('Failed to clear logs');
  const data = await res.json();
  cachedLogs = [];
  safeSetStorage('ns_cached_logs', []);
  if (Array.isArray(data.devices)) {
    cachedDevices = data.devices;
    safeSetStorage('ns_cached_devices', data.devices);
  }
  return data;
};

// --- MAIN CHECK FUNCTION ---

export const simulateHostStats = async (current: SystemStats): Promise<SystemStats> => {
  try {
      const res = await fetch(`${API_URL}/system-stats`, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.status === 429) {
        console.warn('[monitorService] 429 Rate limit on /api/system-stats - serving cached stats');
        return {
          ...current,
          ...(cachedHostStats || {}),
          internetStatus: 'ONLINE'
        };
      }
      if (res.ok) {
          const text = await res.text();
          try {
            const data = JSON.parse(text);
            cachedHostStats = data;
            return {
                ...current,
                ...data,
                internetStatus: 'ONLINE' // Assumed if we can reach backend
            };
          } catch (jsonErr) {
            console.warn(`Failed to parse host stats JSON. Response starts with: ${text.substring(0, 100)}`);
            return {
              ...current,
              ...(cachedHostStats || {}),
              internetStatus: 'ONLINE'
            };
          }
      } else {
        if (res.status >= 500 || res.status === 429) {
          console.warn(`[monitorService] Host stats fetch: HTTP ${res.status}`);
        } else {
          console.warn(`[monitorService] Host stats fetch: ${res.status} ${res.statusText}`);
        }
        if (cachedHostStats) {
          return {
            ...current,
            ...cachedHostStats,
            internetStatus: 'ONLINE'
          };
        }
      }
  } catch (e: any) {
    if (e && (e.message === "Failed to fetch" || e.name === "TypeError")) {
      console.warn("Telemetry polling: server currently not reachable", e.message);
    } else {
      console.warn("Telemetry polling note:", e?.message || e);
    }
  }
  
  // Fallback if backend fails - return cached stats or current stats to avoid flickering
  return {
    ...current,
    ...(cachedHostStats || {}),
    internetStatus: cachedHostStats ? 'ONLINE' : (typeof navigator !== 'undefined' && navigator.onLine ? 'ONLINE' : 'OFFLINE')
  };
};

export const sendLineDevicesSummary = async (payload: {
  deviceIds?: string[];
  customTitle?: string;
  remarksNote?: string;
  pin?: string;
}): Promise<{ success: boolean; message: string }> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (payload.pin) {
    headers['x-admin-pin'] = payload.pin;
  }
  const res = await fetch(`${API_URL}/line/notify-selection`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'เกิดข้อผิดพลาดในการส่ง LINE แจ้งเตือน');
  }
  return data;
};

export const sendWebhookDevicesSummary = async (payload: {
  deviceIds?: string[];
  customTitle?: string;
  remarksNote?: string;
  pin?: string;
}): Promise<{ success: boolean; message: string }> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (payload.pin) {
    headers['x-admin-pin'] = payload.pin;
  }
  const res = await fetch(`${API_URL}/webhook/notify-selection`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'เกิดข้อผิดพลาดในการส่ง Webhook (MS Teams) แจ้งเตือน');
  }
  return data;
};

// Keep for compatibility if needed, but it should fetch from API now
export const generateMockDevices = async (): Promise<Device[]> => {
    return getDevices();
};

