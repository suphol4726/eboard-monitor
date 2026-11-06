// --- E-BOARD MONITOR SERVER v3.5.0 ---
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import ping from 'ping';
import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import checkDiskSpace from 'check-disk-space';
import crypto from 'crypto';
import net from 'net';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from "@google/genai";
import { execSync } from 'child_process';

// --- TYPES (Locally defined to avoid ESM import issues with Enums) ---
enum DeviceType {
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

enum DeviceStatus {
  ONLINE = 'Online',
  OFFLINE = 'Offline',
  WARNING = 'High Latency'
}

interface Device {
  id: string;
  ip: string;
  name: string;
  model: string;
  type: DeviceType;
  location: string;
  floor?: string;
  isMonitored: boolean;
  isMaintenance?: boolean;
  monitorPort?: number;
  status: DeviceStatus;
  latency: number;
  lastSeen: string;
  packetLoss: number;
  lastStatusChange: string;
  totalUptimeSec?: number;
  totalDowntimeSec?: number;
  uptimePercentage?: number;
  tags?: string[];
  latencyHistory?: { timestamp: string; value: number }[];
  alertDelaySeconds?: number;
  macAddress?: string;
  statusReason?: string;
  floorMapX?: number;
  floorMapY?: number;
  floorMapId?: string;
  parentDeviceId?: string;
  remarks?: string;
}

interface AppSettings {
  systemName: string;
  pingInterval: number;
  timeoutThreshold: number;
  warningThreshold: number;
  simulateNetwork: boolean;
  logRetentionDays: number;
  maxLogEntries: number;
  enableAutoDelete: boolean;
  enableSoundAlerts: boolean;
  alertSoundUrl: string;
  alertWebhookUrl?: string;
  adminPin: string;
  enableScheduledReports: boolean;
  reportScheduleTime: string;
  reportRecipientEmail?: string;
  enableLineInstantAlerts?: boolean;
  enableLineSummaryReport?: boolean;
  lineSummaryType?: 'daily' | 'monthly' | 'both';
  lineSummaryTime?: string;
  lineSummaryMonthlyDay?: number;
  lineNotifyToken?: string;
  lineUserId?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  discordWebhookUrl?: string;
  notifyOutage?: boolean;
  notifyRecovery?: boolean;
  notifyWarning?: boolean;
  enableLatencyLogs?: boolean;
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

interface DowntimeLog {
  id: string;
  deviceId: string;
  deviceName: string;
  ip: string;
  location: string;
  timestamp: string;
  durationSeconds?: number;
  type: 'OUTAGE' | 'RECOVERY' | 'HIGH_LATENCY';
  message: string;
  remarks?: string;
}

const app = express();

// --- MIDDLEWARE ---
app.use(compression());
app.use(cors());
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// AI Summary Endpoint (Secure)
app.post('/api/ai/summary', async (req, res) => {
  const { devices, logs } = req.body || { devices: [], logs: [] };
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey.includes('ใส่รหัส') || apiKey.includes('API_KEY')) {
    console.warn("AI Warning: GEMINI_API_KEY is not configured. Falling back to local analysis.");
    return res.status(401).json({ 
      error: "GEMINI_API_KEY is missing. Please set it in the Settings menu of AI Studio to enable AI features." 
    });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const onlineCount = Array.isArray(devices) ? devices.filter((d: any) => d.status === 'Online').length : 0;
    const offlineCount = Array.isArray(devices) ? devices.filter((d: any) => d.status === 'Offline').length : 0;
    
    const recentLogs = Array.isArray(logs) ? logs.slice(0, 10).map((l: any) => `[${l.timestamp}] ${l.deviceName}: ${l.message}`).join('\n') : "No recent logs.";

    const prompt = `
      As an IT Network Administrator, provide a concise health summary for the IP Monitoring System.
      
      SYSTEM STATUS:
      - Total Devices: ${Array.isArray(devices) ? devices.length : 0}
      - Online: ${onlineCount}
      - Offline: ${offlineCount}
      
      RECENT INCIDENTS (Top 10):
      ${recentLogs}
      
      INSTRUCTIONS:
      1. Provide a professional summary of the current network state.
      2. Identify any critical patterns or recurring issues.
      3. Suggest immediate actions if necessary.
      4. RESPONSE MUST BE IN THAI LANGUAGE.
      5. Keep it professional and technical but easy to understand.
      6. Use professional HTML structure if possible. IMPORTANT: Use standard hex colors (e.g., #2563eb) for any styling instead of modern CSS color functions like oklch to ensure PDF compatibility.
      7. Max 150 words.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        maxOutputTokens: 500,
        temperature: 0.7,
      }
    });

    if (!response.text) {
      throw new Error("AI returned empty response");
    }

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("AI Error Details:", error);
    const errorMessage = error.message?.includes('API_KEY_INVALID') 
      ? "Invalid API Key. Please check your GEMINI_API_KEY configuration."
      : "Failed to generate AI summary. " + (error.message || "Unknown error");
    res.status(500).json({ error: errorMessage });
  }
});

app.get('/api/health', (_req, res) => {
  console.log('[API] Health check requested');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
const PORT = 3000;
const SETTINGS_FILE = path.join(process.cwd(), 'settings.json');
const LOGS_FILE = path.join(process.cwd(), 'logs.json');
const DEVICES_FILE = path.join(process.cwd(), 'devices.json');
const REPORTS_DIR = path.join(process.cwd(), 'reports');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  fs.ensureDirSync(REPORTS_DIR);
}

// --- ATOMIC JSON FILE PERSISTENCE & AUTO-RECOVERY ---
function writeJsonAtomicSync(filePath: string, data: any) {
  const tmpPath = `${filePath}.tmp`;
  const bakPath = `${filePath}.bak`;
  try {
    fs.writeJsonSync(tmpPath, data, { spaces: 2, encoding: 'utf8' });
    if (fs.existsSync(filePath)) {
      try {
        fs.copyFileSync(filePath, bakPath);
      } catch (_copyErr) {}
    }
    fs.moveSync(tmpPath, filePath, { overwrite: true });
  } catch (err) {
    console.error(`[Storage] Atomic write failed for ${path.basename(filePath)}:`, err);
    try {
      fs.writeJsonSync(filePath, data, { spaces: 2, encoding: 'utf8' });
    } catch (fallbackErr) {
      console.error(`[Storage] Fallback write also failed for ${path.basename(filePath)}:`, fallbackErr);
    }
  }
}

function readJsonSafeSync<T>(filePath: string, fallback: T): T {
  const bakPath = `${filePath}.bak`;
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
      if (content) {
        return JSON.parse(content) as T;
      }
    } catch (err) {
      console.warn(`[Storage] Primary file ${path.basename(filePath)} is corrupted, attempting recovery from .bak...`, err);
    }
  }
  if (fs.existsSync(bakPath)) {
    try {
      const bakContent = fs.readFileSync(bakPath, 'utf8').replace(/^\uFEFF/, '').trim();
      if (bakContent) {
        const recovered = JSON.parse(bakContent) as T;
        console.log(`[Storage] Successfully recovered ${path.basename(filePath)} from backup (.bak)`);
        writeJsonAtomicSync(filePath, recovered);
        return recovered;
      }
    } catch (bakErr) {
      console.error(`[Storage] Backup recovery failed for ${path.basename(filePath)}:`, bakErr);
    }
  }
  return fallback;
}

// Helper to run async tasks with bounded concurrency (prevents Windows process spawn storms)
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  const runners = Array.from({ length: workerCount }, async () => {
    while (true) {
      const idx = currentIndex++;
      if (idx >= items.length) break;
      results[idx] = await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
  return results;
}

// --- SETTINGS MANAGEMENT ---
let settings: AppSettings = {
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
  notifyOutage: false,
  notifyRecovery: false,
  notifyWarning: false,
  enableLatencyLogs: false,
  adminPin: '1234',
  enableScheduledReports: false,
  reportScheduleTime: '08:00',
  enableLineInstantAlerts: false,
  enableLineSummaryReport: false,
  lineSummaryType: 'daily',
  lineSummaryTime: '16:30',
  lineSummaryMonthlyDay: 1,
  gasWebAppUrl: '',
  enableGasSync: false,
  syncDevicesToGas: true,
  syncLogsToGas: true
};

// Load settings on start (with automatic .bak recovery)
const loadedSettings = readJsonSafeSync<Partial<AppSettings> | null>(SETTINGS_FILE, null);
if (loadedSettings && typeof loadedSettings === 'object') {
  if (loadedSettings.systemName === 'E-Broad') {
    loadedSettings.systemName = 'E-Board';
  }
  settings = { ...settings, ...loadedSettings, simulateNetwork: false };
}

function sanitizePublicSettings(src: AppSettings) {
  const publicSettings: any = { ...src };
  publicSettings.hasAdminPin = !!src.adminPin && src.adminPin !== '';
  publicSettings.hasLineNotifyToken = !!src.lineNotifyToken && src.lineNotifyToken !== '';
  publicSettings.hasLineUserId = !!src.lineUserId && src.lineUserId !== '';
  publicSettings.hasTelegramBotToken = !!src.telegramBotToken && src.telegramBotToken !== '';
  publicSettings.hasTelegramChatId = !!src.telegramChatId && src.telegramChatId !== '';
  publicSettings.hasDiscordWebhookUrl = !!src.discordWebhookUrl && src.discordWebhookUrl !== '';
  publicSettings.hasSmtpPass = !!src.smtpPass && src.smtpPass !== '';
  publicSettings.hasSmtpUser = !!src.smtpUser && src.smtpUser !== '';

  delete publicSettings.adminPin;
  delete publicSettings.lineNotifyToken;
  delete publicSettings.lineUserId;
  delete publicSettings.telegramBotToken;
  delete publicSettings.telegramChatId;
  delete publicSettings.discordWebhookUrl;
  delete publicSettings.smtpPass;
  delete publicSettings.smtpUser;
  return publicSettings;
}

// --- PIN BRUTE-FORCE PROTECTION ---
const pinAttemptsMap = new Map<string, { count: number; lockUntil: number; lastAttempt: number }>();
const PIN_MAX_ATTEMPTS = 10;
const PIN_LOCKOUT_MS = 60 * 1000; // 60 seconds cooldown

function getClientIp(req: express.Request): string {
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) return xff.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function verifyAdminPinRequest(req: express.Request): boolean {
  if (!settings.adminPin || settings.adminPin === '') return true;
  const headerPin = req.headers['x-admin-pin'];
  const providedPin =
    (typeof headerPin === 'string' && headerPin) ||
    (req.body && typeof req.body.pin === 'string' ? req.body.pin : '') ||
    (req.query && typeof req.query.pin === 'string' ? req.query.pin : '');
  return providedPin === settings.adminPin;
}

// --- LOGS MANAGEMENT ---
let logs: DowntimeLog[] = [];

const saveLogs = () => {
  pruneLogs(false);
  writeJsonAtomicSync(LOGS_FILE, logs);
};

// Smart log insertion with anti-spam deduplication & cooldown
function insertLogSmart(newLog: DowntimeLog): boolean {
  const nowMs = new Date(newLog.timestamp).getTime() || Date.now();
  const isConflictLog = Boolean(newLog.message && newLog.message.includes('IP Conflict'));
  const cooldownMs = isConflictLog ? 15 * 60 * 1000 : 120 * 1000; // 15 min for IP conflict, 2 min for rapid flap

  const existingIdx = logs.findIndex((l) => {
    if (l.deviceId !== newLog.deviceId || l.type !== newLog.type) return false;
    const prevMs = new Date(l.timestamp).getTime() || 0;
    return Math.abs(nowMs - prevMs) <= cooldownMs;
  });

  if (existingIdx !== -1) {
    const existing = logs[existingIdx];
    const matchRepeat = existing.message.match(/\(ซ้ำ x(\d+)\)$/);
    const nextCount = matchRepeat ? parseInt(matchRepeat[1], 10) + 1 : 2;
    const baseMsg = newLog.message.replace(/\s*\(ซ้ำ x\d+\)$/, '');
    const updated: DowntimeLog = {
      ...existing,
      ip: newLog.ip || existing.ip,
      timestamp: newLog.timestamp,
      message: `${baseMsg} (ซ้ำ x${nextCount})`,
      remarks: newLog.remarks ?? existing.remarks
    };
    logs.splice(existingIdx, 1);
    logs.unshift(updated);
    saveLogs();
    return false; // Coalesced into existing recent log; skip duplicate push notification
  }

  logs.unshift(newLog);
  saveLogs();
  return true;
}

const pruneReports = () => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) return;
    const files = fs.readdirSync(REPORTS_DIR).filter(f => f.endsWith('.pdf'));
    const retentionDays = settings.logRetentionDays || 30;
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    
    const fileStats = files.map(f => {
      const filePath = path.join(REPORTS_DIR, f);
      return { file: f, path: filePath, mtime: fs.statSync(filePath).mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);

    fileStats.forEach((item, index) => {
      if (item.mtime < cutoff || index >= 30) {
        try {
          fs.unlinkSync(item.path);
          console.log(`[Auto-Clean] Deleted old report file: ${item.file}`);
        } catch (e) {}
      }
    });
  } catch (e) {
    console.error('[Auto-Clean] Failed to prune reports:', e);
  }
};

const pruneLogs = (saveIfChanged = true) => {
  if (settings.enableAutoDelete) {
    let changed = false;
    const maxEntries = Number(settings.maxLogEntries) || 500;
    if (maxEntries > 0 && logs.length > maxEntries) {
      logs = logs.slice(0, maxEntries);
      changed = true;
    }
    const retentionDays = Number(settings.logRetentionDays) || 0;
    if (retentionDays > 0) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - retentionDays);
      const originalLength = logs.length;
      logs = logs.filter(l => new Date(l.timestamp) > cutoff);
      if (logs.length !== originalLength) {
        changed = true;
      }
    }
    if (changed && saveIfChanged) {
      console.log(`[Log Auto-Delete] Pruned logs. New count: ${logs.length}`);
      saveLogs();
    }
    pruneReports();
  }
};

// Load logs on start (with automatic .bak recovery)
const loadedLogs = readJsonSafeSync<DowntimeLog[]>(LOGS_FILE, []);
if (Array.isArray(loadedLogs)) {
  logs = loadedLogs;
  setTimeout(pruneLogs, 1000);
}

app.get('/api/settings', (_req, res) => {
  res.json(sanitizePublicSettings(settings));
});

app.post('/api/verify-pin', (req, res) => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const record = pinAttemptsMap.get(clientIp);

  if (record && record.lockUntil > now) {
    const waitSec = Math.ceil((record.lockUntil - now) / 1000);
    return res.status(429).json({
      success: false,
      error: `ใส่รหัสผิดเกินจำนวนครั้ง กรุณารอ ${waitSec} วินาทีแล้วลองใหม่`
    });
  }

  const { pin } = req.body;
  if (!settings.adminPin || settings.adminPin === '' || pin === settings.adminPin) {
    pinAttemptsMap.delete(clientIp);
    return res.json({ success: true });
  }

  const currentCount = (record && (now - record.lastAttempt < PIN_LOCKOUT_MS)) ? record.count + 1 : 1;
  const lockUntil = currentCount >= PIN_MAX_ATTEMPTS ? now + PIN_LOCKOUT_MS : 0;
  pinAttemptsMap.set(clientIp, { count: currentCount, lockUntil, lastAttempt: now });

  res.status(401).json({ success: false, error: 'Invalid PIN' });
});

app.post('/api/settings', (req, res) => {
  const { pin, ...newSettings } = req.body;
  
  // Verify PIN before saving settings
  if (settings.adminPin && settings.adminPin !== '' && pin !== settings.adminPin) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }

  settings = { ...settings, ...newSettings };
  pruneLogs(); // Clean up logs immediately based on new/updated retention rules
  try {
    writeJsonAtomicSync(SETTINGS_FILE, settings);
    res.json(sanitizePublicSettings(settings));
  } catch (e) {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// --- RESTORE CONFIG API ---
app.post('/api/restore', (req, res) => {
  const { pin, settings: newSettings, devices: newDevices } = req.body;

  // Verify PIN if set
  if (settings.adminPin && settings.adminPin !== '' && pin !== settings.adminPin) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }

  if (!newSettings || !newDevices || !Array.isArray(newDevices)) {
    return res.status(400).json({ error: 'Invalid backup layout' });
  }

  try {
    // 1. Update settings
    settings = { ...settings, ...newSettings };
    writeJsonAtomicSync(SETTINGS_FILE, settings);

    // 2. Update devices
    devices = newDevices;
    writeJsonAtomicSync(DEVICES_FILE, devices);

    res.json({ success: true, settings: sanitizePublicSettings(settings), devices });
  } catch (e) {
    console.error('Failed to restore config:', e);
    res.status(500).json({ error: 'Failed to restore configuration on server' });
  }
});

// --- LOGS API ---
app.get('/api/logs', (_req, res) => {
  res.json(logs);
});

app.post('/api/logs', (req, res) => {
  const newLog: DowntimeLog = req.body;
  insertLogSmart(newLog);
  res.json(newLog);
});

app.post('/api/logs/cleanup', (req, res) => {
  if (!verifyAdminPinRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized: กรุณายืนยันรหัส PIN ผู้ดูแลระบบก่อนล้าง Log ขยะ' });
  }

  const originalCount = logs.length;
  const cleaned: DowntimeLog[] = [];
  const lastTypeByDevice = new Map<string, string>();

  // Traverse from oldest to newest so we keep genuine state transitions and drop IP Conflict / SIM / duplicate spam
  for (let i = logs.length - 1; i >= 0; i--) {
    const entry = logs[i];
    const msg = String(entry.message || '');
    if (msg.includes('IP Conflict') || msg.includes('[SIM]')) {
      continue;
    }
    const prevType = lastTypeByDevice.get(entry.deviceId);
    if (entry.deviceId !== 'system' && prevType === entry.type) {
      continue;
    }
    lastTypeByDevice.set(entry.deviceId, entry.type);
    cleaned.unshift(entry);
  }

  logs = cleaned;
  saveLogs();
  const removedCount = Math.max(0, originalCount - logs.length);
  console.log(`[Log Cleanup] Removed ${removedCount} noisy/conflict log entries. Remaining: ${logs.length}`);
  res.json({
    success: true,
    removedCount,
    remainingCount: logs.length,
    logs
  });
});

app.delete('/api/logs', (req, res) => {
  if (!verifyAdminPinRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }

  logs = [];
  saveLogs();

  // Reset status timers & SLA counters on all devices so offline duration cards start counting fresh
  const nowIso = new Date().toISOString();
  devices = devices.map(d => ({
    ...d,
    lastStatusChange: nowIso,
    lastSeen: nowIso,
    totalUptimeSec: 0,
    totalDowntimeSec: 0,
    uptimePercentage: d.status === DeviceStatus.OFFLINE ? 0 : 100,
    latencyHistory: []
  }));
  saveDevices();

  res.json({ success: true, devices });
});

// --- GOOGLE APPS SCRIPT (GAS) API ---
app.post('/api/gas/test', async (req, res) => {
  const { url } = req.body;

  const targetUrl = url || settings.gasWebAppUrl;
  if (!targetUrl || targetUrl.trim() === '') {
    return res.status(400).json({ error: 'กรุณาระบุ URL ของ Google Apps Script Web App' });
  }

  try {
    const payload = {
      type: 'event',
      event: {
        id: 'test-' + Date.now(),
        deviceId: 'system',
        deviceName: 'E-Board Node',
        ip: getLocalIpAddress(),
        location: 'Server Internal',
        timestamp: new Date().toISOString(),
        type: 'RECOVERY',
        message: 'เชื่อมต่อกับ Google Apps Script Web App สำเร็จ! (ระบบทดสอบ)'
      }
    };

    console.log(`[GAS Test] Sending test payload to: ${targetUrl}`);
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    if (response.ok) {
      res.json({ success: true, message: 'ส่งข้อมูลทดสอบไปยัง GAS สำเร็จ', details: text });
    } else {
      res.status(response.status).json({ error: `GAS Web App ตอบกลับด้วยสถานะ ${response.status}`, details: text });
    }
  } catch (e: any) {
    console.error('[GAS Test] Connection failed:', e);
    res.status(500).json({ error: 'ไม่สามารถเชื่อมต่อกับ GAS Web App ได้', details: e.message || String(e) });
  }
});

app.post('/api/gas/sync', async (_req, res) => {
  if (!settings.gasWebAppUrl || settings.gasWebAppUrl.trim() === '') {
    return res.status(400).json({ error: 'กรุณาตั้งค่า URL ของ Google Apps Script Web App ก่อนซิงก์ข้อมูล' });
  }

  try {
    const payload = {
      type: 'sync',
      devices: devices.map(d => ({
        id: d.id,
        name: d.name,
        ip: d.ip,
        model: d.model || '',
        type: d.type,
        location: d.location,
        status: d.status,
        latency: d.latency,
        uptimePercentage: d.uptimePercentage || 100,
        lastSeen: d.lastSeen
      })),
      logs: logs.slice(0, 100).map(l => ({
        id: l.id,
        timestamp: l.timestamp,
        deviceName: l.deviceName,
        ip: l.ip,
        location: l.location,
        type: l.type,
        message: l.message
      }))
    };

    console.log(`[GAS Sync] Syncing ${devices.length} devices and ${payload.logs.length} logs to GAS`);
    const response = await fetch(settings.gasWebAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    if (response.ok) {
      res.json({ success: true, message: 'ซิงก์ข้อมูลทั้งหมดไปยัง Google Sheet สำเร็จ', details: text });
    } else {
      res.status(response.status).json({ error: `GAS Web App ตอบกลับด้วยสถานะ ${response.status}`, details: text });
    }
  } catch (e: any) {
    console.error('[GAS Sync] Sync failed:', e);
    res.status(500).json({ error: 'ไม่สามารถซิงก์ข้อมูลกับ GAS Web App ได้', details: e.message || String(e) });
  }
});

// --- TELEGRAM TEST API ---
app.post('/api/telegram/test', async (req, res) => {
  const { botToken, chatId } = req.body;
  const token = botToken || settings.telegramBotToken;
  const chat = chatId || settings.telegramChatId;

  if (!token || !chat) {
    return res.status(400).json({ error: 'กรุณาระบุ Telegram Bot Token และ Chat ID' });
  }

  try {
    const text = `<b>🛡️ ${settings.systemName || 'E-Board'} Test Notification</b>\n` +
                 `<b>สถานะ:</b> 🧪 ทดสอบระบบ\n` +
                 `<b>ข้อความ:</b> Connection to Telegram Bot is working properly!\n` +
                 `<b>เวลา:</b> ${new Date().toLocaleString('th-TH')}`;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: 'HTML' })
    });

    const data = await response.json();
    if (response.ok && data.ok) {
      res.json({ success: true, message: 'ส่งข้อความทดสอบไปยัง Telegram สำเร็จ!' });
    } else {
      res.status(400).json({ error: `Telegram API error: ${data.description || 'Unknown error'}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: 'ไม่สามารถส่งข้อความ Telegram ได้: ' + (e.message || String(e)) });
  }
});

// --- DISCORD TEST API ---
app.post('/api/discord/test', async (req, res) => {
  const { webhookUrl } = req.body;
  const url = webhookUrl || settings.discordWebhookUrl;

  if (!url) {
    return res.status(400).json({ error: 'กรุณาระบุ Discord Webhook URL' });
  }

  try {
    const embed = {
      title: `🛡️ ${settings.systemName || 'E-Board'} - Discord Notification Test`,
      description: '🧪 การเชื่อมต่อกับ Discord Webhook ทำงานได้อย่างถูกต้อง!',
      color: 3066993, // Green
      fields: [
        { name: 'สถานะ', value: '🟢 Success', inline: true },
        { name: 'IP โฮสต์', value: `\`${getLocalIpAddress()}\``, inline: true },
        { name: 'เวลาทดสอบ', value: new Date().toLocaleString('th-TH') }
      ],
      footer: { text: `${settings.systemName || 'E-Board'} System Test` },
      timestamp: new Date().toISOString()
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (response.ok) {
      res.json({ success: true, message: 'ส่งข้อความทดสอบไปยัง Discord Webhook สำเร็จ!' });
    } else {
      const text = await response.text();
      res.status(400).json({ error: `Discord Webhook ตอบกลับด้วยสถานะ ${response.status}: ${text}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: 'ไม่สามารถส่งข้อความ Discord ได้: ' + (e.message || String(e)) });
  }
});

// --- GENERIC / MS TEAMS / SLACK WEBHOOK TEST API ---
app.post('/api/webhook/test', async (req, res) => {
  const { webhookUrl } = req.body;
  const url = webhookUrl || settings.alertWebhookUrl;

  if (!url) {
    return res.status(400).json({ error: 'กรุณาระบุ Webhook URL ก่อนทดสอบ' });
  }

  try {
    const bkk = getBangkokTimeInfo();
    const formattedDate = bkk.fullFormatted || new Date().toLocaleString('th-TH');

    const cardBody: any[] = [
      // 1. School Branding Header with Logo & System Name
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "auto",
            verticalContentAlignment: "Center",
            items: [
              {
                type: "Image",
                url: SCHOOL_LOGO_URL,
                width: "78px",
                altText: "School Logo"
              }
            ]
          },
          {
            type: "Column",
            width: "stretch",
            verticalContentAlignment: "Center",
            items: [
              {
                type: "TextBlock",
                text: `🛡️ ${settings.systemName || 'E-Board'} Monitor`,
                weight: "Bolder",
                size: "Small",
                color: "Accent",
                wrap: true
              },
              {
                type: "TextBlock",
                text: `⏰ ${formattedDate}`,
                size: "Small",
                isSubtle: true,
                spacing: "None",
                wrap: true
              }
            ]
          }
        ]
      },
      // 2. Title Section (Full width to avoid mobile text wrapping)
      {
        type: "Container",
        separator: true,
        spacing: "Small",
        items: [
          {
            type: "TextBlock",
            text: "🧪 ทดสอบระบบแจ้งเตือน Microsoft Teams",
            weight: "Bolder",
            size: "Medium",
            color: "Good",
            wrap: true
          }
        ]
      },
      // 3. Main Detail Container
      {
        type: "Container",
        spacing: "Small",
        items: [
          {
            type: "Container",
            style: "default",
            items: [
              {
                type: "TextBlock",
                text: "🖥️ **อุปกรณ์ทดสอบ (Smart Board 75\")**",
                size: "Medium",
                weight: "Bolder",
                color: "Good",
                wrap: true
              }
            ]
          },
          {
            type: "FactSet",
            spacing: "Small",
            facts: [
              { title: "IP:", value: getLocalIpAddress() },
              { title: "สถานที่:", value: "ห้องเซิร์ฟเวอร์หลัก / ศูนย์เทคโนโลยี" },
              { title: "รุ่น:", value: "Smart Board 75\" 4K Pro" },
              { title: "สถานะ:", value: "🟢 เชื่อมต่อสำเร็จ (Connected)" },
              { title: "ผลทดสอบ:", value: "การส่งข้อมูล Adaptive Card ไปยัง Microsoft Teams ทำงานสมบูรณ์" }
            ]
          }
        ]
      },
      // 4. Footer
      {
        type: "TextBlock",
        text: `@ 2026 ${settings.systemName || 'E-Board'} • Network Monitoring`,
        size: "Small",
        isSubtle: true,
        horizontalAlignment: "Center",
        spacing: "Medium"
      }
    ];

    const payload = {
      type: "message",
      text: `🧪 [ทดสอบการเชื่อมต่อ] ${settings.systemName || 'E-Board'} Webhook Test - สำเร็จ!`,
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.2",
            body: cardBody
          }
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.ok || response.status === 200 || response.status === 202) {
      res.json({ success: true, message: 'ส่งการ์ดแจ้งเตือนทดสอบไปยัง Microsoft Teams สำเร็จ!' });
    } else {
      const text = await response.text();
      res.status(400).json({ error: `Webhook ตอบกลับด้วยสถานะ ${response.status}: ${text}` });
    }
  } catch (e: any) {
    res.status(500).json({ error: 'ไม่สามารถส่งข้อความ Webhook ได้: ' + (e.message || String(e)) });
  }
});

// Helper to format Bangkok / Thailand time reliably
function getBangkokTimeInfo() {
  const now = new Date();
  const thaiYear = now.getFullYear() + 543;
  
  let timeStr = '00:00';
  let dateStr = '';
  let dayNum = 1;
  let monthStr = '';
  let fullFormatted = '';

  try {
    const timeParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);
    
    timeStr = timeParts.substring(0, 5); // "HH:mm"
    
    const dateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(now); // "YYYY-MM-DD"
    
    dateStr = dateParts;
    monthStr = dateParts.substring(0, 7); // "YYYY-MM"

    const dayParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric'
    }).format(now);
    dayNum = parseInt(dayParts, 10) || 1;

    const thaiDate = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(now);

    fullFormatted = `${thaiDate} น.`;
  } catch (e) {
    const hours = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    const secs = now.getSeconds().toString().padStart(2, '0');
    timeStr = `${hours}:${mins}`;
    dateStr = now.toISOString().split('T')[0];
    monthStr = dateStr.substring(0, 7);
    dayNum = now.getDate();
    fullFormatted = `${now.getDate()}/${now.getMonth() + 1}/${thaiYear} ${hours}:${mins}:${secs} น.`;
  }

  return { timeStr, dateStr, dayNum, monthStr, fullFormatted };
}

// --- LINE TEST SUMMARY REPORT & ALERT APIS ---
app.post('/api/line/test-summary', async (req, res) => {
  try {
    const { token, userId } = req.body || {};
    const activeToken = (token && token.trim() !== '' && token !== '********') ? token.trim() : (settings.lineNotifyToken || '').trim();
    const activeUserId = (userId && userId.trim() !== '' && userId !== '********') ? userId.trim() : (settings.lineUserId || '').trim();

    if (!activeToken || !activeUserId) {
      console.warn('[API /api/line/test-summary] Missing LINE token or userId');
      return res.status(400).json({ 
        error: 'กรุณาระบุ Channel Access Token และ User ID ในหน้าตั้งค่า LINE ให้ครบถ้วนก่อนทดสอบ',
        code: 'LINE_NOT_CONFIGURED'
      });
    }

    const result = await sendLineSummaryFlexMessage(true, '🧪 [ทดสอบ] รายงานสรุปสถานะจอ : E-Board', activeToken, activeUserId);
    res.json({ success: true, message: result.message || 'ส่งรายงานสรุปสถานะจอ : E-Board ไปยัง LINE สำเร็จ!' });
  } catch (e: any) {
    console.warn('[API /api/line/test-summary] Error sending test summary:', e?.message || e);
    res.status(400).json({ error: e.message || 'เกิดข้อผิดพลาดในการส่ง LINE Flex Message' });
  }
});

app.post('/api/line/test-alert', async (req, res) => {
  try {
    const { token, userId } = req.body || {};
    const activeToken = (token && token.trim() !== '' && token !== '********') ? token.trim() : (settings.lineNotifyToken || '').trim();
    const activeUserId = (userId && userId.trim() !== '' && userId !== '********') ? userId.trim() : (settings.lineUserId || '').trim();

    if (!activeToken || !activeUserId) {
      console.warn('[API /api/line/test-alert] Missing LINE token or userId');
      return res.status(400).json({ 
        error: 'กรุณาระบุ Channel Access Token และ User ID ในหน้าตั้งค่า LINE ให้ครบถ้วนก่อนทดสอบ',
        code: 'LINE_NOT_CONFIGURED'
      });
    }

    const dummyLog: DowntimeLog = {
      id: 'test-' + Date.now(),
      deviceId: 'test',
      deviceName: 'อุปกรณ์ทดสอบ (Test Device)',
      ip: '192.168.1.1',
      location: 'ห้องเซิร์ฟเวอร์หลัก',
      timestamp: new Date().toISOString(),
      type: 'OUTAGE',
      message: 'Connection timed out (ทดสอบระบบแจ้งเตือน)'
    };
    await sendLineBotMessage(dummyLog, activeToken, activeUserId);
    res.json({ success: true, message: 'ส่งการแจ้งเตือนเหตุการณ์ทดสอบไปที่ LINE สำเร็จ!' });
  } catch (e: any) {
    console.warn('[API /api/line/test-alert] Error sending test alert:', e?.message || e);
    res.status(400).json({ error: e.message || 'เกิดข้อผิดพลาดในการส่ง LINE Alert' });
  }
});

// --- LINE NOTIFY SELECTED DEVICES API ---
let lastLineSelectionNotifyTime = 0;

app.post('/api/line/notify-selection', async (req, res) => {
  try {
    const pin = (req.headers['x-admin-pin'] as string) || req.body?.pin;
    if (settings.adminPin && settings.adminPin !== '' && pin !== settings.adminPin) {
      return res.status(401).json({ error: 'Unauthorized: จำเป็นต้องยืนยันรหัส PIN ผู้ดูแลระบบก่อนส่งการแจ้งเตือน' });
    }

    const now = Date.now();
    if (now - lastLineSelectionNotifyTime < 4000) {
      const waitSec = Math.ceil((4000 - (now - lastLineSelectionNotifyTime)) / 1000);
      return res.status(429).json({ error: `กรุณารอ ${waitSec} วินาทีก่อนส่งแจ้งเตือน LINE อีกครั้ง เพื่อป้องกันการส่งซ้ำ` });
    }

    const { deviceIds, customTitle, remarksNote, token, userId } = req.body || {};

    const activeToken = (token && token.trim() !== '' && token !== '********') ? token.trim() : (settings.lineNotifyToken || '').trim();
    const activeUserId = (userId && userId.trim() !== '' && userId !== '********') ? userId.trim() : (settings.lineUserId || '').trim();

    if (!activeToken || !activeUserId) {
      console.warn('[API /api/line/notify-selection] Selection notification cancelled: LINE Token or User ID is not configured');
      return res.status(400).json({ 
        error: 'กรุณาระบุ Channel Access Token และ User ID ในหน้าตั้งค่า LINE ก่อนใช้งานส่งแจ้งเตือน',
        code: 'LINE_NOT_CONFIGURED'
      });
    }

    let targetDevices: Device[] = [];
    if (Array.isArray(deviceIds) && deviceIds.length > 0) {
      targetDevices = devices.filter(d => deviceIds.includes(d.id));
    } else {
      targetDevices = devices.filter(d => d.isMonitored && !d.isMaintenance);
    }

    if (targetDevices.length === 0) {
      return res.status(400).json({ error: 'ไม่พบอุปกรณ์ที่ต้องการส่งแจ้งเตือน' });
    }

    lastLineSelectionNotifyTime = now;
    const result = await sendLineCustomSelectionFlexMessage(targetDevices, customTitle, remarksNote, activeToken, activeUserId);
    res.json(result);
  } catch (e: any) {
    console.warn('[API /api/line/notify-selection] Error sending selection to LINE:', e?.message || e);
    res.status(400).json({ error: e.message || 'เกิดข้อผิดพลาดในการส่งแจ้งเตือนไปที่ LINE' });
  }
});

// --- WEBHOOK / MS TEAMS NOTIFY SELECTED DEVICES API ---
let lastWebhookSelectionNotifyTime = 0;

app.post('/api/webhook/notify-selection', async (req, res) => {
  try {
    const pin = (req.headers['x-admin-pin'] as string) || req.body?.pin;
    if (settings.adminPin && settings.adminPin !== '' && pin !== settings.adminPin) {
      return res.status(401).json({ error: 'Unauthorized: จำเป็นต้องยืนยันรหัส PIN ผู้ดูแลระบบก่อนส่งการแจ้งเตือน' });
    }

    const now = Date.now();
    if (now - lastWebhookSelectionNotifyTime < 3000) {
      const waitSec = Math.ceil((3000 - (now - lastWebhookSelectionNotifyTime)) / 1000);
      return res.status(429).json({ error: `กรุณารอ ${waitSec} วินาทีก่อนส่งแจ้งเตือน Webhook อีกครั้ง เพื่อป้องกันการส่งซ้ำ` });
    }

    const { deviceIds, customTitle, remarksNote, webhookUrl } = req.body || {};
    const url = (webhookUrl && webhookUrl.trim() !== '' && webhookUrl !== '********') ? webhookUrl.trim() : (settings.alertWebhookUrl || '').trim();

    if (!url) {
      console.warn('[API /api/webhook/notify-selection] Cancelled: Webhook URL is not configured');
      return res.status(400).json({ 
        error: 'กรุณาระบุ Webhook URL (Microsoft Teams / Power Automate) ในหน้าตั้งค่าก่อนใช้งานส่งแจ้งเตือน',
        code: 'WEBHOOK_NOT_CONFIGURED'
      });
    }

    let targetDevices: Device[] = [];
    if (Array.isArray(deviceIds) && deviceIds.length > 0) {
      targetDevices = devices.filter(d => deviceIds.includes(d.id));
    } else {
      targetDevices = devices.filter(d => d.isMonitored && !d.isMaintenance);
    }

    if (targetDevices.length === 0) {
      return res.status(400).json({ error: 'ไม่พบอุปกรณ์ที่ต้องการส่งแจ้งเตือน' });
    }

    lastWebhookSelectionNotifyTime = now;
    const result = await sendWebhookCustomSelectionCard(targetDevices, customTitle, remarksNote, url);
    res.json(result);
  } catch (e: any) {
    console.warn('[API /api/webhook/notify-selection] Error sending selection to Webhook:', e?.message || e);
    res.status(400).json({ error: e.message || 'เกิดข้อผิดพลาดในการส่งแจ้งเตือนไปที่ Webhook (MS Teams)' });
  }
});

// --- SUBNET AUTO-SCANNER & MAC-FIRST MATCHER API (10.80.80.*) ---
app.post('/api/scan-subnet', async (req, res) => {
  const {
    startIp = '10.80.80.1',
    endIp = '10.80.80.254',
    timeoutMs = 550,
    mode = 'registered_mac_only', // 'registered_mac_only' | 'all_subnet'
    autoSyncMatched = true
  } = req.body || {};

  if (!startIp || !endIp) {
    return res.status(400).json({ error: 'กรุณาระบุ IP เริ่มต้น และ IP สิ้นสุด' });
  }

  const ipToInt = (ipStr: string) => {
    return ipStr.trim().split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  };

  const intToIp = (intVal: number) => {
    return [(intVal >>> 24) & 255, (intVal >>> 16) & 255, (intVal >>> 8) & 255, intVal & 255].join('.');
  };

  try {
    // In 'registered_mac_only' mode, sweep both 10.80.80.1 - 10.80.81.254 (/23 school subnet)
    const effectiveStartIp = mode === 'registered_mac_only' ? '10.80.80.1' : startIp;
    const effectiveEndIp = mode === 'registered_mac_only' ? '10.80.81.254' : endIp;

    const startInt = ipToInt(effectiveStartIp);
    const endInt = ipToInt(effectiveEndIp);

    if (isNaN(startInt) || isNaN(endInt) || startInt > endInt) {
      return res.status(400).json({ error: 'ช่วง IP ไม่ถูกต้อง (IP เริ่มต้นต้องน้อยกว่าหรือเท่ากับ IP สิ้นสุด)' });
    }

    const rangeSize = endInt - startInt + 1;
    if (rangeSize > 512) {
      return res.status(400).json({ error: 'อนุญาตให้สแกนได้สูงสุด 512 IP ต่อครั้ง เพื่อความรวดเร็วและป้องกันระบบโหลดหนัก' });
    }

    const ipList: string[] = [];
    for (let i = startInt; i <= endInt; i++) {
      const candidateIp = intToIp(i);
      if (!candidateIp.endsWith('.0') && !candidateIp.endsWith('.255')) {
        ipList.push(candidateIp);
      }
    }

    const timeoutSec = Math.max(0.3, timeoutMs / 1000);
    const isWindows = process.platform === 'win32';
    const alivePingMap = new Map<string, number>();

    // 1. Sweep ping across the IP range (max 48 concurrent) to wake up ARP cache and measure latency
    await runWithConcurrency(ipList, 48, async (ip) => {
      try {
        const pingOptions: any = {
          timeout: timeoutSec,
          extra: isWindows ? ['-n', '1', '-w', String(timeoutMs)] : ['-c', '1', '-W', String(Math.ceil(timeoutSec))]
        };
        const result = await ping.promise.probe(ip, pingOptions);
        if (result.alive) {
          const latency = Math.max(1, Math.round(parseFloat(String(result.time)) || 1));
          alivePingMap.set(ip, latency);
        }
      } catch (_e) {}
    });

    // 2. Read fresh system ARP table after the ping sweep
    const { macToIp, ipToMac } = getArpTableDetails();

    // Also include any IPs in 10.80.*.* that appeared in the ARP table even if they blocked ICMP ping
    for (const [arpIp] of ipToMac.entries()) {
      if (arpIp.startsWith('10.80.') && !alivePingMap.has(arpIp)) {
        const arpInt = ipToInt(arpIp);
        if (arpInt >= startInt && arpInt <= endInt) {
          alivePingMap.set(arpIp, 1);
        }
      }
    }

    const nowIso = new Date().toISOString();
    let devicesUpdatedOnDisk = false;
    let ipUpdatedCount = 0;
    let newlyOnlineCount = 0;

    // Build lookup of existing system devices by normalized MAC
    const systemDeviceByMac = new Map<string, Device>();
    for (const d of devices) {
      if (d.macAddress) {
        const norm = normalizeMac(d.macAddress);
        if (norm.length === 12) {
          systemDeviceByMac.set(norm, d);
        }
      }
    }

    const discoveredResults: any[] = [];
    const matchedDeviceIds = new Set<string>();

    // 3. First pass: Match strictly by MAC address from ARP table in 10.80.*.*
    for (const [normMac, dev] of systemDeviceByMac.entries()) {
      const arpIp = macToIp.get(normMac);
      if (arpIp && arpIp.startsWith('10.80.')) {
        const latency = alivePingMap.get(arpIp) ?? 1;
        const previousIp = dev.ip;
        const ipChanged = Boolean(previousIp !== arpIp);
        const wasOffline = dev.status === DeviceStatus.OFFLINE;

        if (autoSyncMatched) {
          if (ipChanged) {
            console.log(`[MAC Scan Sync] Updating IP for "${dev.name}" (MAC: ${dev.macAddress}) from ${previousIp} -> ${arpIp}`);
            dev.ip = arpIp;
            ipUpdatedCount++;
            devicesUpdatedOnDisk = true;
          }
          if (wasOffline) {
            dev.status = DeviceStatus.ONLINE;
            dev.lastStatusChange = nowIso;
            newlyOnlineCount++;
            devicesUpdatedOnDisk = true;
          }
          dev.latency = latency;
          dev.packetLoss = 0;
          dev.lastSeen = nowIso;
          dev.statusReason = undefined;
          devicesUpdatedOnDisk = true;
        }

        matchedDeviceIds.add(dev.id);
        discoveredResults.push({
          ip: arpIp,
          previousIp: ipChanged ? previousIp : undefined,
          ipChanged,
          macAddress: formatMacColon(normMac),
          matchedBy: 'MAC',
          alive: true,
          latency,
          deviceId: dev.id,
          suggestedName: dev.name,
          suggestedType: dev.type,
          suggestedLocation: dev.location,
          floor: dev.floor,
          model: dev.model,
          isAlreadyInSystem: true,
          wasOffline
        });
      }
    }

    // 4. Second pass: Check alive IPs in 10.80.*.* for system devices matched by IP (or unregistered devices if mode === 'all_subnet')
    const sortedAliveIps = Array.from(alivePingMap.keys()).sort((a, b) => ipToInt(a) - ipToInt(b));
    for (const ip of sortedAliveIps) {
      if (!ip.startsWith('10.80.') && mode === 'registered_mac_only') continue;

      const latency = alivePingMap.get(ip) || 1;
      const arpNormMac = ipToMac.get(ip);
      const formattedArpMac = arpNormMac ? formatMacColon(arpNormMac) : undefined;

      // Skip if this IP was already matched in the MAC pass above
      if (discoveredResults.some(r => r.ip === ip)) continue;

      // Check if an existing device in the system has this IP (and wasn't already matched by another MAC)
      const existingByIp = devices.find(d => d.ip === ip && !matchedDeviceIds.has(d.id));
      if (existingByIp) {
        // If existing device has a configured MAC AND ARP reports a DIFFERENT MAC at this IP, do not falsely match by IP
        const existingNormMac = existingByIp.macAddress ? normalizeMac(existingByIp.macAddress) : '';
        if (existingNormMac && arpNormMac && existingNormMac !== arpNormMac) {
          continue;
        }

        const wasOffline = existingByIp.status === DeviceStatus.OFFLINE;
        if (autoSyncMatched) {
          if (!existingNormMac && formattedArpMac) {
            existingByIp.macAddress = formattedArpMac;
            devicesUpdatedOnDisk = true;
          }
          if (wasOffline) {
            existingByIp.status = DeviceStatus.ONLINE;
            existingByIp.lastStatusChange = nowIso;
            newlyOnlineCount++;
            devicesUpdatedOnDisk = true;
          }
          existingByIp.latency = latency;
          existingByIp.packetLoss = 0;
          existingByIp.lastSeen = nowIso;
          devicesUpdatedOnDisk = true;
        }

        matchedDeviceIds.add(existingByIp.id);
        discoveredResults.push({
          ip,
          ipChanged: false,
          macAddress: existingByIp.macAddress || formattedArpMac || '-',
          matchedBy: existingNormMac && arpNormMac === existingNormMac ? 'MAC' : 'IP',
          alive: true,
          latency,
          deviceId: existingByIp.id,
          suggestedName: existingByIp.name,
          suggestedType: existingByIp.type,
          suggestedLocation: existingByIp.location,
          floor: existingByIp.floor,
          model: existingByIp.model,
          isAlreadyInSystem: true,
          wasOffline
        });
      } else if (mode === 'all_subnet') {
        const lastOctet = parseInt(ip.split('.')[3], 10);
        let suggestedType = DeviceType.EBOARD;
        if (lastOctet === 1 || lastOctet === 254) suggestedType = DeviceType.ROUTER;
        else if (lastOctet >= 2 && lastOctet <= 10) suggestedType = DeviceType.SWITCH;
        else if (lastOctet >= 11 && lastOctet <= 25) suggestedType = DeviceType.SERVER;

        discoveredResults.push({
          ip,
          ipChanged: false,
          macAddress: formattedArpMac || '-',
          matchedBy: 'NEW',
          alive: true,
          latency,
          suggestedName: `E-Board-${ip}`,
          suggestedType,
          suggestedLocation: 'อาคารหลัก',
          isAlreadyInSystem: false,
          wasOffline: false
        });
      }
    }

    if (devicesUpdatedOnDisk) {
      saveDevices();
    }

    res.json({
      success: true,
      mode,
      scannedCount: ipList.length,
      foundCount: discoveredResults.length,
      matchedSystemCount: discoveredResults.filter(r => r.isAlreadyInSystem).length,
      ipUpdatedCount,
      newlyOnlineCount,
      activeDevices: discoveredResults,
      devices: autoSyncMatched ? devices : undefined
    });
  } catch (error: any) {
    res.status(500).json({ error: 'การสแกน IP ล้มเหลว: ' + (error.message || String(error)) });
  }
});

// --- SYSTEM GIT / SELF-UPDATE API (1-CLICK UPDATE WITHOUT DATA LOSS) ---
function getGitCmd(): string {
  try {
    execSync('git --version', { encoding: 'utf-8', timeout: 3000 });
    return 'git';
  } catch (_e) {
    if (process.platform === 'win32') {
      const winCandidates = [
        'C:\\Program Files\\Git\\cmd\\git.exe',
        'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\Git\\cmd\\git.exe')
      ];
      for (const candidate of winCandidates) {
        if (candidate && fs.existsSync(candidate)) {
          return `"${candidate}"`;
        }
      }
    }
    return 'git';
  }
}

app.get('/api/system/update-info', (_req, res) => {
  try {
    const gitCmd = getGitCmd();
    const gitDirExists = fs.existsSync(path.join(process.cwd(), '.git'));
    let remoteUrl = (settings as any).gitRepoUrl || 'https://github.com/suphol4726/eboard-monitor.git';
    let currentBranch = 'main';
    let lastCommit = '';

    if (gitDirExists) {
      try {
        const remoteOut = execSync(`${gitCmd} remote get-url origin`, { encoding: 'utf-8', timeout: 3000 }).trim();
        if (remoteOut) remoteUrl = remoteOut;
      } catch (_e) {}
      try {
        const branchOut = execSync(`${gitCmd} rev-parse --abbrev-ref HEAD`, { encoding: 'utf-8', timeout: 3000 }).trim();
        if (branchOut) currentBranch = branchOut;
      } catch (_e) {}
      try {
        const commitOut = execSync(`${gitCmd} log -1 --format="%h - %s (%cr)"`, { encoding: 'utf-8', timeout: 3000 }).trim();
        if (commitOut) lastCommit = commitOut;
      } catch (_e) {}
    }

    // Check 7-day rolling daily backups in .backup_data
    const backupDir = path.join(process.cwd(), '.backup_data');
    let dailyBackupsCount = 0;
    let latestDailyBackup = '';
    try {
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir).filter(f => f.startsWith('devices-') && f.endsWith('.json')).sort().reverse();
        dailyBackupsCount = files.length;
        if (files.length > 0) {
          latestDailyBackup = files[0].replace('devices-', '').replace('.json', '');
        }
      }
    } catch (_e) {}

    res.json({
      gitConfigured: Boolean(gitDirExists && remoteUrl),
      gitDirExists,
      remoteUrl,
      currentBranch,
      lastCommit,
      dailyBackupsCount,
      latestDailyBackup,
      platform: process.platform,
      cwd: process.cwd()
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

app.post('/api/system/self-update', async (req, res) => {
  const { repoUrl } = req.body || {};

  if (!verifyAdminPinRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized: รหัส PIN ไม่ถูกต้อง' });
  }

  // Save current data in memory before running any git or build commands
  const backupDevices = [...devices];
  const backupSettings = { ...settings };
  const backupLogs = [...logs];

  try {
    const gitCmd = getGitCmd();
    const targetRepo = (repoUrl || (settings as any).gitRepoUrl || 'https://github.com/suphol4726/eboard-monitor.git').trim();
    if (targetRepo) {
      (settings as any).gitRepoUrl = targetRepo;
      writeJsonAtomicSync(SETTINGS_FILE, settings);
    }

    const gitDirExists = fs.existsSync(path.join(process.cwd(), '.git'));
    if (!gitDirExists) {
      if (!targetRepo) {
        return res.status(400).json({
          error: 'ยังไม่ได้ผูก GitHub Repository URL กรุณาวางลิงก์ GitHub Repo ของโปรเจกต์นี้ในช่องด้านบนก่อนกดอัปเดต'
        });
      }
      execSync(`${gitCmd} init`, { encoding: 'utf-8', timeout: 10000 });
      execSync(`${gitCmd} remote add origin "${targetRepo}"`, { encoding: 'utf-8', timeout: 10000 });
    } else if (targetRepo) {
      try {
        execSync(`${gitCmd} remote set-url origin "${targetRepo}"`, { encoding: 'utf-8', timeout: 10000 });
      } catch (_e) {
        try {
          execSync(`${gitCmd} remote add origin "${targetRepo}"`, { encoding: 'utf-8', timeout: 10000 });
        } catch (_e2) {}
      }
    }

    // Verify remote origin exists
    let activeRemote = '';
    try {
      activeRemote = execSync(`${gitCmd} remote get-url origin`, { encoding: 'utf-8', timeout: 5000 }).trim();
    } catch (_e) {}

    if (!activeRemote) {
      return res.status(400).json({
        error: 'ไม่พบ GitHub Remote URL กรุณาระบุ URL ของ GitHub Repository ที่ซิงก์จาก AI Studio ก่อนกดอัปเดต'
      });
    }

    console.log(`[Self-Update] Fetching latest code from ${activeRemote}...`);
    execSync(`${gitCmd} fetch --all`, { encoding: 'utf-8', timeout: 60000 });

    // Determine remote default branch (main or master)
    let branch = 'main';
    try {
      const branches = execSync(`${gitCmd} branch -r`, { encoding: 'utf-8', timeout: 5000 });
      if (!branches.includes('origin/main') && branches.includes('origin/master')) {
        branch = 'master';
      }
    } catch (_e) {}

    execSync(`${gitCmd} reset --hard origin/${branch}`, { encoding: 'utf-8', timeout: 30000 });

    // Restore preserved data files immediately so local devices, settings, and logs are never lost
    writeJsonAtomicSync(DEVICES_FILE, backupDevices);
    writeJsonAtomicSync(SETTINGS_FILE, backupSettings);
    writeJsonAtomicSync(LOGS_FILE, backupLogs);

    console.log('[Self-Update] Installing dependencies & building production bundle...');
    try {
      const oldServerBundle = path.join(process.cwd(), 'dist', 'server.cjs');
      if (fs.existsSync(oldServerBundle)) {
        fs.unlinkSync(oldServerBundle);
      }
    } catch (_e) {}
    execSync('npm install --no-audit --no-fund', { encoding: 'utf-8', timeout: 180000 });
    execSync('npm run build', { encoding: 'utf-8', timeout: 180000 });

    // Ensure preserved data files are still intact after build
    writeJsonAtomicSync(DEVICES_FILE, backupDevices);
    writeJsonAtomicSync(SETTINGS_FILE, backupSettings);
    writeJsonAtomicSync(LOGS_FILE, backupLogs);

    res.json({
      success: true,
      message: 'อัปเดตโค้ดและ Build ระบบใหม่สำเร็จ! เซิร์ฟเวอร์กำลังรีสตาร์ตตัวเองอัตโนมัติใน 2 วินาที (ข้อมูลอุปกรณ์และการตั้งค่าเดิมอยู่ครบ 100%)'
    });

    setTimeout(() => {
      console.log('[Self-Update] Exiting process so PM2 restarts with the new build...');
      process.exit(0);
    }, 1500);
  } catch (err: any) {
    // Always restore user data files even if git/build failed
    writeJsonAtomicSync(DEVICES_FILE, backupDevices);
    writeJsonAtomicSync(SETTINGS_FILE, backupSettings);
    writeJsonAtomicSync(LOGS_FILE, backupLogs);
    console.error('[Self-Update] Failed:', err);
    res.status(500).json({
      error: 'การอัปเดตอัตโนมัติไม่สำเร็จ: ' + (err.stderr || err.message || String(err))
    });
  }
});

// --- RESTART API ---
app.post('/api/restart', (req, res) => {
  const { pin } = req.body;

  // Verify PIN if set
  if (settings.adminPin && settings.adminPin !== '' && pin !== settings.adminPin) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }

  console.log('[System] Restart command received. Sending success response and exiting in 1s...');
  res.json({ success: true, message: 'Server is restarting...' });

  setTimeout(() => {
    console.log('[System] Shutting down process to let PM2/Docker restart...');
    process.exit(0);
  }, 1000);
});

// --- IN-MEMORY DATABASE ---
let devices: Device[] = [];
const offlineSince = new Map<string, { startTime: number, alertSent: boolean }>(); // Updated offlineSince map

// Load devices on start (with automatic .bak recovery)
const loadedDevices = readJsonSafeSync<Device[] | null>(DEVICES_FILE, null);
if (Array.isArray(loadedDevices)) {
  devices = loadedDevices.filter(
    d => d.ip !== '1.1.1.1' && d.ip !== '8.8.8.8' && d.name !== 'Cloudflare DNS' && d.name !== 'Google DNS'
  );
} else {
  devices = [];
  writeJsonAtomicSync(DEVICES_FILE, devices);
}

let lastDevicesDiskSaveMs = Date.now();

const saveDevices = () => {
  lastDevicesDiskSaveMs = Date.now();
  writeJsonAtomicSync(DEVICES_FILE, devices);
};

// --- API ROUTES ---

// Lightweight live status endpoint (sends dynamic fields to keep all connected dashboards in sync)
app.get('/api/devices/live-status', (_req, res) => {
  const compact = devices.map(d => ({
    id: d.id,
    ip: d.ip,
    status: d.status,
    latency: d.latency,
    packetLoss: d.packetLoss,
    lastSeen: d.lastSeen,
    lastStatusChange: d.lastStatusChange,
    uptimePercentage: d.uptimePercentage,
    isMonitored: d.isMonitored,
    isMaintenance: d.isMaintenance,
    remarks: d.remarks,
    statusReason: d.statusReason
  }));
  res.json(compact);
});

app.get('/api/devices', (_req, res) => {
  res.json(devices);
});

app.post('/api/devices', (req, res) => {
  const { device: newDevice } = req.body;
  
  // Verify PIN
  if (!verifyAdminPinRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }

  // Basic validation
  if (!newDevice || !newDevice.name) {
    return res.status(400).json({ error: 'Missing Device Name' });
  }
  if (!newDevice.ip && !newDevice.macAddress) {
    return res.status(400).json({ error: 'Missing both IP and MAC address' });
  }

  // Immediately resolve IP from ARP table if MAC address is provided
  if (newDevice.macAddress) {
    const cleanMac = normalizeMac(newDevice.macAddress);
    newDevice.macAddress = formatMacColon(cleanMac);
    const { macToIp } = getArpTableDetails();
    const arpIp = macToIp.get(cleanMac);
    if (arpIp && arpIp.startsWith('10.80.')) {
      newDevice.ip = arpIp;
      newDevice.status = DeviceStatus.ONLINE;
      newDevice.lastSeen = new Date().toISOString();
    }
  }

  devices.push(newDevice);
  saveDevices();

  // Trigger an immediate monitoring & ARP check in background
  setTimeout(() => {
    runMonitoring().catch(() => {});
    if (!newDevice.ip) {
      runBackgroundSchoolArpSweep().catch(() => {});
    }
  }, 150);

  res.json(newDevice);
});

app.post('/api/devices/bulk-import', (req, res) => {
  const { pin, devices: importedList, mode = 'replace' } = req.body;

  // Verify PIN if adminPin is configured in settings
  if (settings.adminPin && settings.adminPin !== '' && pin !== settings.adminPin) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }

  if (!Array.isArray(importedList)) {
    return res.status(400).json({ error: 'devices must be an array' });
  }

  const nowIso = new Date().toISOString();
  const normalizedIncoming: Device[] = [];
  const usedIds = new Set<string>(mode === 'merge' ? devices.map(d => d.id) : []);

  for (const raw of importedList) {
    if (!raw || typeof raw !== 'object') continue;
    const cleanName = String(raw.name || '').trim();
    const cleanIp = String(raw.ip || '').trim();
    const cleanMac = raw.macAddress ? String(raw.macAddress).trim() : undefined;

    if (!cleanName || (!cleanIp && !cleanMac)) continue;

    let itemId = raw.id ? String(raw.id).trim() : '';
    if (!itemId || usedIds.has(itemId)) {
      itemId = generateUUID();
    }
    usedIds.add(itemId);

    normalizedIncoming.push({
      id: itemId,
      name: cleanName,
      ip: cleanIp,
      macAddress: cleanMac || undefined,
      model: raw.model ? String(raw.model).trim() : '',
      type: (raw.type as DeviceType) || DeviceType.EBOARD,
      location: raw.location ? String(raw.location).trim() : 'อาคารหลัก',
      floor: raw.floor !== undefined && raw.floor !== null && String(raw.floor).trim() !== '' ? String(raw.floor).trim() : undefined,
      isMonitored: raw.isMonitored !== undefined ? Boolean(raw.isMonitored) : true,
      isMaintenance: raw.isMaintenance !== undefined ? Boolean(raw.isMaintenance) : false,
      monitorPort: raw.monitorPort ? Number(raw.monitorPort) : undefined,
      status: (raw.status as DeviceStatus) || DeviceStatus.ONLINE,
      latency: typeof raw.latency === 'number' ? raw.latency : 0,
      packetLoss: typeof raw.packetLoss === 'number' ? raw.packetLoss : 0,
      lastSeen: raw.lastSeen || nowIso,
      lastStatusChange: raw.lastStatusChange || nowIso,
      totalUptimeSec: raw.totalUptimeSec || 0,
      totalDowntimeSec: raw.totalDowntimeSec || 0,
      uptimePercentage: raw.uptimePercentage !== undefined ? raw.uptimePercentage : 100,
      tags: Array.isArray(raw.tags) ? raw.tags : undefined,
      remarks: raw.remarks ? String(raw.remarks).trim() : undefined,
      floorMapX: raw.floorMapX,
      floorMapY: raw.floorMapY,
      floorMapId: raw.floorMapId,
      parentDeviceId: raw.parentDeviceId
    });
  }

  if (normalizedIncoming.length === 0) {
    return res.status(400).json({ error: 'ไม่พบรายการอุปกรณ์ที่ถูกต้องในไฟล์ที่นำเข้า' });
  }

  if (mode === 'replace') {
    devices = normalizedIncoming;
  } else {
    // Merge mode: update matching IP (or ID) and append new devices
    const merged = [...devices];
    for (const incoming of normalizedIncoming) {
      const existingIdx = merged.findIndex(
        d => (incoming.ip && d.ip === incoming.ip) || (incoming.id && d.id === incoming.id)
      );
      if (existingIdx !== -1) {
        merged[existingIdx] = {
          ...merged[existingIdx],
          ...incoming,
          id: merged[existingIdx].id // preserve existing ID
        };
      } else {
        merged.push(incoming);
      }
    }
    devices = merged;
  }

  saveDevices();
  console.log(`[API /api/devices/bulk-import] Imported ${normalizedIncoming.length} devices (mode: ${mode}). Total devices now: ${devices.length}`);
  res.json({
    success: true,
    importedCount: normalizedIncoming.length,
    count: devices.length,
    devices
  });
});

app.delete('/api/devices/bulk', (req, res) => {
  const { pin, ids } = req.body;
  
  // Verify PIN
  if (settings.adminPin && settings.adminPin !== '' && pin !== settings.adminPin) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }

  if (!Array.isArray(ids)) {
    return res.status(400).json({ error: 'ids must be an array' });
  }
  devices = devices.filter(d => !ids.includes(d.id));
  saveDevices();
  res.json({ success: true, count: ids.length });
});

app.put('/api/devices/bulk-update', (req, res) => {
  const { pin, ids, updates } = req.body;
  
  if (!Array.isArray(ids) || !updates || typeof updates !== 'object') {
    return res.status(400).json({ error: 'ids must be an array and updates must be an object' });
  }

  // Verify PIN if adminPin is configured in settings
  if (settings.adminPin && settings.adminPin !== '' && pin !== settings.adminPin) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }

  let updatedCount = 0;
  devices = devices.map(d => {
    if (ids.includes(d.id)) {
      updatedCount++;
      return { ...d, ...updates };
    }
    return d;
  });

  saveDevices();
  res.json({ success: true, count: updatedCount });
});

app.put('/api/devices/:id', (req, res) => {
  const { id } = req.params;
  const { device: updatedDevice } = req.body;
  
  // Verify PIN if adminPin is configured in settings
  if (!verifyAdminPinRequest(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }

  const index = devices.findIndex(d => d.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Device not found' });
  }

  if (updatedDevice && updatedDevice.macAddress) {
    const cleanMac = normalizeMac(updatedDevice.macAddress);
    updatedDevice.macAddress = formatMacColon(cleanMac);
    const { macToIp } = getArpTableDetails();
    const arpIp = macToIp.get(cleanMac);
    if (arpIp && arpIp.startsWith('10.80.')) {
      updatedDevice.ip = arpIp;
      updatedDevice.status = DeviceStatus.ONLINE;
      updatedDevice.statusReason = undefined;
    }
  }

  devices[index] = { ...devices[index], ...updatedDevice };
  saveDevices();
  setTimeout(() => {
    runMonitoring().catch(() => {});
  }, 150);
  res.json(devices[index]);
});

app.delete('/api/devices/:id', (req, res) => {
  const { id } = req.params;
  const { pin } = req.body;
  
  // Verify PIN
  if (settings.adminPin && settings.adminPin !== '' && pin !== settings.adminPin) {
    return res.status(401).json({ error: 'Unauthorized: Invalid PIN' });
  }

  devices = devices.filter(d => d.id !== id);
  saveDevices();
  res.json({ success: true });
});

app.post('/api/ping', async (req, res) => {
  const { ip, timeout } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP required' });

  // Default to 2 seconds if not provided, ensure it's a number
  const timeoutSec = (typeof timeout === 'number' && timeout > 0) ? timeout / 1000 : 2;

  try {
    const result = await ping.promise.probe(ip, {
      timeout: timeoutSec, 
    });
    
    res.json({
      alive: result.alive,
      time: result.time, // ms
      output: result.output
    });
  } catch (error) {
    console.error(`Ping error for ${ip}:`, error);
    res.status(500).json({ error: 'Ping failed', details: String(error) });
  }
});

// --- SYSTEM STATS MONITORING ---
let currentCpuUsage = 0;

function getCpuInfo() {
  const cpus = os.cpus();
  let user = 0;
  let nice = 0;
  let sys = 0;
  let idle = 0;
  let irq = 0;

  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }

  return {
    idle,
    total: user + nice + sys + idle + irq
  };
}

let startCpuInfo = getCpuInfo();

// Update CPU usage every 2 seconds
setInterval(() => {
  const endCpuInfo = getCpuInfo();
  const idleDiff = endCpuInfo.idle - startCpuInfo.idle;
  const totalDiff = endCpuInfo.total - startCpuInfo.total;
  
  if (totalDiff > 0) {
    const percentage = 100 - Math.round((100 * idleDiff) / totalDiff);
    currentCpuUsage = Math.max(0, Math.min(100, percentage));
  }
  
  startCpuInfo = endCpuInfo;
}, 2000);

app.get('/api/system-stats', async (_req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  
  let diskUsage = 0;
  let diskTotal = '0 GB';

  try {
    const drivePath = path.parse(process.cwd()).root || (process.platform === 'win32' ? 'C:\\' : '/');
    // 1. Primary: Node.js built-in native fs.statfsSync (works on Windows 11/Server without wmic.exe, Linux, macOS)
    if (typeof (fs as any).statfsSync === 'function') {
      const stats = (fs as any).statfsSync(drivePath);
      const totalBytes = Number(stats.bsize) * Number(stats.blocks);
      const freeBytes = Number(stats.bsize) * Number(stats.bavail ?? stats.bfree);
      if (totalBytes > 0) {
        diskUsage = Math.max(1, Math.round(((totalBytes - freeBytes) / totalBytes) * 100));
        const usedGb = Math.round((totalBytes - freeBytes) / (1024 * 1024 * 1024));
        const totalGb = Math.round(totalBytes / (1024 * 1024 * 1024));
        diskTotal = `${usedGb} / ${totalGb} GB`;
      }
    }
    // 2. Fallback: check-disk-space if statfsSync returned 0
    if (diskUsage === 0) {
      const diskFn = typeof checkDiskSpace === 'function' ? checkDiskSpace : (checkDiskSpace as any)?.default;
      if (typeof diskFn === 'function') {
        const disk = await diskFn(drivePath);
        if (disk && disk.size > 0) {
          diskUsage = Math.max(1, Math.round(((disk.size - disk.free) / disk.size) * 100));
          const usedGb = Math.round((disk.size - disk.free) / (1024 * 1024 * 1024));
          const totalGb = Math.round(disk.size / (1024 * 1024 * 1024));
          diskTotal = `${usedGb} / ${totalGb} GB`;
        }
      }
    }
  } catch (e) {
    console.error('Disk check failed:', e);
  }

  res.json({
    cpuUsage: currentCpuUsage,
    ramUsage: Math.round(((totalMem - freeMem) / (1024 * 1024 * 1024)) * 100) / 100, // Used GB with 2 decimals
    ramTotal: Math.round(totalMem / (1024 * 1024 * 1024)), // Total GB
    diskUsage,
    diskTotal,
    uptime: os.uptime(),
    hostIp: getLocalIpAddress(),
    os: `${os.type()} ${os.release()}`
  });
});

// Helper: Check if IPv4 is in RFC 6598 CGNAT range 100.64.0.0/10 (100.64.0.0 - 100.127.255.255)
// used by Cloudflare WARP / Zero Trust Tunnel / Tailscale
function isCgnatOrTunnelIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return false;
  if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true; // APIPA link-local
  if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true; // Benchmark / VPN
  return false;
}

function isPrivateClassBIp(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  const schoolLanCandidates: string[] = [];
  const classACandidates: string[] = [];
  const classCCandidates: string[] = [];
  const classBCandidates: string[] = [];
  const otherPhysicalCandidates: string[] = [];
  const tunnelCandidates: string[] = [];

  for (const name of Object.keys(interfaces)) {
    const lowerName = name.toLowerCase();
    // Identify virtual, container, or tunnel adapters (Cloudflare WARP, Tailscale, Docker, WSL, Hyper-V, VPN)
    const isVirtualOrTunnelAdapter =
      lowerName.includes('cloudflare') ||
      lowerName.includes('warp') ||
      lowerName.includes('tailscale') ||
      lowerName.includes('zerotier') ||
      lowerName.includes('tun') ||
      lowerName.includes('tap') ||
      lowerName.includes('wg') ||
      lowerName.includes('wireguard') ||
      lowerName.includes('docker') ||
      lowerName.includes('vethernet') ||
      lowerName.includes('wsl') ||
      lowerName.includes('vmware') ||
      lowerName.includes('vbox') ||
      lowerName.includes('virtual');

    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const addr = iface.address;
        if (addr.startsWith('169.254.') || addr.startsWith('127.')) continue;

        if (isCgnatOrTunnelIp(addr) || isVirtualOrTunnelAdapter) {
          tunnelCandidates.push(addr);
          continue;
        }

        if (addr.startsWith('10.80.')) {
          schoolLanCandidates.push(addr);
        } else if (addr.startsWith('10.')) {
          classACandidates.push(addr);
        } else if (addr.startsWith('192.168.')) {
          classCCandidates.push(addr);
        } else if (isPrivateClassBIp(addr)) {
          classBCandidates.push(addr);
        } else {
          otherPhysicalCandidates.push(addr);
        }
      }
    }
  }

  if (schoolLanCandidates.length > 0) return schoolLanCandidates[0];
  if (classACandidates.length > 0) return classACandidates[0];
  if (classCCandidates.length > 0) return classCCandidates[0];
  if (classBCandidates.length > 0) return classBCandidates[0];
  if (otherPhysicalCandidates.length > 0) return otherPhysicalCandidates[0];

  // If the server only exposes a Cloudflare WARP / CGNAT tunnel interface (e.g. 100.68.190.57),
  // label it with (Cloudflare) so the user knows it's the tunnel interface
  if (tunnelCandidates.length > 0) {
    return `${tunnelCandidates[0]} (Cloudflare)`;
  }
  return '10.80.80.10';
}

app.post('/api/report/test', async (_req, res) => {
  try {
    const filename = await generateServerPDFReport();
    await sendReportEmail(filename);
    res.json({ success: true, filename });
  } catch (e) {
    console.error('Test report failed:', e);
    res.status(500).json({ error: 'Failed to generate test report' });
  }
});

app.get('/api/reports', (_req, res) => {
  try {
    if (!fs.existsSync(REPORTS_DIR)) return res.json([]);
    const files = fs.readdirSync(REPORTS_DIR)
      .filter(f => f.endsWith('.pdf'))
      .map(f => ({
        name: f,
        size: fs.statSync(path.join(REPORTS_DIR, f)).size,
        date: fs.statSync(path.join(REPORTS_DIR, f)).mtime.toISOString()
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: 'Failed to list reports' });
  }
});

app.get('/api/reports/:filename', (req, res) => {
  const safeFilename = path.basename(req.params.filename || '');
  if (!safeFilename.endsWith('.pdf')) {
    return res.status(400).json({ error: 'Invalid report filename' });
  }
  const filePath = path.join(REPORTS_DIR, safeFilename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Report not found' });
  }
});

// --- SERVER-SIDE PDF GENERATION ---
async function generateServerPDFReport(): Promise<string> {
  const { jsPDF } = await import('jspdf');
  
  const doc = new jsPDF();
  const now = new Date();
  const dateStr = now.toLocaleString('th-TH');
  const summary = "AI Summary unavailable in scheduled reports (must be generated from frontend).";

  // Header
  doc.setFillColor(37, 99, 235); // Blue-600
  doc.rect(0, 0, 210, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text('IP MONITOR - SYSTEM REPORT', 15, 25);
  
  doc.setFontSize(10);
  doc.text(`Generated on: ${dateStr}`, 15, 33);
  doc.text(`System: ${settings.systemName}`, 160, 33);

  // AI Summary
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(14);
  doc.text('AI Health Summary', 15, 55);
  
  doc.setFontSize(10);
  const splitSummary = doc.splitTextToSize(summary, 180);
  doc.text(splitSummary, 15, 65);

  let currentY = 65 + (splitSummary.length * 5) + 10;

  // Device Status
  doc.setFontSize(14);
  doc.text('Device Status Overview', 15, currentY);
  currentY += 10;

  doc.setFontSize(9);
  doc.text('Name', 15, currentY);
  doc.text('IP Address', 60, currentY);
  doc.text('Status', 110, currentY);
  doc.text('Latency', 140, currentY);
  doc.text('SLA %', 170, currentY);
  
  currentY += 2;
  doc.line(15, currentY, 195, currentY);
  currentY += 6;

  devices.forEach((d) => {
    if (currentY > 270) {
      doc.addPage();
      currentY = 20;
    }
    doc.text(d.name.substring(0, 20), 15, currentY);
    doc.text(d.ip + (d.monitorPort ? `:${d.monitorPort}` : ''), 60, currentY);
    doc.text(d.status, 110, currentY);
    doc.text(`${d.latency}ms`, 140, currentY);
    doc.text(`${d.uptimePercentage || 100}%`, 170, currentY);
    currentY += 6;
  });

  const fileName = `IP_Monitor_Report_${now.toISOString().replace(/[:.]/g, '-')}.pdf`;
  const filePath = path.join(REPORTS_DIR, fileName);
  
  // Save to file
  const pdfOutput = doc.output('arraybuffer');
  fs.writeFileSync(filePath, Buffer.from(pdfOutput));
  
  return fileName;
}

// --- REAL EMAIL SENDING ---
async function sendReportEmail(filename: string) {
  if (!settings.reportRecipientEmail) return;
  
  console.log(`[Email] Attempting to send report ${filename} to ${settings.reportRecipientEmail}...`);
  
  const filePath = path.join(REPORTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.error(`[Email] Report file not found: ${filePath}`);
    return;
  }

  // Check if SMTP is configured
  if (!settings.smtpHost || !settings.smtpPort || !settings.smtpUser || !settings.smtpPass) {
    console.warn(`[Email] SMTP is not fully configured. Skipping actual email sending. Please configure SMTP in Settings.`);
    
    // Still log it as "simulated" in the history so the user knows why it didn't arrive
    const log: DowntimeLog = {
      id: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      }),
      deviceId: 'system',
      deviceName: 'Email Service',
      ip: '0.0.0.0',
      location: 'Internal',
      timestamp: new Date().toISOString(),
      type: 'RECOVERY',
      message: `Report ${filename} generated but NOT SENT (SMTP not configured).`
    };
    logs.unshift(log);
    saveLogs();
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465, // true for 465, false for other ports
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
    });

    await transporter.sendMail({
      from: settings.smtpFrom || settings.smtpUser,
      to: settings.reportRecipientEmail,
      subject: `[${settings.systemName}] Daily System Health Report - ${new Date().toLocaleDateString()}`,
      text: `Please find the attached system health report for ${settings.systemName}.\n\nGenerated on: ${new Date().toLocaleString()}`,
      attachments: [
        {
          filename: filename,
          path: filePath,
        },
      ],
    });

    console.log(`[Email] Report ${filename} sent successfully to ${settings.reportRecipientEmail}`);

    const log: DowntimeLog = {
      id: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      }),
      deviceId: 'system',
      deviceName: 'Email Service',
      ip: '0.0.0.0',
      location: 'Internal',
      timestamp: new Date().toISOString(),
      type: 'RECOVERY',
      message: `Report ${filename} sent to ${settings.reportRecipientEmail}`
    };
    logs.unshift(log);
    saveLogs();
  } catch (error) {
    console.error(`[Email] Failed to send email:`, error);
    
    const log: DowntimeLog = {
      id: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      }),
      deviceId: 'system',
      deviceName: 'Email Service',
      ip: '0.0.0.0',
      location: 'Internal',
      timestamp: new Date().toISOString(),
      type: 'OUTAGE',
      message: `Failed to send report ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
    logs.unshift(log);
    saveLogs();
  }
}

// --- UUID GENERATOR ---
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// --- MODEL STRING FORMATTER (CLEAN & COMPACT) ---
function formatCompactModel(model?: string, type?: string): string {
  if (!model || !model.trim() || model.trim() === '-') {
    return type || 'E-Board';
  }
  let str = model.trim();
  
  // Specific known vendor mappings
  if (/hisense/i.test(str)) return 'Hisense';
  if (/ktc/i.test(str)) return 'KTC';
  if (/samsung/i.test(str)) return 'Samsung';
  if (/lg\s+electronics/i.test(str)) return 'LG';
  if (/huawei/i.test(str)) return 'Huawei';
  if (/xiaomi/i.test(str)) return 'Xiaomi';
  if (/oppo/i.test(str)) return 'OPPO';
  if (/viewsonic/i.test(str)) return 'ViewSonic';
  if (/maxhub/i.test(str)) return 'MAXHUB';
  if (/newline/i.test(str)) return 'Newline';
  if (/clevertouch/i.test(str)) return 'Clevertouch';
  if (/promethean/i.test(str)) return 'Promethean';
  if (/benq/i.test(str)) return 'BenQ';
  if (/optoma/i.test(str)) return 'Optoma';

  // Remove common corporate suffixes that make strings unnecessarily long
  str = str.replace(/,\s*(co\.|company|ltd\.|limited|inc\.|corp\.|corporation)/gi, '')
           .replace(/\b(co\.|company|ltd\.|limited|inc\.|corp\.|corporation)\b/gi, '')
           .replace(/\b(visual technology|technology|communications|electronics|commercial display)\b/gi, '')
           .replace(/\s+/g, ' ')
           .trim();

  if (str.length > 24) {
    str = str.substring(0, 22) + '..';
  }

  return str || type || 'E-Board';
}

// --- WEBHOOK NOTIFICATION (MS TEAMS / POWER AUTOMATE / ADAPTIVE CARDS) ---
async function sendWebhook(log: DowntimeLog) {
  if (!settings.alertWebhookUrl || settings.alertWebhookUrl.trim() === '') return;
  try {
    const isOutage = log.type === 'OUTAGE';
    const isRecovery = log.type === 'RECOVERY';
    const statusColor = isOutage ? "Attention" : isRecovery ? "Good" : "Warning";

    // Shorten and localize status message
    let shortStatus = log.message;
    if (shortStatus.includes('Host unreachable')) shortStatus = 'ปิดเครื่อง / ไม่ตอบสนอง (Unreachable)';
    else if (shortStatus.includes('Host detected')) shortStatus = 'เปิดเครื่องทำงานปกติ (Online)';
    else if (shortStatus.includes('Connection timed out')) shortStatus = 'ปิดเครื่อง / หมดเวลาตอบกลับ (Timeout)';
    else if (shortStatus.includes('Connection restored')) shortStatus = 'เปิดเครื่องกลับมาทำงานปกติ (Restored)';

    const statusBadge = isOutage ? '🔴 ปิดเครื่อง / ขัดข้อง' : isRecovery ? '🟢 เปิดเครื่องทำงานปกติ' : '🟡 Latency สูงกว่าเกณฑ์';
    const titleText = isOutage 
      ? '🚨 แจ้งเตือน: จอปิดเครื่อง / ขัดข้อง' 
      : isRecovery 
        ? '✅ แจ้งเตือน: จอเปิดเครื่องทำงานปกติ' 
        : '⚠️ แจ้งเตือน: ค่า Latency สูงกว่าเกณฑ์';

    const matchedDevice = devices.find(d => d.id === log.deviceId || d.ip === log.ip);
    const displayLocation = formatLocation(log.location || matchedDevice?.location, matchedDevice?.floor);
    const displayModel = formatCompactModel(matchedDevice?.model, matchedDevice?.type);

    const bkk = getBangkokTimeInfo();
    const formattedDate = bkk.fullFormatted || new Date(log.timestamp).toLocaleString('th-TH');

    const cardBody: any[] = [
      // 1. Header Banner with School Logo & System Name
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "auto",
            verticalContentAlignment: "Center",
            items: [
              {
                type: "Image",
                url: SCHOOL_LOGO_URL,
                width: "78px",
                altText: "School Logo"
              }
            ]
          },
          {
            type: "Column",
            width: "stretch",
            verticalContentAlignment: "Center",
            items: [
              {
                type: "TextBlock",
                text: `🛡️ ${settings.systemName || 'E-Board'} Monitor`,
                weight: "Bolder",
                size: "Small",
                color: "Accent",
                wrap: true
              },
              {
                type: "TextBlock",
                text: `⏰ ${formattedDate}`,
                size: "Small",
                isSubtle: true,
                spacing: "None",
                wrap: true
              }
            ]
          }
        ]
      },
      // 2. Title Section (Full width)
      {
        type: "Container",
        separator: true,
        spacing: "Small",
        items: [
          {
            type: "TextBlock",
            text: titleText,
            weight: "Bolder",
            size: "Medium",
            color: statusColor,
            wrap: true
          }
        ]
      },
      // 3. Main Detail Container
      {
        type: "Container",
        spacing: "Small",
        items: [
          {
            type: "Container",
            style: isOutage ? "emphasis" : "default",
            items: [
              {
                type: "TextBlock",
                text: `🖥️ **${log.deviceName}**`,
                size: "Medium",
                weight: "Bolder",
                color: statusColor,
                wrap: true
              }
            ]
          },
          {
            type: "FactSet",
            spacing: "Small",
            facts: [
              { title: "IP:", value: log.ip },
              { title: "สถานที่:", value: displayLocation || '-' },
              { title: "รุ่น:", value: displayModel },
              { title: "สถานะ:", value: statusBadge },
              { title: "รายละเอียด:", value: shortStatus }
            ]
          }
        ]
      }
    ];

    // Optional Remarks
    if (log.remarks && log.remarks.trim()) {
      cardBody.push({
        type: "Container",
        style: "warning",
        spacing: "Small",
        items: [
          {
            type: "TextBlock",
            text: `📝 **หมายเหตุ:** ${log.remarks.trim()}`,
            wrap: true,
            color: "Warning",
            size: "Small"
          }
        ]
      });
    }

    // 4. Footer
    cardBody.push({
      type: "TextBlock",
      text: `@ 2026 ${settings.systemName || 'E-Board'} • Network Monitoring`,
      size: "Small",
      isSubtle: true,
      horizontalAlignment: "Center",
      spacing: "Medium"
    });

    const payload = {
      type: "message",
      text: `[${settings.systemName || 'E-Board'} ${isOutage ? '🔴 ปิดเครื่อง' : '🟢 เปิดเครื่อง'}] ${log.deviceName} (${log.ip}) - ${shortStatus}`,
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.2",
            body: cardBody
          }
        }
      ]
    };

    const response = await fetch(settings.alertWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorMsg = `Webhook failed with status ${response.status}: ${response.statusText}`;
      console.error(errorMsg);
      // Log to UI history
      const errorLog: DowntimeLog = {
        ...log,
        id: generateUUID(),
        type: 'OUTAGE',
        message: `Webhook Error: ${errorMsg}`
      };
      logs.unshift(errorLog);
      saveLogs();
    } else {
      console.log(`Webhook sent successfully to ${settings.alertWebhookUrl}`);
    }
  } catch (e) {
    const errorMsg = `Error sending webhook: ${e instanceof Error ? e.message : String(e)}`;
    console.error(errorMsg);
    // Log to UI history
    const errorLog: DowntimeLog = {
      ...log,
      id: generateUUID(),
      type: 'OUTAGE',
      message: `Webhook Error: ${errorMsg}`
    };
    logs.unshift(errorLog);
    saveLogs();
  }
}

// --- WEBHOOK CUSTOM SELECTION / ADAPTIVE CARD FOR MS TEAMS ---
async function sendWebhookCustomSelectionCard(
  targetDevices: Device[],
  customTitle?: string,
  _remarksNote?: string,
  webhookUrlOverride?: string
) {
  const url = (webhookUrlOverride && webhookUrlOverride.trim() !== '' && webhookUrlOverride !== '********') 
    ? webhookUrlOverride.trim() 
    : (settings.alertWebhookUrl || '').trim();

  if (!url) {
    throw new Error('กรุณาระบุ Webhook URL (Microsoft Teams / Power Automate) ในหน้าตั้งค่าก่อนใช้งาน');
  }

  const bkk = getBangkokTimeInfo();
  const formattedDate = bkk.fullFormatted;

  const onlineDevices = targetDevices.filter(d => d.status === DeviceStatus.ONLINE || d.status === DeviceStatus.WARNING);
  const offlineDevices = targetDevices.filter(d => d.status === DeviceStatus.OFFLINE);
  const totalCount = targetDevices.length;
  const offlineCount = offlineDevices.length;
  const onlineCount = onlineDevices.length;

  const title = customTitle || `📊 รายงานสถานะจอ ${settings.systemName || 'E-Board'} (${totalCount} เครื่อง)`;

  // Build list of device containers
  const deviceContainers: any[] = [];
  targetDevices.slice(0, 30).forEach(d => {
    const isOutage = d.status === DeviceStatus.OFFLINE;
    const devFacts: any[] = [
      { title: "IP:", value: `${d.ip}${d.monitorPort ? `:${d.monitorPort}` : ''}` },
      { title: "สถานที่:", value: formatLocation(d.location, d.floor) || '-' },
      { title: "รุ่น:", value: formatCompactModel(d.model, d.type) }
    ];

    if (d.remarks && d.remarks.trim()) {
      devFacts.push({ title: "หมายเหตุ:", value: d.remarks.trim() });
    }

    deviceContainers.push({
      type: "Container",
      style: isOutage ? "emphasis" : "default",
      spacing: "Small",
      separator: true,
      items: [
        {
          type: "ColumnSet",
          columns: [
            {
              type: "Column",
              width: "stretch",
              items: [
                {
                  type: "TextBlock",
                  text: `${isOutage ? '🔴' : '🟢'} **${d.name}**`,
                  size: "Medium",
                  weight: "Bolder",
                  color: isOutage ? "Attention" : "Good",
                  wrap: true
                }
              ]
            },
            {
              type: "Column",
              width: "auto",
              verticalContentAlignment: "Center",
              items: [
                {
                  type: "TextBlock",
                  text: isOutage ? "🔴 ปิดเครื่อง" : "🟢 เปิดเครื่อง",
                  size: "Small",
                  weight: "Bolder",
                  color: isOutage ? "Attention" : "Good",
                  wrap: false
                }
              ]
            }
          ]
        },
        {
          type: "FactSet",
          spacing: "Small",
          facts: devFacts
        }
      ]
    });
  });

  const cardBody: any[] = [
    // 1. Header Banner
    {
      type: "ColumnSet",
      columns: [
        {
          type: "Column",
          width: "auto",
          verticalContentAlignment: "Center",
          items: [
            {
              type: "Image",
              url: SCHOOL_LOGO_URL,
              width: "78px",
              altText: "School Logo"
            }
          ]
        },
        {
          type: "Column",
          width: "stretch",
          verticalContentAlignment: "Center",
          items: [
            {
              type: "TextBlock",
              text: `🛡️ ${settings.systemName || 'E-Board'} Monitor`,
              weight: "Bolder",
              size: "Small",
              color: "Accent",
              wrap: true
            },
            {
              type: "TextBlock",
              text: `⏰ ${formattedDate}`,
              size: "Small",
              isSubtle: true,
              spacing: "None",
              wrap: true
            }
          ]
        }
      ]
    },
    // 2. Title Section (Full width to avoid mobile text wrapping)
    {
      type: "Container",
      separator: true,
      spacing: "Small",
      items: [
        {
          type: "TextBlock",
          text: title,
          weight: "Bolder",
          size: "Medium",
          color: offlineCount > 0 ? "Attention" : "Good",
          wrap: true
        }
      ]
    },
    // 3. Summary Stat Bar
    {
      type: "ColumnSet",
      spacing: "Small",
      columns: [
        {
          type: "Column",
          width: "1",
          style: "default",
          items: [
            {
              type: "TextBlock",
              text: "ทั้งหมด",
              size: "Small",
              isSubtle: true,
              horizontalAlignment: "Center"
            },
            {
              type: "TextBlock",
              text: `${totalCount}`,
              size: "Large",
              weight: "Bolder",
              horizontalAlignment: "Center"
            }
          ]
        },
        {
          type: "Column",
          width: "1",
          style: "good",
          items: [
            {
              type: "TextBlock",
              text: "🟢 เปิดเครื่อง",
              size: "Small",
              color: "Good",
              weight: "Bolder",
              horizontalAlignment: "Center"
            },
            {
              type: "TextBlock",
              text: `${onlineCount}`,
              size: "Large",
              weight: "Bolder",
              color: "Good",
              horizontalAlignment: "Center"
            }
          ]
        },
        {
          type: "Column",
          width: "1",
          style: offlineCount > 0 ? "attention" : "default",
          items: [
            {
              type: "TextBlock",
              text: "🔴 ปิดเครื่อง",
              size: "Small",
              color: offlineCount > 0 ? "Attention" : "Default",
              weight: "Bolder",
              horizontalAlignment: "Center"
            },
            {
              type: "TextBlock",
              text: `${offlineCount}`,
              size: "Large",
              weight: "Bolder",
              color: offlineCount > 0 ? "Attention" : "Default",
              horizontalAlignment: "Center"
            }
          ]
        }
      ]
    },
    // 4. Device List
    ...deviceContainers,
    // 5. Footer
    {
      type: "TextBlock",
      text: `@ 2026 ${settings.systemName || 'E-Board'} • Network Monitoring`,
      size: "Small",
      isSubtle: true,
      horizontalAlignment: "Center",
      spacing: "Medium"
    }
  ];

  const payload = {
    type: "message",
    text: `[${settings.systemName || 'E-Board'}] ${title} - เปิด ${onlineCount}/${totalCount} เครื่อง (ปิด ${offlineCount} เครื่อง)`,
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.2",
          body: cardBody
        }
      }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok && response.status !== 200 && response.status !== 202) {
    const text = await response.text();
    throw new Error(`Webhook ตอบกลับด้วยสถานะ ${response.status}: ${text}`);
  }

  return {
    success: true,
    message: `ส่งรายงานสรุปไปยัง Webhook (MS Teams) สำเร็จ ${totalCount} เครื่อง!`
  };
}

// --- GOOGLE APPS SCRIPT WEBHOOK ---
async function sendGasWebhook(log: DowntimeLog) {
  if (!settings.enableGasSync || !settings.gasWebAppUrl || settings.gasWebAppUrl.trim() === '') return;
  
  try {
    const payload = {
      type: 'event',
      event: {
        id: log.id,
        deviceId: log.deviceId,
        deviceName: log.deviceName,
        ip: log.ip,
        location: log.location || '-',
        timestamp: log.timestamp,
        type: log.type,
        message: log.message
      }
    };

    console.log(`[GAS Sync] Auto-sending event to GAS: ${log.deviceName} is ${log.type}`);
    const response = await fetch(settings.gasWebAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      console.error(`[GAS Sync] Failed with status ${response.status}:`, await response.text());
    }
  } catch (e) {
    console.error('[GAS Sync] Error sending auto-event to GAS:', e);
  }
}

// --- LINE MESSAGING API NOTIFICATION ---
const SCHOOL_LOGO_URL = 'https://apps.e-spsm.online/psd/spsm/images/SWU_Prasanmit_Demonstration_Sec_TH_Color.png';

const lineLogoHero = () => ({
  type: 'image',
  url: SCHOOL_LOGO_URL,
  size: 'full',
  aspectRatio: '20:6',
  aspectMode: 'fit',
  backgroundColor: '#FFFFFF'
});

function lineChunks<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function splitLineText(text: string, maxLength = 2000): string[] {
  if (text.length <= maxLength) return [text];
  const lines = text.split('\n');
  const result: string[] = [];
  let current = '';
  for (const line of lines) {
    if ((current + '\n' + line).length > maxLength) {
      if (current) result.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) result.push(current);
  return result;
}

async function pushLineMessages(token: string, toUserId: string, messages: any[]) {
  const messageChunks = lineChunks(messages, 5);
  for (const chunk of messageChunks) {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        to: toUserId,
        messages: chunk
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`LINE API HTTP ${res.status}: ${errText}`);
    }
  }
}

function formatLocation(location?: string, floor?: string): string {
  const loc = (location || '').trim();
  let fl = (floor || '').trim();
  if (!loc && !fl) return '-';

  // Clean leading duplicate words like "ชั้น", "Floor", "Fl." from the floor string
  fl = fl.replace(/^(ชั้น|floor|fl\.?)\s*/i, '').trim();

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
    return `${loc.replace(/ชั้น\s*$/i, '').trim()} ชั้น ${fl}`;
  }

  return `${loc} ชั้น ${fl}`;
}

async function sendLineBotMessage(log: DowntimeLog, tokenOverride?: string, userIdOverride?: string) {
  const isTest = log.id && log.id.startsWith('test-');
  
  // Check if instant alerts are enabled (unless it's an explicit test)
  if (!isTest && settings.enableLineInstantAlerts === false) return;

  // Strictly filter: Only send for OUTAGE and RECOVERY
  if (!isTest && log.type === 'HIGH_LATENCY') return;
  
  const activeToken = (tokenOverride && tokenOverride.trim() !== '' && tokenOverride !== '********') ? tokenOverride.trim() : (settings.lineNotifyToken || '').trim();
  const activeUserId = (userIdOverride && userIdOverride.trim() !== '' && userIdOverride !== '********') ? userIdOverride.trim() : (settings.lineUserId || '').trim();

  if (!activeToken || !activeUserId) {
    if (isTest) {
      throw new Error('กรุณาระบุ Channel Access Token และ User ID ในหน้าตั้งค่า LINE ก่อนทำการทดสอบ');
    }
    return;
  }
  
  try {
    const bkk = getBangkokTimeInfo();
    const formattedDate = bkk.fullFormatted;
    
    // Shorten status message
    let shortStatus = log.message;
    if (shortStatus.includes('Host unreachable')) shortStatus = 'ปิดเครื่อง / ไม่ตอบสนอง (Unreachable)';
    else if (shortStatus.includes('Host detected')) shortStatus = 'เปิดเครื่องทำงานปกติ (Online)';
    else if (shortStatus.includes('Connection timed out')) shortStatus = 'ปิดเครื่อง / หมดเวลาตอบกลับ (Timeout)';
    else if (shortStatus.includes('Connection restored')) shortStatus = 'เปิดเครื่องกลับมาทำงานปกติ';
    
    const isOutage = log.type === 'OUTAGE';
    const statusLabel = isOutage ? '🔴 ปิดเครื่อง' : '🟢 เปิดเครื่อง';

    const matchedDevice = devices.find(d => d.id === log.deviceId || d.ip === log.ip);
    const displayLocation = formatLocation(log.location || matchedDevice?.location, matchedDevice?.floor);
    const displayModel = matchedDevice?.model || '-';
    
    // Modern High-Contrast Gradients
    const headerGradient = isOutage 
      ? { type: 'linearGradient', angle: '135deg', startColor: '#EF4444', endColor: '#B91C1C' } // Crimson Red
      : { type: 'linearGradient', angle: '135deg', startColor: '#10B981', endColor: '#047857' }; // Emerald Green

    const flexMessage = {
      type: 'flex',
      altText: `[E-Board ${statusLabel}] ${log.deviceName} (${log.ip}) - ${shortStatus}`,
      contents: {
        type: 'bubble',
        size: 'mega',
        hero: lineLogoHero(),
        header: {
          type: 'box',
          layout: 'vertical',
          paddingAll: 'lg',
          background: headerGradient,
          contents: [
            {
              type: 'text',
              text: '🛡️ E-BOARD MONITOR',
              weight: 'bold',
              color: isOutage ? '#FEE2E2' : '#D1FAE5',
              size: 'xxs'
            },
            {
              type: 'text',
              text: isOutage ? '🚨 แจ้งเตือน: จอปิดเครื่อง/ขัดข้อง' : '✅ แจ้งเตือน: จอเปิดเครื่องทำงานปกติ',
              weight: 'bold',
              color: '#FFFFFF',
              size: 'md',
              margin: 'xs'
            },
            {
              type: 'text',
              text: `เวลา: ${formattedDate}`,
              color: isOutage ? '#FECACA' : '#A7F3D0',
              size: 'xs',
              margin: 'xs'
            }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          paddingAll: 'lg',
          spacing: 'md',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: isOutage ? '#FEF2F2' : '#F0FDF4',
              borderColor: isOutage ? '#FCA5A5' : '#86EFAC',
              borderWidth: '1px',
              cornerRadius: 'lg',
              paddingAll: 'md',
              spacing: 'sm',
              contents: [
                {
                  type: 'text',
                  text: log.deviceName,
                  weight: 'bold',
                  size: 'md',
                  color: isOutage ? '#991B1B' : '#065F46',
                  wrap: true
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    { type: 'text', text: 'IP Address:', color: '#64748B', size: 'xs', flex: 2 },
                    { type: 'text', text: log.ip, color: '#0F172A', size: 'xs', weight: 'bold', flex: 5 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    { type: 'text', text: 'สถานที่:', color: '#64748B', size: 'xs', flex: 2 },
                    { type: 'text', text: displayLocation, color: '#0F172A', size: 'xs', flex: 5 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    { type: 'text', text: 'ผู้ผลิต/รุ่น:', color: '#64748B', size: 'xs', flex: 2 },
                    { type: 'text', text: displayModel, color: '#0F172A', size: 'xs', flex: 5 }
                  ]
                },
                {
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    { type: 'text', text: 'สถานะ:', color: '#64748B', size: 'xs', flex: 2 },
                    { type: 'text', text: shortStatus, color: isOutage ? '#DC2626' : '#059669', size: 'xs', weight: 'bold', flex: 5 }
                  ]
                },
                ...(log.remarks ? [{
                  type: 'box',
                  layout: 'baseline',
                  spacing: 'sm',
                  contents: [
                    { type: 'text', text: 'หมายเหตุ:', color: '#D97706', size: 'xs', flex: 2, weight: 'bold' },
                    { type: 'text', text: log.remarks, color: '#B45309', size: 'xs', weight: 'bold', flex: 5, wrap: true }
                  ]
                }] : [])
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          paddingAll: 'md',
          contents: [
            {
              type: 'text',
              text: `@ 2026 E-Board Monitoring System`,
              size: 'xxs',
              color: '#9CA3AF',
              align: 'center'
            }
          ]
        }
      }
    };
    
    console.log(`[LINE Bot] Sending Flex Alert Message to ${activeUserId}...`);
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeToken}`
      },
      body: JSON.stringify({
        to: activeUserId,
        messages: [flexMessage]
      })
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[LINE Bot] Flex alert rejected (${response.status}: ${errText}). Trying fallback text...`);
      
      // Fallback to text message
      let fallbackText = `🛡️ [E-Board Alert] [${isOutage ? '🔴 ปิดเครื่อง' : '🟢 เปิดเครื่อง'}]\n` +
        `จอ/อุปกรณ์: ${log.deviceName}\n` +
        `IP: ${log.ip}\n` +
        `สถานที่: ${displayLocation}\n` +
        (displayModel && displayModel !== '-' ? `ผู้ผลิต/รุ่น: ${displayModel}\n` : '') +
        `สถานะ: ${shortStatus}\n` +
        `เวลา: ${formattedDate}`;
      if (log.remarks) {
        fallbackText += `\nหมายเหตุ: ${log.remarks}`;
      }

      const textResponse = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          to: activeUserId,
          messages: [{ type: 'text', text: fallbackText }]
        })
      });

      if (!textResponse.ok) {
        const textErr = await textResponse.text();
        console.error(`[LINE Bot] Text fallback also failed (${textResponse.status}):`, textErr);
        if (isTest) {
          throw new Error(`LINE API ตอบกลับล้มเหลว (${response.status}): ${errText}`);
        }
      }
    }
  } catch (e: any) {
    console.error('[LINE Bot] Error sending message:', e);
    if (isTest) {
      throw e;
    }
  }
}

// --- TELEGRAM BOT NOTIFICATION ---
async function sendTelegramMessage(log: DowntimeLog) {
  if (!settings.telegramBotToken || !settings.telegramChatId || settings.telegramBotToken.trim() === '' || settings.telegramChatId.trim() === '') return;
  
  try {
    const isOutage = log.type === 'OUTAGE';
    const statusIcon = isOutage ? '🔴 OUTAGE' : '🟢 RECOVERY';
    const dateStr = new Date(log.timestamp).toLocaleString('th-TH');
    
    let text = `<b>🛡️ ${settings.systemName || 'E-Board'} Alert</b>\n` +
                 `<b>สถานะ:</b> ${statusIcon}\n` +
                 `<b>อุปกรณ์:</b> ${log.deviceName}\n` +
                 `<b>IP:</b> <code>${log.ip}</code>\n` +
                 `<b>สถานที่:</b> ${log.location || '-'}\n` +
                 `<b>รายละเอียด:</b> ${log.message}\n` +
                 `<b>เวลา:</b> ${dateStr}`;
    if (log.remarks) {
      text += `\n<b>หมายเหตุ:</b> <i>${log.remarks}</i>`;
    }

    const url = `https://api.telegram.org/bot${settings.telegramBotToken}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: settings.telegramChatId,
        text,
        parse_mode: 'HTML'
      })
    });

    if (!response.ok) {
      console.error(`[Telegram] Failed to send message (${response.status}):`, await response.text());
    } else {
      console.log(`[Telegram] Message sent successfully to Chat ID ${settings.telegramChatId}`);
    }
  } catch (e) {
    console.error('[Telegram] Error sending message:', e);
  }
}

// --- DISCORD WEBHOOK NOTIFICATION ---
async function sendDiscordMessage(log: DowntimeLog) {
  if (!settings.discordWebhookUrl || settings.discordWebhookUrl.trim() === '') return;

  try {
    const isOutage = log.type === 'OUTAGE';
    const color = isOutage ? 15158332 : 3066993; // Red or Green
    const statusText = isOutage ? '🔴 OUTAGE - อุปกรณ์ขัดข้อง' : '🟢 RECOVERY - เชื่อมต่อได้ปกติ';
    const dateStr = new Date(log.timestamp).toLocaleString('th-TH');

    const fields = [
      { name: 'อุปกรณ์ (Device)', value: log.deviceName, inline: true },
      { name: 'IP Address', value: `\`${log.ip}\``, inline: true },
      { name: 'สถานที่ (Location)', value: log.location || '-', inline: true },
      { name: 'ข้อความแจ้งเตือน', value: log.message },
      ...(log.remarks ? [{ name: 'หมายเหตุ (Remarks)', value: log.remarks }] : []),
      { name: 'เวลา (Timestamp)', value: dateStr }
    ];

    const embed = {
      title: `🛡️ ${settings.systemName || 'E-Board'} - Network Alert`,
      description: statusText,
      color: color,
      fields: fields,
      footer: { text: `${settings.systemName || 'E-Board'} System Alert` },
      timestamp: new Date().toISOString()
    };

    const response = await fetch(settings.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!response.ok) {
      console.error(`[Discord] Failed to send webhook (${response.status}):`, await response.text());
    } else {
      console.log(`[Discord] Webhook sent successfully`);
    }
  } catch (e) {
    console.error('[Discord] Error sending webhook:', e);
  }
}

// --- LINE MESSAGING API SCHEDULED SUMMARY FLEX MESSAGE (V2) ---
function lineDeviceListBubble(
  title: string,
  dateText: string,
  pageDevices: Device[],
  currentPage: number,
  totalPages: number
) {
  const rows = pageDevices.map(d => {
    const isOff = d.status === DeviceStatus.OFFLINE;
    return {
      type: 'box',
      layout: 'vertical',
      backgroundColor: isOff ? '#FEF2F2' : '#F0FDF4',
      borderColor: isOff ? '#FCA5A5' : '#86EFAC',
      borderWidth: '1px',
      cornerRadius: 'md',
      paddingAll: 'sm',
      margin: 'xs',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: `${isOff ? '🔴' : '🟢'} ${d.name}`,
              weight: 'bold',
              size: 'xs',
              color: isOff ? '#991B1B' : '#065F46',
              flex: 7,
              wrap: true
            },
            {
              type: 'text',
              text: isOff ? 'ปิดเครื่อง' : (d.status === DeviceStatus.WARNING ? '⚠️ ล่าช้า' : 'เปิดเครื่อง'),
              weight: 'bold',
              size: 'xxs',
              color: isOff ? '#DC2626' : (d.status === DeviceStatus.WARNING ? '#D97706' : '#059669'),
              align: 'end',
              flex: 3
            }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'xs',
          contents: [
            {
              type: 'text',
              text: `IP: ${d.ip}`,
              size: 'xxs',
              color: '#64748B',
              flex: 4
            },
            {
              type: 'text',
              text: formatLocation(d.location, d.floor),
              size: 'xxs',
              color: '#64748B',
              align: 'end',
              flex: 6
            }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'xs',
          contents: [
            {
              type: 'text',
              text: `ผู้ผลิต: ${d.model || '-'}`,
              size: 'xxs',
              color: '#475569',
              flex: 7
            },
            ...(d.type ? [{
              type: 'text',
              text: `${d.type}`,
              size: 'xxs',
              color: '#94A3B8',
              align: 'end',
              flex: 3
            }] : [])
          ]
        },
        ...(d.remarks ? [{
          type: 'box',
          layout: 'horizontal',
          margin: 'xs',
          contents: [
            {
              type: 'text',
              text: `📝 หมายเหตุ: ${d.remarks}`,
              size: 'xxs',
              color: '#B45309',
              wrap: true
            }
          ]
        }] : [])
      ]
    };
  });

  return {
    type: 'bubble',
    size: 'mega',
    hero: lineLogoHero(),
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'md',
      background: {
        type: 'linearGradient',
        angle: '135deg',
        startColor: '#2563EB',
        endColor: '#1E3A8A'
      },
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: title || '📋 รายการจอ E-Board',
              weight: 'bold',
              color: '#FFFFFF',
              size: 'sm',
              flex: 1
            },
            {
              type: 'text',
              text: `หน้า ${currentPage}/${totalPages}`,
              weight: 'bold',
              color: '#DBEAFE',
              size: 'xs',
              align: 'end'
            }
          ]
        },
        {
          type: 'text',
          text: `ประจำวันที่ ${dateText}`,
          color: '#BFDBFE',
          size: 'xxs',
          margin: 'xs'
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'md',
      contents: rows
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'sm',
      contents: [
        {
          type: 'text',
          text: `@ 2026 E-Board Monitoring System • หน้า ${currentPage} จาก ${totalPages}`,
          size: 'xxs',
          color: '#9CA3AF',
          align: 'center'
        }
      ]
    }
  };
}

function buildLineOverviewBubble(
  title: string,
  dateText: string,
  monitored: Device[],
  online: Device[],
  offline: Device[],
  uptimeRate: string,
  uptimeRateNumber: number,
  isTest: boolean
) {
  const totalCount = monitored.length;
  const onlineCount = online.length;
  const offlineCount = offline.length;

  const bodyContents: any[] = [
    // 3 Column KPI Stats Badges
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      margin: 'none',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          backgroundColor: '#F8FAFC',
          borderColor: '#CBD5E1',
          borderWidth: '1px',
          cornerRadius: 'md',
          paddingAll: 'sm',
          alignItems: 'center',
          contents: [
            { type: 'text', text: 'จากทั้งหมด', color: '#64748B', size: 'xxs', weight: 'bold' },
            { type: 'text', text: `${totalCount}`, color: '#0F172A', size: 'lg', weight: 'bold', margin: 'xs' }
          ]
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          backgroundColor: '#ECFDF5',
          borderColor: '#6EE7B7',
          borderWidth: '1px',
          cornerRadius: 'md',
          paddingAll: 'sm',
          alignItems: 'center',
          contents: [
            { type: 'text', text: '🟢 เปิดเครื่อง', color: '#047857', size: 'xxs', weight: 'bold' },
            { type: 'text', text: `${onlineCount}`, color: '#059669', size: 'lg', weight: 'bold', margin: 'xs' }
          ]
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          backgroundColor: offlineCount > 0 ? '#FEF2F2' : '#F8FAFC',
          borderColor: offlineCount > 0 ? '#FCA5A5' : '#CBD5E1',
          borderWidth: '1px',
          cornerRadius: 'md',
          paddingAll: 'sm',
          alignItems: 'center',
          contents: [
            { type: 'text', text: '🔴 ปิดเครื่อง', color: offlineCount > 0 ? '#B91C1C' : '#64748B', size: 'xxs', weight: 'bold' },
            { type: 'text', text: `${offlineCount}`, color: offlineCount > 0 ? '#DC2626' : '#64748B', size: 'lg', weight: 'bold', margin: 'xs' }
          ]
        }
      ]
    },
    // Uptime / SLA Bar Box
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      backgroundColor: '#F1F5F9',
      cornerRadius: 'md',
      paddingAll: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: 'ความเสถียรระบบ (SLA Uptime)', color: '#475569', size: 'xxs', weight: 'bold', flex: 1 },
            { type: 'text', text: `${uptimeRate}%`, color: uptimeRateNumber >= 95 ? '#059669' : (uptimeRateNumber >= 80 ? '#D97706' : '#DC2626'), size: 'xxs', weight: 'bold', align: 'end' }
          ]
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'xs',
          backgroundColor: '#E2E8F0',
          cornerRadius: 'xxl',
          height: '6px',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              backgroundColor: uptimeRateNumber >= 95 ? '#10B981' : (uptimeRateNumber >= 80 ? '#F59E0B' : '#EF4444'),
              cornerRadius: 'xxl',
              height: '6px',
              width: `${Math.max(uptimeRateNumber, 5)}%`,
              contents: []
            }
          ]
        }
      ]
    }
  ];

  if (offlineCount > 0) {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      backgroundColor: '#FEF2F2',
      borderColor: '#F87171',
      borderWidth: '1px',
      cornerRadius: 'lg',
      paddingAll: 'md',
      spacing: 'xs',
      contents: [
        {
          type: 'text',
          text: `🔴 พบเครื่องที่ปิด (${offlineCount} เครื่อง)`,
          weight: 'bold',
          size: 'xs',
          color: '#991B1B',
          margin: 'none'
        },
        { type: 'separator', margin: 'xs', color: '#FCA5A5' },
        ...offline.slice(0, 8).map(d => ({
          type: 'box',
          layout: 'baseline',
          spacing: 'sm',
          margin: 'xs',
          contents: [
            { type: 'text', text: '•', color: '#EF4444', size: 'xs', flex: 0 },
            { type: 'text', text: `${d.name} (${d.ip})${d.model ? ` [${d.model}]` : ''}${d.remarks ? ` [${d.remarks}]` : ''}`, size: 'xs', color: '#991B1B', weight: 'bold', wrap: true, flex: 5 },
            { type: 'text', text: formatLocation(d.location, d.floor), size: 'xs', color: '#7F1D1D', flex: 3, align: 'end' }
          ]
        }))
      ]
    });
  } else {
    bodyContents.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      backgroundColor: '#ECFDF5',
      borderColor: '#34D399',
      borderWidth: '1px',
      cornerRadius: 'lg',
      paddingAll: 'md',
      contents: [
        {
          type: 'text',
          text: '🎉 ทุกเครื่องเปิดใช้งานปกติ 100% (ไม่มีเครื่องปิด)',
          weight: 'bold',
          size: 'xs',
          color: '#065F46',
          align: 'center'
        }
      ]
    });
  }

  return {
    type: 'bubble',
    size: 'mega',
    hero: lineLogoHero(),
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      background: {
        type: 'linearGradient',
        angle: '135deg',
        startColor: '#2563EB',
        endColor: '#1E3A8A'
      },
      contents: [
        {
          type: 'text',
          text: '🛡️ E-BOARD MONITOR',
          weight: 'bold',
          color: '#DBEAFE',
          size: 'xxs'
        },
        {
          type: 'text',
          text: title,
          weight: 'bold',
          color: '#FFFFFF',
          size: 'md',
          margin: 'xs'
        },
        {
          type: 'text',
          text: `ประจำวันที่ ${dateText}`,
          color: '#BFDBFE',
          size: 'xs',
          margin: 'xs'
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'lg',
      spacing: 'none',
      contents: bodyContents
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      paddingAll: 'md',
      contents: [
        {
          type: 'text',
          text: `@ 2026 E-Board Monitoring System ${isTest ? '(ทดสอบระบบ)' : ''}`,
          size: 'xxs',
          color: '#9CA3AF',
          align: 'center'
        }
      ]
    }
  };
}

async function sendLineSummaryFlexMessage(
  isTest: boolean = false,
  customTitle?: string,
  tokenOverride?: string,
  userIdOverride?: string
) {
  const activeToken = (tokenOverride && tokenOverride.trim() !== '' && tokenOverride !== '********') ? tokenOverride.trim() : (settings.lineNotifyToken || '').trim();
  const activeUserId = (userIdOverride && userIdOverride.trim() !== '' && userIdOverride !== '********') ? userIdOverride.trim() : (settings.lineUserId || '').trim();

  if (!activeToken || !activeUserId) {
    throw new Error('กรุณาระบุ Channel Access Token และ User ID ในหน้าตั้งค่า LINE ให้ครบถ้วนก่อนใช้งาน');
  }

  const bkk = getBangkokTimeInfo();
  const dateText = bkk.fullFormatted;

  const monitored = devices.filter(
    device => device.isMonitored && !device.isMaintenance
  );

  const online = monitored.filter(
    device => device.status !== DeviceStatus.OFFLINE
  );

  const offline = monitored.filter(
    device => device.status === DeviceStatus.OFFLINE
  );

  const totalCount = monitored.length;
  const onlineCount = online.length;
  const offlineCount = offline.length;
  const uptimeRateNumber = totalCount > 0 ? (onlineCount / totalCount) * 100 : 100;
  const uptimeRate = uptimeRateNumber.toFixed(1);

  const title = customTitle || (isTest ? '🧪 รายงานสรุปสถานะจอ : E-Board (ทดสอบ)' : '📊 รายงานสรุปสถานะจอ : E-Board');

  // Overview Card
  const overview = buildLineOverviewBubble(
    title,
    dateText,
    monitored,
    online,
    offline,
    uptimeRate,
    uptimeRateNumber,
    isTest
  );

  // แบ่งรายการอุปกรณ์หน้าละ 16 เครื่อง
  const pages = lineChunks([...offline, ...online], 16);

  const flexMessages: any[] = [
    {
      type: 'flex',
      altText: `[รายงานสถานะ E-Board] ${title} - เปิดเครื่อง ${online.length}/${monitored.length} เครื่อง (SLA: ${uptimeRate}%)`,
      contents: overview
    },
    ...pages.map((pageDevices, index) => ({
      type: 'flex',
      altText: `[E-Board] รายการอุปกรณ์ หน้า ${index + 1}/${pages.length}`,
      contents: lineDeviceListBubble(
        title,
        dateText,
        pageDevices,
        index + 1,
        pages.length
      )
    }))
  ];

  try {
    console.log(`[LINE Summary] Pushing ${flexMessages.length} Flex Message(s) to ${activeUserId}...`);
    await pushLineMessages(
      activeToken,
      activeUserId,
      flexMessages
    );

    return {
      success: true,
      message: `ส่งรายงาน LINE สำเร็จ ${monitored.length} เครื่อง (${flexMessages.length} ข้อความ Flex Message พร้อมโลโก้โรงเรียน)`
    };
  } catch (flexError: any) {
    console.warn(`[LINE Summary] Flex Message rejected: ${flexError?.message || flexError}. Trying fallback text...`);

    // Fallback to text message
    const fallback =
      `🛡️ ${title}\n` +
      `📅 ประจำวันที่: ${dateText}\n\n` +
      `📊 สรุปภาพรวม:\n` +
      `• ทั้งหมด: ${totalCount} เครื่อง\n` +
      `• 🟢 เปิดเครื่อง: ${onlineCount} เครื่อง\n` +
      `• 🔴 ปิดเครื่อง: ${offlineCount} เครื่อง\n` +
      `• SLA Uptime: ${uptimeRate}%\n\n` +
      (offlineCount > 0
        ? `🔴 เครื่องที่ปิด (${offlineCount} เครื่อง):\n` +
          offline.map((d, i) => `${i + 1}. ${d.name} (${d.ip}) - ${formatLocation(d.location, d.floor)}${d.model ? ` [ผู้ผลิต: ${d.model}]` : ''}${d.remarks ? ` [${d.remarks}]` : ''}`).join('\n') + '\n\n'
        : '🎉 ทุกเครื่องเปิดใช้งานปกติ 100%\n\n') +
      `🟢 เครื่องที่เปิดใช้งาน (${onlineCount} เครื่อง):\n` +
      online.map((d, i) => `${i + 1}. ${d.name} (${d.ip}) - ${formatLocation(d.location, d.floor)}${d.model ? ` [ผู้ผลิต: ${d.model}]` : ''}`).join('\n');

    const textMessages = splitLineText(fallback).map(text => ({
      type: 'text',
      text
    }));

    await pushLineMessages(
      activeToken,
      activeUserId,
      textMessages
    );

    return {
      success: true,
      message: `ส่งรายงาน LINE แบบข้อความสำเร็จ (${monitored.length} เครื่อง)`
    };
  }
}

// --- LINE CUSTOM SELECTION / REMARKS UPDATE NOTIFICATION ---
async function sendLineCustomSelectionFlexMessage(
  targetDevices: Device[], 
  customTitle?: string, 
  _remarksNote?: string,
  tokenOverride?: string, 
  userIdOverride?: string
) {
  const activeToken = (tokenOverride && tokenOverride.trim() !== '' && tokenOverride !== '********') ? tokenOverride.trim() : (settings.lineNotifyToken || '').trim();
  const activeUserId = (userIdOverride && userIdOverride.trim() !== '' && userIdOverride !== '********') ? userIdOverride.trim() : (settings.lineUserId || '').trim();

  if (!activeToken || !activeUserId) {
    throw new Error('กรุณาระบุ Channel Access Token และ User ID ในหน้าตั้งค่า LINE ก่อนใช้งานส่งแจ้งเตือน');
  }

  const bkk = getBangkokTimeInfo();
  const formattedDate = bkk.fullFormatted;

  const onlineDevices = targetDevices.filter(d => d.status === DeviceStatus.ONLINE || d.status === DeviceStatus.WARNING);
  const offlineDevices = targetDevices.filter(d => d.status === DeviceStatus.OFFLINE);
  const totalCount = targetDevices.length;
  const offlineCount = offlineDevices.length;
  const onlineCount = onlineDevices.length;

  const title = customTitle || `📊 รายงานสรุปสถานะจอ : E-Board (${totalCount} เครื่อง)`;

  const deviceItems: any[] = [];
  targetDevices.slice(0, 35).forEach(d => {
    const isOutage = d.status === DeviceStatus.OFFLINE;
    deviceItems.push({
      type: 'box',
      layout: 'vertical',
      backgroundColor: isOutage ? '#FEF2F2' : '#F0FDF4',
      borderColor: isOutage ? '#FECACA' : '#BBF7D0',
      borderWidth: '1px',
      cornerRadius: 'md',
      paddingAll: 'sm',
      margin: 'xs',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            { type: 'text', text: `${isOutage ? '🔴' : '🟢'} ${d.name}`, size: 'xs', weight: 'bold', color: isOutage ? '#991B1B' : '#065F46', flex: 7, wrap: true },
            { type: 'text', text: isOutage ? 'ปิดเครื่อง' : 'เปิดเครื่อง', size: 'xxs', weight: 'bold', color: isOutage ? '#DC2626' : '#059669', align: 'end', flex: 3 }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'xs',
          contents: [
            { type: 'text', text: `IP: ${d.ip}`, size: 'xxs', color: '#64748B', flex: 5 },
            { type: 'text', text: formatLocation(d.location, d.floor), size: 'xxs', color: '#64748B', align: 'end', flex: 5 }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'xs',
          contents: [
            { type: 'text', text: `ผู้ผลิต: ${d.model || '-'}`, size: 'xxs', color: '#475569', flex: 7 },
            ...(d.type ? [{ type: 'text', text: `${d.type}`, size: 'xxs', color: '#94A3B8', align: 'end', flex: 3 }] : [])
          ]
        },
        ...(d.remarks ? [{
          type: 'box',
          layout: 'baseline',
          margin: 'xs',
          contents: [
            { type: 'text', text: 'หมายเหตุ:', size: 'xxs', color: '#D97706', weight: 'bold', flex: 3 },
            { type: 'text', text: d.remarks, size: 'xxs', color: '#B45309', weight: 'bold', flex: 7, wrap: true }
          ]
        }] : [])
      ]
    });
  });

  const bodyContents: any[] = [
    // Header summary statistics
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          backgroundColor: '#F8FAFC',
          borderColor: '#CBD5E1',
          borderWidth: '1px',
          cornerRadius: 'md',
          paddingAll: 'sm',
          alignItems: 'center',
          contents: [
            { type: 'text', text: 'จากทั้งหมด', color: '#64748B', size: 'xxs', weight: 'bold' },
            { type: 'text', text: `${totalCount}`, color: '#0F172A', size: 'md', weight: 'bold' }
          ]
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          backgroundColor: '#ECFDF5',
          borderColor: '#6EE7B7',
          borderWidth: '1px',
          cornerRadius: 'md',
          paddingAll: 'sm',
          alignItems: 'center',
          contents: [
            { type: 'text', text: '🟢 เปิดเครื่อง', color: '#047857', size: 'xxs', weight: 'bold' },
            { type: 'text', text: `${onlineCount}`, color: '#059669', size: 'md', weight: 'bold' }
          ]
        },
        {
          type: 'box',
          layout: 'vertical',
          flex: 1,
          backgroundColor: offlineCount > 0 ? '#FEF2F2' : '#F8FAFC',
          borderColor: offlineCount > 0 ? '#FCA5A5' : '#CBD5E1',
          borderWidth: '1px',
          cornerRadius: 'md',
          paddingAll: 'sm',
          alignItems: 'center',
          contents: [
            { type: 'text', text: '🔴 ปิดเครื่อง', color: offlineCount > 0 ? '#B91C1C' : '#64748B', size: 'xxs', weight: 'bold' },
            { type: 'text', text: `${offlineCount}`, color: offlineCount > 0 ? '#DC2626' : '#64748B', size: 'md', weight: 'bold' }
          ]
        }
      ]
    },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'xs',
      contents: [
        { type: 'text', text: `รายการจอ E-Board (${targetDevices.length} เครื่อง):`, size: 'xs', weight: 'bold', color: '#334155' },
        ...deviceItems
      ]
    }
  ];

  const flexMessage = {
    type: 'flex',
    altText: `[รายงานสถานะจอ : E-Board] ${title} - ${offlineCount > 0 ? `🔴 ปิดเครื่อง ${offlineCount} | ` : ''}🟢 เปิดเครื่อง ${onlineCount}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      hero: lineLogoHero(),
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        background: {
          type: 'linearGradient',
          angle: '135deg',
          startColor: '#2563EB',
          endColor: '#1E3A8A'
        },
        contents: [
          {
            type: 'text',
            text: '🛡️ E-BOARD MONITOR',
            weight: 'bold',
            color: '#DBEAFE',
            size: 'xxs'
          },
          {
            type: 'text',
            text: title,
            weight: 'bold',
            color: '#FFFFFF',
            size: 'md',
            margin: 'xs'
          },
          {
            type: 'text',
            text: `ประจำวันที่ ${formattedDate}`,
            color: '#BFDBFE',
            size: 'xs',
            margin: 'xs'
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'lg',
        contents: bodyContents
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: 'md',
        contents: [
          {
            type: 'text',
            text: `@ 2026 E-Board Monitoring System`,
            size: 'xxs',
            color: '#9CA3AF',
            align: 'center'
          }
        ]
      }
    }
  };

  // Fallback text
  let fallbackText = `🛡️ ${title}\n` +
    `📅 ประจำวันที่: ${formattedDate}\n` +
    `📊 สรุป: จากทั้งหมด ${totalCount} เครื่อง (🔴 ปิดเครื่อง ${offlineCount} | 🟢 เปิดเครื่อง ${onlineCount})\n\n` +
    `📋 รายการจอ E-Board:\n` +
    targetDevices.map((d, i) => `${i + 1}. ${d.status === DeviceStatus.OFFLINE ? '🔴 ปิดเครื่อง' : '🟢 เปิดเครื่อง'} ${d.name} (${d.ip}) - ${formatLocation(d.location, d.floor)}${d.model ? ` [ผู้ผลิต: ${d.model}]` : ''}${d.remarks ? ` [หมายเหตุ: ${d.remarks}]` : ''}`).join('\n');

  console.log(`[LINE Selection] Sending Flex Message to ${activeUserId}...`);
  try {
    await pushLineMessages(activeToken, activeUserId, [flexMessage]);
  } catch (err: any) {
    console.warn(`[LINE Selection] Flex failed (${err.message}). Sending fallback text...`);
    const textMsgs = splitLineText(fallbackText).map(t => ({ type: 'text', text: t }));
    await pushLineMessages(activeToken, activeUserId, textMsgs);
  }

  return { success: true, message: `ส่งรายงานสถานะไปยัง LINE สำเร็จ (${targetDevices.length} เครื่อง)` };
}

// --- BACKGROUND MONITORING LOOP & AUTO 10.80.80.* ARP SWEEPER ---
let isMonitoring = false;
let isArpSweeping = false;

// Helper to normalize MAC Address to 12 hex characters
function normalizeMac(mac: string): string {
  if (!mac) return '';
  const clean = mac.toLowerCase().trim();
  const parts = clean.split(/[:-]/).map(p => p.trim());
  if (parts.length === 6) {
    return parts.map(p => p.padStart(2, '0')).join('');
  }
  const dotParts = clean.split('.').map(p => p.trim());
  if (dotParts.length === 3) {
    return dotParts.map(p => p.padStart(4, '0')).join('');
  }
  const hexOnly = clean.replace(/[^a-f0-9]/g, '');
  if (hexOnly.length === 12) return hexOnly;
  return hexOnly.padStart(12, '0').slice(-12);
}

function formatMacColon(normMac: string): string {
  const clean = normalizeMac(normMac).toUpperCase();
  if (clean.length !== 12) return normMac.toUpperCase();
  return clean.match(/.{1,2}/g)?.join(':') || clean;
}

// Fetch and map MAC <-> IP addresses from system ARP table (prioritizing 10.80.80.*)
function getArpTableDetails(): { macToIp: Map<string, string>; ipToMac: Map<string, string> } {
  const macToIp = new Map<string, string>();
  const ipToMac = new Map<string, string>();
  try {
    let output = '';
    if (process.platform === 'linux' && fs.existsSync('/proc/net/arp')) {
      output = fs.readFileSync('/proc/net/arp', 'utf-8');
    } else {
      const cmd = process.platform === 'win32' ? 'arp -a' : 'arp -an';
      output = execSync(cmd, { encoding: 'utf-8', timeout: 2500 });
    }

    if (!output) return { macToIp, ipToMac };

    const lines = output.split('\n');
    for (const line of lines) {
      const cleanLine = line.trim().toLowerCase();
      if (!cleanLine || cleanLine.includes('incomplete')) continue;

      const macMatch = cleanLine.match(/([0-9a-f]{1,2}[:-]){5}([0-9a-f]{1,2})/) ||
                       cleanLine.match(/([0-9a-f]{4}\.){2}([0-9a-f]{4})/);

      if (macMatch) {
        const rawMac = macMatch[0];
        const normMac = normalizeMac(rawMac);
        // Ignore broadcast, zero, or IPv4 multicast MACs
        if (
          normMac.length !== 12 ||
          normMac === 'ffffffffffff' ||
          normMac === '000000000000' ||
          normMac.startsWith('01005e')
        ) {
          continue;
        }

        const ipMatch = cleanLine.match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/);
        if (ipMatch) {
          const ip = ipMatch[0];
          // Ignore multicast / broadcast IPs
          if (
            ip.startsWith('224.') ||
            ip.startsWith('239.') ||
            ip.startsWith('255.') ||
            ip.endsWith('.255')
          ) {
            continue;
          }

          ipToMac.set(ip, normMac);

          // Always prioritize 10.80.*.* school IPs for MAC-to-IP resolution
          const existingIp = macToIp.get(normMac);
          if (!existingIp || ip.startsWith('10.80.')) {
            macToIp.set(normMac, ip);
          }
        }
      }
    }
  } catch (error) {
    console.error('[ARP] Error resolving ARP table:', error);
  }
  return { macToIp, ipToMac };
}

// Fast background ARP warm-up sweep for 10.80.80.1 - 10.80.81.254 (both .80.* and .81.* school subnets)
// Ensures newly powered-on E-Boards/PCs in 10.80.*.* populate the OS ARP table automatically
// without requiring the user to manually click "Scan Network"
let arpSweepSubnetToggle = 0;
async function runBackgroundSchoolArpSweep() {
  if (isArpSweeping || settings.simulateNetwork) return;
  const localIp = getLocalIpAddress();
  const isOnSchoolNetwork = process.platform === 'win32' || localIp.startsWith('10.80.');
  if (!isOnSchoolNetwork) return; // Skip raw LAN ARP sweep inside cloud preview container

  const offlineOrMacDevices = devices.filter(
    d => d.isMonitored && !d.isMaintenance && (d.status === DeviceStatus.OFFLINE || Boolean(d.macAddress))
  );
  if (offlineOrMacDevices.length === 0) return;

  isArpSweeping = true;
  try {
    const isWindows = process.platform === 'win32';
    const subnetPrefix = arpSweepSubnetToggle % 2 === 0 ? '10.80.80' : '10.80.81';
    arpSweepSubnetToggle++;

    const ipList: string[] = [];
    for (let i = 1; i <= 254; i++) {
      ipList.push(`${subnetPrefix}.${i}`);
    }

    // Fast lightweight probe (350ms timeout, 24 concurrency) to populate OS ARP table
    await runWithConcurrency(ipList, 24, async (ip) => {
      try {
        await ping.promise.probe(ip, {
          timeout: 0.4,
          extra: isWindows ? ['-n', '1', '-w', '350'] : ['-c', '1', '-W', '1']
        } as any);
      } catch (_e) {}
    });

    // Immediately trigger monitoring pass so any newly discovered MAC in 10.80.*.* turns ONLINE right away
    if (!isMonitoring) {
      await runMonitoring();
    }
  } catch (e) {
    console.error('[Auto ARP Sweep] Error sweeping 10.80.*.*:', e);
  } finally {
    isArpSweeping = false;
  }
}

// Helper for TCP Port Monitoring
const checkTcpPort = (ip: string, port: number, timeout: number): Promise<{ alive: boolean, time: number }> => {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      const time = Date.now() - start;
      socket.destroy();
      resolve({ alive: true, time });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ alive: false, time: 0 });
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve({ alive: false, time: 0 });
    });
    
    socket.connect(port, ip);
  });
};

async function runMonitoring() {
  if (isMonitoring) return;
  isMonitoring = true;

  const now = new Date().toISOString();
  let devicesChanged = false;
  let criticalStateChanged = false;
  const localHostIp = getLocalIpAddress();
  const isLocalSchoolServer = process.platform === 'win32' || localHostIp.startsWith('10.80.');

  try {
    // Retrieve current ARP mappings (MAC <-> IP) to resolve dynamic IPs for MAC-configured devices in 10.80.*.*
    const { macToIp: arpMap, ipToMac } = (settings.simulateNetwork || !isLocalSchoolServer)
      ? { macToIp: new Map<string, string>(), ipToMac: new Map<string, string>() }
      : getArpTableDetails();

    // Build fast lookup map of all registered MAC addresses -> Device for Instant Cross-Room MAC Handover
    const registeredMacToDevice = new Map<string, Device>();
    for (const d of devices) {
      if (d.macAddress) {
        const norm = normalizeMac(d.macAddress);
        if (norm) registeredMacToDevice.set(norm, d);
      }
    }

    // Prioritize checking OFFLINE devices first so newly powered-on E-Boards turn ONLINE as fast as possible
    const sortedDevices = [...devices].sort((a, b) => {
      if (a.status === DeviceStatus.OFFLINE && b.status !== DeviceStatus.OFFLINE) return -1;
      if (a.status !== DeviceStatus.OFFLINE && b.status === DeviceStatus.OFFLINE) return 1;
      return 0;
    });

    // Run pings with controlled concurrency (24 on local Windows server, 6 in cloud preview container)
    const monitorConcurrency = isLocalSchoolServer ? 24 : 6;
    await runWithConcurrency(sortedDevices, monitorConcurrency, async (device) => {
      // Resolve Dynamic IP via MAC Address if configured (strictly within 10.80.80.*)
      let hasMacAndConflict = false;
      let conflictDetails = '';
      
      if (device.macAddress && !settings.simulateNetwork) {
        const cleanDeviceMac = normalizeMac(device.macAddress);
        if (cleanDeviceMac) {
          if (arpMap.has(cleanDeviceMac)) {
            const resolvedIp = arpMap.get(cleanDeviceMac)!;
            // Auto-update IP if it's in the 10.80.*.* school subnet (10.80.80.* or 10.80.81.*)
            if (resolvedIp && resolvedIp.startsWith('10.80.') && resolvedIp !== device.ip) {
              console.log(`[ARP Dynamic DNS] Device "${device.name}" with MAC "${device.macAddress}" resolved dynamically from "${device.ip || 'none'}" to "${resolvedIp}"`);
              device.ip = resolvedIp;
              devicesChanged = true;
              criticalStateChanged = true;
            }
            if (device.statusReason) {
              device.statusReason = undefined;
              devicesChanged = true;
              criticalStateChanged = true;
            }
          } else if (device.ip) {
            for (const [mac, ip] of arpMap.entries()) {
              if (ip === device.ip && mac !== cleanDeviceMac) {
                const formattedMac = mac.match(/.{1,2}/g)?.join(':') || mac;
                const actualOwner = registeredMacToDevice.get(mac);
                if (actualOwner && actualOwner.id !== device.id && device.ip.startsWith('10.80.')) {
                  if (actualOwner.ip !== device.ip) {
                    console.log(`[Cross-Room MAC Handover] Transferring IP ${device.ip} from "${device.name}" to "${actualOwner.name}" (MAC ${formattedMac})`);
                    actualOwner.ip = device.ip;
                    actualOwner.statusReason = undefined;
                    devicesChanged = true;
                    criticalStateChanged = true;
                  }
                  conflictDetails = `IP Conflict (IP ${device.ip} ถูกใช้งานโดย ${actualOwner.name} [${formattedMac}] ขณะเครื่องนี้ปิดอยู่)`;
                } else {
                  conflictDetails = `IP Conflict (Another device with MAC ${formattedMac} is using IP ${device.ip})`;
                }
                console.log(`[ARP Conflict] IP "${device.ip}" is currently used by MAC "${mac}", but device "${device.name}" expects MAC "${cleanDeviceMac}". Marking as OFFLINE.`);
                hasMacAndConflict = true;
                break;
              }
            }
          }
        }
      }

      if (hasMacAndConflict) {
        if (device.statusReason !== conflictDetails) {
          device.statusReason = conflictDetails;
          devicesChanged = true;
          criticalStateChanged = true;
        }
      } else {
        if (device.statusReason) {
          device.statusReason = undefined;
          devicesChanged = true;
          criticalStateChanged = true;
        }
      }

      if (!device.ip) {
        device.status = DeviceStatus.OFFLINE;
        device.latency = 0;
        return;
      }

      if (!device.isMonitored || device.isMaintenance) {
        if (device.isMaintenance && device.status !== DeviceStatus.ONLINE) {
          device.status = DeviceStatus.ONLINE;
          device.latency = 0;
          devicesChanged = true;
        }
        return;
      }

      let status = device.status;
      let latency = 0;

      if (hasMacAndConflict) {
        status = DeviceStatus.OFFLINE;
        latency = 0;
      } else if (settings.simulateNetwork) {
        const random = Math.random();
        if (status === DeviceStatus.OFFLINE) {
          if (random > 0.90) status = DeviceStatus.ONLINE;
        } else {
          if (random > 0.99) status = DeviceStatus.OFFLINE;
          else if (random > 0.95) status = DeviceStatus.WARNING;
          else status = DeviceStatus.ONLINE;
        }
        if (status === DeviceStatus.OFFLINE) latency = 0;
        else if (status === DeviceStatus.WARNING) latency = Math.floor(Math.random() * 200) + settings.warningThreshold;
        else latency = Math.max(1, Math.floor(Math.random() * 20) + 1);
      } else {
        try {
          const timeoutThreshold = (typeof settings.timeoutThreshold === 'number' && settings.timeoutThreshold > 0) ? settings.timeoutThreshold : 1500;
          
          if (device.monitorPort) {
            let result = await checkTcpPort(device.ip, device.monitorPort, timeoutThreshold);
            if (!result.alive && device.status !== DeviceStatus.OFFLINE) {
              await new Promise(r => setTimeout(r, 250));
              result = await checkTcpPort(device.ip, device.monitorPort, timeoutThreshold);
              if (!result.alive) {
                await new Promise(r => setTimeout(r, 250));
                result = await checkTcpPort(device.ip, device.monitorPort, timeoutThreshold);
              }
            }
            if (result.alive) {
              latency = result.time;
              status = latency > settings.warningThreshold ? DeviceStatus.WARNING : DeviceStatus.ONLINE;
            } else {
              status = DeviceStatus.OFFLINE;
            }
          } else {
            // Use fast 1000ms probe for OFFLINE devices so scan loop finishes quickly and detects newly powered-on E-Boards faster
            const effectiveTimeoutMs = device.status === DeviceStatus.OFFLINE ? Math.min(timeoutThreshold, 1000) : timeoutThreshold;
            const timeoutSec = Math.max(1, Math.ceil(effectiveTimeoutMs / 1000));
            const isWindows = process.platform === 'win32';
            const pingOptions: any = { 
              timeout: timeoutSec,
              extra: isWindows ? ['-n', '1', '-w', String(effectiveTimeoutMs)] : ['-c', '1', '-W', String(timeoutSec)]
            };
            
            let result = await ping.promise.probe(device.ip, pingOptions);
            // 2-Step Anti-Flap confirmation retries when transitioning downward (ONLINE/WARNING -> OFFLINE)
            if (!result.alive && device.status !== DeviceStatus.OFFLINE) {
              await new Promise(r => setTimeout(r, 250));
              result = await ping.promise.probe(device.ip, pingOptions);
              if (!result.alive) {
                await new Promise(r => setTimeout(r, 250));
                result = await ping.promise.probe(device.ip, pingOptions);
              }
            }
            
            if (result.alive) {
              const cleanDeviceMac = device.macAddress ? normalizeMac(device.macAddress) : '';
              let postPingConflict = false;

              if (cleanDeviceMac && !arpMap.has(cleanDeviceMac)) {
                const postPingArp = getArpTableDetails();
                if (postPingArp.macToIp.has(cleanDeviceMac)) {
                  const newIp = postPingArp.macToIp.get(cleanDeviceMac)!;
                  if (newIp.startsWith('10.80.') && newIp !== device.ip) {
                    device.ip = newIp;
                    devicesChanged = true;
                    criticalStateChanged = true;
                  }
                } else if (postPingArp.ipToMac.has(device.ip)) {
                  const actualMac = postPingArp.ipToMac.get(device.ip)!;
                  if (actualMac !== cleanDeviceMac) {
                    const formattedMac = actualMac.match(/.{1,2}/g)?.join(':') || actualMac;
                    const actualOwner = registeredMacToDevice.get(actualMac);
                    if (actualOwner && actualOwner.id !== device.id && device.ip.startsWith('10.80.')) {
                      if (actualOwner.ip !== device.ip) {
                        actualOwner.ip = device.ip;
                        actualOwner.statusReason = undefined;
                      }
                      conflictDetails = `IP Conflict (IP ${device.ip} ถูกใช้งานโดย ${actualOwner.name} [${formattedMac}] ขณะเครื่องนี้ปิดอยู่)`;
                    } else {
                      conflictDetails = `IP Conflict (Another device with MAC ${formattedMac} is using IP ${device.ip})`;
                    }
                    device.statusReason = conflictDetails;
                    postPingConflict = true;
                    devicesChanged = true;
                    criticalStateChanged = true;
                  }
                }
              }

              if (postPingConflict) {
                status = DeviceStatus.OFFLINE;
                latency = 0;
              } else {
                const parsedTime = parseFloat(String(result.time));
                latency = !isNaN(parsedTime) ? Math.max(1, Math.round(parsedTime)) : 1;
                status = latency > settings.warningThreshold ? DeviceStatus.WARNING : DeviceStatus.ONLINE;
                // Auto-learn MAC address if device is in 10.80.*.* and doesn't have one saved yet
                if (!device.macAddress && device.ip.startsWith('10.80.') && ipToMac.has(device.ip)) {
                  device.macAddress = formatMacColon(ipToMac.get(device.ip)!);
                  devicesChanged = true;
                }
              }
            } else {
              status = DeviceStatus.OFFLINE;
            }
          }
        } catch (e) {
          console.error(`Check failed for ${device.ip}:`, e);
          status = DeviceStatus.OFFLINE;
        }
      }

      // SLA Calculation
      const pingIntervalSec = settings.pingInterval || 5;
      if (status === DeviceStatus.ONLINE || status === DeviceStatus.WARNING) {
        device.totalUptimeSec = (device.totalUptimeSec || 0) + pingIntervalSec;
      } else {
        device.totalDowntimeSec = (device.totalDowntimeSec || 0) + pingIntervalSec;
      }
      
      const totalSec = (device.totalUptimeSec || 0) + (device.totalDowntimeSec || 0);
      device.uptimePercentage = totalSec > 0 ? Number((((device.totalUptimeSec || 0) / totalSec) * 100).toFixed(2)) : 100;

      // --- SMART ALERTING LOGIC ---
      if (status === DeviceStatus.OFFLINE) {
        if (!offlineSince.has(device.id)) {
          offlineSince.set(device.id, { startTime: Date.now(), alertSent: false });
        }
        const delay = (device.alertDelaySeconds || 0) * 1000;
        if (Date.now() - offlineSince.get(device.id)!.startTime < delay) {
          status = device.status; // Keep previous status during grace period
        }
      } else {
        offlineSince.delete(device.id);
      }

      if (status !== device.status) {
        criticalStateChanged = true;
        const isLatencyTransition = (status === DeviceStatus.WARNING && device.status === DeviceStatus.ONLINE) ||
                                    (status === DeviceStatus.ONLINE && device.status === DeviceStatus.WARNING);
        
        const shouldLog = !isLatencyTransition || settings.enableLatencyLogs;

        if (shouldLog) {
          const log: DowntimeLog = {
            id: generateUUID(),
            deviceId: device.id,
            deviceName: device.name,
            ip: device.ip,
            location: device.location,
            timestamp: now,
            type: status === DeviceStatus.OFFLINE ? 'OUTAGE' : (device.status === DeviceStatus.OFFLINE ? 'RECOVERY' : 'HIGH_LATENCY'),
            message: status === DeviceStatus.OFFLINE ? (device.statusReason || 'Host unreachable (Ping failed).') : (device.status === DeviceStatus.OFFLINE ? 'Host detected (Ping success).' : `High Latency: ${latency}ms`),
            remarks: device.remarks
          };

          if (settings.simulateNetwork) {
            log.message = status === DeviceStatus.OFFLINE ? '[SIM] Connection timed out.' : '[SIM] Connection restored.';
          }

          const isFreshLog = insertLogSmart(log);
          
          const isOutageAllowed = log.type === 'OUTAGE' && (settings.notifyOutage === true);
          const isRecoveryAllowed = log.type === 'RECOVERY' && (settings.notifyRecovery === true);
          const isWarningAllowed = log.type === 'HIGH_LATENCY' && (settings.notifyWarning === true);

          if (isFreshLog && (isOutageAllowed || isRecoveryAllowed || isWarningAllowed)) {
            sendWebhook(log);
            sendLineBotMessage(log);
            sendTelegramMessage(log);
            sendDiscordMessage(log);
            sendGasWebhook(log);
          }
        }
        device.lastStatusChange = now;
      }

      if (device.status !== status || device.latency !== latency) {
        device.status = status;
        device.latency = latency;
        
        if (!device.latencyHistory) device.latencyHistory = [];
        device.latencyHistory.push({ timestamp: now, value: latency });
        if (device.latencyHistory.length > 20) device.latencyHistory.shift();

        device.packetLoss = status === DeviceStatus.OFFLINE ? 100 : 0;
        if (status !== DeviceStatus.OFFLINE) {
          device.lastSeen = now;
        }
        devicesChanged = true;
      }
    });

    // Save immediately on status/IP changes, or periodically every 60s for routine latency/uptime updates
    if (criticalStateChanged || (devicesChanged && (Date.now() - lastDevicesDiskSaveMs >= 60000))) {
      saveDevices();
    }
  } finally {
    isMonitoring = false;
  }
}

// --- SCHEDULED REPORTS (BANGKOK TIMEZONE) ---
let lastReportDate = '';

async function checkScheduledReports() {
  if (!settings.enableScheduledReports) return;

  const bkk = getBangkokTimeInfo();
  const targetTime = settings.reportScheduleTime || '08:00';

  if (bkk.timeStr === targetTime && lastReportDate !== bkk.dateStr) {
    console.log(`[Scheduler] Generating scheduled PDF report for Bangkok date ${bkk.dateStr} at ${bkk.timeStr}...`);
    lastReportDate = bkk.dateStr;
    
    try {
      const filename = await generateServerPDFReport();
      await sendReportEmail(filename);
      
      const log: DowntimeLog = {
        id: 'sched-pdf-' + Date.now(),
        deviceId: 'system',
        deviceName: 'System Scheduler',
        ip: '0.0.0.0',
        location: 'Internal',
        timestamp: new Date().toISOString(),
        type: 'RECOVERY',
        message: `Scheduled Daily PDF Report Generated: ${filename}`
      };
      logs.unshift(log);
      saveLogs();
    } catch (e) {
      console.error('[Scheduler] Failed to generate scheduled report:', e);
    }
  }
}

// --- SCHEDULED LINE FLEX SUMMARY REPORTS ---
let lastLineSummaryDate = '';
let lastLineSummaryMonth = '';

async function checkScheduledLineSummary() {
  if (!settings.enableLineSummaryReport) return;

  const bkk = getBangkokTimeInfo();
  const targetTime = settings.lineSummaryTime || '16:30';
  const summaryType = settings.lineSummaryType || 'daily';
  const targetMonthlyDay = settings.lineSummaryMonthlyDay || 1;

  if (bkk.timeStr === targetTime) {
    const isDaily = summaryType === 'daily' || summaryType === 'both';
    const isMonthly = (summaryType === 'monthly' || summaryType === 'both') && bkk.dayNum === targetMonthlyDay;

    if (isDaily && lastLineSummaryDate !== bkk.dateStr) {
      console.log(`[LINE Scheduler] Triggering daily LINE Summary at Bangkok time ${bkk.timeStr} (Date: ${bkk.dateStr})...`);
      lastLineSummaryDate = bkk.dateStr;
      try {
        await sendLineSummaryFlexMessage(false, '📊 รายงานสรุปสถานะจอ : E-Board (ประจำวัน)');
        
        const log: DowntimeLog = {
          id: 'line-sched-' + Date.now(),
          deviceId: 'system',
          deviceName: 'LINE Auto Scheduler',
          ip: 'LINE Bot',
          location: 'Auto-Report',
          timestamp: new Date().toISOString(),
          type: 'RECOVERY',
          message: `[LINE Auto-Report] ส่งรายงานสรุปประจำวันสำเร็จ เวลา ${bkk.timeStr} น.`
        };
        logs.unshift(log);
        saveLogs();
      } catch (e: any) {
        console.error('[LINE Scheduler] Failed to send daily summary:', e);
        const log: DowntimeLog = {
          id: 'line-sched-err-' + Date.now(),
          deviceId: 'system',
          deviceName: 'LINE Auto Scheduler',
          ip: 'LINE Bot',
          location: 'Auto-Report',
          timestamp: new Date().toISOString(),
          type: 'OUTAGE',
          message: `[LINE Auto-Report Error] ส่งรายงานสรุปประจำวันไม่สำเร็จ: ${e.message || String(e)}`
        };
        logs.unshift(log);
        saveLogs();
      }
    }

    if (isMonthly && lastLineSummaryMonth !== bkk.monthStr) {
      console.log(`[LINE Scheduler] Triggering monthly LINE Summary at Bangkok time ${bkk.timeStr} (Month: ${bkk.monthStr})...`);
      lastLineSummaryMonth = bkk.monthStr;
      try {
        await sendLineSummaryFlexMessage(false, '📅 รายงานสรุปสถานะจอ : E-Board (ประจำเดือน)');
        
        const log: DowntimeLog = {
          id: 'line-sched-month-' + Date.now(),
          deviceId: 'system',
          deviceName: 'LINE Auto Scheduler',
          ip: 'LINE Bot',
          location: 'Auto-Report',
          timestamp: new Date().toISOString(),
          type: 'RECOVERY',
          message: `[LINE Auto-Report] ส่งรายงานสรุปประจำเดือนสำเร็จ วันที่ ${bkk.dayNum} เวลา ${bkk.timeStr} น.`
        };
        logs.unshift(log);
        saveLogs();
      } catch (e: any) {
        console.error('[LINE Scheduler] Failed to send monthly summary:', e);
      }
    }
  }
}

async function monitoringLoop() {
  try {
    await runMonitoring();
  } catch (e) {
    console.error('Monitoring loop error:', e);
  }
  const intervalSec = Math.max(2, Number(settings.pingInterval) || 3);
  setTimeout(monitoringLoop, intervalSec * 1000);
}

// --- 7-DAY ROLLING DAILY AUTO-BACKUP & MORNING ARP CACHE FLUSH ---
let lastDailyBackupDate = '';
let lastMorningArpFlushDate = '';

function runDailyAutoBackup() {
  try {
    const bkk = getBangkokTimeInfo();
    if (!bkk.dateStr || lastDailyBackupDate === bkk.dateStr) return;

    const backupDir = path.join(process.cwd(), '.backup_data');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const devicesBackupPath = path.join(backupDir, `devices-${bkk.dateStr}.json`);
    const settingsBackupPath = path.join(backupDir, `settings-${bkk.dateStr}.json`);
    writeJsonAtomicSync(devicesBackupPath, devices);
    writeJsonAtomicSync(settingsBackupPath, settings);
    lastDailyBackupDate = bkk.dateStr;

    // Keep only the latest 7 daily backups
    const cleanupPrefix = (prefix: string) => {
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
        .sort()
        .reverse();
      files.slice(7).forEach((oldFile) => {
        try {
          fs.unlinkSync(path.join(backupDir, oldFile));
        } catch (_e) {}
      });
    };
    cleanupPrefix('devices-');
    cleanupPrefix('settings-');
    console.log(`[Auto-Backup] Saved 7-day rolling snapshot for ${bkk.dateStr}`);
  } catch (e) {
    console.error('[Auto-Backup] Failed to write daily snapshot:', e);
  }
}

// Run initial snapshot on startup
setTimeout(runDailyAutoBackup, 3000);

// Dedicated 15s scheduler & Auto-ARP sweep loop:
// - Sweeps 10.80.80.1 - 10.80.80.254 in background when any E-Board is offline so newly powered-on E-Boards are detected automatically by MAC
// - Checks scheduled LINE/PDF reports on the exact minute
// - Runs 7-day rolling auto-backup and 05:30 morning ARP refresh
let lastPruneCheckMs = Date.now();
let lastArpSweepMs = 0;
setInterval(async () => {
  try {
    await checkScheduledReports();
    await checkScheduledLineSummary();
    runDailyAutoBackup();

    const bkk = getBangkokTimeInfo();
    if (bkk.timeStr === '05:30' && lastMorningArpFlushDate !== bkk.dateStr) {
      lastMorningArpFlushDate = bkk.dateStr;
      if (process.platform === 'win32') {
        try {
          execSync('arp -d *', { stdio: 'ignore', timeout: 5000 });
          console.log('[Morning Maintenance] Flushed stale Windows ARP cache at 05:30.');
        } catch (_e) {}
      }
      runBackgroundSchoolArpSweep().catch(() => {});
    }

    const hasOfflineDevices = devices.some(d => d.isMonitored && !d.isMaintenance && d.status === DeviceStatus.OFFLINE);
    const sweepIntervalMs = hasOfflineDevices ? 15000 : 45000;
    if (Date.now() - lastArpSweepMs >= sweepIntervalMs) {
      lastArpSweepMs = Date.now();
      runBackgroundSchoolArpSweep().catch(() => {});
    }

    if (Date.now() - lastPruneCheckMs >= 600000) {
      lastPruneCheckMs = Date.now();
      pruneLogs(true);
    }
  } catch (e) {
    console.error('[Scheduler] Error in scheduled task check:', e);
  }
}, 15000);

// --- GLOBAL CRASH GUARDS & GRACEFUL SHUTDOWN ---
process.on('uncaughtException', (err) => {
  console.error('[Process Guard] Uncaught Exception (server kept alive):', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Process Guard] Unhandled Rejection (server kept alive):', reason);
});

const flushStateAndExit = (signal: string) => {
  console.log(`[Server] Received ${signal}. Flushing device & log state to disk...`);
  try {
    saveDevices();
    saveLogs();
  } catch (_e) {}
  process.exit(0);
};
process.on('SIGINT', () => flushStateAndExit('SIGINT'));
process.on('SIGTERM', () => flushStateAndExit('SIGTERM'));

// --- VITE MIDDLEWARE ---
async function startServer() {
  console.log(`[Server] Starting E-Board Monitor Server on port ${PORT}...`);
  try {
    // API 404 Handler (Before Vite/Static to prevent HTML fallback for API calls)
    app.use('/api', (req, res, next) => {
      console.log(`[API] 404 - No route matched for ${req.method} ${req.url}. Accepts JSON: ${req.accepts('json')}`);
      if (req.accepts('json')) {
        return res.status(404).json({ 
          error: `API route not found: ${req.method} ${req.originalUrl}`,
          suggestion: "Check if the route is defined in server.ts"
        });
      }
      next();
    });

    if (process.env.NODE_ENV !== 'production') {
      try {
        console.log('[Server] Loading Vite middleware (Development mode)...');
        const { createServer: createViteServer } = await import('vite');
        const vite = await createViteServer({
          server: { middlewareMode: true, hmr: false, allowedHosts: true },
          appType: 'spa',
        });
        app.use(vite.middlewares);
      } catch (viteError) {
        console.error('[Server] Failed to load Vite. Running without Vite middleware:', viteError);
      }
    } else {
      // Production: serve static files from dist
      console.log('[Server] Serving static files from dist (Production mode)...');
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath, { maxAge: '1h', etag: true }));
      
      // SPA Fallback for production (Express v5 format)
      app.get('*all', (req, res) => {
        if (req.originalUrl.startsWith('/api')) return res.status(404).json({ error: 'API not found' });
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    if (process.platform === 'win32') {
      try {
        const netstatOut = execSync(`netstat -aon | findstr :${PORT} | findstr LISTENING`, {
          encoding: 'utf-8',
          timeout: 5000
        });
        const lines = netstatOut.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
          const parts = line.split(/\s+/);
          const pid = parseInt(parts[parts.length - 1], 10);
          if (pid && !isNaN(pid) && pid > 0 && pid !== process.pid) {
            console.log(`[Server] Releasing port ${PORT} held by stale process PID ${pid}...`);
            try {
              execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: 5000 });
            } catch (_killErr) {}
          }
        }
      } catch (_netErr) {
        // Port is already free
      }
    }

    app.listen(PORT, '0.0.0.0', () => {
      const localIp = getLocalIpAddress();
      console.log(`[Server] Server is UP and running:`);
      console.log(`[Server] - Local:   http://localhost:${PORT}`);
      console.log(`[Server] - Network: http://${localIp}:${PORT}`);
      
      // Start the monitoring loop and initial ARP warm-up AFTER the server is listening
      monitoringLoop();
      setTimeout(() => {
        runBackgroundSchoolArpSweep().catch(() => {});
      }, 2000);
    });
  } catch (e) {
    console.error('[Server] Failed to start server:', e);
  }
}

// Start the server
startServer().catch(err => {
  console.error('Failed to start server:', err);
});
