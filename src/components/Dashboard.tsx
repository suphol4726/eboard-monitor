
import React, { useState, useEffect, useMemo } from 'react';
import { Device, DeviceStatus, DashboardStats, DowntimeLog, Translations, formatLocation } from '../types';
import { DeviceDetailModal } from './DeviceDetailModal';
import { 
  Zap,
  AlertTriangle,
  ShieldCheck,
  Activity,
  Clock,
  MapPin,
  Server,
  CalendarDays,
  AlertOctagon,
  CheckCircle2,
  PieChart,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  XCircle,
  Globe,
  Sun,
  Moon
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer
} from 'recharts';

interface DashboardProps {
  devices: Device[];
  logs: DowntimeLog[];
  stats: DashboardStats;
  t: Translations;
  lang: string;
  onNavigateToMonitor: (filter: 'ALL' | 'ONLINE' | 'OFFLINE') => void;
  toggleTheme: () => void;
  isDark: boolean;
  toggleLang: () => void;
  onUpdateRemarks?: (deviceId: string, remarks: string) => Promise<void>;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  devices, logs, stats, t, lang, onNavigateToMonitor,
  toggleTheme, isDark, toggleLang, onUpdateRemarks
}) => {
  const [time, setTime] = useState(new Date());
  
  // Local State
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [listFilter, setListFilter] = useState<'ALL' | 'OFFLINE'>('OFFLINE'); 

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // --- THAI DATE FORMATTING UTILS ---
  const formatThaiDateTime = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString(lang === 'TH' ? 'th-TH' : 'en-US', {
       year: 'numeric',
       month: 'long',
       day: 'numeric',
       hour: '2-digit',
       minute: '2-digit',
       second: '2-digit',
       hour12: false,
       calendar: lang === 'TH' ? 'buddhist' : 'gregory'
    });
  };

  const formatThaiTime = (date: Date) => {
    return date.toLocaleTimeString(lang === 'TH' ? 'th-TH' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  const formatThaiDateOnly = (date: Date) => {
    return date.toLocaleDateString(lang === 'TH' ? 'th-TH' : 'en-US', {
       year: 'numeric',
       month: 'long',
       day: 'numeric',
       weekday: 'long',
       calendar: lang === 'TH' ? 'buddhist' : 'gregory'
    });
  };
  
  // Real Rolling Latency History (derived from real device latencyHistory & live stats)
  const [liveLatencySamples, setLiveLatencySamples] = useState<{ timeLabel: string; ms: number }[]>([]);

  useEffect(() => {
    const nowLabel = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLiveLatencySamples(prev => {
      // Seed from real device latencyHistory on first load if empty
      if (prev.length === 0) {
        const onlineDevs = devices.filter(d => d.status !== DeviceStatus.OFFLINE && Array.isArray(d.latencyHistory) && d.latencyHistory.length > 0);
        if (onlineDevs.length > 0) {
          const maxLen = Math.min(20, Math.max(...onlineDevs.map(d => d.latencyHistory?.length || 0)));
          const nowMs = Date.now();
          const seeded = Array.from({ length: maxLen }, (_, idx) => {
            const sampleTime = new Date(nowMs - (maxLen - 1 - idx) * 5000);
            let sum = 0;
            let count = 0;
            onlineDevs.forEach(d => {
              const hist = d.latencyHistory || [];
              const hIdx = hist.length - maxLen + idx;
              if (hIdx >= 0 && hist[hIdx] !== undefined) {
                const entry: any = hist[hIdx];
                const val = typeof entry === 'object' && entry !== null ? Number(entry.value) : Number(entry);
                if (!isNaN(val) && val > 0) {
                  sum += val;
                  count++;
                }
              }
            });
            return {
              timeLabel: sampleTime.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              ms: count > 0 ? Number((sum / count).toFixed(1)) : Number(Math.max(0, stats.avgLatency).toFixed(1))
            };
          });
          if (seeded.length > 0) return seeded;
        }
      }
      const next = [...prev, { timeLabel: nowLabel, ms: Number(Math.max(0, stats.avgLatency).toFixed(1)) }];
      return next.slice(-20);
    });
  }, [stats.avgLatency, Math.floor(time.getTime() / 5000)]);

  const latencyHistory = useMemo(() => {
    if (liveLatencySamples.length > 0) return liveLatencySamples;
    return [{
      timeLabel: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      ms: Number(Math.max(0, stats.avgLatency).toFixed(1))
    }];
  }, [liveLatencySamples, stats.avgLatency]);

  const maxLatency = Number(Math.max(1, ...latencyHistory.map(d => d.ms)).toFixed(1));
  const minLatency = Number(Math.min(...latencyHistory.map(d => d.ms)).toFixed(1));

  // Top Offenders Logic
  const topOffenders = useMemo(() => {
     const counts: Record<string, number> = {};
     logs.filter(l => l.type === 'OUTAGE').forEach(l => {
        counts[l.deviceId] = (counts[l.deviceId] || 0) + 1;
     });
     return Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([id, count]) => {
           const dev = devices.find(d => d.id === id);
           return dev ? { ...dev, outageCount: count } : null;
        })
        .filter((d): d is (Device & { outageCount: number }) => d !== null); 
  }, [logs, devices]);

  // Recent Logs Logic
  const recentLogs = useMemo(() => {
     return [...logs].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);
  }, [logs]);

  // List View Logic
  const filteredDevicesList = useMemo(() => {
     if (listFilter === 'ALL') return devices;
     return devices.filter(d => d.status === DeviceStatus.OFFLINE || d.status === DeviceStatus.WARNING);
  }, [devices, listFilter]);

  // Helper for Percentage
  const getPercentage = (val: number, total: number) => {
    return total > 0 ? Math.round((val / total) * 100) : 0;
  };

  const handleDeviceClick = (deviceId: string) => {
     const device = devices.find(d => d.id === deviceId);
     if (device) setSelectedDevice(device);
  };

  const VibrantStatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    gradient, 
    filterKey,
    percentageText,
    suffix
  }: { 
    title: string, 
    value: string | number, 
    icon: any, 
    gradient: string, 
    filterKey: 'ALL' | 'ONLINE' | 'OFFLINE',
    percentageText?: string,
    suffix?: string
  }) => {
    
    return (
      <div 
        onClick={() => onNavigateToMonitor(filterKey)}
        className={`
          relative overflow-hidden rounded-xl sm:rounded-2xl p-3 sm:p-4 cursor-pointer transition-all duration-300 group
          ${gradient} text-white shadow-md sm:shadow-lg hover:scale-[1.01] hover:shadow-xl
        `}
      >
         <div className="absolute -right-4 -bottom-4 w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-white/10 blur-xl group-hover:scale-150 transition-transform duration-500 ease-out pointer-events-none"></div>
         <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-br from-white/20 to-transparent blur-lg opacity-40 pointer-events-none"></div>
 
         <div className="relative z-10 flex flex-col h-full justify-between min-h-[95px] sm:min-h-[115px]">
            <div className="flex justify-between items-start gap-2">
               <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold opacity-90 mb-0.5 tracking-wide truncate flex items-center gap-1">
                    {title}
                  </h3>
                  <div className="flex items-baseline gap-1">
                     <span className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tighter drop-shadow-xs font-mono">{value}</span>
                     {suffix && <span className="text-xs sm:text-sm font-bold opacity-80">{suffix}</span>}
                  </div>
               </div>
               
               <div className="p-2 sm:p-2.5 bg-white/20 backdrop-blur-md rounded-lg sm:rounded-xl shadow-inner border border-white/10 shrink-0">
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white drop-shadow-xs" />
               </div>
            </div>

            <div className="mt-2 sm:mt-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-medium opacity-90 bg-black/15 w-fit px-2 py-0.5 rounded-md backdrop-blur-xs truncate max-w-full">
                 <PieChart className="w-3 h-3 shrink-0" />
                 <span className="truncate">{percentageText}</span>
              </div>
              
              <div className={`
                hidden sm:flex items-center gap-1 text-[11px] font-bold bg-white text-blue-600 px-2.5 py-0.5 rounded-full shadow-md
                transition-all duration-300 opacity-0 translate-x-2
                group-hover:opacity-100 group-hover:translate-x-0
              `}>
                <span>ดู</span>
                <ExternalLink className="w-3 h-3" />
              </div>
            </div>
         </div>
      </div>
    );
  };

  return (
    <div className="w-full space-y-4 sm:space-y-6 md:space-y-8 animate-in fade-in duration-300 pb-6 sm:pb-10">
      {/* Header & Clock */}
      <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-3 sm:gap-4 bg-white dark:bg-slate-800 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl shadow-xs border border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between sm:justify-start gap-3">
           <div className="flex items-center gap-2.5">
             <div className="p-1.5 bg-blue-600 rounded-lg shadow-md shadow-blue-500/20 shrink-0">
               <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
             </div>
             <div>
               <h2 className="text-base sm:text-lg md:text-xl font-black text-slate-800 dark:text-white tracking-tight leading-none">{t.dashboard}</h2>
               <div className="flex items-center gap-1.5 mt-0.5">
                 <span className="relative flex h-2 w-2">
                   <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                   <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                 </span>
                 <span className="text-[10px] sm:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">System Operational</span>
               </div>
             </div>
           </div>

           {/* Mobile-only theme/lang quick toggles */}
           <div className="flex xl:hidden items-center gap-1">
              <button 
                 onClick={toggleLang}
                 className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold"
              >
                 <Globe className="w-3.5 h-3.5" />
                 <span>{lang}</span>
              </button>
              <button 
                 onClick={toggleTheme}
                 className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
              >
                 {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-500" />}
              </button>
           </div>
        </div>
        
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-2 sm:gap-4 bg-slate-50 dark:bg-slate-900/50 px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg sm:rounded-xl border border-slate-200 dark:border-slate-700">
           <div className="flex items-center gap-2 pr-2 sm:pr-4 sm:border-r border-slate-300 dark:border-slate-600">
              <CalendarDays className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300">{formatThaiDateOnly(time)}</span>
           </div>
           <div className="flex items-center gap-2 pl-1">
              <Clock className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="font-mono font-black text-sm sm:text-lg text-slate-800 dark:text-white tracking-tight">
                {formatThaiTime(time)}
              </div>
           </div>
           
           {/* Desktop Theme & Lang Toggles */}
           <div className="hidden xl:flex items-center gap-2 pl-2 border-l border-slate-300 dark:border-slate-600 ml-2">
              <button 
                 onClick={toggleLang}
                 className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-xs"
              >
                 <Globe className="w-3.5 h-3.5" />
                 <span className="text-xs font-bold">{lang}</span>
              </button>

              <button 
                 onClick={toggleTheme}
                 className="p-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-xs"
              >
                 {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-blue-500" />}
              </button>
           </div>
        </div>
      </div>

      {/* Row 1: Vibrant Stats Grid - 2 cols on mobile, 3 on tablet, 5 on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5 sm:gap-3.5 md:gap-4">
        <VibrantStatCard 
          title={t.totalDevices} 
          value={stats.total} 
          icon={Server} 
          gradient="bg-gradient-to-r from-blue-500 to-blue-600"
          filterKey="ALL"
          percentageText="Total Assets"
        />
        <VibrantStatCard 
          title={t.online} 
          value={stats.online} 
          icon={CheckCircle2} 
          gradient="bg-gradient-to-r from-emerald-500 to-teal-600"
          filterKey="ONLINE"
          percentageText={`${getPercentage(stats.online, stats.total)}% Online`}
        />
        <VibrantStatCard 
          title={t.offline} 
          value={stats.offline} 
          icon={XCircle} 
          gradient="bg-gradient-to-r from-rose-500 to-pink-600"
          filterKey="OFFLINE"
          percentageText={`${getPercentage(stats.offline, stats.total)}% Offline`}
        />
        <VibrantStatCard 
          title="Average SLA" 
          value={(stats.avgSla || 0).toFixed(1)} 
          suffix="%"
          icon={ShieldCheck} 
          gradient="bg-gradient-to-r from-indigo-500 to-violet-600"
          filterKey="ALL" 
          percentageText="SLA Rating"
        />
        <div className="col-span-2 sm:col-span-2 md:col-span-1 xl:col-span-1">
          <VibrantStatCard 
            title={t.avgLatency} 
            value={stats.avgLatency.toFixed(0)} 
            suffix="ms"
            icon={Zap} 
            gradient="bg-gradient-to-r from-orange-400 to-amber-500"
            filterKey="ALL" 
            percentageText="Latency Avg"
          />
        </div>
      </div>

      {/* Row 2: Charts & Top Offenders */}
      <div className="grid grid-cols-1 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-6">
        
        {/* Professional Latency Chart */}
        <div className="xl:col-span-2 2xl:col-span-3 bg-white dark:bg-slate-800 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-md border border-slate-200 dark:border-slate-700 flex flex-col h-[280px] sm:h-[360px] md:h-[420px]">
          
          <div className="flex items-start justify-between mb-2 sm:mb-4">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white flex items-center gap-1.5 sm:gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                {t.liveLatency}
              </h3>
              <p className="text-slate-500 text-[10px] mt-0.5">Real-time network fluctuation</p>
            </div>
            
            <div className="flex gap-3 sm:gap-4">
                <div className="flex flex-col items-end">
                    <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400">Peak</span>
                    <span className="text-xs sm:text-sm font-bold text-red-500 font-mono flex items-center">
                        <ArrowUp className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5" />
                        {maxLatency} ms
                    </span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-400">Min</span>
                    <span className="text-xs sm:text-sm font-bold text-emerald-500 font-mono flex items-center">
                        <ArrowDown className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5" />
                        {minLatency} ms
                    </span>
                </div>
            </div>
          </div>
          
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyHistory} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.15} vertical={true} />
                <XAxis 
                    dataKey="timeLabel" 
                    tick={{fill: '#94a3b8', fontSize: 9}} 
                    tickLine={false}
                    axisLine={false}
                    minTickGap={25}
                />
                <YAxis 
                    tick={{fill: '#94a3b8', fontSize: 9}} 
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    unit="ms"
                />
                <Tooltip 
                  cursor={{ stroke: '#6366f1', strokeWidth: 1 }}
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700 text-white px-3 py-2 rounded-lg shadow-xl text-xs">
                          <p className="text-[10px] text-slate-400 font-mono mb-0.5">{label}</p>
                          <div className="flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                              <p className="text-sm font-bold font-mono text-white">
                                {payload[0].value} <span className="text-[10px] text-slate-400 font-sans">ms</span>
                              </p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="ms" 
                  stroke="#6366f1" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorMs)" 
                  animationDuration={800}
                  isAnimationActive={false} 
                  activeDot={{ r: 4, strokeWidth: 0, fill: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Frequent Outages */}
        <div className="xl:col-span-1 2xl:col-span-1 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md flex flex-col overflow-hidden h-[280px] sm:h-[360px] md:h-[420px]">
           <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20">
              <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-white flex items-center gap-2">
                 <AlertTriangle className="w-4 h-4 text-amber-500" />
                 Frequent Outages
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Top devices with connection drops</p>
           </div>
           <div className="flex-1 overflow-y-auto p-2.5 sm:p-4 space-y-2 sm:space-y-3 custom-scrollbar">
              {topOffenders.length > 0 ? topOffenders.map((d, i) => (
                 <div 
                    key={d.id} 
                    onClick={() => handleDeviceClick(d.id)}
                    className="flex items-center gap-2.5 sm:gap-4 p-2 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer group"
                 >
                    <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 font-bold text-xs">
                       {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                       <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white truncate group-hover:text-blue-500 transition-colors">{d.name}</p>
                       <p className="text-[10px] text-slate-400 font-mono">{d.ip}</p>
                    </div>
                    <div className="text-right">
                       <span className="inline-block px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] sm:text-xs font-bold rounded">
                          {d.outageCount}x
                       </span>
                    </div>
                 </div>
              )) : (
                 <div className="flex flex-col items-center justify-center h-full text-slate-400">
                    <CheckCircle2 className="w-10 h-10 mb-2 text-emerald-500 opacity-20" />
                    <p className="text-xs font-medium">System Stable</p>
                 </div>
              )}
           </div>
        </div>
      </div>

      {/* Row 3: Recent Logs & Critical List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        
        {/* Recent Events */}
        <div className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md flex flex-col overflow-hidden h-[340px] sm:h-[440px] md:h-[500px]">
           <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20">
              <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-white flex items-center gap-2">
                 <Clock className="w-4 h-4 text-blue-500" />
                 Recent Events
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">Latest system activities</p>
           </div>
           <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 custom-scrollbar">
              {recentLogs.length > 0 ? recentLogs.map((log) => (
                 <div key={log.id} onClick={() => handleDeviceClick(log.deviceId)} className="relative pl-5 pb-1 group cursor-pointer">
                    <div className="absolute left-1.5 top-2 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700 group-last:bg-transparent"></div>
                    <div className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-800 shadow-xs
                       ${log.type === 'OUTAGE' ? 'bg-red-500' : log.type === 'RECOVERY' ? 'bg-emerald-500' : 'bg-amber-500'}
                    `}></div>
                    
                    <div className="bg-slate-50 dark:bg-slate-900/70 p-2.5 sm:p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 shadow-xs hover:border-blue-300 transition-all">
                       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                             <div className="flex flex-col min-w-0">
                                <span className="font-bold text-slate-800 dark:text-white text-xs sm:text-sm truncate group-hover:text-blue-500 transition-colors">{log.deviceName}</span>
                                <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                                   <MapPin className="w-2.5 h-2.5 shrink-0 text-blue-500" /> {log.location}
                                </span>
                             </div>
                             <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block"></div>
                             <p className={`text-[11px] sm:text-xs font-bold shrink-0
                                ${log.type === 'OUTAGE' ? 'text-red-500' : log.type === 'RECOVERY' ? 'text-emerald-500' : 'text-amber-500'}
                             `}>
                                {log.type === 'OUTAGE' ? 'Offline' : log.type === 'RECOVERY' ? 'Online' : 'Warning'}
                             </p>
                          </div>
                          <div className="text-right flex flex-col items-end shrink-0">
                             <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/60 dark:border-slate-700">
                                {formatThaiDateTime(log.timestamp)}
                             </span>
                          </div>
                       </div>
                    </div>
                 </div>
              )) : (
                 <div className="p-4 text-center text-slate-400 text-xs">No recent events</div>
              )}
           </div>
        </div>

        {/* Offline / Critical Devices List */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-md flex flex-col overflow-hidden h-[340px] sm:h-[440px] md:h-[500px]">
          <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-red-50/50 dark:bg-red-900/10">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertOctagon className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-xs sm:text-sm">Critical Status</h3>
                <p className="text-[9px] sm:text-[10px] text-slate-400">Offline & Warnings</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
               <button 
                  onClick={() => setListFilter('ALL')} 
                  className={`px-2 py-0.5 text-[10px] sm:text-xs font-bold rounded-lg transition-colors ${listFilter === 'ALL' ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
               >
                  All
               </button>
               <button 
                  onClick={() => setListFilter('OFFLINE')} 
                  className={`px-2 py-0.5 text-[10px] sm:text-xs font-bold rounded-lg transition-colors ${listFilter === 'OFFLINE' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'text-slate-500 hover:bg-slate-100'}`}
               >
                  Critical
               </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2 custom-scrollbar">
            {filteredDevicesList.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 pb-6">
                  <CheckCircle2 className="w-12 h-12 mb-2 opacity-20 text-emerald-500" />
                  <p className="font-medium text-xs">No devices in this status</p>
               </div>
            ) : (
              filteredDevicesList.map(device => (
                <div key={device.id} onClick={() => handleDeviceClick(device.id)} className="group relative p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-700/50 hover:border-blue-300 hover:shadow-xs transition-all cursor-pointer">
                  
                  <div className="flex justify-between items-start mb-1.5">
                     <div className="flex items-center gap-1.5 min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            device.status === DeviceStatus.ONLINE ? 'bg-emerald-500' : 
                            device.status === DeviceStatus.OFFLINE ? 'bg-red-500' : 'bg-amber-500'
                        }`}></div>
                        <span className="font-bold text-slate-800 dark:text-white truncate text-xs sm:text-sm">{device.name}</span>
                     </div>
                     <span className="text-[10px] sm:text-xs text-slate-400 font-mono font-bold shrink-0">{device.ip}</span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-2">
                     <div className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="w-3 h-3 text-blue-500 shrink-0" />
                        <span className="truncate max-w-[120px] sm:max-w-[150px]" title={formatLocation(device.location, device.floor)}>{formatLocation(device.location, device.floor)}</span>
                     </div>
                     <div className={`
                        flex items-center gap-1 text-[10px] sm:text-xs px-2 py-0.5 rounded-md font-mono font-bold whitespace-nowrap
                        ${device.status === DeviceStatus.OFFLINE 
                          ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' 
                          : device.status === DeviceStatus.WARNING
                             ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                             : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}
                     `}>
                        {device.status === DeviceStatus.OFFLINE 
                           ? formatThaiDateTime(device.lastStatusChange || device.lastSeen)
                           : `${device.latency}ms`
                        }
                     </div>
                  </div>
                  {device.remarks && (
                     <div className="mt-2 text-[10px] sm:text-xs px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 font-medium truncate flex items-center gap-1">
                        <span className="font-bold shrink-0">📝</span>
                        <span className="truncate">{device.remarks}</span>
                     </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Device Detail Modal */}
      {selectedDevice && (
        <DeviceDetailModal 
          device={devices.find(d => d.id === selectedDevice.id) || selectedDevice}
          logs={logs}
          onClose={() => setSelectedDevice(null)}
          onUpdateRemarks={onUpdateRemarks}
        />
      )}
    </div>
  );
};
