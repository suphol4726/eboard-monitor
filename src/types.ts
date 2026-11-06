
export enum DeviceType {
  SERVER = 'Server',
  SWITCH = 'Switch',
  ROUTER = 'Router',
  AP = 'Access Point',
  PRINTER = 'Printer',
  PC = 'PC/Laptop',
  CAMERA = 'IP Camera',
  EBOARD = 'E-Board',
  OTHER = 'Other'
}

export enum DeviceStatus {
  ONLINE = 'Online',
  OFFLINE = 'Offline',
  WARNING = 'High Latency' // > 100ms
}

export interface Device {
  id: string;
  ip: string;
  name: string;
  model: string;
  type: DeviceType;
  location: string;
  floor?: string; // Floor/ชั้น
  tags?: string[]; // Added tags for device grouping
  isMonitored: boolean;
  isMaintenance?: boolean; // Maintenance Mode toggle
  monitorPort?: number; // Optional TCP port to monitor (e.g. 80, 443)
  alertDelaySeconds?: number; // Added alert delay
  macAddress?: string; // Optional MAC Address for dynamic IP resolution
  statusReason?: string; // Reason for current status (e.g. IP conflict description)
  remarks?: string; // Note/Remark for device downtime or status (e.g. ปิดปรับปรุง, รอซ่อมจอ, ดับไฟห้อง)
  
  // Floor Map & Topology
  floorMapX?: number; // 0-100 percentage
  floorMapY?: number; // 0-100 percentage
  floorMapId?: string; // Floor identifier e.g. "building-1-f1"
  parentDeviceId?: string; // Parent node ID for topology tree
  
  // Dynamic State
  status: DeviceStatus;
  latency: number; // in ms
  latencyHistory?: { timestamp: string; value: number }[]; // Added latency history
  lastSeen: string; // ISO Date string
  packetLoss: number; // 0-100%
  lastStatusChange: string; // ISO Date string for uptime/downtime calculation
  
  // SLA Tracking
  totalUptimeSec?: number;
  totalDowntimeSec?: number;
  uptimePercentage?: number;
}

export interface DowntimeLog {
  id: string;
  deviceId: string;
  deviceName: string;
  ip: string;
  location: string;
  timestamp: string;
  durationSeconds?: number;
  type: 'OUTAGE' | 'RECOVERY' | 'HIGH_LATENCY';
  message: string;
  remarks?: string; // Note/Remark for downtimeเหตุการณ์
}

export interface AppSettings {
  // General
  systemName: string; // Custom System Name

  // Monitoring Config
  pingInterval: number; // seconds
  timeoutThreshold: number; // ms
  warningThreshold: number; // ms
  simulateNetwork: boolean; // Toggle for simulation mode

  // Data Retention & Storage
  logRetentionDays: number; // Auto-delete logs older than X days
  maxLogEntries: number; // Max number of logs to keep (FIFO)
  enableAutoDelete: boolean;

  // Notifications
  enableSoundAlerts: boolean;
  alertSoundUrl: string; // Custom sound URL
  alertWebhookUrl?: string; // Optional: for Slack/MS Teams/Custom Webhook
  lineNotifyToken?: string; // Optional: for LINE Notify integration
  lineUserId?: string; // Optional: for LINE Messaging API User ID
  telegramBotToken?: string; // Optional: for Telegram Bot
  telegramChatId?: string; // Optional: for Telegram Chat ID
  discordWebhookUrl?: string; // Optional: for Discord Webhook
  notifyOutage?: boolean; // Send alert on OUTAGE
  notifyRecovery?: boolean; // Send alert on RECOVERY
  notifyWarning?: boolean; // Send alert on WARNING/latency
  enableLatencyLogs?: boolean; // Save latency warning events to logs

  // Security
  adminPin: string; // PIN for unlocking settings
  hasAdminPin?: boolean; // Flag to check if PIN is set on server
  hasLineNotifyToken?: boolean;
  hasLineUserId?: boolean;
  hasTelegramBotToken?: boolean;
  hasTelegramChatId?: boolean;
  hasDiscordWebhookUrl?: boolean;
  hasSmtpPass?: boolean;
  hasSmtpUser?: boolean;

  // Reports & Automation
  enableScheduledReports: boolean;
  reportScheduleTime: string; // HH:mm format
  reportRecipientEmail?: string;

  // LINE Flex Message Scheduled Summary
  enableLineInstantAlerts?: boolean; // Send real-time event alerts to LINE
  enableLineSummaryReport?: boolean;
  lineSummaryType?: 'daily' | 'monthly' | 'both';
  lineSummaryTime?: string; // e.g. '16:30'
  lineSummaryMonthlyDay?: number; // e.g. 1

  // SMTP Configuration (Optional for sending reports)
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  gasWebAppUrl?: string;
  enableGasSync?: boolean;
  syncDevicesToGas?: boolean;
  syncLogsToGas?: boolean;
}

export interface DashboardStats {
  total: number;
  online: number;
  offline: number;
  avgLatency: number;
  avgSla: number;
}

export interface SystemStats {
  cpuUsage: number;
  ramUsage: number;
  ramTotal: number;
  diskUsage: number; // Percentage
  diskTotal: string; // e.g. "512 GB"
  hostIp: string;
  os: string;
  uptime: number; // seconds
  internetStatus: 'ONLINE' | 'OFFLINE';
}

export type Language = 'EN' | 'TH';

export interface Translations {
  dashboard: string;
  deviceManagement: string;
  latencyMonitor: string;
  downtimeHistory: string;
  settings: string;
  totalDevices: string;
  online: string;
  offline: string;
  avgLatency: string;
  criticalDevices: string;
  liveLatency: string;
  lastUpdated: string;
  addDevice: string;
  searchPlaceholder: string;
  systemStatus: string;
  hostIp: string;
  cpuLoad: string;
  ramUsage: string;
  os: string;
}

/**
 * Normalize a floor value by stripping any leading "ชั้น", "Floor", "Fl." prefixes
 * (e.g. "ชั้น 2", "ชั้น ชั้น 2", "Floor 2", "2" -> "2")
 */
export function normalizeFloorValue(floor?: string): string {
  if (!floor) return '';
  return String(floor)
    .trim()
    .replace(/^(?:(?:ชั้น|floor|fl\.?)\s*)+/i, '')
    .trim();
}

/**
 * Format a floor string with a single "ชั้น " prefix (e.g. "2" or "ชั้น 2" -> "ชั้น 2")
 */
export function formatFloorLabel(floor?: string): string {
  const clean = normalizeFloorValue(floor);
  return clean ? `ชั้น ${clean}` : '';
}

/**
 * Format location and floor cleanly to avoid duplicate prefixes like 'อาคาร 2 ชั้น ชั้น'
 */
export function formatLocation(location?: string, floor?: string): string {
  const loc = (location || '').trim().replace(/ชั้น\s+ชั้น/g, 'ชั้น');
  const fl = normalizeFloorValue(floor);
  if (!loc && !fl) return '-';

  if (!loc) {
    return fl ? `ชั้น ${fl}` : '-';
  }
  if (!fl) {
    return loc;
  }

  // If location already contains this floor (e.g. "อาคาร 2 ชั้น 2", "อาคาร 2 ชั้น2", "อาคาร 2 Fl.2")
  if (loc.includes(`ชั้น ${fl}`) || loc.includes(`ชั้น${fl}`) || loc.includes(`Floor ${fl}`) || loc.includes(`Fl.${fl}`)) {
    return loc;
  }

  // If location ends with "ชั้น" (e.g. "อาคาร 2 ชั้น" or "อาคาร 2  ชั้น  ")
  if (/ชั้น\s*$/i.test(loc)) {
    return `${loc.replace(/(?:ชั้น\s*)+$/i, '').trim()} ชั้น ${fl}`;
  }

  return `${loc} ชั้น ${fl}`;
}

