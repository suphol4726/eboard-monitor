import React, { useState, useRef } from 'react';
import { LayoutDashboard, Server, History, Settings, Activity, Cpu, HardDrive, Monitor, Copy, Network, ChevronLeft, ChevronRight, Lock, Unlock, ChevronDown, ChevronUp } from 'lucide-react';
import { SystemStats, Translations } from '../types';
import toast from 'react-hot-toast';
import { ScrollToTop } from './ScrollToTop';

export const APP_VERSION = 'v3.5.0';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
  hostStats: SystemStats;
  t: Translations;
  systemName: string;
  hasAdminPin?: boolean;
  isAdmin?: boolean;
  onAdminLogin?: () => void;
  onAdminLogout?: () => void;
}

export const Layout: React.FC<LayoutProps> = ({ 
  children, activeTab, onTabChange, 
  hostStats, t,
  systemName,
  hasAdminPin,
  isAdmin,
  onAdminLogin,
  onAdminLogout
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showMobileHostDrawer, setShowMobileHostDrawer] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 5 Core Production Menus (100% Real Functionality)
  const navItems = [
    { id: 'dashboard', label: t.dashboard, shortLabel: 'แดชบอร์ด', icon: LayoutDashboard },
    { id: 'monitor', label: t.latencyMonitor, shortLabel: 'Latency', icon: Activity },
    { id: 'devices', label: t.deviceManagement, shortLabel: 'อุปกรณ์', icon: Server },
    { id: 'history', label: t.downtimeHistory, shortLabel: 'ประวัติ', icon: History },
    { id: 'settings', label: t.settings, shortLabel: 'ตั้งค่า', icon: Settings },
  ];

  const handleCopyIp = () => {
     const ip = hostStats.hostIp.split(' ')[0];
     navigator.clipboard.writeText(ip);
     toast.success(`คัดลอก IP: ${ip} แล้ว`);
  };

  const isCloudflareIp = hostStats.hostIp.includes('Cloudflare') || hostStats.hostIp.startsWith('100.');

  return (
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      {/* Desktop Sidebar */}
      <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-2xl z-10 hidden md:flex transition-all duration-300 relative`}>
        
        {/* Toggle Button */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-8 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full p-1 shadow-md text-slate-500 hover:text-blue-600 z-50 transition-colors cursor-pointer"
          title={isCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {/* Header with Official Logo and System Name + Version */}
        <div className={`p-4 border-b border-slate-200 dark:border-slate-700 ${isCollapsed ? 'flex flex-col items-center px-2 py-3' : 'flex flex-col items-center text-center'}`}>
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-1.5">
              <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0" title="โรงเรียนสาธิต มศว ประสานมิตร (ฝ่ายมัธยม)">
                <img 
                  src="https://apps.e-spsm.online/psd/spsm/images/SWU_Prasanmit_Demonstration_Sec_TH_Color.png" 
                  alt="SPSM School Logo" 
                  className="w-10 h-10 object-contain"
                />
              </div>
              <span className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[9px] font-mono font-bold border border-blue-200/60 dark:border-blue-800/60">
                {APP_VERSION}
              </span>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center">
              <div className="bg-white dark:bg-slate-900/90 py-3 px-2.5 rounded-2xl shadow-sm border border-slate-200/90 dark:border-slate-700 flex items-center justify-center w-full transition-all hover:shadow-md">
                 <img 
                   src="https://apps.e-spsm.online/psd/spsm/images/SWU_Prasanmit_Demonstration_Sec_TH_Color.png" 
                   alt="โรงเรียนสาธิต มศว ประสานมิตร (ฝ่ายมัธยม)" 
                   className="h-14 sm:h-16 w-full max-w-[220px] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                 />
              </div>

              <div className="mt-3 px-1 text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <h1 className="font-black text-xl text-slate-800 dark:text-white tracking-tight leading-tight truncate max-w-[160px]" title={systemName || 'E-Board'}>
                     {systemName || 'E-Board'}
                  </h1>
                  <span className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[10px] font-mono font-extrabold border border-blue-200/80 dark:border-blue-800/60 shrink-0">
                    {APP_VERSION}
                  </span>
                </div>
                <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase mt-0.5">
                  IP Monitoring System
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 ${isCollapsed ? 'justify-center px-0' : 'px-4'} py-2.5 rounded-xl transition-all duration-200 group cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/50 hover:text-slate-900 dark:hover:text-white font-medium'
                }`}
              >
                <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-white'}`} />
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Admin Mode Button on Desktop Sidebar */}
        {hasAdminPin && (
          <div className="px-3 pb-2">
            {isAdmin ? (
              <button
                onClick={onAdminLogout}
                title="คลิกเพื่อล็อกสิทธิ์ผู้ดูแลระบบ"
                className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3.5 py-2'} rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 hover:bg-emerald-100 transition-colors cursor-pointer`}
              >
                <div className="flex items-center gap-2">
                  <Unlock className="w-4 h-4 text-emerald-600 shrink-0" />
                  {!isCollapsed && <span>โหมดผู้ดูแล (Admin)</span>}
                </div>
                {!isCollapsed && <span className="text-[10px] underline opacity-80">ล็อก</span>}
              </button>
            ) : (
              <button
                onClick={onAdminLogin}
                title="คลิกเพื่อปลดล็อกสิทธิ์ผู้ดูแลระบบด้วย PIN"
                className={`w-full flex items-center ${isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3.5 py-2'} rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 transition-colors cursor-pointer`}
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  {!isCollapsed && <span>โหมดผู้ชม (View Only)</span>}
                </div>
                {!isCollapsed && <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400">ใส่ PIN</span>}
              </button>
            )}
          </div>
        )}

        {/* Host Status Widget - Bottom Left */}
        <div className="mt-auto border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 p-3">
           <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} mb-3`}>
              {!isCollapsed && (
                <div className="flex items-center gap-2">
                   <div className="p-1.5 bg-white dark:bg-slate-700 rounded-md shadow-sm border border-slate-100 dark:border-slate-600">
                      <Monitor className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                   </div>
                   <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Host Status</span>
                </div>
              )}
              <div className={`
                 px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1
                 ${hostStats.internetStatus === 'ONLINE' 
                   ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' 
                   : 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'}
              `} title={`Internet: ${hostStats.internetStatus}`}>
                 <span className="relative flex h-1.5 w-1.5">
                   <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hostStats.internetStatus === 'ONLINE' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                   <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${hostStats.internetStatus === 'ONLINE' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                 </span>
                 {!isCollapsed && hostStats.internetStatus}
              </div>
           </div>

           {/* Private IP Card */}
           {!isCollapsed && (
             <div className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 mb-3 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-300">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400 shrink-0">
                         <Network className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                         <div className="flex items-center gap-1.5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Server IP</p>
                            {isCloudflareIp ? (
                              <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 text-[9px] font-bold rounded" title="Cloudflare Tunnel / WARP Interface">
                                Cloudflare
                              </span>
                            ) : (
                              <span className="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 text-[9px] font-bold rounded">
                                LAN
                              </span>
                            )}
                         </div>
                         <p className="text-base font-mono font-black text-slate-800 dark:text-white tracking-tight mt-0.5 truncate">
                            {hostStats.hostIp.split(' ')[0]}
                         </p>
                      </div>
                   </div>
                   <button 
                      onClick={handleCopyIp}
                      className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all cursor-pointer shrink-0"
                      title="คัดลอก IP"
                   >
                      <Copy className="w-4 h-4" />
                   </button>
                </div>
             </div>
           )}
           
           {/* Hardware Stats Grid */}
           <div className={`grid ${isCollapsed ? 'grid-cols-1' : 'grid-cols-3'} gap-2`}>
              <div className="flex flex-col items-center bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm" title={`CPU: ${hostStats.cpuUsage}%`}>
                 <div className="mb-1 text-purple-500">
                    <Cpu className="w-3.5 h-3.5" />
                 </div>
                 {!isCollapsed && <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">CPU</div>}
                 <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{hostStats.cpuUsage}%</div>
                 {!isCollapsed && (
                   <div className="w-full h-1 bg-slate-100 dark:bg-slate-700 rounded-full">
                      <div className="h-full bg-purple-500 rounded-full transition-all duration-700" style={{ width: `${hostStats.cpuUsage}%` }}></div>
                   </div>
                 )}
              </div>

              <div className="flex flex-col items-center bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm" title={`RAM: ${hostStats.ramUsage}G / ${hostStats.ramTotal}G`}>
                 <div className="mb-1 text-amber-500">
                    <Activity className="w-3.5 h-3.5" />
                 </div>
                 {!isCollapsed && <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">RAM</div>}
                 <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{hostStats.ramUsage}G</div>
                 {!isCollapsed && (
                   <div className="w-full h-1 bg-slate-100 dark:bg-slate-700 rounded-full">
                      <div className="h-full bg-amber-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (hostStats.ramUsage / (hostStats.ramTotal || 1)) * 100)}%` }}></div>
                   </div>
                 )}
              </div>

              <div className="flex flex-col items-center bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm" title={`Disk: ${hostStats.diskUsage.toFixed(0)}% (${hostStats.diskTotal})`}>
                 <div className="mb-1 text-cyan-500">
                    <HardDrive className="w-3.5 h-3.5" />
                 </div>
                 {!isCollapsed && <div className="text-[10px] text-slate-400 font-bold uppercase mb-1">Disk</div>}
                 <div className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{hostStats.diskUsage.toFixed(0)}%</div>
                 {!isCollapsed && (
                   <div className="w-full h-1 bg-slate-100 dark:bg-slate-700 rounded-full">
                      <div className="h-full bg-cyan-500 rounded-full transition-all duration-700" style={{ width: `${hostStats.diskUsage}%` }}></div>
                   </div>
                 )}
              </div>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative h-full overflow-hidden">
        {/* Mobile Top Header Bar - Responsive & Well-Proportioned */}
        <div className="md:hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0 z-20 shadow-2xs">
          <div className="px-2.5 sm:px-4 py-2 flex items-center justify-between gap-2">
            {/* Brand Logo & System Title (Full Visibility Guaranteed) */}
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="bg-slate-50 dark:bg-slate-900/90 px-1.5 py-1 rounded-xl border border-slate-200/80 dark:border-slate-700 shrink-0 flex items-center justify-center shadow-2xs">
                <img 
                  src="https://apps.e-spsm.online/psd/spsm/images/SWU_Prasanmit_Demonstration_Sec_TH_Color.png" 
                  alt="โรงเรียนสาธิต มศว ประสานมิตร (ฝ่ายมัธยม)" 
                  className="h-7 sm:h-8 w-auto max-w-[96px] sm:max-w-[120px] object-contain" 
                />
              </div>
              <div className="min-w-0 flex flex-col justify-center">
                <div className="flex items-center gap-1.5">
                  <h1 className="font-black text-[15px] sm:text-base text-slate-900 dark:text-white leading-tight whitespace-nowrap tracking-tight">
                    {systemName || 'E-Board'}
                  </h1>
                  <span className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/70 text-blue-600 dark:text-blue-400 text-[9px] font-mono font-bold border border-blue-200/70 dark:border-blue-800/60 shrink-0 leading-none">
                    {APP_VERSION}
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] font-extrabold text-blue-600 dark:text-blue-400 tracking-tight leading-tight whitespace-nowrap mt-0.5">
                  IP Monitoring System
                </p>
              </div>
            </div>

            {/* Right Header Controls (Stacked on narrow mobile so title never truncates, row on wider screens) */}
            <div className="flex flex-col min-[460px]:flex-row items-end min-[460px]:items-center gap-1 min-[460px]:gap-1.5 shrink-0">
              {hasAdminPin && (
                isAdmin ? (
                  <button
                    onClick={onAdminLogout}
                    className="px-2 py-0.5 min-[460px]:px-2.5 min-[460px]:py-1 rounded-lg text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700 flex items-center gap-1 transition-colors active:scale-95 whitespace-nowrap"
                    title="ล็อกระบบ Admin"
                  >
                    <Unlock className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                    <span>Admin</span>
                  </button>
                ) : (
                  <button
                    onClick={onAdminLogin}
                    className="px-2 py-0.5 min-[460px]:px-2.5 min-[460px]:py-1 rounded-lg text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700 flex items-center gap-1 transition-colors active:scale-95 whitespace-nowrap"
                    title="คลิกเพื่อกรอก PIN เข้าสู่โหมด Admin"
                  >
                    <Lock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                    <span>ใส่ PIN</span>
                  </button>
                )
              )}

              {/* Tappable Host Status Pill for Mobile */}
              <button
                type="button"
                onClick={() => setShowMobileHostDrawer(!showMobileHostDrawer)}
                className={`px-2 py-0.5 min-[460px]:px-2.5 min-[460px]:py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1 shrink-0 transition-all active:scale-95 whitespace-nowrap ${
                  hostStats.internetStatus === 'ONLINE' 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' 
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20'
                }`}
                title="แตะเพื่อดูสถานะเซิร์ฟเวอร์ (IP / CPU / RAM / Disk)"
              >
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${hostStats.internetStatus === 'ONLINE' ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                  <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${hostStats.internetStatus === 'ONLINE' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                </span>
                <span className="font-mono">{hostStats.hostIp.split(' ')[0]}</span>
                {showMobileHostDrawer ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
              </button>
            </div>
          </div>

          {/* Collapsible Mobile Server Telemetry Bar */}
          {showMobileHostDrawer && (
            <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200/80 dark:border-slate-700/80 grid grid-cols-4 gap-2 text-center animate-in slide-in-from-top-2 duration-150">
              <div onClick={handleCopyIp} className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center active:scale-95">
                <span className="text-[9px] font-bold text-slate-400 uppercase flex items-center gap-1">
                  {isCloudflareIp ? 'Cloudflare' : 'LAN IP'} <Copy className="w-2.5 h-2.5 text-blue-500" />
                </span>
                <span className="text-[11px] font-mono font-black text-slate-800 dark:text-white truncate max-w-full mt-0.5">
                  {hostStats.hostIp.split(' ')[0]}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
                <span className="text-[9px] font-bold text-purple-500 uppercase">CPU</span>
                <span className="text-xs font-mono font-black text-slate-800 dark:text-white mt-0.5">{hostStats.cpuUsage}%</span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
                <span className="text-[9px] font-bold text-amber-500 uppercase">RAM</span>
                <span className="text-xs font-mono font-black text-slate-800 dark:text-white mt-0.5">{hostStats.ramUsage}G</span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
                <span className="text-[9px] font-bold text-cyan-500 uppercase">DISK</span>
                <span className="text-xs font-mono font-black text-slate-800 dark:text-white mt-0.5">{hostStats.diskUsage.toFixed(0)}%</span>
              </div>
            </div>
          )}
        </div>

        {/* Content Body - Responsive Full Width */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-2.5 sm:p-4 md:p-6 scroll-smooth">
           <div className="w-full min-h-full">
              {children}
           </div>
           <ScrollToTop container={scrollRef.current} />
        </div>
        
        {/* Mobile Navigation Bar (Bottom) - 5 Core Items with Large Touch Targets */}
        <nav className="md:hidden bg-white/95 dark:bg-slate-800/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-700 px-1.5 py-1.5 flex justify-around items-center shrink-0 z-20 pb-[max(0.4rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
           {navItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button 
                  key={item.id} 
                  onClick={() => onTabChange(item.id)}
                  className={`flex-1 min-h-[46px] py-1.5 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                    isActive 
                      ? 'text-blue-600 dark:text-blue-400 font-extrabold bg-blue-50/90 dark:bg-blue-950/60 shadow-2xs' 
                      : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <item.icon className={`w-4.5 h-4.5 ${isActive ? 'scale-110 text-blue-600 dark:text-blue-400' : ''} transition-transform`} />
                  <span className="text-[10px] tracking-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-[64px] text-center leading-none">
                    {item.shortLabel}
                  </span>
                </button>
              );
           })}
        </nav>
      </main>
    </div>
  );
};
