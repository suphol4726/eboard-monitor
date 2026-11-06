import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Device, DowntimeLog, DeviceStatus, DeviceType, formatLocation, normalizeFloorValue, formatFloorLabel 
} from '../types';
import { DeviceDetailModal } from './DeviceDetailModal';
import { 
  Activity, Search, ArrowUpDown, Maximize2, Minimize2, ArrowDown,
  Clock, MapPin, Wifi, Router, Video, Printer, Laptop, Server, Tv, Box,
  ArrowLeftRight, LayoutGrid, Grid, List, SlidersHorizontal, ChevronDown, ChevronUp, X
} from 'lucide-react';
import { resolveDeviceVendor } from '../utils/macVendor';

interface LatencyMonitorProps {
  devices: Device[];
  logs: DowntimeLog[];
  filterType: 'ALL' | 'ONLINE' | 'OFFLINE';
  setFilterType: (type: 'ALL' | 'ONLINE' | 'OFFLINE') => void;
  lang: string;
  onUpdateRemarks?: (deviceId: string, remarks: string) => Promise<void>;
}

const getDeviceIcon = (type: DeviceType) => {
  switch (type) {
    case DeviceType.ROUTER: return Router;
    case DeviceType.SWITCH: return ArrowLeftRight; 
    case DeviceType.SERVER: return Server;
    case DeviceType.PRINTER: return Printer;
    case DeviceType.CAMERA: return Video;
    case DeviceType.PC: return Laptop;
    case DeviceType.AP: return Wifi;
    case DeviceType.EBOARD: return Tv;
    default: return Box;
  }
};

/**
 * Standard Detailed Monitor Card
 */
const StandardMonitorCard = ({ 
  device, 
  onClick, 
  lang = 'TH' 
}: { 
  device: Device; 
  onClick: () => void; 
  lang?: string;
}) => {
  const isOnline = device.status === DeviceStatus.ONLINE;
  const isOffline = device.status === DeviceStatus.OFFLINE;
  const DeviceIcon = getDeviceIcon(device.type);
  const vendorInfo = resolveDeviceVendor(device);

  const [offlineDuration, setOfflineDuration] = useState('');

  const formatFullDate = (date: string) => {
    return new Date(date).toLocaleString(lang === 'TH' ? 'th-TH' : 'en-US', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      calendar: lang === 'TH' ? 'buddhist' : 'gregory'
    });
  };

  useEffect(() => {
    if (!isOffline) return;
    
    const updateTimer = () => {
      const now = new Date().getTime();
      const last = new Date(device.lastStatusChange || device.lastSeen).getTime();
      const diff = Math.max(0, Math.floor((now - last) / 1000));
      
      const d = Math.floor(diff / (3600 * 24));
      const h = Math.floor((diff % (3600 * 24)) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      
      let str = '';
      if (d > 0) str += `${d}d `;
      if (h > 0) str += `${h}h `;
      str += `${m}m ${s}s`;
      setOfflineDuration(str);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isOffline, device.lastSeen, device.lastStatusChange]);

  const colors = isOnline 
    ? { border: 'border-emerald-500', text: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-500', glow: 'shadow-emerald-500/10', bgGrad: 'from-emerald-500/5 to-transparent' } 
    : isOffline 
    ? { border: 'border-red-500', text: 'text-red-500 dark:text-red-400', bg: 'bg-red-500', glow: 'shadow-red-500/15', bgGrad: 'from-red-500/5 to-transparent' }
    : { border: 'border-amber-500', text: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-500', glow: 'shadow-amber-500/10', bgGrad: 'from-amber-500/5 to-transparent' };

  return (
    <div 
      onClick={onClick}
      className={`
        relative group bg-white dark:bg-slate-800 rounded-2xl overflow-hidden 
        border border-slate-200/90 dark:border-slate-700/80
        shadow-sm hover:shadow-lg ${colors.glow}
        transition-all duration-200 hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between
      `}
    >
      {/* Top accent border */}
      <div className={`h-1.5 w-full ${colors.bg}`}></div>
      <div className={`absolute inset-0 bg-gradient-to-b ${colors.bgGrad} opacity-30 pointer-events-none`}></div>

      <div className="p-3.5 sm:p-4 relative z-10 flex flex-col h-full justify-between gap-2.5">
        {/* Header: Icon, Name, Type, Status & SLA */}
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0">
              <div className={`p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700/70 ${colors.text} transition-all duration-300 group-hover:scale-110 shadow-2xs`}>
                <DeviceIcon className={`w-4 h-4 sm:w-4.5 sm:h-4.5 transition-transform duration-300 ${isOnline ? 'animate-pulse' : ''}`} />
              </div>
              {isOnline && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 pointer-events-none" title="Ping Active">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-2 ring-white dark:ring-slate-800"></span>
                </span>
              )}
              {isOffline && (
                <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 pointer-events-none" title="Offline">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 ring-2 ring-white dark:ring-slate-800"></span>
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-[15px] text-slate-800 dark:text-white leading-tight truncate" title={device.name}>
                {device.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  {device.type}
                </span>
                <span className="text-slate-300 dark:text-slate-600">•</span>
                <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 truncate max-w-[100px]">
                  {vendorInfo.vendor}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${colors.bg} text-white shadow-xs`}>
              {device.status}
            </div>
            {device.uptimePercentage !== undefined && (
              <div className="text-[9px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/70 px-1.5 py-0.5 rounded">
                SLA {device.uptimePercentage.toFixed(1)}%
              </div>
            )}
          </div>
        </div>

        {/* Telemetry Display (Latency or Outage Timer) */}
        <div className="my-1">
          {isOffline ? (
            <div className="space-y-1">
              <div className="bg-red-50 dark:bg-red-950/40 rounded-xl p-2.5 border border-red-100 dark:border-red-900/50">
                <p className="text-[9px] font-bold text-red-500 uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  ระยะเวลาออฟไลน์ (Offline)
                </p>
                <p className="text-xl sm:text-2xl font-mono font-black text-red-600 dark:text-red-400 tracking-tight">
                  {offlineDuration || '0m 0s'}
                </p>
              </div>
              <p className="text-[9px] text-slate-400 text-center font-medium truncate">
                ดับเมื่อ: {formatFullDate(device.lastStatusChange || device.lastSeen)}
              </p>
            </div>
          ) : (
            <div className="flex items-end justify-between py-0.5">
              <div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-3xl sm:text-4xl font-black tracking-tighter ${colors.text} font-mono leading-none`}>
                    {device.latency}
                  </span>
                  <span className="text-xs font-bold text-slate-400">ms</span>
                </div>
                <p className="text-[9px] text-slate-400 font-medium mt-1 truncate">
                  ตรวจล่าสุด: {formatFullDate(device.lastSeen)}
                </p>
              </div>

              {/* Dynamic Bouncing Ping Equalizer Wave */}
              <div className="flex items-end gap-1 h-8 pb-0.5" title={`Signal Wave (${device.latency || 0}ms)`}>
                {[
                  { baseH: 28, delay: '0s' },
                  { baseH: 46, delay: '0.12s' },
                  { baseH: 64, delay: '0.24s' },
                  { baseH: 82, delay: '0.36s' },
                  { baseH: 100, delay: '0.48s' },
                ].map((bar, i) => {
                  const animSpeed = (device.latency && device.latency < 50) ? '0.75s' : (device.latency && device.latency < 150) ? '1.0s' : '1.3s';
                  return (
                    <div 
                      key={i} 
                      className={`w-1.5 rounded-full animate-ping-bar ${colors.bg}`} 
                      style={{ 
                        height: `${bar.baseH}%`, 
                        animation: isOnline ? `pingEqualizer ${animSpeed} ease-in-out infinite alternate ${bar.delay}` : 'none',
                        opacity: isOnline ? 0.95 : 0.25,
                        boxShadow: isOnline ? '0 0 6px rgba(16, 185, 129, 0.4)' : 'none'
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Remarks pill if exists */}
        {device.remarks && (
          <div className="text-[10px] px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200/70 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 font-medium truncate flex items-center gap-1">
            <span className="font-bold shrink-0">📝</span>
            <span className="truncate">{device.remarks}</span>
          </div>
        )}

        {/* Footer: IP & Location */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-xs gap-1.5">
          <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/50 px-2 py-0.5 rounded-md font-medium text-[11px] truncate">
            <Box className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="font-mono font-bold truncate">
              {device.ip}{device.monitorPort ? `:${device.monitorPort}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 text-[11px] min-w-0">
            <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
            <span className="truncate max-w-[110px] sm:max-w-[130px] font-medium" title={formatLocation(device.location, device.floor)}>
              {formatLocation(device.location, device.floor)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Compact Monitor Card (Ultra sleek for Mobile & Dense View)
 */
const CompactMonitorCard = ({ 
  device, 
  onClick
}: { 
  device: Device; 
  onClick: () => void; 
}) => {
  const isOnline = device.status === DeviceStatus.ONLINE;
  const isOffline = device.status === DeviceStatus.OFFLINE;
  const DeviceIcon = getDeviceIcon(device.type);
  const vendorInfo = resolveDeviceVendor(device);

  const [offlineDuration, setOfflineDuration] = useState('');

  useEffect(() => {
    if (!isOffline) return;
    const updateTimer = () => {
      const now = new Date().getTime();
      const last = new Date(device.lastStatusChange || device.lastSeen).getTime();
      const diff = Math.max(0, Math.floor((now - last) / 1000));
      const m = Math.floor(diff / 60);
      const s = diff % 60;
      setOfflineDuration(`${m}m ${s}s`);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isOffline, device.lastSeen, device.lastStatusChange]);

  const colors = isOnline 
    ? { dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', badge: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' } 
    : isOffline 
    ? { dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400', badge: 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' }
    : { dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' };

  return (
    <div 
      onClick={onClick}
      className="p-2.5 sm:p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-blue-500 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-1.5"
    >
      {/* Top row: Status Dot, Icon, Name, Latency / Alert */}
      <div className="flex items-start justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${colors.dot} ${isOnline ? 'animate-pulse' : ''}`} />
          <DeviceIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 shrink-0" />
          <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-white truncate" title={device.name}>
            {device.name}
          </h4>
        </div>
        <div className="shrink-0 text-right">
          {isOffline ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-black bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 font-mono">
              <Clock className="w-2.5 h-2.5" />
              {offlineDuration || 'OFF'}
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="flex items-baseline gap-0.5 font-mono">
                <span className={`text-base sm:text-lg font-black leading-none ${colors.text}`}>
                  {device.latency}
                </span>
                <span className="text-[9px] font-bold text-slate-400">ms</span>
              </div>
              <div className="flex items-end gap-0.5 h-4 pb-0.5" title={`${device.latency}ms`}>
                {[
                  { baseH: 35, delay: '0s' },
                  { baseH: 65, delay: '0.15s' },
                  { baseH: 100, delay: '0.3s' },
                ].map((bar, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full animate-ping-bar ${colors.dot}`}
                    style={{
                      height: `${bar.baseH}%`,
                      animation: isOnline ? `pingEqualizer 0.85s ease-in-out infinite alternate ${bar.delay}` : 'none',
                      opacity: isOnline ? 0.95 : 0.3
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Middle: IP & Vendor Tag */}
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
        <span className="truncate font-semibold">{device.ip}</span>
        <span className="text-indigo-600 dark:text-indigo-400 font-bold truncate max-w-[80px]">
          {vendorInfo.vendor}
        </span>
      </div>

      {/* Bottom: Location & SLA */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-700/60 text-[10px] text-slate-500">
        <span className="truncate max-w-[120px]" title={formatLocation(device.location, device.floor)}>
          📍 {formatLocation(device.location, device.floor)}
        </span>
        {device.uptimePercentage !== undefined && (
          <span className="font-bold text-slate-600 dark:text-slate-300">
            {device.uptimePercentage.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Live List / Table Row
 */
const LiveListRow = ({ 
  device, 
  onClick 
}: { 
  device: Device; 
  onClick: () => void; 
}) => {
  const isOnline = device.status === DeviceStatus.ONLINE;
  const isOffline = device.status === DeviceStatus.OFFLINE;
  const DeviceIcon = getDeviceIcon(device.type);
  const vendorInfo = resolveDeviceVendor(device);

  return (
    <tr 
      onClick={onClick}
      className="border-b border-slate-100 dark:border-slate-800 hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer text-xs"
    >
      <td className="py-2 px-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : isOffline ? 'bg-red-500' : 'bg-amber-500'}`} />
          <DeviceIcon className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
          <div className="min-w-0">
            <p className="font-bold text-slate-800 dark:text-white truncate max-w-[160px] sm:max-w-[220px]" title={device.name}>
              {device.name}
            </p>
            <p className="text-[10px] text-slate-400">{device.type}</p>
          </div>
        </div>
      </td>
      <td className="py-2 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
        {device.ip}{device.monitorPort ? `:${device.monitorPort}` : ''}
      </td>
      <td className="py-2 px-3 text-slate-600 dark:text-slate-300 truncate max-w-[140px]">
        {formatLocation(device.location, device.floor)}
      </td>
      <td className="py-2 px-3">
        <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200/60 dark:border-indigo-800/60">
          {vendorInfo.vendor}
        </span>
      </td>
      <td className="py-2 px-3 text-right">
        {isOffline ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 uppercase">
            Offline
          </span>
        ) : (
          <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
            {device.latency} <span className="text-[10px] text-slate-400">ms</span>
          </span>
        )}
      </td>
      <td className="py-2 px-3 text-right font-bold text-slate-600 dark:text-slate-300">
        {device.uptimePercentage !== undefined ? `${device.uptimePercentage.toFixed(1)}%` : '-'}
      </td>
    </tr>
  );
};

export const LatencyMonitor: React.FC<LatencyMonitorProps> = ({
  devices,
  logs,
  filterType,
  setFilterType,
  lang,
  onUpdateRemarks
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [sortConfig, setSortConfig] = useState<{ 
    key: 'name' | 'ip' | 'location' | 'status' | 'latency' | 'floor' | 'type' | 'sla'; 
    direction: 'asc' | 'desc';
  }>({ key: 'name', direction: 'asc' });
  const [groupBy, setGroupBy] = useState<'NONE' | 'LOCATION' | 'TYPE' | 'STATUS'>('NONE');
  const [density, setDensity] = useState<'compact' | 'standard' | 'table'>('standard');
  const [filterLocation, setFilterLocation] = useState<string>('ALL');
  const [filterFloor, setFilterFloor] = useState<string>('ALL');
  const [filterTypeSelect, setFilterTypeSelect] = useState<string>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeFilterCount = [
    filterLocation !== 'ALL',
    filterFloor !== 'ALL',
    filterTypeSelect !== 'ALL',
    groupBy !== 'NONE'
  ].filter(Boolean).length;

  // Quick statistics
  const stats = useMemo(() => {
    const total = devices.length;
    const onlineDevices = devices.filter(d => d.status === DeviceStatus.ONLINE);
    const offlineDevices = devices.filter(d => d.status === DeviceStatus.OFFLINE);
    const slowDevices = onlineDevices.filter(d => (d.latency || 0) > 80);
    const avgLatency = onlineDevices.length 
      ? Math.round(onlineDevices.reduce((sum, d) => sum + (d.latency || 0), 0) / onlineDevices.length)
      : 0;

    return {
      total,
      online: onlineDevices.length,
      offline: offlineDevices.length,
      slow: slowDevices.length,
      avgLatency
    };
  }, [devices]);

  const allLocations = useMemo(() => {
    const locations = devices.map(d => d.location?.trim()).filter(Boolean);
    return ['ALL', ...Array.from(new Set(locations))];
  }, [devices]);

  const allFloors = useMemo(() => {
    const floors = new Set<string>();
    devices.forEach(d => {
      const normalized = normalizeFloorValue(d.floor);
      if (normalized) floors.add(normalized);
    });
    return ['ALL', ...Array.from(floors).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }))];
  }, [devices]);

  const allTypes = useMemo(() => {
    const types = devices.map(d => d.type).filter(Boolean);
    return ['ALL', ...Array.from(new Set(types))];
  }, [devices]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => console.error(err));
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleSort = (key: 'name' | 'ip' | 'location' | 'status' | 'latency' | 'floor' | 'type' | 'sla') => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key) {
      direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    }
    setSortConfig({ key, direction });
  };

  const toggleSortDirection = () => {
    setSortConfig(prev => ({
      ...prev,
      direction: prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredDevices = useMemo(() => {
    let filtered = devices.filter(d => {
      const matchesSearch = 
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        d.ip.includes(searchTerm) || 
        d.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (d.floor && d.floor.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (d.model && d.model.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (d.macAddress && d.macAddress.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesFilter = filterType === 'ALL' 
        ? true 
        : filterType === 'ONLINE' 
          ? d.status === DeviceStatus.ONLINE || d.status === DeviceStatus.WARNING 
          : d.status === DeviceStatus.OFFLINE;

      const matchesLocation = filterLocation === 'ALL' || d.location === filterLocation;
      const matchesFloor = filterFloor === 'ALL' || normalizeFloorValue(d.floor) === normalizeFloorValue(filterFloor);
      const matchesType = filterTypeSelect === 'ALL' || d.type === filterTypeSelect;

      return matchesSearch && matchesFilter && matchesLocation && matchesFloor && matchesType;
    });

    if (sortConfig) {
      filtered.sort((a, b) => {
        let comparison = 0;

        if (sortConfig.key === 'latency') {
          const latA = a.status === DeviceStatus.OFFLINE ? 999999 : (a.latency ?? 0);
          const latB = b.status === DeviceStatus.OFFLINE ? 999999 : (b.latency ?? 0);
          comparison = latA - latB;
        } else if (sortConfig.key === 'ip') {
          // Robust IPv4 octet comparison (e.g. 192.168.1.2 before 192.168.1.10)
          const parseIP = (ip: string) => (ip || '').trim().split('.').map(n => parseInt(n, 10));
          const pA = parseIP(a.ip);
          const pB = parseIP(b.ip);
          if (pA.length === 4 && pB.length === 4 && !pA.some(isNaN) && !pB.some(isNaN)) {
            for (let i = 0; i < 4; i++) {
              if (pA[i] !== pB[i]) {
                comparison = pA[i] - pB[i];
                break;
              }
            }
          } else {
            comparison = (a.ip || '').localeCompare(b.ip || '', undefined, { numeric: true });
          }
        } else if (sortConfig.key === 'status') {
          // Status rank: OFFLINE (0) -> WARNING (1) -> ONLINE (2)
          const statusOrder = { [DeviceStatus.OFFLINE]: 0, [DeviceStatus.WARNING]: 1, [DeviceStatus.ONLINE]: 2 };
          const rankA = statusOrder[a.status] ?? 3;
          const rankB = statusOrder[b.status] ?? 3;
          comparison = rankA - rankB;
        } else if (sortConfig.key === 'sla') {
          const slaA = a.uptimePercentage ?? 100;
          const slaB = b.uptimePercentage ?? 100;
          comparison = slaA - slaB;
        } else {
          // String properties: name, location, floor, type
          const valA = (a[sortConfig.key] ?? '').toString();
          const valB = (b[sortConfig.key] ?? '').toString();
          // Natural sort: supports numbers in names like "E-Board 1", "E-Board 2", "E-Board 10"
          comparison = valA.localeCompare(valB, 'th', { sensitivity: 'base', numeric: true });
        }

        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [devices, searchTerm, filterType, sortConfig, filterLocation, filterFloor, filterTypeSelect]);

  const groupedDevices = useMemo(() => {
    if (groupBy === 'NONE') return { 'อุปกรณ์ทั้งหมด': filteredDevices };
    
    return filteredDevices.reduce((acc, device) => {
      let key = 'Other';
      if (groupBy === 'LOCATION') key = device.location || 'ไม่ระบุสถานที่';
      else if (groupBy === 'TYPE') key = device.type || 'ทั่วไป';
      else if (groupBy === 'STATUS') key = device.status;

      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(device);
      return acc;
    }, {} as Record<string, Device[]>);
  }, [filteredDevices, groupBy]);

  return (
    <div 
      ref={containerRef}
      className={`space-y-4 sm:space-y-5 ${isFullscreen ? 'p-4 sm:p-6 bg-slate-50 dark:bg-slate-900 h-screen overflow-y-auto' : ''}`}
    >
      {selectedDevice && (
        <DeviceDetailModal 
          device={devices.find(d => d.id === selectedDevice.id) || selectedDevice} 
          logs={logs} 
          onClose={() => setSelectedDevice(null)}
          onUpdateRemarks={onUpdateRemarks}
        />
      )}

      {/* Top Header - Single-Row Compact on Mobile */}
      <div className="flex items-center justify-between gap-2 pb-1.5 sm:pb-2 border-b border-slate-200 dark:border-slate-700/80">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="p-2 sm:p-2.5 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl sm:rounded-2xl shadow-sm shadow-blue-500/20 text-white shrink-0">
            <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h2 className="text-base sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-tight truncate">
                <span className="sm:hidden">{lang === 'TH' ? 'ตรวจสอบ Latency' : 'Latency Monitor'}</span>
                <span className="hidden sm:inline">{lang === 'TH' ? 'ตรวจสอบ Latency แบบเรียลไทม์' : 'Realtime Latency Monitor'}</span>
              </h2>
              <span className="relative flex h-2 w-2 sm:h-2.5 sm:w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 sm:h-2.5 sm:w-2.5 bg-emerald-500"></span>
              </span>
            </div>
            <p className="hidden sm:block text-slate-500 dark:text-slate-400 text-xs font-medium mt-0.5 truncate">
              {lang === 'TH' ? 'ตรวจจับสถานะและค่า Ping ตอบสนองทุกอุปกรณ์อัตโนมัติ' : 'Live telemetry & network ping monitoring'}
            </p>
          </div>
        </div>

        {/* Quick Density & View Mode Switcher */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <div className="flex p-0.5 sm:p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setDensity('compact')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                density === 'compact' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="โหมดกะทัดรัด (พอดีจอ สำหรับมือถือ / ดูภาพรวม)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden md:inline">กะทัดรัด</span>
            </button>
            <button
              type="button"
              onClick={() => setDensity('standard')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                density === 'standard' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="โหมดมาตรฐาน (รายละเอียดครบ)"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden md:inline">มาตรฐาน</span>
            </button>
            <button
              type="button"
              onClick={() => setDensity('table')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                density === 'table' 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
              title="โหมดตารางแถว"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden md:inline">ตาราง</span>
            </button>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-1.5 sm:p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-xs"
            title="สลับเต็มจอ (Fullscreen Mode)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar - Collapsible & Ultra-Clean on Mobile */}
      <div className="bg-white dark:bg-slate-800/95 p-2.5 sm:p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-2">
        {/* Top Row: Search Input + Filter Drawer Toggle Button + Status Tabs (on Desktop) */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
          {/* Search Box + Collapsible Filter Trigger */}
          <div className="flex items-center gap-1.5 flex-1">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text"
                placeholder="ค้นหาชื่อ, IP, อาคาร, ชั้น, ผู้ผลิต หรือ MAC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 sm:h-10 pl-9 sm:pl-10 pr-7 text-xs sm:text-sm bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-800 dark:text-slate-100 font-medium shadow-2xs transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold p-1"
                  title="ล้างคำค้นหา"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Collapsible Filter & Sort Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFilters(prev => !prev)}
              className={`h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                showFilters || activeFilterCount > 0
                  ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'bg-slate-50 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="เปิด/ปิด ตัวกรองและการเรียงลำดับ"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
              <span>ตัวกรอง</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-white text-[10px] font-mono leading-tight">
                  {activeFilterCount}
                </span>
              )}
              {showFilters ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
            </button>
          </div>

          {/* Status Filter Segmented Control (3 Equal Columns) */}
          <div className="grid grid-cols-3 p-0.5 sm:p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/80 shrink-0 lg:min-w-[320px] gap-1">
            <button
              type="button"
              onClick={() => setFilterType('ALL')}
              className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                filterType === 'ALL'
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              <span>ทั้งหมด</span>
              <span className="text-[10px] opacity-80 font-mono">({stats.total})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('ONLINE')}
              className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                filterType === 'ONLINE'
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
              <span>ออนไลน์</span>
              <span className="text-[10px] opacity-80 font-mono">({stats.online})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterType('OFFLINE')}
              className={`px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer ${
                filterType === 'OFFLINE'
                  ? 'bg-white dark:bg-slate-800 text-red-600 dark:text-red-400 shadow-xs'
                  : 'text-slate-500 hover:text-red-600 dark:hover:text-red-400'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
              <span>ออฟไลน์</span>
              <span className="text-[10px] opacity-80 font-mono">({stats.offline})</span>
            </button>
          </div>
        </div>

        {/* Active Filter Pills when Drawer is Collapsed */}
        {!showFilters && activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/60">
            {filterLocation !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold">
                🏢 {filterLocation}
                <button type="button" onClick={() => setFilterLocation('ALL')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterFloor !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold">
                📶 {formatFloorLabel(filterFloor)}
                <button type="button" onClick={() => setFilterFloor('ALL')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterTypeSelect !== 'ALL' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold">
                🏷️ {filterTypeSelect}
                <button type="button" onClick={() => setFilterTypeSelect('ALL')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {groupBy !== 'NONE' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold">
                📦 จัดกลุ่มแล้ว
                <button type="button" onClick={() => setGroupBy('NONE')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setFilterLocation('ALL');
                setFilterFloor('ALL');
                setFilterTypeSelect('ALL');
                setGroupBy('NONE');
              }}
              className="text-[11px] font-extrabold text-red-600 dark:text-red-400 hover:underline ml-auto"
            >
              ล้างทั้งหมด
            </button>
          </div>
        )}

        {/* Collapsible Drawer: Filter, Grouping & Sorting Grid */}
        {showFilters && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 sm:gap-2.5 animate-in fade-in duration-150">
            {/* 1. Location Filter */}
            <div className="flex flex-col">
              <label className="hidden sm:block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-0.5">
                อาคาร / สถานที่
              </label>
              <div className="relative">
                <select 
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  className={`w-full h-8 sm:h-9 appearance-none pl-2.5 pr-6 rounded-xl border text-[11px] sm:text-xs font-bold cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors ${
                    filterLocation !== 'ALL'
                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">📍 ทุกอาคาร</option>
                  {allLocations.filter(loc => loc !== 'ALL').map(loc => (
                    <option key={loc} value={loc}>🏢 {loc}</option>
                  ))}
                </select>
                <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 2. Floor Filter */}
            <div className="flex flex-col">
              <label className="hidden sm:block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-0.5">
                ระดับชั้น
              </label>
              <div className="relative">
                <select 
                  value={filterFloor}
                  onChange={(e) => setFilterFloor(e.target.value)}
                  className={`w-full h-8 sm:h-9 appearance-none pl-2.5 pr-6 rounded-xl border text-[11px] sm:text-xs font-bold cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors ${
                    filterFloor !== 'ALL'
                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">📶 ทุกชั้น</option>
                  {allFloors.filter(fl => fl !== 'ALL').map(fl => (
                    <option key={fl} value={fl}>{formatFloorLabel(fl)}</option>
                  ))}
                </select>
                <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 3. Device Type Filter */}
            <div className="flex flex-col">
              <label className="hidden sm:block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-0.5">
                ประเภทอุปกรณ์
              </label>
              <div className="relative">
                <select 
                  value={filterTypeSelect}
                  onChange={(e) => setFilterTypeSelect(e.target.value)}
                  className={`w-full h-8 sm:h-9 appearance-none pl-2.5 pr-6 rounded-xl border text-[11px] sm:text-xs font-bold cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors ${
                    filterTypeSelect !== 'ALL'
                      ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <option value="ALL">🏷️ ทุกประเภท</option>
                  {allTypes.filter(t => t !== 'ALL').map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 4. Group By */}
            <div className="flex flex-col">
              <label className="hidden sm:block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-0.5">
                การจัดกลุ่ม
              </label>
              <div className="relative">
                <select 
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as any)}
                  className={`w-full h-8 sm:h-9 appearance-none pl-2.5 pr-6 rounded-xl border text-[11px] sm:text-xs font-bold cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors ${
                    groupBy !== 'NONE'
                      ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <option value="NONE">📦 ไม่จัดกลุ่ม</option>
                  <option value="LOCATION">🏢 แยกตามอาคาร</option>
                  <option value="TYPE">🏷️ แยกตามประเภท</option>
                  <option value="STATUS">⚡ แยกตามสถานะ</option>
                </select>
                <ArrowDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 5. Sort Dropdown & Direction Control */}
            <div className="flex flex-col col-span-2 sm:col-span-2 lg:col-span-1">
              <div className="hidden sm:flex items-center justify-between mb-1 px-0.5">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  เรียงลำดับข้อมูล
                </label>
                {(searchTerm || filterType !== 'ALL' || activeFilterCount > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setFilterType('ALL');
                      setFilterLocation('ALL');
                      setFilterFloor('ALL');
                      setFilterTypeSelect('ALL');
                      setGroupBy('NONE');
                    }}
                    className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    ล้างตัวกรอง
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <select 
                    value={sortConfig.key}
                    onChange={(e) => setSortConfig(prev => ({ ...prev, key: e.target.value as any }))}
                    className="w-full h-8 sm:h-9 appearance-none pl-7 pr-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[11px] sm:text-xs font-bold cursor-pointer truncate"
                    title="เลือกเกณฑ์การเรียงลำดับ"
                  >
                    <option value="name">เรียง: ชื่อ / เลขห้อง</option>
                    <option value="ip">เรียง: หมายเลข IP</option>
                    <option value="latency">เรียง: ความเร็ว Ping</option>
                    <option value="status">เรียง: สถานะออนไลน์</option>
                    <option value="location">เรียง: อาคาร / สถานที่</option>
                    <option value="floor">เรียง: ระดับชั้น</option>
                    <option value="type">เรียง: ประเภทอุปกรณ์</option>
                    <option value="sla">เรียง: ค่า SLA (%)</option>
                  </select>
                  <ArrowUpDown className="w-3.5 h-3.5 text-blue-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <ArrowDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <button
                  type="button"
                  onClick={toggleSortDirection}
                  className="h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] sm:text-xs font-extrabold rounded-xl text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors shrink-0 flex items-center justify-center gap-1 cursor-pointer"
                  title={sortConfig.direction === 'asc' ? 'กำลังเรียง: น้อย ➔ มาก (คลิกเพื่อสลับ)' : 'กำลังเรียง: มาก ➔ น้อย (คลิกเพื่อสลับ)'}
                >
                  <span>{sortConfig.direction === 'asc' ? '↑ น้อย➔มาก' : '↓ มาก➔น้อย'}</span>
                </button>

                {(searchTerm || filterType !== 'ALL' || activeFilterCount > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setFilterType('ALL');
                      setFilterLocation('ALL');
                      setFilterFloor('ALL');
                      setFilterTypeSelect('ALL');
                      setGroupBy('NONE');
                    }}
                    className="sm:hidden h-8 px-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/80 rounded-xl text-[11px] font-extrabold shrink-0"
                    title="ล้างตัวกรอง"
                  >
                    ล้าง
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content View Rendering */}
      <div className="space-y-6">
        {filteredDevices.length > 0 ? (
          Object.entries(groupedDevices).map(([groupName, groupDevices]) => (
            <div key={groupName} className="space-y-3">
              {groupBy !== 'NONE' && (
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-1.5">
                  <h3 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    <span>{groupName}</span>
                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold px-2 py-0.5 rounded-full">
                      {groupDevices.length}
                    </span>
                  </h3>
                </div>
              )}

              {/* DENSITY: COMPACT (Optimized for Mobile & Overview) */}
              {density === 'compact' && (
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-3">
                  {groupDevices.map(device => (
                    <CompactMonitorCard 
                      key={device.id} 
                      device={device} 
                      onClick={() => setSelectedDevice(device)}
                    />
                  ))}
                </div>
              )}

              {/* DENSITY: STANDARD (Detailed Cards) */}
              {density === 'standard' && (
                <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
                  {groupDevices.map(device => (
                    <StandardMonitorCard 
                      key={device.id} 
                      device={device} 
                      onClick={() => setSelectedDevice(device)}
                      lang={lang}
                    />
                  ))}
                </div>
              )}

              {/* DENSITY: TABLE LIST (High Density Rows) */}
              {density === 'table' && (
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
                          <th 
                            className="py-2.5 px-3 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            onClick={() => handleSort('name')}
                            title="คลิกเพื่อเรียงตามชื่อ"
                          >
                            <div className="flex items-center gap-1">
                              <span>อุปกรณ์</span>
                              {sortConfig.key === 'name' && (
                                <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            className="py-2.5 px-3 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            onClick={() => handleSort('ip')}
                            title="คลิกเพื่อเรียงตาม IP"
                          >
                            <div className="flex items-center gap-1">
                              <span>IP Address</span>
                              {sortConfig.key === 'ip' && (
                                <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            className="py-2.5 px-3 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            onClick={() => handleSort('location')}
                            title="คลิกเพื่อเรียงตามสถานที่"
                          >
                            <div className="flex items-center gap-1">
                              <span>สถานที่ / อาคาร</span>
                              {sortConfig.key === 'location' && (
                                <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th className="py-2.5 px-3">ผู้ผลิต (Vendor)</th>
                          <th 
                            className="py-2.5 px-3 text-right cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            onClick={() => handleSort('latency')}
                            title="คลิกเพื่อเรียงตาม Latency"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>Latency</span>
                              {sortConfig.key === 'latency' && (
                                <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            className="py-2.5 px-3 text-right cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            onClick={() => handleSort('sla')}
                            title="คลิกเพื่อเรียงตาม SLA"
                          >
                            <div className="flex items-center justify-end gap-1">
                              <span>SLA</span>
                              {sortConfig.key === 'sla' && (
                                <span className="text-blue-600 dark:text-blue-400 font-extrabold">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupDevices.map(device => (
                          <LiveListRow 
                            key={device.id} 
                            device={device} 
                            onClick={() => setSelectedDevice(device)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="py-16 text-center flex flex-col items-center justify-center bg-white dark:bg-slate-800 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <Search className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-base font-bold text-slate-700 dark:text-slate-200">ไม่พบอุปกรณ์ที่ตรงตามเงื่อนไข</p>
            <p className="text-xs text-slate-400 mt-1">ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองด้านบน</p>
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterType('ALL');
                setFilterLocation('ALL');
                setFilterFloor('ALL');
                setFilterTypeSelect('ALL');
              }}
              className="mt-3 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-100 transition-colors"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
