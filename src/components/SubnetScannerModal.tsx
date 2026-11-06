import React, { useState } from 'react';
import { Device, DeviceType, DeviceStatus } from '../types';
import { Radar, CheckCircle2, RefreshCw, X, Plus, ShieldCheck, Cpu, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface SubnetScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddDevices: (newDevices: Partial<Device>[]) => void;
  onSyncDevices?: (updatedDevices: Device[]) => void;
  hostIp: string;
  devices?: Device[];
}

interface ScannedHost {
  ip: string;
  previousIp?: string;
  ipChanged?: boolean;
  macAddress?: string;
  matchedBy?: 'MAC' | 'IP' | 'NEW';
  alive: boolean;
  latency: number;
  deviceId?: string;
  suggestedName: string;
  suggestedType: DeviceType;
  suggestedLocation: string;
  floor?: string;
  model?: string;
  isAlreadyInSystem: boolean;
  wasOffline?: boolean;
  selected?: boolean;
}

export const SubnetScannerModal: React.FC<SubnetScannerModalProps> = ({
  isOpen,
  onClose,
  onAddDevices,
  onSyncDevices,
  devices = []
}) => {
  if (!isOpen) return null;

  const [scanMode, setScanMode] = useState<'registered_mac_only' | 'all_subnet'>('registered_mac_only');
  const [startIp, setStartIp] = useState<string>('10.80.80.1');
  const [endIp, setEndIp] = useState<string>('10.80.80.254');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scannedHosts, setScannedHosts] = useState<ScannedHost[]>([]);
  const [scanSummary, setScanSummary] = useState<{
    scanned: number;
    found: number;
    matchedSystemCount: number;
    ipUpdatedCount: number;
    newlyOnlineCount: number;
  } | null>(null);

  const registeredMacCount = React.useMemo(
    () => devices.filter(d => Boolean(d.macAddress && d.macAddress.trim())).length,
    [devices]
  );

  const handleStartScan = async () => {
    setIsScanning(true);
    setScannedHosts([]);
    setScanSummary(null);

    try {
      const res = await fetch('/api/scan-subnet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startIp: scanMode === 'registered_mac_only' ? '10.80.80.1' : startIp,
          endIp: scanMode === 'registered_mac_only' ? '10.80.80.254' : endIp,
          timeoutMs: 550,
          mode: scanMode,
          autoSyncMatched: true
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'การสแกนล้มเหลว');
      }

      if (data.devices && Array.isArray(data.devices) && onSyncDevices) {
        onSyncDevices(data.devices);
      }

      const activeList: ScannedHost[] = (data.activeDevices || []).map((h: any) => ({
        ...h,
        selected: !h.isAlreadyInSystem
      }));

      setScannedHosts(activeList);
      setScanSummary({
        scanned: data.scannedCount || 254,
        found: data.foundCount || 0,
        matchedSystemCount: data.matchedSystemCount || 0,
        ipUpdatedCount: data.ipUpdatedCount || 0,
        newlyOnlineCount: data.newlyOnlineCount || 0
      });

      if (scanMode === 'registered_mac_only') {
        toast.success(
          `สแกนจับคู่ MAC (10.80.80.*) สำเร็จ! พบออนไลน์ ${data.matchedSystemCount || 0} เครื่อง` +
          (data.ipUpdatedCount > 0 ? ` (อัปเดต IP ใหม่ ${data.ipUpdatedCount} เครื่อง)` : '')
        );
      } else {
        toast.success(`สแกนเสร็จสิ้น! พบอุปกรณ์ทำงานอยู่ ${data.foundCount} เครื่อง`);
      }
    } catch (e: any) {
      toast.error(e.message || 'เกิดข้อผิดพลาดขณะสแกนวง 10.80.80.*');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSelectHost = (ip: string) => {
    setScannedHosts(prev =>
      prev.map(h => (h.ip === ip ? { ...h, selected: !h.selected } : h))
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    setScannedHosts(prev =>
      prev.map(h => (h.isAlreadyInSystem ? h : { ...h, selected: checked }))
    );
  };

  const updateHostDetail = (ip: string, field: 'suggestedName' | 'suggestedType' | 'suggestedLocation', value: any) => {
    setScannedHosts(prev =>
      prev.map(h => (h.ip === ip ? { ...h, [field]: value } : h))
    );
  };

  const handleImportSelected = () => {
    const selected = scannedHosts.filter(h => h.selected && !h.isAlreadyInSystem);
    if (selected.length === 0) {
      toast.error('กรุณาเลือกอุปกรณ์ใหม่ที่ต้องการนำเข้าอย่างน้อย 1 รายการ');
      return;
    }

    const newDeviceEntries: Partial<Device>[] = selected.map(h => ({
      id: String(Date.now() + Math.random()),
      ip: h.ip,
      macAddress: h.macAddress && h.macAddress !== '-' ? h.macAddress : undefined,
      name: h.suggestedName,
      model: 'Discovered Device',
      type: h.suggestedType,
      location: h.suggestedLocation || 'อาคารหลัก',
      isMonitored: true,
      status: DeviceStatus.ONLINE,
      latency: h.latency,
      lastSeen: new Date().toISOString(),
      packetLoss: 0,
      lastStatusChange: new Date().toISOString()
    }));

    onAddDevices(newDeviceEntries);
    toast.success(`นำเข้าอุปกรณ์ ${selected.length} รายการเข้าสู่ระบบ E-Board เรียบร้อยแล้ว!`);
    onClose();
  };

  const newSelectableCount = scannedHosts.filter(h => !h.isAlreadyInSystem && h.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 sm:p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-md">
              <Radar className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg tracking-tight">
                สแกนตรวจสอบและซิงก์จอ E-Board ด้วย MAC Address (วง 10.80.80.*)
              </h3>
              <p className="text-xs text-blue-100">
                ระบบกวาดเช็กตาราง ARP ในวง 10.80.80.* อัตโนมัติทุก 15 วินาที หรือกดสแกนด่วนด้านล่างเพื่อซิงก์ทันที
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-all text-blue-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-5">
          
          {/* Scan Mode Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setScanMode('registered_mac_only');
                setStartIp('10.80.80.1');
                setEndIp('10.80.80.254');
              }}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                scanMode === 'registered_mac_only'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>สแกนเฉพาะเครื่องในระบบด้วย MAC (10.80.80.*)</span>
            </button>
            <button
              type="button"
              onClick={() => setScanMode('all_subnet')}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                scanMode === 'all_subnet'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Radar className="w-4 h-4 shrink-0" />
              <span>ค้นหาอุปกรณ์ทั้งหมดในวงแลน (รวมเครื่องใหม่)</span>
            </button>
          </div>

          {/* Scan Configuration Box */}
          <div className="bg-slate-50 dark:bg-slate-900/70 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            {scanMode === 'registered_mac_only' ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/50 rounded-xl p-3.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-blue-900 dark:text-blue-200">
                    <Cpu className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>โหมดจับคู่เฉพาะอุปกรณ์ที่มีในระบบ (MAC-First Matching)</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    สแกนเฉพาะวง <span className="font-mono font-bold text-blue-700 dark:text-blue-300">10.80.80.1 - 10.80.80.254</span> โดยยึดเลข MAC Address ของอุปกรณ์ในระบบ ({registeredMacCount} เครื่องที่มี MAC) เป็นหลัก หากจอได้เลข IP ใหม่จาก DHCP ระบบจะอัปเดต IP และเปลี่ยนสถานะเป็น ONLINE ให้อัตโนมัติทันที
                  </p>
                </div>
                <div className="shrink-0 font-mono text-xs font-bold px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-center">
                  10.80.80.*
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      IP เริ่มต้น (Start IP)
                    </label>
                    <input
                      type="text"
                      value={startIp}
                      onChange={(e) => setStartIp(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-mono text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="10.80.80.1"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      IP สิ้นสุด (End IP)
                    </label>
                    <input
                      type="text"
                      value={endIp}
                      onChange={(e) => setEndIp(e.target.value)}
                      className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-3 py-2 text-sm font-mono text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="10.80.80.254"
                    />
                  </div>
                </div>

                {/* Quick Preset Buttons */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-xs text-slate-400 font-medium mr-1">ทางลัดช่วง IP:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStartIp('10.80.80.1');
                      setEndIp('10.80.80.254');
                    }}
                    className="px-2.5 py-1 bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-700 text-xs font-semibold text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    วงโรงเรียน (10.80.80.1 - 254)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartIp('10.80.80.100');
                      setEndIp('10.80.80.200');
                    }}
                    className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 rounded-lg hover:border-blue-400"
                  >
                    ช่วง 10.80.80.100 - 200
                  </button>
                </div>
              </>
            )}

            {/* Start Scan Action Button */}
            <button
              onClick={handleStartScan}
              disabled={isScanning}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>กำลังกวาดเช็ก MAC Address ในวง 10.80.80.* ... โปรดรอสักครู่</span>
                </>
              ) : (
                <>
                  <Radar className="w-4 h-4" />
                  <span>
                    {scanMode === 'registered_mac_only'
                      ? 'เริ่มสแกนจับคู่ MAC เฉพาะเครื่องในระบบ (10.80.80.*)'
                      : 'เริ่มสแกนค้นหาอุปกรณ์ในเครือข่าย'}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* Summary Banner */}
          {scanSummary && (
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3 text-center">
                <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">พบเครื่องในระบบออนไลน์</div>
                <div className="text-xl font-black font-mono text-emerald-600 dark:text-emerald-300 tabular-nums">
                  {scanSummary.matchedSystemCount} เครื่อง
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 rounded-xl p-3 text-center">
                <div className="text-[11px] font-bold text-blue-700 dark:text-blue-400">ซิงก์เปลี่ยนเลข IP ใหม่ตาม MAC</div>
                <div className="text-xl font-black font-mono text-blue-600 dark:text-blue-300 tabular-nums">
                  {scanSummary.ipUpdatedCount} เครื่อง
                </div>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/60 rounded-xl p-3 text-center">
                <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400">เพิ่งตรวจพบออนไลน์ใหม่</div>
                <div className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-300 tabular-nums">
                  {scanSummary.newlyOnlineCount} เครื่อง
                </div>
              </div>
            </div>
          )}

          {/* Results Table */}
          {scannedHosts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-white">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>
                    {scanMode === 'registered_mac_only'
                      ? `รายการจอ E-Board ในระบบที่ออนไลน์ (${scannedHosts.length} เครื่อง)`
                      : `อุปกรณ์ที่ตรวจพบ (${scannedHosts.length} เครื่อง)`}
                  </span>
                </div>

                {scanMode === 'all_subnet' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="selectAll"
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="selectAll" className="text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                      เลือกเฉพาะเครื่องที่ยังไม่มีในระบบ
                    </label>
                  </div>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-700 sticky top-0">
                    <tr>
                      {scanMode === 'all_subnet' && <th className="p-3 text-center w-10">เลือก</th>}
                      <th className="p-3">ชื่ออุปกรณ์ / ห้องเรียน</th>
                      <th className="p-3">MAC Address</th>
                      <th className="p-3">IP Address (10.80.80.*)</th>
                      <th className="p-3">Latency</th>
                      <th className="p-3">สถานะการจับคู่</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 bg-white dark:bg-slate-800">
                    {scannedHosts.map((host) => (
                      <tr
                        key={`${host.ip}-${host.macAddress}`}
                        className="hover:bg-blue-50/50 dark:hover:bg-blue-900/20"
                      >
                        {scanMode === 'all_subnet' && (
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              disabled={host.isAlreadyInSystem}
                              checked={!!host.selected && !host.isAlreadyInSystem}
                              onChange={() => toggleSelectHost(host.ip)}
                              className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-40"
                            />
                          </td>
                        )}
                        <td className="p-3">
                          {host.isAlreadyInSystem ? (
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white">{host.suggestedName}</div>
                              <div className="text-[11px] text-slate-500">
                                {host.suggestedLocation}
                                {host.floor ? ` · ชั้น ${String(host.floor).replace(/^ชั้น\s*/i, '')}` : ''}
                                {host.model ? ` · ${host.model}` : ''}
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={host.suggestedName}
                                onChange={(e) => updateHostDetail(host.ip, 'suggestedName', e.target.value)}
                                className="w-36 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:ring-1 focus:ring-blue-500"
                              />
                              <select
                                value={host.suggestedType}
                                onChange={(e) => updateHostDetail(host.ip, 'suggestedType', e.target.value as DeviceType)}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 outline-none"
                              >
                                {Object.values(DeviceType).map(t => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400 tabular-nums">
                          {host.macAddress || '-'}
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800 dark:text-white tabular-nums">
                          {host.ipChanged && host.previousIp ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="line-through text-slate-400 text-[11px]">{host.previousIp}</span>
                              <ArrowRight className="w-3 h-3 text-blue-500" />
                              <span className="text-blue-600 dark:text-blue-400">{host.ip}</span>
                            </div>
                          ) : (
                            <span>{host.ip}</span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-emerald-600 dark:text-emerald-400 font-bold tabular-nums">
                          {host.latency} ms
                        </td>
                        <td className="p-3">
                          {host.isAlreadyInSystem ? (
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              {host.ipChanged
                                ? 'อัปเดต IP ใหม่ตาม MAC แล้ว'
                                : host.matchedBy === 'MAC'
                                ? 'ตรงกับ MAC ในระบบ (ONLINE)'
                                : 'ตรงกับ IP ในระบบ (ONLINE)'}
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              ยังไม่มีในระบบ
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 dark:bg-slate-900/80 p-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs text-slate-500 font-medium">
            {scanMode === 'registered_mac_only'
              ? 'ซิงก์สถานะและเลข IP ตาม MAC Address อัตโนมัติแล้ว'
              : `เลือกอุปกรณ์ใหม่ไว้ ${newSelectableCount} รายการ`}
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm hover:bg-slate-300 transition-all cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
            {scanMode === 'all_subnet' && (
              <button
                onClick={handleImportSelected}
                disabled={newSelectableCount === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>นำเข้าอุปกรณ์ใหม่ที่เลือก ({newSelectableCount})</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
