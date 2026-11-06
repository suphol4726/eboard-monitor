import React, { useState, useRef, useMemo } from 'react';
import { Device, DeviceType, DeviceStatus, formatLocation, normalizeFloorValue, formatFloorLabel } from '../types';
import { 
  Plus, Trash2, Edit2, Search, MonitorPlay, MonitorStop, 
  FileDown, FileUp, Server, Printer, Router, Wifi, Video, Laptop, 
  Box, MapPin, Tag, Network,
  Globe, Shield, ArrowUpDown, Wrench, Hash, Tv,
  ChevronDown, ChevronUp, Radar, FileText, FileEdit, Sparkles, Check, X,
  CheckSquare, Send, LayoutGrid, List, Copy, Building2, Webhook, SlidersHorizontal
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MotionButton } from './MotionButton';
import { sendLineDevicesSummary, sendWebhookDevicesSummary } from '../services/monitorService';
import { resolveDeviceVendor, normalizeMacAddress } from '../utils/macVendor';

interface DeviceManagerProps {
  devices: Device[];
  onAdd: (device: Device) => void;
  onImportBulk?: (payload: { devices: Partial<Device>[]; mode: 'replace' | 'merge' }) => Promise<void> | void;
  onDelete: (id: string) => void;
  onUpdate: (device: Device) => void;
  onDeleteBulk?: (ids: string[]) => void;
  onOpenSubnetScanner?: () => void;
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  onUpdateBulkRemarks?: (ids: string[], remarks: string) => Promise<void> | void;
  onUpdateRemarks?: (deviceId: string, remarks: string) => Promise<void> | void;
  onSendLineSelection?: (payload: { deviceIds: string[]; customTitle?: string; remarksNote?: string }) => Promise<void> | void;
  onSendWebhookSelection?: (payload: { deviceIds: string[]; customTitle?: string; remarksNote?: string }) => Promise<void> | void;
}

// Helper to get icon for device type
const getDeviceIcon = (type: DeviceType) => {
  switch (type) {
    case DeviceType.SERVER: return Server;
    case DeviceType.PRINTER: return Printer;
    case DeviceType.ROUTER: return Router;
    case DeviceType.SWITCH: return Network;
    case DeviceType.AP: return Wifi;
    case DeviceType.CAMERA: return Video;
    case DeviceType.PC: return Laptop;
    case DeviceType.EBOARD: return Tv;
    default: return Box;
  }
};

export const DeviceManager: React.FC<DeviceManagerProps> = ({ 
  devices, onAdd, onImportBulk, onDelete, onUpdate, onDeleteBulk,
  onOpenSubnetScanner, onExportPdf, onExportExcel,
  onUpdateBulkRemarks, onUpdateRemarks, onSendLineSelection, onSendWebhookSelection
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<{ fileName: string; devices: Partial<Device>[] } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterLocation, setFilterLocation] = useState<string>('All');
  const [filterFloor, setFilterFloor] = useState<string>('All');
  const [filterTag, setFilterTag] = useState<string>('All');
  const [filterStatus, setFilterStatus] = useState<string>('All'); // 'All' | 'Online' | 'Offline' | 'Warning'
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Device; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards'); // Mobile friendly default
  const [showFilters, setShowFilters] = useState(false);
  const [showFileTools, setShowFileTools] = useState(false);

  const activeFilterCount = [
    filterLocation !== 'All',
    filterFloor !== 'All',
    filterType !== 'All',
    filterTag !== 'All'
  ].filter(Boolean).length;

  // Bulk Remark Modal State
  const [isBulkRemarkModalOpen, setIsBulkRemarkModalOpen] = useState(false);
  const [bulkRemarkText, setBulkRemarkText] = useState('');
  const [isSavingBulkRemark, setIsSavingBulkRemark] = useState(false);
  const [sendToLineAfterRemark, setSendToLineAfterRemark] = useState(true);
  const [isSendingLineDirect, setIsSendingLineDirect] = useState(false);
  const [lineCooldownSec, setLineCooldownSec] = useState(0);
  const [isSendingWebhookDirect, setIsSendingWebhookDirect] = useState(false);
  const [webhookCooldownSec, setWebhookCooldownSec] = useState(0);

  // Single Device Quick Remark Modal State
  const [singleRemarkDevice, setSingleRemarkDevice] = useState<Device | null>(null);
  const [singleRemarkText, setSingleRemarkText] = useState('');
  const [isSavingSingleRemark, setIsSavingSingleRemark] = useState(false);
  const [sendSingleToLine, setSendSingleToLine] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cooldown countdown timer for LINE notifications
  React.useEffect(() => {
    if (lineCooldownSec <= 0) return;
    const timer = setInterval(() => {
      setLineCooldownSec(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [lineCooldownSec]);

  // Cooldown countdown timer for Webhook notifications
  React.useEffect(() => {
    if (webhookCooldownSec <= 0) return;
    const timer = setInterval(() => {
      setWebhookCooldownSec(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [webhookCooldownSec]);

  // Calculate counts for each device type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All': devices.length };
    // Initialize all types with 0
    Object.values(DeviceType).forEach(t => counts[t] = 0);
    
    // Count devices
    devices.forEach(d => {
      if (counts[d.type] !== undefined) {
        counts[d.type]++;
      }
    });
    return counts;
  }, [devices]);

  // Calculate counts for status
  const statusCounts = useMemo(() => {
    return {
      all: devices.length,
      online: devices.filter(d => d.status === DeviceStatus.ONLINE).length,
      offline: devices.filter(d => d.status === DeviceStatus.OFFLINE).length,
      warning: devices.filter(d => d.status === DeviceStatus.WARNING).length
    };
  }, [devices]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    devices.forEach(d => d.tags?.forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [devices]);

  const allLocations = useMemo(() => {
    const locs = new Set<string>();
    devices.forEach(d => {
      if (d.location && d.location.trim()) locs.add(d.location.trim());
    });
    return Array.from(locs).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
  }, [devices]);

  const allFloors = useMemo(() => {
    const floors = new Set<string>();
    devices.forEach(d => {
      const normalized = normalizeFloorValue(d.floor);
      if (normalized) floors.add(normalized);
    });
    return Array.from(floors).sort((a, b) => a.localeCompare(b, 'th', { numeric: true }));
  }, [devices]);

  const filteredDevices = useMemo(() => {
    let result = devices.filter(d => {
      const vendorName = resolveDeviceVendor(d).vendor;
      const lowerSearch = searchTerm.toLowerCase();
      const matchesSearch = d.name.toLowerCase().includes(lowerSearch) || 
                            d.ip.includes(lowerSearch) || 
                            (d.macAddress && d.macAddress.toLowerCase().includes(lowerSearch)) ||
                            vendorName.toLowerCase().includes(lowerSearch) ||
                            (d.location && d.location.toLowerCase().includes(lowerSearch)) ||
                            (d.floor && d.floor.toLowerCase().includes(lowerSearch)) ||
                            (d.remarks && d.remarks.toLowerCase().includes(lowerSearch));
      const matchesType = filterType === 'All' || d.type === filterType;
      const matchesLocation = filterLocation === 'All' || d.location === filterLocation;
      const matchesFloor = filterFloor === 'All' || normalizeFloorValue(d.floor) === normalizeFloorValue(filterFloor);
      const matchesTag = filterTag === 'All' || (d.tags && d.tags.includes(filterTag));
      const matchesStatus = filterStatus === 'All' 
        ? true 
        : filterStatus === 'Online'
          ? d.status === DeviceStatus.ONLINE
          : filterStatus === 'Offline'
            ? d.status === DeviceStatus.OFFLINE
            : d.status === DeviceStatus.WARNING;

      return matchesSearch && matchesType && matchesLocation && matchesFloor && matchesTag && matchesStatus;
    });

    const config = sortConfig || { key: 'name', direction: 'asc' };
    result.sort((a, b) => {
      let comp = 0;

      if (config.key === 'ip') {
        const parseIP = (ip: string) => (ip || '').trim().split('.').map(n => parseInt(n, 10));
        const pA = parseIP(a.ip);
        const pB = parseIP(b.ip);
        if (pA.length === 4 && pB.length === 4 && !pA.some(isNaN) && !pB.some(isNaN)) {
          for (let i = 0; i < 4; i++) {
            if (pA[i] !== pB[i]) {
              comp = pA[i] - pB[i];
              break;
            }
          }
        } else {
          comp = (a.ip || '').localeCompare(b.ip || '', undefined, { numeric: true });
        }
      } else if (config.key === 'latency') {
        const latA = a.status === DeviceStatus.OFFLINE ? 999999 : (a.latency ?? 0);
        const latB = b.status === DeviceStatus.OFFLINE ? 999999 : (b.latency ?? 0);
        comp = latA - latB;
      } else if (config.key === 'status') {
        const statusOrder = { [DeviceStatus.OFFLINE]: 0, [DeviceStatus.WARNING]: 1, [DeviceStatus.ONLINE]: 2 };
        comp = (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3);
      } else {
        const aValue = (a[config.key] ?? '').toString();
        const bValue = (b[config.key] ?? '').toString();
        
        comp = aValue.localeCompare(bValue, 'th', { sensitivity: 'base', numeric: true });
      }

      return config.direction === 'asc' ? comp : -comp;
    });

    return result;
  }, [devices, searchTerm, filterType, filterLocation, filterFloor, filterTag, filterStatus, sortConfig]);

  // Selected Device Stats Breakdown
  const selectedStats = useMemo(() => {
    const selectedDevices = devices.filter(d => selectedIds.includes(d.id));
    return {
      total: selectedIds.length,
      offline: selectedDevices.filter(d => d.status === DeviceStatus.OFFLINE).length,
      online: selectedDevices.filter(d => d.status === DeviceStatus.ONLINE).length,
      warning: selectedDevices.filter(d => d.status === DeviceStatus.WARNING).length
    };
  }, [devices, selectedIds]);

  // Quick Selection Helpers
  const selectAllFiltered = () => {
    setSelectedIds(filteredDevices.map(d => d.id));
    toast.success(`เลือกอุปกรณ์ทั้งหมด ${filteredDevices.length} เครื่อง`);
  };

  const selectOnlyOnline = () => {
    const onlineIds = filteredDevices
      .filter(d => d.status === DeviceStatus.ONLINE || d.status === DeviceStatus.WARNING)
      .map(d => d.id);
    setSelectedIds(onlineIds);
    if (onlineIds.length === 0) {
      toast('ไม่พบอุปกรณ์ที่ออนไลน์ในรายการนี้', { icon: 'ℹ️' });
    } else {
      toast.success(`เลือกเฉพาะอุปกรณ์ออนไลน์ ${onlineIds.length} เครื่อง`);
    }
  };

  const selectOnlyOffline = () => {
    const offlineIds = filteredDevices
      .filter(d => d.status === DeviceStatus.OFFLINE)
      .map(d => d.id);
    setSelectedIds(offlineIds);
    if (offlineIds.length === 0) {
      toast('ไม่พบอุปกรณ์ที่ออฟไลน์ในรายการนี้', { icon: 'ℹ️' });
    } else {
      toast.success(`เลือกเฉพาะอุปกรณ์ออฟไลน์ ${offlineIds.length} เครื่อง`);
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handleSort = (key: keyof Device) => {
    setSortConfig(current => {
      if (current && current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const confirmDelete = () => {
    if (deleteConfirmId) {
      onDelete(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    setBulkDeleteConfirm(true);
  };

  const confirmBulkDelete = () => {
    if (onDeleteBulk) {
      onDeleteBulk(selectedIds);
      setSelectedIds([]);
    } else {
      selectedIds.forEach(id => onDelete(id));
      setSelectedIds([]);
    }
    setBulkDeleteConfirm(false);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredDevices.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredDevices.map(d => d.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(prev => prev.filter(i => i !== id));
    } else {
      setSelectedIds(prev => [...prev, id]);
    }
  };

  const openEdit = (device: Device) => {
    setEditingDevice(device);
    setIsModalOpen(true);
  };

  const openAdd = () => {
    setEditingDevice(null);
    setIsModalOpen(true);
  };

  // --- REMARK HANDLERS ---
  const handleOpenBulkRemarks = () => {
    if (selectedIds.length === 0) return;
    setBulkRemarkText('');
    setIsBulkRemarkModalOpen(true);
  };

  const handleDirectSendLineSelection = async () => {
    if (selectedIds.length === 0 || isSendingLineDirect || lineCooldownSec > 0) return;
    try {
      setIsSendingLineDirect(true);
      const targetCount = selectedIds.length;
      const payload = {
        deviceIds: selectedIds,
        customTitle: `📊 รายงานสรุปสถานะจอ : E-Board (${targetCount} เครื่อง)`
      };
      if (onSendLineSelection) {
        await onSendLineSelection(payload);
      } else {
        const res = await sendLineDevicesSummary(payload);
        toast.success(res.message || `ส่งรายงานสถานะจอ E-Board ${targetCount} เครื่องไปที่ LINE สำเร็จ!`);
      }
      setLineCooldownSec(5);
    } catch (e: any) {
      console.warn('Direct LINE send note:', e?.message || e);
      toast.error(e.message || 'ไม่สามารถส่งข้อความไปที่ LINE ได้ กรุณาตรวจสอบการตั้งค่า LINE ในหน้า Settings', { duration: 5000 });
    } finally {
      setIsSendingLineDirect(false);
    }
  };

  const handleDirectSendWebhookSelection = async () => {
    if (selectedIds.length === 0 || isSendingWebhookDirect || webhookCooldownSec > 0) return;
    try {
      setIsSendingWebhookDirect(true);
      const targetCount = selectedIds.length;
      const payload = {
        deviceIds: selectedIds,
        customTitle: `📊 รายงานสรุปสถานะจอ : E-Board (${targetCount} เครื่อง)`
      };
      if (onSendWebhookSelection) {
        await onSendWebhookSelection(payload);
      } else {
        const res = await sendWebhookDevicesSummary(payload);
        toast.success(res.message || `ส่งรายงานสถานะจอ E-Board ${targetCount} เครื่องไปที่ Webhook (MS Teams) สำเร็จ!`);
      }
      setWebhookCooldownSec(5);
    } catch (e: any) {
      console.warn('Direct Webhook send note:', e?.message || e);
      toast.error(e.message || 'ไม่สามารถส่งข้อความไปที่ Webhook ได้ กรุณาตรวจสอบ Webhook URL ในหน้า Settings', { duration: 5000 });
    } finally {
      setIsSendingWebhookDirect(false);
    }
  };

  const handleSaveBulkRemarks = async (remarkToSave: string) => {
    if (selectedIds.length === 0) return;
    const targetIds = [...selectedIds];
    try {
      setIsSavingBulkRemark(true);
      if (onUpdateBulkRemarks) {
        await onUpdateBulkRemarks(targetIds, remarkToSave);
      } else {
        targetIds.forEach(id => {
          const dev = devices.find(d => d.id === id);
          if (dev) onUpdate({ ...dev, remarks: remarkToSave });
        });
      }

      // If sendToLineAfterRemark is true, send notification to LINE
      if (sendToLineAfterRemark) {
        try {
          const payload = {
            deviceIds: targetIds,
            remarksNote: remarkToSave || '(ล้างหมายเหตุ)',
            customTitle: `📝 อัปเดตหมายเหตุจอ E-Board (${targetIds.length} เครื่อง)`
          };
          if (onSendLineSelection) {
            await onSendLineSelection(payload);
          } else {
            await sendLineDevicesSummary(payload);
            toast.success(`บันทึกหมายเหตุและส่งแจ้งเตือน LINE สำเร็จ (${targetIds.length} เครื่อง)`);
          }
          setLineCooldownSec(5);
        } catch (lineErr: any) {
          console.warn('Failed to send LINE notification:', lineErr);
          toast.success(`บันทึกหมายเหตุแล้ว (แจ้งเตือน LINE ไม่สำเร็จ: ${lineErr.message || 'ตรวจสอบ Token'})`);
        }
      } else if (!onUpdateBulkRemarks) {
        toast.success(`บันทึกหมายเหตุ ${targetIds.length} อุปกรณ์เรียบร้อย`);
      }

      setIsBulkRemarkModalOpen(false);
      setSelectedIds([]);
    } catch (e) {
      console.error(e);
      toast.error('เกิดข้อผิดพลาดในการบันทึกหมายเหตุ');
    } finally {
      setIsSavingBulkRemark(false);
    }
  };

  const handleOpenSingleRemark = (device: Device) => {
    setSingleRemarkDevice(device);
    setSingleRemarkText(device.remarks || '');
    setSendSingleToLine(false);
  };

  const handleSaveSingleRemark = async () => {
    if (!singleRemarkDevice) return;
    const targetDev = singleRemarkDevice;
    try {
      setIsSavingSingleRemark(true);
      if (onUpdateRemarks) {
        await onUpdateRemarks(targetDev.id, singleRemarkText);
      } else {
        onUpdate({ ...targetDev, remarks: singleRemarkText });
      }

      if (sendSingleToLine) {
        try {
          const payload = {
            deviceIds: [targetDev.id],
            remarksNote: singleRemarkText || '(ล้างหมายเหตุ)',
            customTitle: `📝 อัปเดตหมายเหตุ: ${targetDev.name}`
          };
          if (onSendLineSelection) {
            await onSendLineSelection(payload);
          } else {
            await sendLineDevicesSummary(payload);
            toast.success(`บันทึกหมายเหตุและส่งแจ้งเตือน LINE สำเร็จ`);
          }
          setLineCooldownSec(5);
        } catch (lineErr: any) {
          toast.success(`บันทึกหมายเหตุแล้ว (แจ้งเตือน LINE ไม่สำเร็จ: ${lineErr.message || 'ตรวจสอบ Token'})`);
        }
      } else if (!onUpdateRemarks) {
        toast.success('บันทึกหมายเหตุเรียบร้อย');
      }

      setSingleRemarkDevice(null);
    } catch (e) {
      console.error(e);
      toast.error('ไม่สามารถบันทึกหมายเหตุได้');
    } finally {
      setIsSavingSingleRemark(false);
    }
  };

  // --- IMPORT / EXPORT LOGIC ---
  const handleDownloadTemplate = () => {
    // UTF-8 BOM to make sure Thai characters are displayed correctly in Excel!
    const BOM = '\uFEFF';
    const headers = ['name', 'ip', 'macAddress', 'type', 'location', 'floor', 'model'];
    const example1 = ['เครื่องพิมพ์ สำนักงาน อาคาร 2', '192.168.1.50', 'e8:fc:af:12:34:56', 'Printer', 'อาคารวิทยวิโรฒ', '2', 'Canon iR-ADV-550'];
    const example2 = ['สวิตช์หลัก Server Room', '192.168.1.2', '', 'Switch', 'อาคาร 5', '4', 'Cisco Catalyst 2960'];
    const csvContent = BOM + [headers.join(','), example1.join(','), example2.join(',')].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'device_import_template.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('ดาวน์โหลดเทมเพลต CSV แล้ว (สามารถเปิด/แก้ไขใน Excel ได้)');
  };

  const handleExportCSV = () => {
    const BOM = '\uFEFF';
    const headers = ['name', 'ip', 'macAddress', 'type', 'location', 'floor', 'model'];
    
    const rows = devices.map(device => {
      return headers.map(header => {
        const value = (device as any)[header] !== undefined ? String((device as any)[header]) : '';
        // If value contains comma, double-quotes, or new line, escape it properly for CSV
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
    });

    const csvContent = BOM + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devices_export.csv';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('ส่งออกข้อมูลเป็นไฟล์ Excel/CSV สำเร็จ!');
  };

  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(devices, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "devices_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success('Backup JSON สำเร็จ!');
  };

  const splitCSVLine = (line: string, delimiter = ','): string[] => {
    const parts: string[] = [];
    let currentPart = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === delimiter && !insideQuotes) {
        parts.push(currentPart);
        currentPart = '';
      } else {
        currentPart += char;
      }
    }
    parts.push(currentPart);
    return parts;
  };

  const parseCSV = (text: string): any[] => {
    const lines: string[] = [];
    let currentLine = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === '\n' && !insideQuotes) {
        lines.push(currentLine);
        currentLine = '';
      } else if (char === '\r' && !insideQuotes) {
        // Skip carriage return
      } else {
        currentLine += char;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    const nonEmptyLines = lines.map(l => l.trim()).filter(Boolean);
    if (nonEmptyLines.length < 2) return [];

    // Detect delimiter (comma, semicolon, or tab)
    const headerLine = nonEmptyLines[0];
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semiCount = (headerLine.match(/;/g) || []).length;
    const tabCount = (headerLine.match(/\t/g) || []).length;
    const delimiter = semiCount > commaCount && semiCount >= tabCount ? ';' : (tabCount > commaCount ? '\t' : ',');

    const headers = splitCSVLine(headerLine, delimiter);

    // Normalize headers to Device properties
    const headerKeys = headers.map(h => {
      const cleanHeader = h.replace(/^\uFEFF/, '').replace(/["']/g, '').trim().toLowerCase();
      if (cleanHeader === 'name' || cleanHeader.includes('name') || cleanHeader.includes('ชื่อ') || cleanHeader.includes('อุปกรณ์') || cleanHeader.includes('ห้อง')) return 'name';
      if (cleanHeader === 'ip' || cleanHeader.startsWith('ip') || cleanHeader.includes('ip ') || cleanHeader.includes('ip_') || cleanHeader.includes('ไอพี')) return 'ip';
      if (cleanHeader.includes('mac') || cleanHeader.includes('แมค')) return 'macAddress';
      if (cleanHeader === 'type' || cleanHeader.includes('type') || cleanHeader.includes('ประเภท') || cleanHeader.includes('ชนิด')) return 'type';
      if (cleanHeader === 'location' || cleanHeader.includes('loc') || cleanHeader.includes('สถานที่') || cleanHeader.includes('อาคาร') || cleanHeader.includes('ตึก')) return 'location';
      if (cleanHeader === 'floor' || cleanHeader.includes('ชั้น')) return 'floor';
      if (cleanHeader === 'model' || cleanHeader.includes('รุ่น') || cleanHeader.includes('โมเดล') || cleanHeader.includes('ผู้ผลิต') || cleanHeader.includes('ยี่ห้อ') || cleanHeader.includes('แบรนด์')) return 'model';
      if (cleanHeader === 'remarks' || cleanHeader === 'remark' || cleanHeader.includes('หมายเหตุ')) return 'remarks';
      return cleanHeader;
    });

    const results: any[] = [];

    for (let j = 1; j < nonEmptyLines.length; j++) {
      const line = nonEmptyLines[j];
      if (!line) continue;
      const values = splitCSVLine(line, delimiter);
      const item: any = {};
      
      headerKeys.forEach((key, idx) => {
        if (idx < values.length) {
          let val = values[idx].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1).trim();
          }
          val = val.replace(/""/g, '"');
          item[key] = val;
        }
      });

      // Fallback if CSV has no standard header names: col 0 = name, col 1 = ip
      if (!item.name && values.length >= 2) {
        const col0 = values[0]?.replace(/^["']|["']$/g, '').trim();
        const col1 = values[1]?.replace(/^["']|["']$/g, '').trim();
        if (col0 && (/\d+\.\d+\.\d+\.\d+/.test(col1) || values[2])) {
          item.name = col0;
          item.ip = col1;
        }
      }

      if (item.name) {
        results.push(item);
      }
    }

    return results;
  };

  const normalizeImportedType = (text: string): DeviceType => {
    const clean = (text || '').toLowerCase().trim();
    if (clean.includes('server') || clean.includes('เซิร์ฟ') || clean.includes('เซอร์เวย์')) return DeviceType.SERVER;
    if (clean.includes('switch') || clean.includes('สวิต') || clean.includes('สวิท')) return DeviceType.SWITCH;
    if (clean.includes('router') || clean.includes('เราต์') || clean.includes('เราท์')) return DeviceType.ROUTER;
    if (clean.includes('ap') || clean.includes('access') || clean.includes('wifi') || clean.includes('ไวไฟ') || clean.includes('พอยต')) return DeviceType.AP;
    if (clean.includes('printer') || clean.includes('พิมพ์') || clean.includes('ปริ้น')) return DeviceType.PRINTER;
    if (clean.includes('pc') || clean.includes('laptop') || clean.includes('คอม') || clean.includes('โน้ตบุ๊ค') || clean.includes('เครื่อง')) return DeviceType.PC;
    if (clean.includes('camera') || clean.includes('กล้อง') || clean.includes('cctv')) return DeviceType.CAMERA;
    if (clean.includes('eboard') || clean.includes('e-board') || clean.includes('board') || clean.includes('จอ')) return DeviceType.EBOARD;
    return DeviceType.EBOARD;
  };

  const handleImportData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const fileContent = e.target?.result as string;
        let importedDevices: any[] = [];

        if (file.name.toLowerCase().endsWith('.csv')) {
          const parsed = parseCSV(fileContent);
          importedDevices = parsed.map(item => ({
            name: String(item.name || '').trim(),
            ip: String(item.ip || '').trim(),
            macAddress: String(item.macAddress || '').trim() || undefined,
            type: normalizeImportedType(item.type),
            location: String(item.location || 'อาคารหลัก').trim(),
            floor: item.floor !== undefined && String(item.floor).trim() !== '' ? String(item.floor).trim() : undefined,
            model: String(item.model || '').trim() || undefined,
            remarks: item.remarks ? String(item.remarks).trim() : undefined,
            isMonitored: true,
            isMaintenance: false,
            status: DeviceStatus.ONLINE,
            latency: 0,
            packetLoss: 0,
            lastSeen: new Date().toISOString()
          }));
        } else {
          // Support both direct array JSON [...] and full backup JSON { devices: [...] }
          const jsonParsed = JSON.parse(fileContent.replace(/^\uFEFF/, ''));
          if (Array.isArray(jsonParsed)) {
            importedDevices = jsonParsed;
          } else if (jsonParsed && Array.isArray(jsonParsed.devices)) {
            importedDevices = jsonParsed.devices;
          } else {
            throw new Error('Invalid JSON format');
          }
        }

        const validDevices: Partial<Device>[] = importedDevices
          .filter(d => d && d.name && (d.ip || d.macAddress))
          .map(device => ({
            id: device.id ? String(device.id).trim() : undefined,
            name: String(device.name).trim(),
            ip: String(device.ip || '').trim(),
            macAddress: device.macAddress ? String(device.macAddress).trim() : undefined,
            type: device.type || DeviceType.EBOARD,
            location: String(device.location || 'อาคารหลัก').trim(),
            floor: device.floor !== undefined && device.floor !== null && String(device.floor).trim() !== '' ? String(device.floor).trim() : undefined,
            model: device.model ? String(device.model).trim() : undefined,
            remarks: device.remarks ? String(device.remarks).trim() : undefined,
            isMonitored: device.isMonitored !== undefined ? Boolean(device.isMonitored) : true,
            isMaintenance: device.isMaintenance !== undefined ? Boolean(device.isMaintenance) : false,
            status: device.status || DeviceStatus.ONLINE,
            latency: device.latency || 0,
            packetLoss: device.packetLoss || 0,
            lastSeen: device.lastSeen || new Date().toISOString(),
            lastStatusChange: device.lastStatusChange || new Date().toISOString()
          }));

        if (validDevices.length > 0) {
          setPendingImportData({
            fileName: file.name,
            devices: validDevices
          });
        } else {
          toast.error('ไม่พบรายการอุปกรณ์ที่ถูกต้องในไฟล์ (ต้องมีชื่อและ IP/MAC)');
        }
      } catch (err) {
        toast.error('ล้มเหลวในการอ่านไฟล์ กรุณาตรวจสอบรูปแบบไฟล์ CSV หรือ JSON อีกครั้ง');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  const executeConfirmImport = async (mode: 'replace' | 'merge') => {
    if (!pendingImportData) return;
    const itemsToImport = pendingImportData.devices;
    setPendingImportData(null);

    if (onImportBulk) {
      await onImportBulk({ devices: itemsToImport, mode });
    } else {
      itemsToImport.forEach(d => onAdd(d as Device));
      toast.success(`นำเข้าอุปกรณ์สำเร็จทั้งหมด ${itemsToImport.length} เครื่อง!`);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full space-y-3 sm:space-y-5 pb-12">
      
      {/* Header & Action Toolbar Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-4">
        {/* Top Title Row + Mobile View Mode Switcher */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20 shrink-0">
              <Server className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-base sm:text-2xl font-black text-slate-800 dark:text-white tracking-tight leading-tight truncate">
                  จัดการอุปกรณ์เครือข่าย
                </h1>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[11px] sm:text-xs font-mono font-bold border border-blue-200/60 dark:border-blue-800/60 shrink-0">
                  {devices.length} เครื่อง
                </span>
              </div>
              <p className="hidden sm:block text-slate-500 dark:text-slate-400 mt-0.5 text-xs font-medium truncate">
                บริหารจัดการรายการอุปกรณ์, กำหนด IP/สถานที่, บันทึกหมายเหตุ และนำเข้า-ส่งออกข้อมูล
              </p>
            </div>
          </div>

          {/* Mobile View Switcher (Cards / Table) placed neatly on the top right */}
          <div className="flex sm:hidden bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
              title="มุมมองการ์ด"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>การ์ด</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1 px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
              }`}
              title="มุมมองตาราง"
            >
              <List className="w-3.5 h-3.5" />
              <span>ตาราง</span>
            </button>
          </div>
        </div>

        {/* Action Toolbar - Collapsible File Tools on Mobile, Symmetrical & Clean */}
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-1.5 sm:gap-2 w-full lg:w-auto">
          <input type="file" ref={fileInputRef} onChange={handleImportData} className="hidden" accept=".json,.csv" />

          {/* Primary Action Row (3 Equal Buttons on Mobile: [ ไฟล์/ส่งออก ] [ สแกน IP ] [ + เพิ่มอุปกรณ์ ]) */}
          <div className={`grid ${onOpenSubnetScanner ? 'grid-cols-3' : 'grid-cols-2'} sm:flex items-center gap-1.5 sm:gap-2 sm:order-2`}>
            {/* Mobile Toggle for Import/Export/Report Bar */}
            <button
              type="button"
              onClick={() => setShowFileTools(prev => !prev)}
              className={`sm:hidden px-2.5 py-2 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                showFileTools
                  ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
              title="เปิด/ปิด เมนูนำเข้าและส่งออกไฟล์"
            >
              <FileDown className="w-3.5 h-3.5 shrink-0 text-blue-500" />
              <span className="truncate">ไฟล์/รายงาน</span>
              {showFileTools ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
            </button>

            {onOpenSubnetScanner && (
              <MotionButton 
                onClick={onOpenSubnetScanner}
                className="bg-purple-600 hover:bg-purple-700 text-white px-2.5 sm:px-3 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm shadow-purple-600/20 font-bold text-xs cursor-pointer truncate"
                title="สแกนหา IP อัตโนมัติในวง Subnet"
              >
                <Radar className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">สแกน IP</span>
              </MotionButton>
            )}

            <MotionButton 
              onClick={openAdd}
              className="bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 text-white px-2.5 sm:px-3.5 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-sm shadow-blue-500/25 font-bold text-xs cursor-pointer truncate"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">เพิ่มอุปกรณ์</span>
            </MotionButton>
          </div>

          {/* Unified Data Import / Export / Report Bar (Collapsible on Mobile, Always Visible on sm+) */}
          <div className={`${showFileTools ? 'grid' : 'hidden'} sm:flex grid-cols-6 items-center bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs sm:order-1 divide-x divide-slate-200/70 dark:divide-slate-700/70 animate-in fade-in duration-150`}>
            <MotionButton 
              onClick={handleDownloadTemplate}
              className="px-1.5 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-l-lg flex items-center justify-center gap-1 transition-colors"
              title="ดาวน์โหลดไฟล์ตัวอย่าง CSV Template"
            >
              <FileDown className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Template</span>
              <span className="md:hidden">ฟอร์ม</span>
            </MotionButton>
            <MotionButton 
              onClick={handleExportCSV}
              className="px-1.5 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center justify-center gap-1 transition-colors"
              title="ส่งออกไฟล์ CSV (เปิดใน Excel ได้)"
            >
              <FileDown className="w-3.5 h-3.5 text-emerald-500 shrink-0 hidden sm:inline" />
              <span>CSV</span>
            </MotionButton>
            <MotionButton 
              onClick={handleExportData}
              className="px-1.5 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center justify-center gap-1 transition-colors"
              title="สำรองข้อมูล JSON Backup"
            >
              <FileDown className="w-3.5 h-3.5 text-amber-500 shrink-0 hidden sm:inline" />
              <span>JSON</span>
            </MotionButton>
            <MotionButton 
              onClick={handleImportClick}
              className="px-1.5 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center gap-1 transition-colors"
              title="นำเข้าข้อมูลจากไฟล์ CSV หรือ JSON"
            >
              <FileUp className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
              <span>Import</span>
            </MotionButton>
            {onExportPdf && (
              <MotionButton 
                onClick={onExportPdf}
                className="px-1.5 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center justify-center gap-1 transition-colors"
                title="ดาวน์โหลดรายงานสรุปผู้บริหารแบบ PDF"
              >
                <FileText className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                <span>PDF</span>
              </MotionButton>
            )}
            {onExportExcel && (
              <MotionButton 
                onClick={onExportExcel}
                className="px-1.5 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-r-lg flex items-center justify-center gap-1 transition-colors"
                title="ดาวน์โหลดรายงานสรุปผู้บริหารแบบ Excel"
              >
                <FileText className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
                <span>Excel</span>
              </MotionButton>
            )}
          </div>
        </div>
      </div>

      {/* Contextual Bulk Action Floating Bar when devices are selected */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-blue-50/90 dark:bg-blue-950/50 p-2 sm:p-3 rounded-2xl border border-blue-200 dark:border-blue-800/80 shadow-xs animate-in fade-in duration-150">
          <div className="px-1.5 py-0.5 text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <CheckSquare className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>เลือกแล้ว <b className="text-blue-600 dark:text-blue-400">{selectedIds.length}</b> เครื่อง</span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
              (ออนไลน์ {selectedStats.online + selectedStats.warning} • ออฟไลน์ {selectedStats.offline})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <MotionButton 
              onClick={handleOpenBulkRemarks}
              className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 sm:px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all shadow-2xs font-bold text-xs cursor-pointer"
              title="ใส่หมายเหตุให้อุปกรณ์ที่เลือกทั้งหมด เช่น ปิดจอ E-Board"
            >
              <FileEdit className="w-3.5 h-3.5" />
              <span>ใส่หมายเหตุ</span>
            </MotionButton>
            <MotionButton 
              onClick={handleDirectSendLineSelection}
              disabled={isSendingLineDirect || lineCooldownSec > 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 sm:px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all shadow-2xs font-bold text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={lineCooldownSec > 0 ? `กรุณารอ ${lineCooldownSec} วินาทีเพื่อป้องกันการส่งซ้ำ` : "ส่งสรุปสถานะอุปกรณ์ที่เลือกและหมายเหตุไปที่ LINE ทันที"}
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSendingLineDirect ? 'กำลังส่ง...' : lineCooldownSec > 0 ? `รอ ${lineCooldownSec}s` : 'แจ้ง LINE'}</span>
            </MotionButton>
            <MotionButton 
              onClick={handleDirectSendWebhookSelection}
              disabled={isSendingWebhookDirect || webhookCooldownSec > 0}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 sm:px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all shadow-2xs font-bold text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={webhookCooldownSec > 0 ? `กรุณารอ ${webhookCooldownSec} วินาทีเพื่อป้องกันการส่งซ้ำ` : "ส่งสรุปสถานะอุปกรณ์ที่เลือกและหมายเหตุไปที่ Microsoft Teams / Webhook ทันที"}
            >
              <Webhook className="w-3.5 h-3.5" />
              <span>{isSendingWebhookDirect ? 'กำลังส่ง...' : webhookCooldownSec > 0 ? `รอ ${webhookCooldownSec}s` : 'แจ้ง Webhook'}</span>
            </MotionButton>
            <MotionButton 
              onClick={handleBulkDelete}
              className="bg-red-500 hover:bg-red-600 text-white px-2.5 sm:px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all shadow-2xs font-bold text-xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ลบ ({selectedIds.length})</span>
            </MotionButton>
            <button 
              onClick={clearSelection}
              className="px-2 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white rounded-xl hover:bg-blue-100/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Filters, Sort & Selection Panel - Collapsible & Ultra-Clean on Mobile */}
      <div className="bg-white dark:bg-slate-800/95 p-2.5 sm:p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-2">
        {/* Row 1: Search Input + Collapsible Filter Toggle + 4-Column Status Filter Tabs */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
          {/* Search Input + Filter Drawer Toggle */}
          <div className="flex items-center gap-1.5 flex-1">
            <div className="relative flex-1 group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" 
                placeholder="ค้นหาชื่ออุปกรณ์, IP, อาคาร, ชั้น, ผู้ผลิต, MAC หรือหมายเหตุ..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 sm:h-10 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white pl-9 sm:pl-10 pr-7 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-xs sm:text-sm font-medium shadow-2xs"
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

            {/* Collapsible Filter, Sort & Quick Select Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFilters(prev => !prev)}
              className={`h-9 sm:h-10 px-2.5 sm:px-3.5 rounded-xl border text-xs font-extrabold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                showFilters || activeFilterCount > 0
                  ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'bg-slate-50 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="เปิด/ปิด ตัวกรอง, เรียงลำดับ และเลือกด่วน"
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

          {/* Status Segmented Bar (4 Equal Columns on Mobile & Desktop - 1 Single Row!) */}
          <div className="grid grid-cols-4 gap-1 p-0.5 sm:p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/80 shrink-0">
            {[
              { id: 'All', label: 'ทั้งหมด', dot: '', count: statusCounts.all, activeText: 'text-blue-600 dark:text-white' },
              { id: 'Online', label: 'ออนไลน์', dot: 'bg-emerald-500', count: statusCounts.online, activeText: 'text-emerald-600 dark:text-emerald-400' },
              { id: 'Offline', label: 'ออฟไลน์', dot: 'bg-red-500', count: statusCounts.offline, activeText: 'text-red-600 dark:text-red-400' },
              { id: 'Warning', label: 'Ping สูง', dot: 'bg-amber-500', count: statusCounts.warning, activeText: 'text-amber-600 dark:text-amber-400' }
            ].map(statusItem => {
              const isActive = filterStatus === statusItem.id;
              return (
                <button
                  key={statusItem.id}
                  type="button"
                  onClick={() => setFilterStatus(statusItem.id)}
                  className={`px-1 sm:px-2.5 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    isActive
                      ? `bg-white dark:bg-slate-800 ${statusItem.activeText} shadow-xs`
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                  }`}
                >
                  {statusItem.dot && <span className={`w-1.5 h-1.5 rounded-full ${statusItem.dot} shrink-0`}></span>}
                  <span className="truncate">{statusItem.label}</span>
                  <span className="text-[10px] opacity-80 font-mono shrink-0">({statusItem.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Filter Pills when Drawer is Collapsed */}
        {!showFilters && activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/60">
            {filterLocation !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold">
                🏢 {filterLocation}
                <button type="button" onClick={() => setFilterLocation('All')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterFloor !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold">
                📶 {formatFloorLabel(filterFloor)}
                <button type="button" onClick={() => setFilterFloor('All')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterType !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] font-bold">
                🏷️ {filterType}
                <button type="button" onClick={() => setFilterType('All')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            {filterTag !== 'All' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-[11px] font-bold">
                #{filterTag}
                <button type="button" onClick={() => setFilterTag('All')} className="hover:text-red-500"><X className="w-3 h-3" /></button>
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setFilterLocation('All');
                setFilterFloor('All');
                setFilterType('All');
                setFilterTag('All');
              }}
              className="text-[11px] font-extrabold text-red-600 dark:text-red-400 hover:underline ml-auto"
            >
              ล้างทั้งหมด
            </button>
          </div>
        )}

        {/* Collapsible Drawer: Filters, Sort & Quick Selection */}
        {showFilters && (
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 animate-in fade-in duration-150">
            {/* Sub-row A: Compact Filter & Sort Grid */}
            <div className={`grid grid-cols-3 ${allTags.length > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-1.5 sm:gap-2.5`}>
              {/* 1. Location / Building Filter */}
              <div className="flex flex-col">
                <label className="hidden sm:block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-0.5">
                  อาคาร / สถานที่
                </label>
                <div className="relative">
                  <select
                    value={filterLocation}
                    onChange={(e) => setFilterLocation(e.target.value)}
                    className={`w-full h-8 sm:h-9 appearance-none pl-2 sm:pl-2.5 pr-5 sm:pr-7 rounded-xl border text-[11px] sm:text-xs font-bold cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors ${
                      filterLocation !== 'All'
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <option value="All">📍 ทุกอาคาร ({devices.length})</option>
                    {allLocations.map(loc => (
                      <option key={loc} value={loc}>🏢 {loc}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 absolute right-1.5 sm:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                    className={`w-full h-8 sm:h-9 appearance-none pl-2 sm:pl-2.5 pr-5 sm:pr-7 rounded-xl border text-[11px] sm:text-xs font-bold cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors ${
                      filterFloor !== 'All'
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <option value="All">📶 ทุกชั้น</option>
                    {allFloors.map(fl => (
                      <option key={fl} value={fl}>{formatFloorLabel(fl)}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 absolute right-1.5 sm:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* 3. Device Type Filter */}
              <div className="flex flex-col">
                <label className="hidden sm:block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-0.5">
                  ประเภทอุปกรณ์
                </label>
                <div className="relative">
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className={`w-full h-8 sm:h-9 appearance-none pl-2 sm:pl-2.5 pr-5 sm:pr-7 rounded-xl border text-[11px] sm:text-xs font-bold cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors ${
                      filterType !== 'All'
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <option value="All">🏷️ ทุกประเภท ({typeCounts['All'] || devices.length})</option>
                    {Object.values(DeviceType).map(type => (
                      <option key={type} value={type}>
                        {type} ({typeCounts[type] || 0})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 absolute right-1.5 sm:right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Optional Tag Filter if tags exist */}
              {allTags.length > 0 && (
                <div className="flex flex-col col-span-3 lg:col-span-1">
                  <label className="hidden sm:block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 px-0.5">
                    แท็ก (Tags)
                  </label>
                  <div className="relative">
                    <select
                      value={filterTag}
                      onChange={(e) => setFilterTag(e.target.value)}
                      className={`w-full h-8 sm:h-9 appearance-none pl-2.5 pr-7 rounded-xl border text-[11px] sm:text-xs font-bold cursor-pointer truncate focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-colors ${
                        filterTag !== 'All'
                          ? 'border-purple-500 bg-purple-50/60 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <option value="All">🔖 ทุกแท็ก</option>
                      {allTags.map(tag => (
                        <option key={tag} value={tag}>#{tag}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              )}

              {/* 4. Sort By & Direction Control */}
              <div className="flex flex-col col-span-3 lg:col-span-1">
                <div className="hidden sm:flex items-center justify-between mb-1 px-0.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    เรียงลำดับข้อมูล
                  </label>
                  {(searchTerm || filterStatus !== 'All' || activeFilterCount > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setFilterStatus('All');
                        setFilterLocation('All');
                        setFilterFloor('All');
                        setFilterType('All');
                        setFilterTag('All');
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
                      onChange={(e) => setSortConfig(prev => ({ ...prev, key: e.target.value as keyof Device }))}
                      className="w-full h-8 sm:h-9 appearance-none pl-7 pr-6 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-[11px] sm:text-xs font-bold cursor-pointer truncate"
                      title="เลือกเกณฑ์การเรียงลำดับ"
                    >
                      <option value="name">เรียง: ชื่อ / เลขห้อง</option>
                      <option value="ip">เรียง: หมายเลข IP</option>
                      <option value="location">เรียง: อาคาร / สถานที่</option>
                      <option value="floor">เรียง: ระดับชั้น</option>
                      <option value="status">เรียง: สถานะออนไลน์</option>
                      <option value="latency">เรียง: ความเร็ว Ping</option>
                      <option value="type">เรียง: ประเภทอุปกรณ์</option>
                    </select>
                    <ArrowUpDown className="w-3.5 h-3.5 text-blue-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                    className="h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-700 text-[11px] sm:text-xs font-extrabold rounded-xl text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors shrink-0 flex items-center justify-center cursor-pointer"
                    title={sortConfig.direction === 'asc' ? 'กำลังเรียง: น้อย ➔ มาก (คลิกเพื่อสลับ)' : 'กำลังเรียง: มาก ➔ น้อย (คลิกเพื่อสลับ)'}
                  >
                    <span>{sortConfig.direction === 'asc' ? '↑ น้อย➔มาก' : '↓ มาก➔น้อย'}</span>
                  </button>
                  {(searchTerm || filterStatus !== 'All' || activeFilterCount > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setFilterStatus('All');
                        setFilterLocation('All');
                        setFilterFloor('All');
                        setFilterType('All');
                        setFilterTag('All');
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

            {/* Sub-row B: Compact Quick Selection Bar & Desktop View Mode Switcher */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="grid grid-cols-3 sm:flex items-center gap-1.5 w-full sm:w-auto">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mr-1 hidden sm:inline">
                  เลือกด่วน:
                </span>
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 bg-slate-50 dark:bg-slate-900/80 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 cursor-pointer truncate"
                >
                  <CheckSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span className="truncate">ทั้งหมด ({filteredDevices.length})</span>
                </button>
                <button
                  type="button"
                  onClick={selectOnlyOffline}
                  className="px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 bg-slate-50 dark:bg-slate-900/80 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 cursor-pointer truncate"
                  title="เลือกเฉพาะอุปกรณ์ที่ออฟไลน์"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                  <span className="truncate">Offline ({statusCounts.offline})</span>
                </button>
                <button
                  type="button"
                  onClick={selectOnlyOnline}
                  className="px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1 bg-slate-50 dark:bg-slate-900/80 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 cursor-pointer truncate"
                  title="เลือกเฉพาะอุปกรณ์ที่ออนไลน์"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                  <span className="truncate">Online ({statusCounts.online})</span>
                </button>
                {selectedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="col-span-3 sm:col-span-1 px-2.5 py-1 text-[11px] sm:text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer text-center"
                  >
                    ล้างที่เลือก ({selectedIds.length})
                  </button>
                )}
              </div>

              {/* Filtered Count & Desktop View Mode Switcher */}
              <div className="hidden sm:flex items-center gap-2.5 ml-auto">
                <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">
                  แสดง <b className="text-slate-700 dark:text-slate-200">{filteredDevices.length}</b> จาก {devices.length}
                </span>
                <div className="flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      viewMode === 'cards'
                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    }`}
                    title="มุมมองการ์ด (เหมาะกับมือถือ)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span>การ์ด</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      viewMode === 'table'
                        ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                    }`}
                    title="มุมมองตาราง"
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>ตาราง</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content: Card View (Default / Mobile) OR Table View */}
      {viewMode === 'cards' ? (
        /* CARD VIEW: Clean, mobile-first, no horizontal scroll */
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {filteredDevices.map((device) => {
              const Icon = getDeviceIcon(device.type);
              const isSelected = selectedIds.includes(device.id);
              const isOnline = device.status === DeviceStatus.ONLINE;
              const isOffline = device.status === DeviceStatus.OFFLINE;
              const vendorInfo = resolveDeviceVendor(device);
              const formattedMac = normalizeMacAddress(device.macAddress);

              const handleCopyMac = (e: React.MouseEvent) => {
                e.stopPropagation();
                if (formattedMac) {
                  navigator.clipboard.writeText(formattedMac);
                  toast.success(`คัดลอก MAC: ${formattedMac} แล้ว`);
                }
              };

              return (
                <div 
                  key={device.id} 
                  className={`
                    bg-white dark:bg-slate-800 rounded-2xl border transition-all duration-200 p-3.5 sm:p-4 relative shadow-xs
                    ${isSelected 
                      ? 'border-blue-500 dark:border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 dark:bg-blue-900/10' 
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}
                  `}
                >
                  {/* Top Row: Select Checkbox, Icon, Name, Status Badge */}
                  <div className="flex items-start justify-between gap-2.5 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer shrink-0"
                        checked={isSelected}
                        onChange={() => toggleSelect(device.id)}
                      />
                      <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-800 dark:text-white text-sm truncate flex items-center gap-1.5">
                          {device.name}
                          {device.isMaintenance && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase shrink-0">
                              Maint
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {device.ip}
                          {device.monitorPort && <span className="text-blue-500 font-semibold">:{device.monitorPort}</span>}
                        </p>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="shrink-0">
                      {device.isMonitored ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${
                          isOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                          isOffline ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' :
                          'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            isOnline ? 'bg-emerald-500 animate-pulse' :
                            isOffline ? 'bg-red-500 animate-pulse' :
                            'bg-amber-500'
                          }`}></span>
                          {device.status}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                          Paused
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Hardware & Vendor Information Bar (Only ผู้ผลิต & MAC, NO รุ่น) */}
                  <div className="flex flex-wrap items-center gap-1.5 my-2">
                    {/* Manufacturer / ผู้ผลิต */}
                    <span 
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs"
                      title={`ผู้ผลิต: ${vendorInfo.vendor}`}
                    >
                      <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span className="font-semibold text-slate-500 dark:text-slate-400">ผู้ผลิต:</span>
                      <span className="truncate max-w-[150px]">{vendorInfo.vendor}</span>
                    </span>

                    {/* MAC Address */}
                    {formattedMac ? (
                      <button
                        type="button"
                        onClick={handleCopyMac}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-950/40 border border-cyan-200 dark:border-cyan-800/60 text-cyan-800 dark:text-cyan-300 font-mono text-xs font-bold hover:bg-cyan-100 dark:hover:bg-cyan-900/60 transition-colors cursor-pointer"
                        title="คลิกเพื่อคัดลอก MAC Address"
                      >
                        <Hash className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                        <span>MAC: {formattedMac}</span>
                        <Copy className="w-3 h-3 text-cyan-600/70 shrink-0 ml-0.5" />
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-slate-400 dark:text-slate-500 font-mono text-xs">
                        <Hash className="w-3.5 h-3.5 text-slate-400" />
                        <span>MAC: -</span>
                      </span>
                    )}
                  </div>

                  {/* Mid Row: Location & Latency */}
                  <div className="grid grid-cols-2 gap-2 my-2 py-2 px-2.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">สถานที่ / อาคาร</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200 truncate block" title={formatLocation(device.location, device.floor)}>
                        {formatLocation(device.location, device.floor)}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase">
                        <span>LATENCY</span>
                        <span className="font-mono text-slate-700 dark:text-slate-200">{device.latency}ms</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            device.latency < 50 ? 'bg-emerald-500' : device.latency < 100 ? 'bg-amber-500' : 'bg-red-500'
                          }`} 
                          style={{ width: `${Math.min(100, (device.latency / 200) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>

                  {/* Remarks tag if present */}
                  {device.remarks && (
                    <div 
                      onClick={() => handleOpenSingleRemark(device)}
                      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 mb-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 font-medium cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors"
                      title="คลิกเพื่อแก้ไขหมายเหตุ"
                    >
                      <FileEdit className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="font-bold shrink-0">หมายเหตุ:</span>
                      <span className="truncate">{device.remarks}</span>
                    </div>
                  )}

                  {/* Action Buttons Row */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700/60 text-xs">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700/60 text-slate-500 dark:text-slate-400 text-[10px] font-bold">
                      {device.type}
                    </span>

                    <div className="flex items-center gap-1">
                      <MotionButton 
                        onClick={() => onUpdate({...device, isMaintenance: !device.isMaintenance})}
                        className={`p-1.5 rounded-lg transition-colors ${
                           device.isMaintenance 
                           ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' 
                           : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                        }`}
                        title={device.isMaintenance ? "End Maintenance" : "Start Maintenance"}
                      >
                         <Wrench className="w-3.5 h-3.5" />
                      </MotionButton>
                      <MotionButton 
                        onClick={() => onUpdate({...device, isMonitored: !device.isMonitored})}
                        className={`p-1.5 rounded-lg transition-colors ${
                           device.isMonitored 
                           ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' 
                           : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                        }`}
                        title={device.isMonitored ? "Pause Monitoring" : "Resume Monitoring"}
                      >
                         {device.isMonitored ? <MonitorPlay className="w-3.5 h-3.5" /> : <MonitorStop className="w-3.5 h-3.5" />}
                      </MotionButton>
                      <MotionButton 
                        onClick={() => handleOpenSingleRemark(device)}
                        className="p-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 rounded-lg transition-colors"
                        title="แก้ไขหมายเหตุ"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                      </MotionButton>
                      <MotionButton 
                         onClick={() => openEdit(device)}
                         className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 rounded-lg transition-colors"
                         title="แก้ไขอุปกรณ์"
                      >
                         <Edit2 className="w-3.5 h-3.5" />
                      </MotionButton>
                      <MotionButton 
                         onClick={() => handleDelete(device.id)}
                         className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 rounded-lg transition-colors"
                         title="ลบอุปกรณ์"
                      >
                         <Trash2 className="w-3.5 h-3.5" />
                      </MotionButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {filteredDevices.length === 0 && (
            <div className="p-8 sm:p-12 text-center bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-3">
                 <Search className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-slate-900 dark:text-white font-bold text-base sm:text-lg">ไม่พบอุปกรณ์ที่ค้นหา</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-1 max-w-xs">
                 ลองปรับคำค้นหาหรือเพิ่มอุปกรณ์ใหม่เข้าสู่ระบบ
              </p>
            </div>
          )}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-900/30 border-b border-slate-200 dark:border-slate-700">
                  <th className="py-2.5 px-4 w-[50px]">
                    <input 
                      type="checkbox" 
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                      checked={filteredDevices.length > 0 && selectedIds.length === filteredDevices.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th 
                    className="py-2.5 px-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[20%] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Identity
                      {sortConfig?.key === 'name' && (
                        <ArrowUpDown className={`w-3 h-3 ${sortConfig.direction === 'desc' ? 'rotate-180' : ''} transition-transform`} />
                      )}
                    </div>
                  </th>
                  <th 
                    className="py-2.5 px-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[20%] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    onClick={() => handleSort('location')}
                  >
                    <div className="flex items-center gap-1">
                      Location
                      {sortConfig?.key === 'location' && (
                        <ArrowUpDown className={`w-3 h-3 ${sortConfig.direction === 'desc' ? 'rotate-180' : ''} transition-transform`} />
                      )}
                    </div>
                  </th>
                  <th 
                    className="py-2.5 px-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[15%] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    onClick={() => handleSort('type')}
                  >
                    <div className="flex items-center gap-1">
                      Type
                      {sortConfig?.key === 'type' && (
                        <ArrowUpDown className={`w-3 h-3 ${sortConfig.direction === 'desc' ? 'rotate-180' : ''} transition-transform`} />
                      )}
                    </div>
                  </th>
                  <th 
                    className="py-2.5 px-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[15%] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors select-none"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-1">
                      Status
                      {sortConfig?.key === 'status' && (
                        <ArrowUpDown className={`w-3 h-3 ${sortConfig.direction === 'desc' ? 'rotate-180' : ''} transition-transform`} />
                      )}
                    </div>
                  </th>
                  <th className="py-2.5 px-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[15%]">State</th>
                  <th className="py-2.5 px-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {filteredDevices.map((device) => {
                  const Icon = getDeviceIcon(device.type);
                  const isSelected = selectedIds.includes(device.id);
                  const vendorInfo = resolveDeviceVendor(device);
                  const formattedMac = normalizeMacAddress(device.macAddress);

                  const handleCopyMac = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    if (formattedMac) {
                      navigator.clipboard.writeText(formattedMac);
                      toast.success(`คัดลอก MAC: ${formattedMac} แล้ว`);
                    }
                  };

                  return (
                    <tr 
                      key={device.id} 
                      className={`group hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors duration-200 ${isSelected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                    >
                      <td className="py-2.5 px-4">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelect(device.id)}
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-3">
                           <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20 transition-colors shrink-0">
                              <Icon className="w-4 h-4" />
                           </div>
                           <div>
                              <div className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
                                {device.name}
                                {device.isMaintenance && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-tighter flex items-center gap-1">
                                    <Wrench className="w-2.5 h-2.5" />
                                    Maint
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono mt-0.5 flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{device.ip}</span>
                                {device.monitorPort && (
                                  <span className="text-blue-500 dark:text-blue-400 font-semibold">:{device.monitorPort}</span>
                                )}
                                {formattedMac && (
                                  <button
                                    type="button"
                                    onClick={handleCopyMac}
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/60 font-mono text-[10px] font-bold border border-cyan-200 dark:border-cyan-800/60 cursor-pointer"
                                    title="คัดลอก MAC Address"
                                  >
                                    <Hash className="w-2.5 h-2.5" />
                                    <span>{formattedMac}</span>
                                    <Copy className="w-2.5 h-2.5 opacity-70" />
                                  </button>
                                )}
                              </div>
                              {device.remarks && (
                                <div 
                                  onClick={() => handleOpenSingleRemark(device)}
                                  className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 font-medium cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors"
                                  title="คลิกเพื่อแก้ไขหมายเหตุ (Click to edit remarks)"
                                >
                                  <FileEdit className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                                  <span className="font-bold">หมายเหตุ:</span>
                                  <span className="truncate max-w-[200px]">{device.remarks}</span>
                                </div>
                              )}
                           </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                         <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-300" title={formatLocation(device.location, device.floor)}>
                              {formatLocation(device.location, device.floor)}
                            </span>
                            <div className="flex flex-wrap items-center gap-1 mt-0.5">
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold border border-indigo-200/70 dark:border-indigo-800/60">
                                <Building2 className="w-3 h-3 text-indigo-500" />
                                <span>ผู้ผลิต: {vendorInfo.vendor}</span>
                              </span>
                            </div>
                         </div>
                      </td>
                      <td className="py-2.5 px-4">
                         <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            {device.type}
                         </span>
                      </td>
                      <td className="py-2.5 px-4">
                          {device.isMonitored ? (
                            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                              device.status === DeviceStatus.ONLINE ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' :
                              device.status === DeviceStatus.OFFLINE ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' :
                              'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                                 device.status === DeviceStatus.ONLINE ? 'bg-emerald-500' :
                                 device.status === DeviceStatus.OFFLINE ? 'bg-red-500' :
                                 'bg-amber-500'
                              }`}></span>
                              {device.status}
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                               <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                               Paused
                            </div>
                          )}
                      </td>
                      <td className="py-2.5 px-4">
                          <div className="flex flex-col gap-0.5">
                             <div className="flex items-center justify-between text-[10px]">
                                <span className="text-slate-500">Latency</span>
                                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{device.latency}ms</span>
                             </div>
                             <div className="w-20 h-1 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    device.latency < 50 ? 'bg-emerald-500' : device.latency < 100 ? 'bg-amber-500' : 'bg-red-500'
                                  }`} 
                                  style={{ width: `${Math.min(100, (device.latency / 200) * 100)}%` }}
                                ></div>
                             </div>
                          </div>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                         <div className="flex items-center justify-end gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <MotionButton 
                              onClick={() => onUpdate({...device, isMaintenance: !device.isMaintenance})}
                              className={`p-1.5 rounded-lg transition-colors ${
                                 device.isMaintenance 
                                 ? 'bg-amber-100 text-amber-600 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-400' 
                                 : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400'
                              }`}
                              title={device.isMaintenance ? "End Maintenance" : "Start Maintenance"}
                            >
                               <Wrench className="w-3.5 h-3.5" />
                            </MotionButton>
                            <MotionButton 
                              onClick={() => onUpdate({...device, isMonitored: !device.isMonitored})}
                              className={`p-1.5 rounded-lg transition-colors ${
                                 device.isMonitored 
                                 ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20' 
                                 : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-400'
                              }`}
                              title={device.isMonitored ? "Pause Monitoring" : "Resume Monitoring"}
                            >
                               {device.isMonitored ? <MonitorPlay className="w-3.5 h-3.5" /> : <MonitorStop className="w-3.5 h-3.5" />}
                            </MotionButton>
                            <MotionButton 
                              onClick={() => handleOpenSingleRemark(device)}
                              className="p-1.5 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20 rounded-lg transition-colors"
                              title="แก้ไขหมายเหตุ (Edit Remarks)"
                            >
                              <FileEdit className="w-3.5 h-3.5" />
                            </MotionButton>
                            <MotionButton 
                               onClick={() => openEdit(device)}
                               className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400 dark:hover:bg-blue-500/20 rounded-lg transition-colors"
                               title="Edit Device"
                            >
                               <Edit2 className="w-3.5 h-3.5" />
                            </MotionButton>
                            <MotionButton 
                               onClick={() => handleDelete(device.id)}
                               className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20 rounded-lg transition-colors"
                               title="Delete Device"
                            >
                               <Trash2 className="w-3.5 h-3.5" />
                            </MotionButton>
                         </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredDevices.length === 0 && (
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                   <Search className="w-8 h-8 text-slate-400" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-bold text-lg">No devices found</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-xs">
                   Try adjusting your search terms or add a new device to get started.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Modal remains same */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-in fade-in duration-200">
           <DeviceModal 
             isOpen={isModalOpen} 
             onClose={() => setIsModalOpen(false)} 
             initialData={editingDevice}
             devices={devices}
             onSave={(d: Device) => {
                if (editingDevice) {
                  onUpdate({...editingDevice, ...d});
                } else {
                  onAdd(d);
                }
                setIsModalOpen(false);
             }}
           />
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 p-10 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md text-center relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/5 rounded-full blur-3xl"></div>
            
            <div className="w-24 h-24 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/40 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner rotate-3 hover:rotate-0 transition-transform duration-500 relative z-10">
              <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
                <Trash2 className="w-10 h-10 text-red-600 dark:text-red-400" />
              </div>
            </div>
            
            <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 tracking-tight relative z-10">ลบอุปกรณ์นี้?</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-10 text-sm leading-relaxed relative z-10">
              คุณแน่ใจหรือไม่ว่าต้องการลบอุปกรณ์นี้ออกจากระบบ?<br/>
              <span className="text-red-500 font-bold">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
            </p>
            
            <div className="flex gap-4 relative z-10">
              <button 
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold py-4 rounded-2xl transition-all hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                ยกเลิก
              </button>
              <button 
                type="button"
                onClick={confirmDelete}
                className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-red-600/30 transition-all"
              >
                ลบอุปกรณ์
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 p-10 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md text-center relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/5 rounded-full blur-3xl"></div>
            
            <div className="w-24 h-24 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/40 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner rotate-3 hover:rotate-0 transition-transform duration-500 relative z-10">
              <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
                <Trash2 className="w-10 h-10 text-red-600 dark:text-red-400" />
              </div>
            </div>
            
            <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 tracking-tight relative z-10">ลบ {selectedIds.length} อุปกรณ์?</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-10 text-sm leading-relaxed relative z-10">
              คุณแน่ใจหรือไม่ว่าต้องการลบอุปกรณ์ที่เลือกทั้งหมด?<br/>
              <span className="text-red-500 font-bold">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
            </p>
            
            <div className="flex gap-4 relative z-10">
              <button 
                type="button"
                onClick={() => setBulkDeleteConfirm(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold py-4 rounded-2xl transition-all hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                ยกเลิก
              </button>
              <button 
                type="button"
                onClick={confirmBulkDelete}
                className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-red-600/30 transition-all"
              >
                ลบทั้งหมด
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Remark Modal */}
      {isBulkRemarkModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg text-left relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-2xl text-amber-600 dark:text-amber-400">
                  <FileEdit className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">
                    ใส่หมายเหตุ ({selectedIds.length} อุปกรณ์)
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded-md border border-red-200 dark:border-red-800">
                      🔴 ออฟไลน์ {selectedStats.offline} เครื่อง
                    </span>
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      🟢 ออนไลน์ {selectedStats.online + selectedStats.warning} เครื่อง
                    </span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsBulkRemarkModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  ข้อความหมายเหตุ (Remarks)
                </label>
                <input 
                  type="text"
                  value={bulkRemarkText}
                  onChange={(e) => setBulkRemarkText(e.target.value)}
                  placeholder="พิมพ์ข้อความหมายเหตุ เช่น ปิดจอ E-Board, รอซ่อม..."
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  autoFocus
                />
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    ตัวเลือกด่วน (คลิกเพื่อเลือก):
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setBulkRemarkText('')}
                    className="text-red-500 hover:underline text-[11px]"
                  >
                    ล้างข้อความ
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {[
                    'ปิดจอ E-Board',
                    'ปิดจอช่วงพักเที่ยง',
                    'ปิดจอหลังเลิกเรียน/เลิกงาน',
                    'ปิดปรับปรุง/บำรุงรักษา',
                    'รอส่งซ่อมจอภาพ',
                    'ห้องปิดใช้งาน/ดับไฟ'
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBulkRemarkText(preset)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-amber-100 dark:bg-slate-700 dark:hover:bg-amber-900/40 text-slate-700 dark:text-slate-300 hover:text-amber-800 dark:hover:text-amber-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer border border-transparent hover:border-amber-300 dark:hover:border-amber-700"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Clear Remark Option */}
              <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300">
                💡 <strong>เคล็ดลับ:</strong> หากต้องการลบหมายเหตุออกจากอุปกรณ์ที่เลือก ให้เว้นว่างช่องข้อความแล้วกด "บันทึก" หรือกดปุ่ม "ล้างหมายเหตุ"
              </div>

              {/* LINE Notification Toggle Card */}
              <div className="p-3.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-xs shadow-sm">
                    LINE
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <span>ส่งสรุปแจ้งเตือนไปที่ LINE ทันที</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-bold">
                        อัตโนมัติ
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      ส่ง Flex Message สรุปอุปกรณ์และหมายเหตุที่อัปเดตไปยัง LINE กลุ่ม/แอดมิน
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    checked={sendToLineAfterRemark}
                    onChange={(e) => setSendToLineAfterRemark(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
              <button 
                type="button"
                onClick={() => setIsBulkRemarkModalOpen(false)}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all"
              >
                ยกเลิก
              </button>
              <button 
                type="button"
                onClick={() => handleSaveBulkRemarks('')}
                disabled={isSavingBulkRemark}
                className="px-4 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-all border border-red-200 dark:border-red-800/60"
              >
                ล้างหมายเหตุทั้งหมด
              </button>
              <button 
                type="button"
                onClick={() => handleSaveBulkRemarks(bulkRemarkText)}
                disabled={isSavingBulkRemark}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-500/25 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {isSavingBulkRemark ? <span>กำลังบันทึก...</span> : <><Check className="w-4 h-4" /> บันทึก {selectedIds.length} รายการ</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single Device Quick Remark Modal */}
      {singleRemarkDevice && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md text-left relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-2xl text-blue-600 dark:text-blue-400">
                  <FileEdit className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    แก้ไขหมายเหตุอุปกรณ์
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {singleRemarkDevice.name} ({singleRemarkDevice.ip})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSingleRemarkDevice(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  ข้อความหมายเหตุ (Remarks)
                </label>
                <input 
                  type="text"
                  value={singleRemarkText}
                  onChange={(e) => setSingleRemarkText(e.target.value)}
                  placeholder="เช่น ปิดจอ E-Board, รอซ่อมจอ..."
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  autoFocus
                />
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  ตัวเลือกด่วน:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'ปิดจอ E-Board',
                    'ปิดจอช่วงพักเที่ยง',
                    'ปิดจอหลังเลิกเรียน/เลิกงาน',
                    'ปิดปรับปรุง/บำรุงรักษา',
                    'รอส่งซ่อมจอภาพ',
                    'ห้องปิดใช้งาน/ดับไฟ'
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSingleRemarkText(preset)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-blue-100 dark:bg-slate-700 dark:hover:bg-blue-900/40 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Single Device LINE notification toggle */}
              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-black text-[11px] shadow-sm">
                    LINE
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      ส่งแจ้งเตือนไปที่ LINE
                    </p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">
                      ส่งข้อความอัปเดตหมายเหตุนี้เข้า LINE กลุ่ม
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox" 
                    checked={sendSingleToLine}
                    onChange={(e) => setSendSingleToLine(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
              <button 
                type="button"
                onClick={() => setSingleRemarkDevice(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all"
              >
                ยกเลิก
              </button>
              <button 
                type="button"
                onClick={handleSaveSingleRemark}
                disabled={isSavingSingleRemark}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/25 flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {isSavingSingleRemark ? <span>กำลังบันทึก...</span> : <><Check className="w-4 h-4" /> บันทึก</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Confirmation Modal */}
      {pendingImportData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg text-left relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-2xl text-blue-600 dark:text-blue-400">
                  <FileUp className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    ยืนยันการนำเข้าข้อมูลอุปกรณ์
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    ไฟล์: <span className="font-semibold text-slate-700 dark:text-slate-300">{pendingImportData.fileName}</span> • พบทั้งหมด <span className="font-bold text-blue-600 dark:text-blue-400">{pendingImportData.devices.length} รายการ</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingImportData(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 max-h-48 overflow-y-auto space-y-1.5">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  ตัวอย่างรายการที่ตรวจพบในไฟล์ ({pendingImportData.devices.length} เครื่อง):
                </p>
                {pendingImportData.devices.slice(0, 6).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60">
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                      {idx + 1}. {item.name}
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 shrink-0 ml-2">
                      {item.ip || item.macAddress} • {formatLocation(item.location, item.floor)}
                    </span>
                  </div>
                ))}
                {pendingImportData.devices.length > 6 && (
                  <p className="text-center text-xs text-slate-400 pt-1 font-medium">
                    ... และอีก {pendingImportData.devices.length - 6} รายการ ...
                  </p>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/50 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                <p className="font-bold text-blue-800 dark:text-blue-300">เลือกรูปแบบการนำเข้าข้อมูล:</p>
                <p>• <strong>แทนที่ข้อมูลเดิมทั้งหมด:</strong> ล้างข้อมูลเก่าที่ค้างอยู่ ({devices.length} เครื่อง) แล้วใช้ข้อมูลชุดใหม่ทั้ง {pendingImportData.devices.length} รายการแทนทันที</p>
                <p>• <strong>รวมกับข้อมูลเดิม:</strong> เก็บข้อมูลเดิมไว้ และอัปเดต/เพิ่มรายการใหม่เข้าไป</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2.5 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setPendingImportData(null)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-all"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => executeConfirmImport('merge')}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                รวมกับข้อมูลเดิม (Merge)
              </button>
              <button
                type="button"
                onClick={() => executeConfirmImport('replace')}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>แทนที่ข้อมูลเดิมทั้งหมด ({pendingImportData.devices.length} รายการ)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Internal Modal Component
const DeviceModal = ({ isOpen, onClose, initialData, onSave, devices = [] }: any) => {
  if (!isOpen) return null;

  const [formData, setFormData] = useState<Partial<Device>>(
    initialData ? { ...initialData } : {
      name: '',
      ip: '',
      type: DeviceType.OTHER,
      location: '',
      floor: '',
      tags: [],
      model: '',
      isMonitored: true,
      isMaintenance: false,
      monitorPort: undefined,
      status: DeviceStatus.ONLINE,
      latency: 0,
      packetLoss: 0,
      lastSeen: new Date().toISOString(),
      macAddress: ''
    }
  );

  const [tagsInput, setTagsInput] = useState<string>(initialData?.tags?.join(', ') || '');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formData.name?.trim() || "";
    const cleanIP = formData.ip?.trim() || "";
    const cleanMAC = formData.macAddress?.trim() || "";
    const cleanLocation = formData.location?.trim() || "";
    const cleanFloor = normalizeFloorValue(formData.floor);

    if (!cleanName) {
      toast.error("กรุณาระบุชื่อเครื่อง (Please specify device name)");
      return;
    }

    if (!cleanLocation) {
      toast.error("กรุณาระบุ อาคาร / สถานที่ (Please specify location)");
      return;
    }

    // At least IP or MAC must be provided
    if (!cleanIP && !cleanMAC) {
      toast.error("กรุณาระบุ IP Address หรือ MAC Address อย่างน้อยหนึ่งอย่าง (Please specify at least IP or MAC Address)");
      return;
    }

    // 1. Check duplicate Name (case-insensitive)
    const dupName = devices.find((d: Device) => d.id !== initialData?.id && d.name.toLowerCase().trim() === cleanName.toLowerCase());
    if (dupName) {
      toast.error(`ชื่อเครื่อง "${cleanName}" มีในระบบแล้ว! กรุณาตั้งชื่ออื่น (Device name is already taken)`);
      return;
    }

    // 2. Validate IP if provided
    if (cleanIP) {
      const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
      if (!ipRegex.test(cleanIP)) {
        toast.error("รูปแบบ IP Address ไม่ถูกต้อง! (Invalid IP Address format, e.g. 192.168.1.1)");
        return;
      }

      // Check duplicate IP
      const dupIP = devices.find((d: Device) => d.id !== initialData?.id && d.ip && d.ip.trim() === cleanIP);
      if (dupIP) {
        toast.error(`IP "${cleanIP}" ซ้ำกับอุปกรณ์อื่นในระบบ! (${dupIP.name}) (IP is already allocated)`);
        return;
      }
    }

    // 3. Check duplicate MAC (if provided)
    if (cleanMAC) {
      const dupMAC = devices.find((d: Device) => d.id !== initialData?.id && d.macAddress && d.macAddress.trim().toLowerCase() === cleanMAC.toLowerCase());
      if (dupMAC) {
        toast.error(`MAC Address "${cleanMAC}" ซ้ำกับอุปกรณ์อื่นในระบบ! (${dupMAC.name}) (MAC is already used)`);
        return;
      }
    }

    const tagsArray = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
    onSave({ 
      ...formData, 
      name: cleanName, 
      ip: cleanIP, 
      macAddress: cleanMAC || undefined, 
      location: cleanLocation,
      floor: cleanFloor || undefined,
      tags: tagsArray 
    } as Device);
  };
  
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-700 animate-in zoom-in-95 duration-200 relative">
        {/* Decorative background element */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
        
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-transparent relative z-10">
          <div className="flex items-center gap-3">
             <div className="p-2.5 sm:p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl sm:rounded-2xl shadow-md shadow-blue-500/20">
                {initialData ? <Edit2 className="w-5 h-5 text-white" /> : <Plus className="w-5 h-5 text-white" />}
             </div>
             <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white">
                  {initialData ? 'แก้ไขอุปกรณ์ (Edit Device)' : 'เพิ่มอุปกรณ์ใหม่ (Add Device)'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {initialData ? 'แก้ไขข้อมูลการตั้งค่าและการตรวจสอบ' : 'ลงทะเบียนอุปกรณ์ปลายทางสำหรับการเฝ้าระวัง'}
                </p>
             </div>
          </div>
          <button 
             onClick={onClose} 
             className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
          >
             <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 relative z-10 space-y-4">
           <form id="deviceForm" onSubmit={handleSubmit} className="space-y-4">
              
              {/* Network Identity Section */}
              <div className="space-y-3">
                 <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">ข้อมูลเครือข่าย (Network Identity)</h4>
                 </div>
                 
                 <div className="space-y-3">
                    {/* Name */}
                    <div>
                       <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">ชื่อเครื่อง / Device Name <span className="text-red-500">*</span></label>
                       <div className="relative group">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                             <Server className="w-4 h-4" />
                          </div>
                          <input 
                             required
                             autoFocus
                             placeholder="เช่น E-Board ห้อง 301, Switch Core 01"
                             className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-semibold"
                             value={formData.name}
                             onChange={e => setFormData({...formData, name: e.target.value})}
                          />
                       </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* IP Address */}
                        <div>
                           <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                              IP Address {!formData.macAddress && <span className="text-red-500">*</span>}
                           </label>
                           <div className="relative group">
                              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                                 <Globe className="w-4 h-4" />
                              </div>
                              <input 
                                 placeholder={formData.macAddress ? "เว้นได้ (สแกน IP อัตโนมัติ)" : "192.168.x.x"}
                                 className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono text-sm font-semibold"
                                 value={formData.ip}
                                 onChange={e => setFormData({...formData, ip: e.target.value})}
                              />
                           </div>
                        </div>

                        {/* MAC Address */}
                        <div>
                           <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">MAC Address (Optional)</label>
                           <div className="relative group">
                              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                                 <Hash className="w-4 h-4" />
                              </div>
                              <input 
                                 placeholder="e8:fc:af:12:34:56"
                                 pattern="^([0-9a-fA-F]{2}[:-]){5}([0-9a-fA-F]{2})$|^([0-9a-fA-F]{12})$"
                                 className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono text-sm font-semibold"
                                 value={formData.macAddress || ''}
                                 onChange={e => setFormData({...formData, macAddress: e.target.value})}
                              />
                           </div>
                        </div>
                    </div>

                    {/* Device Type */}
                    <div>
                       <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">ประเภทอุปกรณ์ (Device Type)</label>
                       <div className="relative group">
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                             <Tag className="w-4 h-4" />
                          </div>
                          <select 
                             className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-8 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none appearance-none cursor-pointer text-sm font-semibold"
                             value={formData.type}
                             onChange={e => setFormData({...formData, type: e.target.value as DeviceType})}
                          >
                             {Object.values(DeviceType).map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                             <ChevronDown className="w-4 h-4" />
                          </div>
                       </div>
                    </div>

                    {/* Advanced Accordion */}
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-800/20">
                       <button
                          type="button"
                          onClick={() => setShowAdvanced(!showAdvanced)}
                          className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
                       >
                          <span className="flex items-center gap-1.5">
                             <Wrench className="w-3.5 h-3.5 text-blue-500" />
                             ตัวเลือกขั้นสูง (TCP Port, Alert Delay, Maintenance)
                          </span>
                          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                       </button>

                       {showAdvanced && (
                          <div className="p-3.5 border-t border-slate-200 dark:border-slate-700 space-y-3">
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                   <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Monitor TCP Port</label>
                                   <input 
                                      type="number"
                                      placeholder="เช่น 80, 443"
                                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-900 dark:text-white text-xs"
                                      value={formData.monitorPort || ''}
                                      onChange={e => setFormData({...formData, monitorPort: e.target.value ? parseInt(e.target.value) : undefined})}
                                   />
                                </div>

                                <div>
                                   <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Alert Delay (วินาที)</label>
                                   <input 
                                      type="number"
                                      placeholder="เช่น 30"
                                      className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-900 dark:text-white text-xs"
                                      value={formData.alertDelaySeconds || ''}
                                      onChange={e => setFormData({...formData, alertDelaySeconds: e.target.value ? parseInt(e.target.value) : undefined})}
                                   />
                                </div>
                             </div>

                             <div 
                               onClick={() => setFormData({...formData, isMaintenance: !formData.isMaintenance})}
                               className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                                 formData.isMaintenance 
                                 ? 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700' 
                                 : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                               }`}
                             >
                                <div>
                                   <span className={`text-xs font-bold block ${formData.isMaintenance ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                      Maintenance Mode ({formData.isMaintenance ? 'เปิดอยู่' : 'ปิดอยู่'})
                                   </span>
                                   <span className="text-[11px] text-slate-500">ข้ามการแจ้งเตือนและการนับ Downtime ชั่วคราว</span>
                                </div>
                                <div className={`w-10 h-6 rounded-full relative transition-colors ${formData.isMaintenance ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                   <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.isMaintenance ? 'left-5' : 'left-1'}`}></div>
                                </div>
                             </div>
                          </div>
                       )}
                    </div>
                 </div>
              </div>

              {/* Physical Details Section */}
              <div className="space-y-3">
                 <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
                    <MapPin className="w-4 h-4 text-purple-500" />
                    <h4 className="text-xs font-bold uppercase text-slate-500 tracking-wider">สถานที่และข้อมูลเพิ่มเติม (Location & Details)</h4>
                 </div>
                 
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                     <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">อาคาร / สถานที่ <span className="text-red-500">*</span></label>
                        <input 
                           required
                           placeholder="เช่น อาคาร 5, สำนักงานหลัก"
                           className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white text-sm font-semibold"
                           value={formData.location}
                           onChange={e => setFormData({...formData, location: e.target.value})}
                        />
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">ชั้น (Floor)</label>
                        <input 
                           placeholder="เช่น ชั้น 3, ชั้น G"
                           className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white text-sm font-semibold"
                           value={formData.floor || ''}
                           onChange={e => setFormData({...formData, floor: e.target.value})}
                        />
                     </div>
                 </div>

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                       <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">แท็ก (Tags คั่นด้วยจุลภาค)</label>
                       <input 
                          placeholder="e.g. eboard, classroom, floor2"
                          className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white text-xs"
                          value={tagsInput}
                          onChange={e => setTagsInput(e.target.value)}
                       />
                    </div>
                    <div>
                       <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">ผู้ผลิต / แบรนด์ (Manufacturer)</label>
                       <input
                          placeholder="เช่น Hisense, Samsung, Cisco, TP-Link"
                          className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white text-xs"
                          value={formData.model}
                          onChange={e => setFormData({...formData, model: e.target.value})}
                       />
                    </div>
                 </div>

                 {/* Remarks */}
                 <div>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
                       <FileEdit className="w-3.5 h-3.5 text-amber-500" />
                       <span>หมายเหตุอุปกรณ์ / สาเหตุที่ปิด (Remarks)</span>
                    </label>
                    <input 
                       placeholder="เช่น ปิดจอ E-Board, รอส่งซ่อม, ปิดห้อง"
                       className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-slate-900 dark:text-white text-xs font-medium"
                       value={formData.remarks || ''}
                       onChange={e => setFormData({...formData, remarks: e.target.value})}
                    />
                    <div className="flex flex-wrap items-center gap-1 pt-1.5">
                       <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <Sparkles className="w-3 h-3 text-amber-500" /> ด่วน:
                       </span>
                       {[
                          'ปิดจอ E-Board',
                          'ปิดจอพักเที่ยง',
                          'ปิดหลังเลิกเรียน/งาน',
                          'รอส่งซ่อม',
                          'ดับไฟห้อง'
                       ].map((preset) => (
                          <button
                             key={preset}
                             type="button"
                             onClick={() => setFormData({...formData, remarks: preset})}
                             className="px-2 py-0.5 bg-slate-200/70 hover:bg-amber-100 dark:bg-slate-700 dark:hover:bg-amber-900/40 text-slate-700 dark:text-slate-300 text-[11px] rounded-lg transition-colors cursor-pointer"
                          >
                             + {preset}
                          </button>
                       ))}
                    </div>
                 </div>
              </div>

           </form>
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5 relative z-10">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-all font-bold text-xs"
            >
              ยกเลิก (Cancel)
            </button>
            <button 
              type="submit"
              form="deviceForm"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-600/20 transition-all font-bold text-xs cursor-pointer"
            >
              {initialData ? 'บันทึกการแก้ไข' : 'สร้างอุปกรณ์'}
            </button>
        </div>
    </div>
  );
};
