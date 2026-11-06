
import React, { useMemo, useState } from 'react';
import { Device, DowntimeLog, DeviceStatus, formatLocation } from '../types';
import { 
  X, TrendingUp, History, Info, FileEdit, Check, Sparkles, Copy, Building2, Hash
} from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer 
} from 'recharts';
import { resolveDeviceVendor, normalizeMacAddress } from '../utils/macVendor';

interface DeviceDetailModalProps {
  device: Device;
  logs: DowntimeLog[];
  onClose: () => void;
  onUpdateRemarks?: (deviceId: string, remarks: string) => Promise<void>;
}

export const DeviceDetailModal: React.FC<DeviceDetailModalProps> = ({ device, logs, onClose, onUpdateRemarks }) => {
   const [isEditingRemarks, setIsEditingRemarks] = useState(false);
   const [remarkText, setRemarkText] = useState(device.remarks || '');
   const [isSaving, setIsSaving] = useState(false);

   const handleSaveRemarks = async () => {
     if (!onUpdateRemarks) return;
     try {
       setIsSaving(true);
       await onUpdateRemarks(device.id, remarkText);
       setIsEditingRemarks(false);
     } catch (e) {
       console.error('Failed to update remarks', e);
     } finally {
       setIsSaving(false);
     }
   };
   // Filter logs for this device
   const deviceLogs = useMemo(() => {
      return logs.filter(l => l.deviceId === device.id).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
   }, [logs, device.id]);

   // Generate fake historical data based on current latency for the chart
   const chartData = useMemo(() => {
      if (!device.latencyHistory || device.latencyHistory.length === 0) return [];
      return device.latencyHistory.map((h, i) => ({
         time: i,
         latency: h.value
      }));
   }, [device.latencyHistory]);

   // Calculate online duration
   const getOnlineDuration = () => {
      if(device.status === DeviceStatus.OFFLINE) return "0m";
      const diff = Math.floor((new Date().getTime() - new Date(device.lastStatusChange || device.lastSeen).getTime()) / 1000);
      const m = Math.floor(diff / 60);
      return `${m}m`;
   }

   const formatThaiDateTime = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleString('th-TH', {
         year: 'numeric',
         month: 'numeric',
         day: 'numeric',
         hour: '2-digit',
         minute: '2-digit',
         second: '2-digit',
         hour12: false,
         calendar: 'buddhist'
      });
   };

   const vendorInfo = resolveDeviceVendor(device);
   const formattedMac = normalizeMacAddress(device.macAddress);

   const handleCopyMac = () => {
     if (formattedMac) {
       navigator.clipboard.writeText(formattedMac);
       toast.success(`คัดลอก MAC: ${formattedMac} แล้ว`);
     }
   };

   return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
         <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[92vh] rounded-2xl sm:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-700 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start bg-slate-50/50 dark:bg-slate-800/50">
               <div className="min-w-0 pr-2 space-y-1">
                  <div className="flex items-center gap-2">
                     <h2 className="text-base sm:text-xl font-black text-slate-800 dark:text-white truncate">{device.name}</h2>
                     <span className={`px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                        device.status === DeviceStatus.ONLINE ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' :
                        device.status === DeviceStatus.OFFLINE ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400' :
                        'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400'
                     }`}>
                        {device.status}
                     </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                     <p className="text-slate-500 dark:text-slate-400 font-mono text-[11px] sm:text-xs">
                        {device.ip}
                        {device.monitorPort && <span className="text-blue-500 font-bold">:{device.monitorPort}</span>}
                     </p>
                     <span className="text-slate-300 dark:text-slate-600">•</span>
                     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 font-bold text-[11px]">
                        <Building2 className="w-3 h-3 text-indigo-500 shrink-0" />
                        <span>ผู้ผลิต: {vendorInfo.vendor}</span>
                     </span>
                     {formattedMac && (
                        <button
                           type="button"
                           onClick={handleCopyMac}
                           className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/60 text-cyan-800 dark:text-cyan-300 font-mono text-[11px] font-bold hover:bg-cyan-100 dark:hover:bg-cyan-900/60 transition-colors cursor-pointer"
                           title="คัดลอก MAC"
                        >
                           <Hash className="w-3 h-3 text-cyan-600 shrink-0" />
                           <span>MAC: {formattedMac}</span>
                           <Copy className="w-2.5 h-2.5 opacity-70" />
                        </button>
                     )}
                  </div>
               </div>
               <button onClick={onClose} className="p-1 sm:p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors shrink-0">
                  <X className="w-5 h-5 text-slate-500" />
               </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 sm:space-y-6 custom-scrollbar">
               {/* Remarks / Note Section */}
               <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 p-3 sm:p-4 rounded-xl sm:rounded-2xl">
                  <div className="flex items-center justify-between mb-2 gap-2">
                     <div className="flex items-center gap-1.5 min-w-0">
                        <FileEdit className="w-4 h-4 text-blue-500 shrink-0" />
                        <h4 className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider truncate">
                           หมายเหตุอุปกรณ์ / สาเหตุ (Remarks)
                        </h4>
                     </div>
                     {!isEditingRemarks && onUpdateRemarks && (
                        <button
                           onClick={() => setIsEditingRemarks(true)}
                           className="px-2 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
                        >
                           <FileEdit className="w-3 h-3" />
                           แก้ไข
                        </button>
                     )}
                  </div>

                  {isEditingRemarks ? (
                     <div className="space-y-2.5 pt-1">
                        <input
                           type="text"
                           value={remarkText}
                           onChange={(e) => setRemarkText(e.target.value)}
                           placeholder="ระบุหมายเหตุ เช่น ปิดจอ E-Board หลังเลิกเรียน, รอซ่อมจอ, ดับไฟห้อง..."
                           className="w-full bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-500 rounded-xl px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                           autoFocus
                        />
                        {/* Quick Presets */}
                        <div className="flex flex-wrap items-center gap-1">
                           <span className="text-[10px] text-slate-400 flex items-center gap-1 mr-1">
                              <Sparkles className="w-3 h-3 text-amber-500" /> ด่วน:
                           </span>
                           {[
                              'ปิดจอ E-Board',
                              'ปิดจอช่วงพักเที่ยง',
                              'ปิดจอหลังเลิกเรียน/งาน',
                              'ปิดปรับปรุง/ซ่อมบำรุง',
                              'รอส่งซ่อมจอภาพ',
                              'ห้องปิดใช้งาน/ดับไฟ'
                           ].map((preset) => (
                              <button
                                 key={preset}
                                 type="button"
                                 onClick={() => setRemarkText(preset)}
                                 className="px-1.5 py-0.5 bg-slate-200/70 hover:bg-blue-100 dark:bg-slate-700 dark:hover:bg-blue-900/40 text-slate-700 dark:text-slate-300 text-[10px] rounded transition-colors cursor-pointer"
                              >
                                 + {preset}
                              </button>
                           ))}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                           <button
                              type="button"
                              onClick={() => {
                                 setRemarkText(device.remarks || '');
                                 setIsEditingRemarks(false);
                              }}
                              className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                           >
                              ยกเลิก
                           </button>
                           <button
                              type="button"
                              onClick={handleSaveRemarks}
                              disabled={isSaving}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shadow-xs disabled:opacity-50 cursor-pointer"
                           >
                              {isSaving ? <span className="animate-spin">⏳</span> : <Check className="w-3.5 h-3.5" />}
                              บันทึก
                           </button>
                        </div>
                     </div>
                  ) : (
                     <div className="mt-1">
                        {device.remarks ? (
                           <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg text-xs text-amber-800 dark:text-amber-200 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              <span>{device.remarks}</span>
                           </div>
                        ) : (
                           <p className="text-xs text-slate-400 italic">
                              ไม่มีหมายเหตุ (สามารถกด "แก้ไข" เพื่อระบุสาเหตุ เช่น ปิดจอ E-Board)
                           </p>
                        )}
                     </div>
                  )}
               </div>

               {/* Tech Note for User */}
               <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800 p-2.5 sm:p-3 rounded-xl flex gap-2">
                  <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                     <h4 className="text-[11px] sm:text-xs font-bold text-amber-700 dark:text-amber-300">Tech Note: Ping vs App Status</h4>
                     <p className="text-[10px] text-amber-600/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                        หากเครื่อง Windows ของคุณ ping เจอแต่ระบบแจ้งว่า Outage อาจเกิดจาก: Timeout Threshold ต่ำกว่าความล่าช้าจริง, Packet Loss หรือ ICMP Firewall Rule
                     </p>
                  </div>
               </div>

               {/* Stats Grid */}
               <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3">
                  <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                     <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold mb-0.5">ผู้ผลิต (Vendor)</p>
                     <p className="text-xs sm:text-sm font-semibold text-indigo-600 dark:text-indigo-400 truncate" title={vendorInfo.vendor}>{vendorInfo.vendor}</p>
                  </div>
                  <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                     <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold mb-0.5">ประเภท (Type)</p>
                     <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 truncate" title={device.type}>{device.type}</p>
                  </div>
                  <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                     <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold mb-0.5">Location</p>
                     <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 truncate" title={formatLocation(device.location, device.floor)}>{formatLocation(device.location, device.floor)}</p>
                  </div>
                  <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                     <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold mb-0.5">Uptime</p>
                     <p className="text-xs sm:text-sm font-mono font-semibold text-slate-700 dark:text-slate-200">{getOnlineDuration()}</p>
                  </div>
                  <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                     <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold mb-0.5">Latency</p>
                     <p className="text-xs sm:text-sm font-mono font-semibold text-slate-700 dark:text-slate-200">{device.latency} ms</p>
                  </div>
                  <div className="p-2.5 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-xl col-span-2 sm:col-span-1">
                     <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold mb-0.5">SLA %</p>
                     <p className="text-xs sm:text-sm font-mono font-semibold text-slate-700 dark:text-slate-200">{device.uptimePercentage !== undefined ? `${device.uptimePercentage.toFixed(2)}%` : '100.00%'}</p>
                  </div>
               </div>

               {/* Performance Chart */}
               <div>
                  <h3 className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-800 dark:text-white mb-2">
                     <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
                     Performance History
                  </h3>
                  <div className="h-[140px] sm:h-[180px] w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-2">
                     <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                           <defs>
                              <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                                 <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                 <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                              </linearGradient>
                           </defs>
                           <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.1} vertical={false} />
                           <XAxis dataKey="time" hide />
                           <YAxis hide domain={[0, 'auto']} />
                           <RechartsTooltip 
                              cursor={{ stroke: '#10b981', strokeWidth: 1 }}
                              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '10px' }}
                           />
                           <Area 
                              type="monotone" 
                              dataKey="latency" 
                              stroke="#10b981" 
                              strokeWidth={2}
                              fillOpacity={1} 
                              fill="url(#colorLatency)" 
                           />
                        </AreaChart>
                     </ResponsiveContainer>
                  </div>
               </div>

               {/* Outage History */}
               <div>
                  <h3 className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-800 dark:text-white mb-2">
                     <History className="w-3.5 h-3.5 text-purple-500" />
                     Outage & Status History
                  </h3>
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                     <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[9px] sm:text-[10px] uppercase">
                           <tr>
                              <th className="p-2 sm:p-3">Time</th>
                              <th className="p-2 sm:p-3">Status</th>
                              <th className="p-2 sm:p-3">Message</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                           {deviceLogs.length > 0 ? deviceLogs.map(log => (
                              <tr key={log.id} className="text-[11px] sm:text-xs">
                                 <td className="p-2 sm:p-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                    {formatThaiDateTime(log.timestamp)}
                                 </td>
                                 <td className="p-2 sm:p-3">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-bold text-[9px] sm:text-[10px]
                                       ${log.type === 'OUTAGE' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                                         log.type === 'RECOVERY' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                         'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'}
                                    `}>
                                       {log.type === 'OUTAGE' ? 'Offline' : 'Online'}
                                    </span>
                                 </td>
                                 <td className="p-2 sm:p-3 text-slate-700 dark:text-slate-300">
                                    {log.message}
                                 </td>
                              </tr>
                           )) : (
                              <tr>
                                 <td colSpan={3} className="p-3 text-center text-slate-400 text-xs">No events recorded</td>
                              </tr>
                           )}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
         </div>
      </div>
   );
};
