
import React, { useState } from 'react';
import { DowntimeLog, Device, AppSettings } from '../types';
import { Bot, AlertOctagon, CheckCircle2, Clock, Loader2, Search, Download, Printer, FileText, Sparkles } from 'lucide-react';
import { generateLocalIncidentReport } from '../services/analysisService';
import { generateAISummary } from '../services/geminiService';
import { exportToExcel } from '../utils/reportExporter';
import { ExecutiveReportModal } from './ExecutiveReportModal';
import toast from 'react-hot-toast';

interface HistoryProps {
  logs: DowntimeLog[];
  devices: Device[];
  settings: AppSettings;
  onSyncLogs?: (newLogs: DowntimeLog[]) => void;
}

export const History: React.FC<HistoryProps> = ({ logs, devices, settings, onSyncLogs }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCleaningLogs, setIsCleaningLogs] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isExecutiveReportOpen, setIsExecutiveReportOpen] = useState(false);

  const conflictLogsCount = logs.filter(l => l.message && (l.message.includes('IP Conflict') || l.message.includes('[SIM]'))).length;

  const handleCleanupNoisyLogs = async () => {
    setIsCleaningLogs(true);
    try {
      const pin = sessionStorage.getItem('netsentinel_admin_pin') || '';
      const res = await fetch('/api/logs/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'กรุณาปลดล็อกโหมดผู้ดูแลระบบ (Admin PIN) มุมขวาบนก่อนล้าง Log ขยะ');
        return;
      }
      if (data.logs && Array.isArray(data.logs) && onSyncLogs) {
        onSyncLogs(data.logs);
      }
      toast.success(`ล้าง Log ขยะ / IP Conflict ออก ${data.removedCount || 0} รายการเรียบร้อยแล้ว (เหลือประวัติจริง ${data.remainingCount || 0} รายการ)`);
    } catch (_e) {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อล้าง Log ขยะได้');
    } finally {
      setIsCleaningLogs(false);
    }
  };

  // Calculate log stats
  const totalLogs = logs.length;
  const oldestLog = logs.length > 0 ? logs[logs.length - 1] : null;
  const newestLog = logs.length > 0 ? logs[0] : null;
  
  const logCapacityPercent = Math.min(100, Math.round((totalLogs / settings.maxLogEntries) * 100));
  
  const getOldestDate = () => {
    if (!oldestLog) return '-';
    return new Date(oldestLog.timestamp).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      calendar: 'buddhist'
    });
  };

  const getRetentionText = () => {
    if (!settings.enableAutoDelete) return 'ไม่มีการลบอัตโนมัติ (เก็บถาวร)';
    return `เก็บข้อมูลย้อนหลัง ${settings.logRetentionDays} วัน หรือสูงสุด ${settings.maxLogEntries} รายการ`;
  };

  const getDaysOfData = () => {
    if (!oldestLog || !newestLog) return 0;
    const diff = new Date(newestLog.timestamp).getTime() - new Date(oldestLog.timestamp).getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  // THAI DATE FORMAT
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

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    try {
        // Try real AI first
        const result = await generateAISummary(devices, logs);
        setReport(result || null);
        toast.success("AI วิเคราะห์ข้อมูลสำเร็จ");
    } catch (error) {
        console.warn("AI Analysis failed, falling back to local analysis:", error);
        // Fallback to local analysis
        try {
            const result = generateLocalIncidentReport(logs, devices);
            setReport(result);
            toast.success("สร้างรายงานสรุปสำเร็จ (Local Engine)");
        } catch (localError) {
            toast.error("ไม่สามารถสร้างรายงานได้");
        }
    } finally {
        setIsGenerating(false);
    }
  };

  const handlePrintReport = () => {
    const printContent = document.getElementById('report-content');
    if (printContent) {
        const win = window.open('', '', 'height=700,width=900');
        if(win) {
            win.document.write('<html><head><title>Network Sentinel - Incident Report</title>');
            win.document.write('<script src="https://cdn.tailwindcss.com"></script>'); 
            win.document.write('<style>');
            win.document.write(`
                @page {
                    size: A4;
                    margin: 10mm;
                }
                @media print {
                    body { padding: 0; margin: 0; background: white; }
                    .report-container { 
                        box-shadow: none !important; 
                        border: none !important; 
                        max-width: 100% !important; 
                        padding: 0 !important;
                        width: 100% !important;
                    }
                    .no-print { display: none; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
                body { 
                    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                    background-color: #f8fafc;
                }
            `);
            win.document.write('</style>');
            win.document.write('</head><body class="p-8 bg-white">');
            win.document.write(printContent.innerHTML);
            win.document.write('</body></html>');
            win.document.close();
            
            setTimeout(() => {
                win.focus();
                win.print();
            }, 1200);
        }
    }
  };

  const handleExportLogs = () => {
    if (logs.length === 0) {
      toast.error("No logs to export");
      return;
    }

    const headers = ['Timestamp,Device Name,IP,Type,Message,Location'];
    const rows = logs.map(log => {
      const msg = `"${log.message.replace(/"/g, '""')}"`; 
      // Export with ISO for compatibility, or Thai if preferred
      return `${new Date(log.timestamp).toISOString()},${log.deviceName},${log.ip},${log.type},${msg},${log.location}`;
    });
    
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `downtime_history_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success("History log exported successfully");
  };

  const filteredLogs = logs.filter(log => {
     const matchesSearch = log.deviceName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           log.ip.includes(searchTerm) || 
                           log.message.toLowerCase().includes(searchTerm.toLowerCase());
     
     const matchesFilter = filterType === 'ALL' || log.type === filterType;

     const logDateObj = new Date(log.timestamp);
     const logDate = `${logDateObj.getFullYear()}-${String(logDateObj.getMonth() + 1).padStart(2, '0')}-${String(logDateObj.getDate()).padStart(2, '0')}`;
     
     const matchesStartDate = !startDate || logDate >= startDate;
     const matchesEndDate = !endDate || logDate <= endDate;

     return matchesSearch && matchesFilter && matchesStartDate && matchesEndDate;
  }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-white">Downtime & Incident History</h2>
          <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm">Automated logs of network unavailability and high latency events.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto">
          <button
            onClick={handleCleanupNoisyLogs}
            disabled={isCleaningLogs || logs.length === 0}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl font-bold transition-all shadow-md shadow-amber-500/20 text-xs disabled:opacity-50 cursor-pointer"
            title="ลบเฉพาะ Log ที่เกิดจาก IP Conflict หรือข้อมูลซ้ำซ้อน โดยเก็บประวัติจริงไว้ครบ"
          >
            {isCleaningLogs ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>ล้าง Log ขยะ / IP ชนกัน{conflictLogsCount > 0 ? ` (${conflictLogsCount})` : ''}</span>
          </button>
          <button
            onClick={handleExportLogs}
            disabled={logs.length === 0}
            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-800 text-white px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl font-bold transition-all text-xs disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>
          <button
            onClick={() => setIsExecutiveReportOpen(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold transition-all shadow-md shadow-indigo-600/20 text-xs"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF สรุป</span>
          </button>
          <button
            onClick={() => {
              exportToExcel({ systemName: settings.systemName || 'E-Board', devices, logs, aiSummaryText: report || undefined });
              toast.success("กำลังดาวน์โหลดรายงาน Excel");
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold transition-all shadow-md shadow-emerald-600/20 text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Excel</span>
          </button>
          <button
            onClick={handleGenerateReport}
            disabled={isGenerating}
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-500 hover:from-blue-800 hover:via-blue-700 hover:to-cyan-600 text-white px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-xl font-bold transition-all shadow-md shadow-blue-600/20 disabled:opacity-70 text-xs"
          >
            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
            <span>{isGenerating ? 'Analyzing...' : 'AI Summary'}</span>
          </button>
        </div>
      </div>

      {/* Log Retention Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
         <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-xs flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl text-blue-600 dark:text-blue-400 shrink-0">
               <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
               <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">นโยบายการเก็บข้อมูล</p>
               <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{getRetentionText()}</p>
               <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 italic truncate">* ปรับเปลี่ยนได้ที่เมนูตั้งค่า</p>
            </div>
         </div>
         
         <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-xs flex items-center gap-3 sm:gap-4">
            <div className="p-2 sm:p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400 shrink-0">
               <Search className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
               <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">ข้อมูลย้อนหลังที่มี</p>
               <p className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-200 truncate">{getDaysOfData()} วัน <span className="text-[10px] font-normal text-slate-400">(ตั้งแต่ {getOldestDate()})</span></p>
            </div>
         </div>

         <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-xs col-span-1 sm:col-span-2 md:col-span-1">
            <div className="flex justify-between items-center mb-1.5 sm:mb-2">
               <p className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">ความจุของ Log ({totalLogs}/{settings.maxLogEntries})</p>
               <span className={`text-[10px] sm:text-xs font-bold ${
                 !settings.enableAutoDelete && logCapacityPercent > 90
                   ? 'text-red-500'
                   : logCapacityPercent >= 100
                     ? 'text-emerald-600 dark:text-emerald-400'
                     : 'text-slate-500'
               }`}>
                 {settings.enableAutoDelete && logCapacityPercent >= 100 ? 'วนทับอัตโนมัติ (FIFO)' : `${logCapacityPercent}%`}
               </span>
            </div>
            <div className="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
               <div 
                  className={`h-full transition-all duration-500 ${
                    !settings.enableAutoDelete && logCapacityPercent > 90
                      ? 'bg-red-500'
                      : logCapacityPercent >= 100
                        ? 'bg-emerald-500'
                        : logCapacityPercent > 70
                          ? 'bg-amber-500'
                          : 'bg-blue-500'
                  }`}
                  style={{ width: `${logCapacityPercent}%` }}
               ></div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5 text-right">
              {settings.enableAutoDelete
                ? 'เมื่อครบ 500 รายการ ระบบจะดันรายการเก่าสุดออกทีละรายการอัตโนมัติ'
                : 'ปิดการลบอัตโนมัติอยู่ (สามารถเปิดได้ที่เมนูตั้งค่า)'}
            </p>
         </div>
      </div>

      {/* AI Report Card */}
      {report && (
        <div className="bg-white dark:bg-slate-800 border border-purple-500/30 rounded-xl p-6 shadow-xl animate-in fade-in slide-in-from-top-4 relative">
          <div className="flex items-center justify-between mb-4 border-b border-purple-100 dark:border-slate-700 pb-3">
             <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                <Bot className="w-6 h-6" />
                <h3 className="font-bold text-lg">AI Incident Analysis Result</h3>
             </div>
             <div className="flex gap-2">
                 <button 
                    onClick={handlePrintReport}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-500/20"
                 >
                    <Printer className="w-4 h-4" />
                    Print / Save as PDF
                 </button>
                 <button 
                    onClick={() => setReport(null)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold transition-colors"
                 >
                    Close
                 </button>
             </div>
          </div>
          
          <div id="report-content">
              {report?.trim().startsWith('<div') || report?.trim().startsWith('<h') ? (
                <div 
                  className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 dark:prose-invert"
                  dangerouslySetInnerHTML={{ __html: report }}
                />
              ) : (
                <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-300 dark:prose-invert whitespace-pre-wrap">
                  {report}
                </div>
              )}
          </div>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
             <input 
                type="text" 
                placeholder="ค้นหาประวัติด้วยชื่ออุปกรณ์, IP, สถานที่ หรือข้อความ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs transition-all"
             />
          </div>
          <div className="grid grid-cols-2 sm:flex gap-2">
             <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
             />
             <input 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
             />
          </div>
          <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-x-auto no-scrollbar">
              {[
                { key: 'ALL', label: 'ทั้งหมด' },
                { key: 'OUTAGE', label: 'OUTAGE' },
                { key: 'RECOVERY', label: 'RECOVERY' },
                { key: 'HIGH_LATENCY', label: 'HIGH LATENCY' }
              ].map((item) => (
                 <button
                    key={item.key}
                    onClick={() => setFilterType(item.key)}
                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 whitespace-nowrap cursor-pointer ${
                       filterType === item.key 
                          ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-xs' 
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                 >
                    {item.label}
                 </button>
              ))}
          </div>
      </div>

      {/* Mobile Card List (md:hidden) */}
      <div className="md:hidden space-y-2.5">
        {filteredLogs.map(log => {
          const dtParts = formatThaiDateTime(log.timestamp).split(' ');
          return (
            <div
              key={log.id}
              className="p-3.5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-sm text-slate-800 dark:text-white truncate">{log.deviceName}</h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                    <span>{log.ip}</span>
                    {log.location && (
                      <>
                        <span>•</span>
                        <span className="font-sans truncate max-w-[140px]">📍 {log.location}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                  log.type === 'OUTAGE' ? 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-500/15' :
                  log.type === 'RECOVERY' ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15' :
                  'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/15'
                }`}>
                  {log.type === 'OUTAGE' && <AlertOctagon className="w-3 h-3" />}
                  {log.type === 'RECOVERY' && <CheckCircle2 className="w-3 h-3" />}
                  {log.type === 'HIGH_LATENCY' && <Clock className="w-3 h-3" />}
                  {log.type.replace('_', ' ')}
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-700/60">
                {log.message}
              </p>
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-0.5">
                <span>📅 {dtParts[0]}</span>
                <span className="font-bold text-slate-600 dark:text-slate-300">🕒 {dtParts[1]}</span>
              </div>
            </div>
          );
        })}
        {filteredLogs.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
            ไม่พบประวัติเหตุการณ์ที่ตรงกับเงื่อนไขการค้นหา
          </div>
        )}
      </div>

      {/* Desktop Table (hidden md:block) */}
      <div className="hidden md:block bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">
                <th className="p-4">วัน-เวลา</th>
                <th className="p-4">อุปกรณ์</th>
                <th className="p-4">สถานที่</th>
                <th className="p-4">ประเภทเหตุการณ์</th>
                <th className="p-4">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="p-4 text-sm text-slate-600 dark:text-slate-400 font-mono whitespace-nowrap">
                     <div className="flex flex-col">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{formatThaiDateTime(log.timestamp).split(' ')[1]}</span>
                        <span className="text-xs text-slate-400">{formatThaiDateTime(log.timestamp).split(' ')[0]}</span>
                     </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{log.deviceName}</span>
                      <span className="text-xs text-slate-500 font-mono">{log.ip}</span>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="text-sm text-slate-600 dark:text-slate-400">{log.location || '-'}</span>
                  </td>
                  <td className="p-4">
                    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-semibold ${
                      log.type === 'OUTAGE' ? 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-500/10' :
                      log.type === 'RECOVERY' ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10' :
                      'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10'
                    }`}>
                      {log.type === 'OUTAGE' && <AlertOctagon className="w-3 h-3" />}
                      {log.type === 'RECOVERY' && <CheckCircle2 className="w-3 h-3" />}
                      {log.type === 'HIGH_LATENCY' && <Clock className="w-3 h-3" />}
                      {log.type.replace('_', ' ')}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                    {log.message}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                   <td colSpan={5} className="p-8 text-center text-slate-500">ไม่พบประวัติเหตุการณ์ที่ตรงกับเงื่อนไขการค้นหา</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isExecutiveReportOpen && (
        <ExecutiveReportModal
          isOpen={isExecutiveReportOpen}
          onClose={() => setIsExecutiveReportOpen(false)}
          systemName={settings.systemName || 'E-Board'}
          devices={devices}
          logs={logs}
          aiSummary={report || undefined}
          onGenerateAiSummary={handleGenerateReport}
          isGeneratingAi={isGenerating}
        />
      )}
    </div>
  );
};
