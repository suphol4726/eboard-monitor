import React, { useRef } from 'react';
import { 
  X, 
  Printer, 
  Download, 
  FileSpreadsheet, 
  ShieldCheck, 
  Building2, 
  Layers, 
  FileText,
  Clock,
  Sparkles,
  Bot
} from 'lucide-react';
import { Device, DeviceStatus, DowntimeLog, formatLocation } from '../types';
import { exportToExcel, exportToPdf, printExecutiveReport } from '../utils/reportExporter';
import toast from 'react-hot-toast';

interface ExecutiveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemName: string;
  devices: Device[];
  logs: DowntimeLog[];
  aiSummary?: string;
  onGenerateAiSummary?: () => Promise<string | void>;
  isGeneratingAi?: boolean;
}

export const ExecutiveReportModal: React.FC<ExecutiveReportModalProps> = ({
  isOpen,
  onClose,
  systemName,
  devices,
  logs,
  aiSummary,
  onGenerateAiSummary,
  isGeneratingAi = false
}) => {
  const reportRef = useRef<HTMLDivElement>(null);
  if (!isOpen) return null;

  const now = new Date();
  const dateStr = now.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    calendar: 'buddhist'
  });
  const timeStr = now.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const total = devices.length;
  const online = devices.filter(d => d.status === DeviceStatus.ONLINE || d.status === DeviceStatus.WARNING).length;
  const offline = devices.filter(d => d.status === DeviceStatus.OFFLINE).length;
  const warning = devices.filter(d => d.status === DeviceStatus.WARNING).length;
  const onlinePct = total > 0 ? ((online / total) * 100).toFixed(1) : '100.0';
  const offlinePct = total > 0 ? ((offline / total) * 100).toFixed(1) : '0.0';
  const avgSla = total > 0
    ? (devices.reduce((acc, d) => acc + (d.uptimePercentage || 100), 0) / total).toFixed(1)
    : '100.0';

  const locMap = new Map<string, { total: number; online: number; offline: number }>();
  devices.forEach(d => {
    const locName = formatLocation(d.location, d.floor) || 'ไม่ระบุสถานที่';
    const curr = locMap.get(locName) || { total: 0, online: 0, offline: 0 };
    curr.total += 1;
    if (d.status === DeviceStatus.OFFLINE) curr.offline += 1;
    else curr.online += 1;
    locMap.set(locName, curr);
  });
  const locationStats = Array.from(locMap.entries()).sort((a, b) => b[1].offline - a[1].offline || b[1].total - a[1].total);

  const handlePrint = () => {
    printExecutiveReport({
      systemName,
      devices,
      logs,
      aiSummaryText: aiSummary
    });
    toast.success('เปิดหน้าต่างพิมพ์รายงานผู้บริหารแล้ว');
  };

  const handleDownloadPdf = async () => {
    toast.success('กำลังสร้างและดาวน์โหลดไฟล์ PDF...');
    await exportToPdf({
      systemName,
      devices,
      logs,
      aiSummaryText: aiSummary,
      elementToCapture: reportRef.current || undefined
    });
  };

  const handleDownloadExcel = () => {
    exportToExcel({
      systemName,
      devices,
      logs
    });
    toast.success('ดาวน์โหลดรายงาน Excel สำเร็จ');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 w-full max-w-5xl h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Modal Top Bar */}
        <div className="px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-white flex items-center gap-2">
                ตัวอย่างรายงานผู้บริหาร (Executive Report Preview)
                <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-semibold">
                  A4 Ready
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ตรวจสอบความถูกต้องก่อนสั่งพิมพ์หรือส่งออกไฟล์ PDF / Excel
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {onGenerateAiSummary && (
              <button
                onClick={onGenerateAiSummary}
                disabled={isGeneratingAi}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60 rounded-xl text-xs font-bold hover:bg-purple-100 transition-colors disabled:opacity-50"
                title="วิเคราะห์สรุปรายงานด้วย AI"
              >
                <Bot className="w-4 h-4" />
                <span>{isGeneratingAi ? 'กำลังวิเคราะห์...' : 'วิเคราะห์ด้วย AI'}</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-600/20 cursor-pointer"
              title="พิมพ์เอกสาร หรือ บันทึกเป็น PDF (คมชัดระดับเวกเตอร์)"
            >
              <Printer className="w-4 h-4" />
              <span>พิมพ์ / บันทึก PDF</span>
            </button>

            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
              title="ดาวน์โหลดไฟล์ .pdf โดยตรง"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">โหลด PDF</span>
            </button>

            <button
              onClick={handleDownloadExcel}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 cursor-pointer"
              title="ดาวน์โหลดไฟล์ .xls สำหรับเปิดใน Excel"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">Excel</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ml-2"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Content (Paper View) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/70 dark:bg-slate-950 flex justify-center">
          <div ref={reportRef} className="w-full max-w-4xl bg-white text-slate-900 rounded-2xl shadow-xl p-6 sm:p-8 border border-slate-200 space-y-6">
            
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-950 text-white rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/10 rounded-2xl p-2 flex items-center justify-center border border-white/20 shrink-0">
                  <ShieldCheck className="w-10 h-10 text-cyan-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-white/20 text-cyan-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full tracking-wider border border-white/20 uppercase">
                      Executive Report
                    </span>
                    <span className="text-xs text-blue-200 font-medium">
                      ระบบตรวจจับเครือข่าย & จออัจฉริยะ
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    {systemName || 'E-Board'} - สรุปสถานะการทำงานระบบ
                  </h1>
                  <p className="text-xs text-slate-300 mt-1">
                    โรงเรียนสาธิต มศว ประสานมิตร (ฝ่ายมัธยม) • แผนกเทคโนโลยีสารสนเทศ
                  </p>
                </div>
              </div>
              <div className="text-left sm:text-right bg-white/10 px-4 py-2 rounded-xl border border-white/15 shrink-0">
                <p className="text-[11px] text-cyan-200 font-bold">วันที่ออกรายงาน</p>
                <p className="text-sm font-bold text-white">{dateStr}</p>
                <p className="text-xs text-slate-300">เวลา {timeStr} น.</p>
              </div>
            </div>

            {/* 4 Stats Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 border-l-4 border-l-blue-500">
                <p className="text-xs font-semibold text-slate-500 flex items-center justify-between">
                  อุปกรณ์ทั้งหมด <span>📦</span>
                </p>
                <p className="text-2xl font-black text-slate-900 mt-1">
                  {total} <span className="text-xs font-semibold text-slate-500">เครื่อง</span>
                </p>
                <p className="text-[10px] text-slate-400 mt-1">เปิดเฝ้าระวัง Active 100%</p>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 border-l-4 border-l-emerald-500">
                <p className="text-xs font-semibold text-emerald-800 flex items-center justify-between">
                  สถานะออนไลน์ <span>🟢</span>
                </p>
                <p className="text-2xl font-black text-emerald-600 mt-1">
                  {online} <span className="text-xs font-semibold text-emerald-800">เครื่อง</span>
                </p>
                <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                  คิดเป็น {onlinePct}% {warning > 0 ? `(หน่วง ${warning})` : 'ของระบบ'}
                </p>
              </div>

              <div className={`${offline > 0 ? 'bg-red-50 border-red-200 border-l-red-500' : 'bg-slate-50 border-slate-200 border-l-slate-400'} border rounded-xl p-3.5 border-l-4`}>
                <p className={`text-xs font-semibold ${offline > 0 ? 'text-red-800' : 'text-slate-500'} flex items-center justify-between`}>
                  สถานะออฟไลน์ <span>{offline > 0 ? '🔴' : '⚪'}</span>
                </p>
                <p className={`text-2xl font-black ${offline > 0 ? 'text-red-600' : 'text-slate-500'} mt-1`}>
                  {offline} <span className="text-xs font-semibold text-slate-600">เครื่อง</span>
                </p>
                <p className={`text-[10px] ${offline > 0 ? 'text-red-700 font-semibold' : 'text-slate-400'} mt-1`}>
                  {offline > 0 ? `พบปัญหา ${offlinePct}% (มีบันทึกหมายเหตุ)` : 'ไม่มีอุปกรณ์ขัดข้อง'}
                </p>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 border-l-4 border-l-indigo-500">
                <p className="text-xs font-semibold text-indigo-800 flex items-center justify-between">
                  SLA Uptime เฉลี่ย <span>⚡</span>
                </p>
                <p className="text-2xl font-black text-indigo-600 mt-1">
                  {avgSla}<span className="text-sm font-bold">%</span>
                </p>
                <div className="w-full bg-indigo-200 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${avgSla}%` }} />
                </div>
              </div>
            </div>

            {/* AI / Executive Summary Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  บทวิเคราะห์และข้อสรุปผู้บริหาร (Executive Insights)
                </h3>
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-semibold">
                  AI & System Analytics
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {aiSummary 
                  ? aiSummary.replace(/<[^>]*>/g, '') 
                  : `ระบบภาพรวมทำงานได้ที่ระดับความพร้อมใช้งาน (SLA) ${avgSla}% มีอุปกรณ์พร้อมให้บริการปกติจำนวน ${online} เครื่อง จากทั้งหมด ${total} เครื่อง ${offline > 0 ? `โดยตรวจพบอุปกรณ์สถานะออฟไลน์จำนวน ${offline} เครื่อง ซึ่งมีการบันทึกสาเหตุ/หมายเหตุการปิดจอหรือการบำรุงรักษาไว้เรียบร้อยแล้ว` : 'อุปกรณ์ทุกเครื่องสามารถตอบสนองการเชื่อมต่อได้อย่างสมบูรณ์ ไม่พบเหตุขัดข้องผิดปกติ'}`}
              </p>
            </div>

            {/* Location Badges */}
            {locationStats.length > 0 && (
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-slate-600" />
                  สรุปสถานะตามอาคารและสถานที่ ({locationStats.length} โซน/อาคาร)
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {locationStats.map(([loc, stat]) => (
                    <div
                      key={loc}
                      className={`text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${
                        stat.offline > 0 ? 'bg-red-50 border-red-200 text-slate-800' : 'bg-emerald-50 border-emerald-200 text-slate-800'
                      }`}
                    >
                      <span className="font-semibold">{loc}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        stat.offline > 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {stat.online}/{stat.total}
                      </span>
                      {stat.offline > 0 && (
                        <span className="text-[10px] text-red-600 font-bold">(ดับ {stat.offline})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Device Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-blue-600" />
                  รายการอุปกรณ์เครือข่ายและหมายเหตุ (Device Inventory)
                </h3>
                <span className="text-xs text-slate-500 font-semibold">ทั้งหมด {devices.length} รายการ</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-800 text-white font-bold text-[11px]">
                    <tr>
                      <th className="p-2.5 text-center w-10">#</th>
                      <th className="p-2.5">ชื่ออุปกรณ์</th>
                      <th className="p-2.5">IP Address</th>
                      <th className="p-2.5">สถานที่ / ชั้น</th>
                      <th className="p-2.5 text-center w-24">สถานะ</th>
                      <th className="p-2.5">หมายเหตุ (Remarks)</th>
                      <th className="p-2.5 text-right w-16">Ping</th>
                      <th className="p-2.5 text-right w-16">SLA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {devices.map((d, i) => {
                      const isOffline = d.status === DeviceStatus.OFFLINE;
                      const isWarning = d.status === DeviceStatus.WARNING;
                      return (
                        <tr key={d.id} className={i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/50'}>
                          <td className="p-2 text-center text-slate-400 font-mono text-[11px]">{i + 1}</td>
                          <td className="p-2 font-bold text-slate-800">
                            {d.name}
                            {d.type && <span className="block text-[10px] text-slate-400 font-normal">{d.type} {d.model ? `• ${d.model}` : ''}</span>}
                          </td>
                          <td className="p-2 font-mono text-[11px] text-slate-600 font-semibold">{d.ip}</td>
                          <td className="p-2 text-slate-600 text-[11px]">{formatLocation(d.location, d.floor)}</td>
                          <td className="p-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isOffline ? 'bg-red-100 text-red-700 border border-red-200' :
                              isWarning ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                              'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              {isOffline ? '🔴 ดับ' : isWarning ? '🟡 ช้า' : '🟢 ปกติ'}
                            </span>
                          </td>
                          <td className="p-2">
                            {d.remarks ? (
                              <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded text-[10px] font-semibold border border-amber-200 inline-flex items-center gap-1">
                                📝 {d.remarks}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="p-2 text-right font-mono text-[11px] text-slate-600">{d.latency}ms</td>
                          <td className={`p-2 text-right font-bold text-[11px] ${(d.uptimePercentage || 100) < 95 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {d.uptimePercentage || 100}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Incident Logs Table (If available) */}
            {logs && logs.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-red-600" />
                    ประวัติบันทึกเหตุการณ์ขัดข้องล่าสุด (Incident Logs)
                  </h3>
                  <span className="text-xs text-slate-500 font-semibold">แสดง {Math.min(10, logs.length)} รายการ</span>
                </div>

                <div className="border border-red-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-red-800 text-white font-bold text-[11px]">
                      <tr>
                        <th className="p-2 text-center w-10">#</th>
                        <th className="p-2">วัน-เวลา</th>
                        <th className="p-2">ชื่ออุปกรณ์</th>
                        <th className="p-2">IP Address</th>
                        <th className="p-2">สถานที่</th>
                        <th className="p-2">รายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-100">
                      {logs.slice(0, 10).map((l, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-red-50/40'}>
                          <td className="p-2 text-center text-red-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="p-2 text-slate-600 text-[11px]">{new Date(l.timestamp).toLocaleString('th-TH')}</td>
                          <td className="p-2 font-bold text-slate-800">{l.deviceName}</td>
                          <td className="p-2 font-mono text-[11px] text-slate-600">{l.ip}</td>
                          <td className="p-2 text-slate-600 text-[11px]">{formatLocation(l.location)}</td>
                          <td className="p-2 text-red-700 font-semibold text-[11px]">{l.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-2">
              <div>
                <strong>ผู้จัดทำ:</strong> แผนกเทคโนโลยีสารสนเทศ โรงเรียนสาธิต มศว ประสานมิตร (ฝ่ายมัธยม)
              </div>
              <div className="text-slate-400">
                เอกสารสรุปสถานะระบบสำหรับผู้บริหาร • E-Board System
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
