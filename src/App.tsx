
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { DeviceManager } from './components/DeviceManager';
import { History as HistoryView } from './components/History';
import { Settings } from './components/Settings';
import { SubnetScannerModal } from './components/SubnetScannerModal';
import { ExecutiveReportModal } from './components/ExecutiveReportModal';
import { exportToExcel } from './utils/reportExporter';
import { CommandPalette } from './components/CommandPalette';
import { Device, DowntimeLog, AppSettings, DeviceStatus, Language, Translations, SystemStats, DeviceType } from './types';
import { getDevices, getDevicesLiveStatus, addDevice, importDevicesBulk, updateDevice, deleteDevice, deleteDevicesBulk, updateDevicesBulk, simulateHostStats, getLocalIP, generateUUID, getSettings, saveSettings, restoreConfig, getLogs, clearLogs, verifyPin, sendLineDevicesSummary, sendWebhookDevicesSummary } from './services/monitorService';
import { Toaster, toast } from 'react-hot-toast';
import { PinModal } from './components/PinModal';
import { LatencyMonitor } from './components/LatencyMonitor';

const TRANSLATIONS: Record<Language, Translations> = {
  EN: {
    dashboard: 'Dashboard',
    deviceManagement: 'Device Management',
    latencyMonitor: 'Latency Monitor',
    downtimeHistory: 'Downtime History',
    settings: 'Settings',
    totalDevices: 'Total Devices',
    online: 'Online',
    offline: 'Offline',
    avgLatency: 'Avg Latency',
    criticalDevices: 'Critical Alerts',
    liveLatency: 'Live Network Latency',
    lastUpdated: 'Last updated',
    addDevice: 'Add Device',
    searchPlaceholder: 'Search by Name or IP...',
    systemStatus: 'Host Node Status',
    hostIp: 'Host IP',
    cpuLoad: 'CPU Load',
    ramUsage: 'RAM Usage',
    os: 'OS',
  },
  TH: {
    dashboard: 'แดชบอร์ด',
    deviceManagement: 'จัดการอุปกรณ์',
    latencyMonitor: 'ตรวจสอบ Latency',
    downtimeHistory: 'ประวัติการทำงาน',
    settings: 'ตั้งค่าระบบ',
    totalDevices: 'อุปกรณ์ทั้งหมด',
    online: 'ออนไลน์',
    offline: 'ออฟไลน์',
    avgLatency: 'Latency เฉลี่ย',
    criticalDevices: 'อุปกรณ์ที่มีปัญหา',
    liveLatency: 'กราฟ Latency แบบเรียลไทม์',
    lastUpdated: 'อัปเดตล่าสุด',
    addDevice: 'เพิ่มอุปกรณ์',
    searchPlaceholder: 'ค้นหาชื่อ หรือ IP...',
    systemStatus: 'สถานะเซิร์ฟเวอร์',
    hostIp: 'หมายเลขไอพีเครื่อง',
    cpuLoad: 'การใช้ CPU',
    ramUsage: 'การใช้ RAM',
    os: 'ระบบปฏิบัติการ',
  }
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isSubnetScannerOpen, setIsSubnetScannerOpen] = useState(false);
  const [isExecutiveReportOpen, setIsExecutiveReportOpen] = useState(false);
  const [monitorFilter, setMonitorFilter] = useState<'ALL' | 'ONLINE' | 'OFFLINE'>('ALL');
  const [pendingAction, setPendingAction] = useState<{ type: string; data?: any } | null>(null);
  const [adminPinSession, setAdminPinSession] = useState<string>(() => {
    return sessionStorage.getItem('netsentinel_admin_pin') || '';
  });
  const [isExplicitPinModalOpen, setIsExplicitPinModalOpen] = useState(false);
  
  const [devices, setDevices] = useState<Device[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const [settings, setSettings] = useState<AppSettings>({
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
  });

  const [logs, setLogs] = useState<DowntimeLog[]>([]);
  
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('ns_theme');
    if (saved !== null) {
      return saved === 'dark';
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('ns_lang');
    return (saved === 'EN' || saved === 'TH') ? saved : 'TH';
  }); 
  
  const [hostStats, setHostStats] = useState<SystemStats>({
    cpuUsage: 0,
    ramUsage: 0,
    ramTotal: 0,
    diskUsage: 0,
    diskTotal: 'Loading...',
    hostIp: 'Loading...',
    os: 'Loading...', 
    uptime: 0,
    internetStatus: navigator.onLine ? 'ONLINE' : 'OFFLINE'
  });

  // Load devices, settings, and logs from API on mount
  useEffect(() => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const loadData = async () => {
      try {
        const [devicesData, settingsData, logsData] = await Promise.all([getDevices(), getSettings(), getLogs()]);
        if (Array.isArray(devicesData)) setDevices(devicesData);
        if (settingsData) {
          if (settingsData.systemName === 'E-Broad') settingsData.systemName = 'E-Board';
          setSettings(settingsData);
        }
        if (Array.isArray(logsData)) setLogs(logsData);
      } catch (err: any) {
        if (err && (err.message === "Failed to fetch" || err.name === "TypeError" || err.message?.includes("429"))) {
          console.warn("Failed to load initial data from server, using cached data", err.message);
        } else {
          console.warn("Initial data load notice:", err?.message || err);
        }
      }
    };
    loadData();

    // Poll for device list updates (Optimized: 15s interval + lightweight delta sync)
    let isSyncing = false;
    let syncTimer: NodeJS.Timeout;
    let pollCount = 0;

    const syncData = async () => {
      if (isSyncing) return;
      isSyncing = true;
      // 15 seconds when active, 30 seconds when tab is hidden/background
      let nextInterval = typeof document !== 'undefined' && document.hidden ? 30000 : 15000;
      pollCount++;

      try {
        // Every 4th poll (approx 1 min) or on initial, sync full device list & logs. Otherwise use lightweight delta!
        if (pollCount % 4 === 0) {
          const [serverDevices, serverLogs] = await Promise.all([getDevices(), getLogs()]);
          setDevices(serverDevices);

          const currentLogs = logsRef.current;
          if (serverLogs.length > 0 && currentLogs.length > 0) {
            const newLogs = serverLogs.filter(sl => !currentLogs.some(cl => cl.id === sl.id));
            newLogs.forEach(log => {
              if (log.type === 'OUTAGE' && settingsRef.current.notifyOutage !== false) {
                toast.error(log.message, { position: 'bottom-right', duration: 4000 });
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification('Network Alert - DOWN', { body: log.message });
                }
                if (settingsRef.current.enableSoundAlerts && settingsRef.current.alertSoundUrl) {
                  const audio = new Audio(settingsRef.current.alertSoundUrl);
                  audio.volume = 0.5;
                  audio.play().catch(() => {});
                }
              }
              if (log.type === 'RECOVERY' && settingsRef.current.notifyRecovery !== false) {
                toast.success(log.message, { position: 'bottom-right', duration: 4000 });
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification('Network Alert - RECOVERED', { body: log.message });
                }
              }
              if (log.type === 'HIGH_LATENCY' && settingsRef.current.notifyWarning === true) {
                toast(log.message, { icon: '⚠️', position: 'bottom-right', duration: 4000 });
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification('Network Alert - WARNING', { body: log.message });
                }
              }
            });
          }
          setLogs(serverLogs);
        } else {
          // Lightweight live-status polling (transfers < 1 KB instead of full data)
          const liveStatuses = await getDevicesLiveStatus();
          if (liveStatuses && Array.isArray(liveStatuses)) {
            if (liveStatuses.length !== devicesRef.current.length) {
              // Device count changed on server (e.g. bulk import / add / delete), fetch full list immediately
              const freshDevices = await getDevices();
              if (Array.isArray(freshDevices)) {
                setDevices(freshDevices);
              }
            } else if (liveStatuses.length > 0) {
              setDevices(prevDevices => {
                const statusMap = new Map(liveStatuses.map(s => [s.id, s]));
                return prevDevices.map(d => {
                  const live = statusMap.get(d.id);
                  if (!live) return d;
                  return {
                    ...d,
                    ip: live.ip || d.ip,
                    status: live.status,
                    latency: live.latency,
                    packetLoss: live.packetLoss,
                    lastSeen: live.lastSeen,
                    lastStatusChange: live.lastStatusChange || d.lastStatusChange,
                    uptimePercentage: live.uptimePercentage !== undefined ? live.uptimePercentage : d.uptimePercentage,
                    isMonitored: live.isMonitored !== undefined ? live.isMonitored : d.isMonitored,
                    isMaintenance: live.isMaintenance !== undefined ? live.isMaintenance : d.isMaintenance,
                    remarks: live.remarks !== undefined ? live.remarks : d.remarks,
                    statusReason: live.statusReason !== undefined ? live.statusReason : d.statusReason
                  };
                });
              });
            }
          }
        }

        try {
          const newStats = await simulateHostStats(hostStatsRef.current);
          setHostStats(newStats);
        } catch (e) {}

      } catch (e: any) {
        if (e && (e.message === "Failed to fetch" || e.name === "TypeError" || e.message?.includes("429"))) {
          console.warn("Sync temporarily paused or rate-limited; using cached data", e.message);
          nextInterval = 20000; // back off when rate-limited or offline
        } else {
          console.warn("Sync temporarily unavailable:", e?.message || e);
        }
      } finally {
        isSyncing = false;
        syncTimer = setTimeout(syncData, nextInterval);
      }
    };

    // Schedule initial poll after 15 seconds (initial data already loaded on mount)
    syncTimer = setTimeout(syncData, 15000);

    return () => clearTimeout(syncTimer);
  }, []);

  // Save settings via API when changed (debounced or handled in Settings component)
  // We remove the useEffect that saves to localStorage
  
  useEffect(() => {
    document.title = settings.systemName ? `${settings.systemName} - IP Monitoring System v3.5` : "E-Board - IP Monitoring System v3.5";
  }, [settings]);

  useEffect(() => {
    getLocalIP().then(ip => {
      setHostStats(prev => ({ ...prev, hostIp: ip }));
    });
    const platform = window.navigator.platform;
    if (platform) setHostStats(prev => ({ ...prev, os: platform }));
    const handleOnline = () => setHostStats(prev => ({ ...prev, internetStatus: 'ONLINE' }));
    const handleOffline = () => setHostStats(prev => ({ ...prev, internetStatus: 'OFFLINE' }));
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
       window.removeEventListener('online', handleOnline);
       window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('ns_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('ns_theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem('ns_lang', lang);
  }, [lang]);

  // Use refs to access latest state inside intervals without resetting them
  const devicesRef = useRef(devices);
  const settingsRef = useRef(settings);
  const hostStatsRef = useRef(hostStats);
  const logsRef = useRef(logs);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    hostStatsRef.current = hostStats;
  }, [hostStats]);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  const stats = useMemo(() => {
    const total = devices.length;
    const online = devices.filter(d => d.status !== DeviceStatus.OFFLINE).length;
    const offline = total - online;
    const onlineDevices = devices.filter(d => d.status !== DeviceStatus.OFFLINE && d.latency > 0);
    const avgLatency = onlineDevices.length > 0 
      ? Number((onlineDevices.reduce((sum, d) => sum + d.latency, 0) / onlineDevices.length).toFixed(1))
      : 0;
    
    // Calculate Average SLA
    const monitoredDevices = devices.filter(d => d.isMonitored);
    const avgSla = monitoredDevices.length > 0
      ? monitoredDevices.reduce((sum, d) => sum + (d.uptimePercentage ?? (d.status === DeviceStatus.OFFLINE ? 0 : 100)), 0) / monitoredDevices.length
      : 100;

    return { total, online, offline, avgLatency, avgSla };
  }, [devices]);

  const getEffectivePin = (overridePin?: string) => overridePin || adminPinSession || undefined;

  const handleAdminLogout = () => {
    setAdminPinSession('');
    sessionStorage.removeItem('netsentinel_admin_pin');
    toast('🔒 ล็อกระบบกลับสู่โหมดผู้ชม (Viewer Only)', { icon: 'ℹ️' });
  };

  const handleAddDevice = async (device: Device, pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'ADD_DEVICE', data: device });
      return;
    }
    try {
      const newDevice = await addDevice({ ...device, id: generateUUID() }, effectivePin);
      setDevices(prev => [...prev, newDevice]);
      toast.success('เพิ่มอุปกรณ์เรียบร้อยแล้ว');
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'ADD_DEVICE', data: device });
        toast.error('รหัส PIN ไม่ถูกต้องหรือหมดอายุ');
      } else {
        toast.error('ไม่สามารถเพิ่มอุปกรณ์ได้');
      }
    }
  };

  const handleBulkImportDevices = async (payload: { devices: Partial<Device>[]; mode: 'replace' | 'merge' }, pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'BULK_IMPORT_DEVICES', data: payload });
      return;
    }
    try {
      const res = await importDevicesBulk(payload.devices, payload.mode, effectivePin);
      if (Array.isArray(res.devices)) {
        setDevices(res.devices);
      }
      toast.success(
        payload.mode === 'replace'
          ? `นำเข้าและแทนที่ข้อมูลสำเร็จทั้งหมด ${res.importedCount} รายการ!`
          : `นำเข้าและรวมข้อมูลสำเร็จ ${res.importedCount} รายการ (รวมทั้งหมด ${res.count} เครื่อง)!`
      );
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'BULK_IMPORT_DEVICES', data: payload });
        toast.error('รหัส PIN ไม่ถูกต้องหรือจำเป็นต้องยืนยันรหัส PIN ก่อนนำเข้าข้อมูล');
      } else {
        toast.error(e.message || 'ไม่สามารถนำเข้าข้อมูลอุปกรณ์ได้');
      }
    }
  };

  const handleScannerAddDevices = async (newDevices: Partial<Device>[], pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'SCANNER_ADD', data: newDevices });
      return;
    }
    const prepared: Partial<Device>[] = newDevices.map(item => ({
      id: generateUUID(),
      name: item.name || `Device-${item.ip}`,
      ip: item.ip || '',
      type: item.type || DeviceType.SERVER,
      location: item.location || 'สแกนอัตโนมัติ (Auto-Scanned)',
      status: item.status || DeviceStatus.ONLINE,
      latency: item.latency || 10,
      packetLoss: 0,
      model: '',
      lastStatusChange: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      isMonitored: true,
      tags: ['AutoScanned']
    }));
    try {
      const res = await importDevicesBulk(prepared, 'merge', effectivePin);
      if (Array.isArray(res.devices)) {
        setDevices(res.devices);
      }
      toast.success(`นำเข้าอุปกรณ์จากสแกนสำเร็จ ${res.importedCount} เครื่อง`);
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'SCANNER_ADD', data: newDevices });
        toast.error('รหัส PIN ไม่ถูกต้องหรือหมดอายุ');
      } else {
        toast.error('ไม่สามารถนำเข้าอุปกรณ์จากสแกนได้');
      }
    }
  };

  const handleUpdateDevice = async (device: Device, pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'UPDATE_DEVICE', data: device });
      return;
    }
    try {
      const updated = await updateDevice(device, effectivePin);
      setDevices(prev => prev.map(d => d.id === device.id ? updated : d));
      toast.success('บันทึกการแก้ไขอุปกรณ์เรียบร้อย');
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'UPDATE_DEVICE', data: device });
        toast.error('รหัส PIN ไม่ถูกต้องหรือหมดอายุ');
      } else {
        toast.error('ไม่สามารถแก้ไขอุปกรณ์ได้');
      }
    }
  };

  const handleDeleteDevice = async (id: string, pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'DELETE_DEVICE', data: id });
      return;
    }
    try {
      await deleteDevice(id, effectivePin);
      setDevices(prev => prev.filter(d => d.id !== id));
      toast.success('ลบอุปกรณ์เรียบร้อยแล้ว');
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'DELETE_DEVICE', data: id });
        toast.error('รหัส PIN ไม่ถูกต้องหรือหมดอายุ');
      } else {
        toast.error('ไม่สามารถลบอุปกรณ์ได้');
      }
    }
  };

  const handleExportPdfReport = () => {
    setIsExecutiveReportOpen(true);
  };

  const handleExportExcelReport = () => {
    exportToExcel({
      systemName: settings.systemName || 'E-Board',
      devices,
      logs
    });
    toast.success("กำลังดาวน์โหลดรายงาน Excel");
  };

  const handleBulkDeleteDevice = async (ids: string[], pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'BULK_DELETE_DEVICE', data: ids });
      return;
    }
    try {
      await deleteDevicesBulk(ids, effectivePin);
      setDevices(prev => prev.filter(d => !ids.includes(d.id)));
      toast.success(`ลบ ${ids.length} อุปกรณ์เรียบร้อยแล้ว`);
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'BULK_DELETE_DEVICE', data: ids });
        toast.error('รหัส PIN ไม่ถูกต้องหรือหมดอายุ');
      } else {
        toast.error('ไม่สามารถลบอุปกรณ์ได้');
      }
    }
  };

  const handleBulkUpdateRemarks = async (ids: string[], remarks: string, pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'BULK_UPDATE_REMARKS', data: { ids, remarks } });
      return;
    }
    try {
      await updateDevicesBulk(ids, { remarks }, effectivePin);
      setDevices(prev => prev.map(d => ids.includes(d.id) ? { ...d, remarks } : d));
      toast.success(`อัปเดตหมายเหตุสำหรับ ${ids.length} อุปกรณ์เรียบร้อยแล้ว`);
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'BULK_UPDATE_REMARKS', data: { ids, remarks } });
        toast.error('รหัส PIN ไม่ถูกต้องหรือหมดอายุ');
      } else {
        toast.error('ไม่สามารถอัปเดตหมายเหตุได้');
      }
    }
  };

  const handleUpdateRemarks = async (deviceId: string, remarks: string, pin?: string) => {
    const target = devices.find(d => d.id === deviceId);
    if (!target) return;
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'UPDATE_REMARKS', data: { deviceId, remarks } });
      return;
    }
    const updated = { ...target, remarks };
    try {
      const res = await updateDevice(updated, effectivePin);
      setDevices(prev => prev.map(d => d.id === deviceId ? res : d));
      toast.success('บันทึกหมายเหตุอุปกรณ์สำเร็จ');
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'UPDATE_REMARKS', data: { deviceId, remarks } });
        toast.error('รหัส PIN ไม่ถูกต้องหรือหมดอายุ');
      } else {
        toast.error('ไม่สามารถบันทึกหมายเหตุได้');
      }
    }
  };

  const handleClearLogs = async (pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'CLEAR_LOGS' });
      return;
    }
    try {
      const res = await clearLogs(effectivePin);
      setLogs([]);
      if (res?.devices && Array.isArray(res.devices)) {
        setDevices(res.devices);
      } else {
        const nowIso = new Date().toISOString();
        setDevices(prev => prev.map(d => ({
          ...d,
          lastStatusChange: nowIso,
          lastSeen: nowIso,
          totalUptimeSec: 0,
          totalDowntimeSec: 0,
          uptimePercentage: d.status === DeviceStatus.OFFLINE ? 0 : 100
        })));
      }
      toast.success('ล้างประวัติ Log และรีเซ็ตเวลานับถอยหลังอุปกรณ์เรียบร้อย');
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'CLEAR_LOGS' });
        toast.error('รหัส PIN ไม่ถูกต้องหรือหมดอายุ');
      } else {
        toast.error('ไม่สามารถล้างประวัติได้');
      }
    }
  };

  const handleSendLineSelection = async (payload: { deviceIds: string[]; customTitle?: string; remarksNote?: string }, pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'SEND_LINE_SELECTION', data: payload });
      return;
    }
    try {
      const res = await sendLineDevicesSummary({ ...payload, pin: effectivePin });
      toast.success(res.message || `ส่งรายงานสถานะอุปกรณ์ ${payload.deviceIds?.length || 0} เครื่องไปที่ LINE สำเร็จ!`);
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'SEND_LINE_SELECTION', data: payload });
        toast.error('รหัส PIN ไม่ถูกต้องหรือจำเป็นต้องยืนยันตัวตนก่อนส่งการแจ้งเตือน');
      } else {
        toast.error(e.message || 'ไม่สามารถส่งข้อความไปที่ LINE ได้');
      }
    }
  };

  const handleSendWebhookSelection = async (payload: { deviceIds: string[]; customTitle?: string; remarksNote?: string }, pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'SEND_WEBHOOK_SELECTION', data: payload });
      return;
    }
    try {
      const res = await sendWebhookDevicesSummary({ ...payload, pin: effectivePin });
      toast.success(res.message || `ส่งรายงานสถานะอุปกรณ์ ${payload.deviceIds?.length || 0} เครื่องไปที่ Webhook สำเร็จ!`);
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'SEND_WEBHOOK_SELECTION', data: payload });
        toast.error('รหัส PIN ไม่ถูกต้องหรือจำเป็นต้องยืนยันตัวตนก่อนส่งการแจ้งเตือน');
      } else {
        toast.error(e.message || 'ไม่สามารถส่งข้อความไปที่ Webhook (MS Teams) ได้');
      }
    }
  };

  const handleRestartServer = async (pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'RESTART_SERVER' });
      return;
    }
    try {
      const res = await fetch('/api/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: effectivePin })
      });
      if (res.ok) {
        toast.success('กำลังส่งคำสั่งรีสตาร์ตเซิร์ฟเวอร์... ระบบจะทำการรีสตาร์ตและพร้อมบริการใน 3-5 วินาที', { duration: 5000 });
        setPendingAction(null);
      } else {
        const data = await res.json();
        if (res.status === 401) {
          setAdminPinSession('');
          sessionStorage.removeItem('netsentinel_admin_pin');
          setPendingAction({ type: 'RESTART_SERVER' });
          toast.error('รหัส PIN ไม่ถูกต้อง');
        } else {
          toast.error(data.error || 'ไม่สามารถส่งคำสั่งรีสตาร์ตได้');
        }
      }
    } catch (e) {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    }
  };

  const handlePinSuccess = (pin: string) => {
    setAdminPinSession(pin);
    sessionStorage.setItem('netsentinel_admin_pin', pin);
    toast.success('🔓 ปลดล็อกสิทธิ์ผู้ดูแลระบบ (Admin) สำเร็จ');
    setIsExplicitPinModalOpen(false);

    if (!pendingAction) return;
    
    const { type, data } = pendingAction;
    setPendingAction(null);
    
    setTimeout(() => {
      switch (type) {
        case 'ADD_DEVICE': handleAddDevice(data, pin); break;
        case 'BULK_IMPORT_DEVICES': handleBulkImportDevices(data, pin); break;
        case 'UPDATE_DEVICE': handleUpdateDevice(data, pin); break;
        case 'DELETE_DEVICE': handleDeleteDevice(data, pin); break;
        case 'BULK_DELETE_DEVICE': handleBulkDeleteDevice(data, pin); break;
        case 'BULK_UPDATE_REMARKS': handleBulkUpdateRemarks(data.ids, data.remarks, pin); break;
        case 'UPDATE_REMARKS': handleUpdateRemarks(data.deviceId, data.remarks, pin); break;
        case 'SCANNER_ADD': handleScannerAddDevices(data, pin); break;
        case 'CLEAR_LOGS': handleClearLogs(pin); break;
        case 'RESTART_SERVER': handleRestartServer(pin); break;
        case 'SAVE_SETTINGS': handleSaveSettings(data, pin); break;
        case 'RESTORE_CONFIG': handleRestoreConfiguration(data, pin); break;
        case 'SEND_LINE_SELECTION': handleSendLineSelection(data, pin); break;
        case 'SEND_WEBHOOK_SELECTION': handleSendWebhookSelection(data, pin); break;
      }
    }, 0);
  };

  const handleSaveSettings = async (newSettings: AppSettings, pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'SAVE_SETTINGS', data: newSettings });
      return;
    }
    try {
      const saved = await saveSettings(newSettings, effectivePin);
      setSettings(saved);
      if (newSettings.adminPin) {
        setAdminPinSession(newSettings.adminPin);
        sessionStorage.setItem('netsentinel_admin_pin', newSettings.adminPin);
      }
      toast.success('บันทึกการตั้งค่าลงเซิร์ฟเวอร์เรียบร้อย');
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'SAVE_SETTINGS', data: newSettings });
        toast.error('รหัส PIN ไม่ถูกต้องหรือหมดอายุ');
      } else {
        toast.error('ไม่สามารถบันทึกการตั้งค่าได้');
      }
    }
  };

  const handleRestoreConfiguration = async (data: { settings: AppSettings, devices: Device[] }, pin?: string) => {
    const effectivePin = getEffectivePin(pin);
    if (settings.hasAdminPin && !effectivePin) {
      setPendingAction({ type: 'RESTORE_CONFIG', data });
      return;
    }
    try {
      await restoreConfig(data, effectivePin);
      setSettings(data.settings);
      setDevices(data.devices);
      toast.success('กู้คืนข้อมูลสำเร็จเรียบร้อยแล้ว!');
      setPendingAction(null);
    } catch (e: any) {
      if (e.message?.includes('Unauthorized') || e.message?.includes('Invalid PIN')) {
        setAdminPinSession('');
        sessionStorage.removeItem('netsentinel_admin_pin');
        setPendingAction({ type: 'RESTORE_CONFIG', data });
        toast.error('รหัส PIN ไม่ถูกต้องหรือหมดอายุ');
      } else {
        toast.error(e.message || 'ไม่สามารถกู้คืนข้อมูลได้');
      }
    }
  };

  const handleNavigateToMonitor = (filter: 'ALL' | 'ONLINE' | 'OFFLINE') => {
    setMonitorFilter(filter);
    setActiveTab('monitor');
  };

  const isAdmin = !settings.hasAdminPin || Boolean(adminPinSession);

  return (
    <Layout 
      activeTab={activeTab} 
      onTabChange={setActiveTab}
      hostStats={hostStats}
      t={TRANSLATIONS[lang]}
      systemName={settings.systemName || "E-Board"}
      hasAdminPin={settings.hasAdminPin}
      isAdmin={isAdmin}
      onAdminLogin={() => setIsExplicitPinModalOpen(true)}
      onAdminLogout={handleAdminLogout}
    >
      <CommandPalette 
        isOpen={isCommandPaletteOpen} 
        onClose={() => setIsCommandPaletteOpen(false)} 
        onNavigate={setActiveTab}
      />
      <Toaster 
        toastOptions={{
          style: {
            background: isDark ? '#1e293b' : '#fff',
            color: isDark ? '#fff' : '#1e293b',
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0'
          }
        }}
      />

      {(!!pendingAction || isExplicitPinModalOpen) && (
        <PinModal 
          onVerify={verifyPin}
          onSuccess={handlePinSuccess}
          onCancel={() => {
            setPendingAction(null);
            setIsExplicitPinModalOpen(false);
          }}
          title={
            !pendingAction ? 'เข้าสู่โหมดผู้ดูแลระบบ (Admin Mode)' :
            pendingAction.type === 'ADD_DEVICE' ? 'ยืนยันรหัส PIN เพื่อเพิ่มอุปกรณ์' :
            pendingAction.type === 'BULK_IMPORT_DEVICES' ? `ยืนยันรหัส PIN เพื่อนำเข้าอุปกรณ์ (${pendingAction.data?.devices?.length || 0} รายการ)` :
            pendingAction.type === 'UPDATE_DEVICE' ? 'ยืนยันรหัส PIN เพื่อแก้ไขอุปกรณ์' :
            pendingAction.type === 'DELETE_DEVICE' || pendingAction.type === 'BULK_DELETE_DEVICE' ? 'ยืนยันรหัส PIN เพื่อลบอุปกรณ์' :
            pendingAction.type === 'BULK_UPDATE_REMARKS' || pendingAction.type === 'UPDATE_REMARKS' ? 'ยืนยันรหัส PIN เพื่อบันทึกหมายเหตุ' :
            pendingAction.type === 'SCANNER_ADD' ? 'ยืนยันรหัส PIN เพื่อนำเข้าอุปกรณ์' :
            pendingAction.type === 'CLEAR_LOGS' ? 'ยืนยันรหัส PIN เพื่อล้างประวัติ' :
            pendingAction.type === 'RESTART_SERVER' ? 'ยืนยันรหัส PIN เพื่อรีสตาร์ตเซิร์ฟเวอร์' :
            pendingAction.type === 'SAVE_SETTINGS' ? 'ยืนยันรหัส PIN เพื่อบันทึกการตั้งค่า' :
            pendingAction.type === 'RESTORE_CONFIG' ? 'ยืนยันรหัส PIN เพื่อกู้คืนสำรองข้อมูล' :
            pendingAction.type === 'SEND_LINE_SELECTION' ? 'ยืนยันรหัส PIN เพื่อส่งข้อความแจ้งเตือน LINE' :
            pendingAction.type === 'SEND_WEBHOOK_SELECTION' ? 'ยืนยันรหัส PIN เพื่อส่งข้อความแจ้งเตือน Webhook' : 'ระบบป้องกัน: กรุณากรอกรหัส PIN'
          }
          description={
            !pendingAction ? 'กรุณากรอกรหัส PIN เพื่อปลดล็อกสิทธิ์ในการเพิ่ม ลบ หรือแก้ไขข้อมูล' :
            'ระบบถูกป้องกันไว้ ป้องกันบุคคลภายนอกสั่งการหรือแก้ไขข้อมูล กรุณากรอกรหัส PIN ผู้ดูแลระบบเพื่อดำเนินการ'
          }
        />
      )}
      
      {isSubnetScannerOpen && (
        <SubnetScannerModal 
          isOpen={isSubnetScannerOpen} 
          onClose={() => setIsSubnetScannerOpen(false)} 
          onAddDevices={handleScannerAddDevices}
          onSyncDevices={setDevices}
          hostIp={hostStats.hostIp}
          devices={devices}
        />
      )}

      {isExecutiveReportOpen && (
        <ExecutiveReportModal
          isOpen={isExecutiveReportOpen}
          onClose={() => setIsExecutiveReportOpen(false)}
          systemName={settings.systemName || 'E-Board'}
          devices={devices}
          logs={logs}
        />
      )}

      {activeTab === 'dashboard' && (
        <Dashboard 
          devices={devices} 
          logs={logs} 
          stats={stats} 
          t={TRANSLATIONS[lang]} 
          lang={lang}
          onNavigateToMonitor={handleNavigateToMonitor}
          toggleTheme={() => setIsDark(!isDark)}
          isDark={isDark}
          toggleLang={() => setLang(prev => prev === 'EN' ? 'TH' : 'EN')}
          onUpdateRemarks={handleUpdateRemarks}
        />
      )}
      
      {activeTab === 'devices' && (
        <DeviceManager 
          devices={devices} 
          onAdd={handleAddDevice} 
          onImportBulk={handleBulkImportDevices}
          onUpdate={handleUpdateDevice} 
          onDelete={handleDeleteDevice} 
          onDeleteBulk={handleBulkDeleteDevice}
          onOpenSubnetScanner={() => setIsSubnetScannerOpen(true)}
          onExportPdf={handleExportPdfReport}
          onExportExcel={handleExportExcelReport}
          onUpdateBulkRemarks={handleBulkUpdateRemarks}
          onUpdateRemarks={handleUpdateRemarks}
          onSendLineSelection={handleSendLineSelection}
          onSendWebhookSelection={handleSendWebhookSelection}
        />
      )}

      {activeTab === 'monitor' && (
        <LatencyMonitor 
          devices={devices} 
          logs={logs} 
          filterType={monitorFilter}
          setFilterType={setMonitorFilter}
          lang={lang}
          onUpdateRemarks={handleUpdateRemarks}
        />
      )}

      {activeTab === 'history' && (
        <HistoryView logs={logs} devices={devices} settings={settings} onSyncLogs={setLogs} />
      )}

      {activeTab === 'settings' && (
        <Settings 
          settings={settings} 
          devices={devices}
          onSave={handleSaveSettings} 
          onRestore={handleRestoreConfiguration}
          onClearLogs={handleClearLogs}
          onRestartServer={handleRestartServer}
        />
      )}
    </Layout>
  );
};

export default App;
