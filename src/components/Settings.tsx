
import React, { useRef, useState, useEffect } from 'react';
import { AppSettings, Device } from '../types';
import { verifyPin } from '../services/monitorService';
import { 
  Database, Bell, Trash2, AlertTriangle, 
  Clock, Volume2, Activity, Zap, 
  CheckCircle2, Server, ShieldAlert, Sliders,
  Play, Download, Upload, FileJson, Type,
  Lock, Unlock, KeyRound, ShieldCheck, Calendar,
  Cloud, Copy, Check, RefreshCw, Code, MessageSquare, Send, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MotionButton } from './MotionButton';

interface SettingsProps {
  settings: AppSettings;
  devices: Device[]; // Need devices for backup
  onSave: (s: AppSettings) => void;
  onRestore: (data: { settings: AppSettings, devices: Device[] }) => void;
  onClearLogs: () => void;
  onRestartServer?: () => void;
}

interface GeneratedReport {
  name: string;
  size: number;
  date: string;
}

// Preset Sounds
const SOUND_PRESETS = [
  { name: 'Classic Sonar (Default)', url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
  { name: 'Red Alert Siren 🚨', url: 'https://assets.mixkit.co/active_storage/sfx/995/995-preview.mp3' },
  { name: 'Sci-Fi Alarm 👽', url: 'https://assets.mixkit.co/active_storage/sfx/212/212-preview.mp3' },
  { name: 'Submarine Dive', url: 'https://assets.mixkit.co/active_storage/sfx/2866/2866-preview.mp3' },
];

const GAS_TEMPLATE_CODE = `// ==========================================
// Google Apps Script (GAS) Web App Template
// สำหรับใช้กับระบบตรวจสอบสิทธิ์ E-Board
// ==========================================

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (payload.type === 'event') {
      // บันทึก Log เหตุการณ์ลงชีต 'Device Events'
      var sheet = getOrCreateSheet(ss, 'Device Events');
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['ID', 'วัน-เวลา', 'ชื่ออุปกรณ์', 'IP Address', 'สถานที่', 'ประเภทเหตุการณ์', 'รายละเอียด']);
        formatHeader(sheet);
      }
      
      // แปลงเวลา ISO เป็นวันเวลาของ Google Sheets
      var dateVal = parseIsoDate(payload.event.timestamp);
      
      sheet.appendRow([
        payload.event.id,
        dateVal,
        payload.event.deviceName,
        payload.event.ip,
        payload.event.location,
        translateType(payload.event.type),
        payload.event.message
      ]);
      
      // จัดรูปแบบสีตามประเภทเหตุการณ์ล่าสุด
      var lastRow = sheet.getLastRow();
      formatEventRow(sheet, lastRow, payload.event.type);
      
    } else if (payload.type === 'sync') {
      // 1. ซิงก์สถานะอุปกรณ์ทั้งหมดไปที่แผ่นงาน 'Devices'
      var devSheet = getOrCreateSheet(ss, 'Devices');
      devSheet.clear();
      devSheet.appendRow(['ID', 'ชื่ออุปกรณ์', 'IP Address', 'โมเดล', 'ประเภท', 'สถานที่', 'สถานะล่าสุด', 'ค่าความหน่วง (ms)', 'SLA Uptime (%)', 'ตรวจพบล่าสุด']);
      formatHeader(devSheet);
      
      for (var i = 0; i < payload.devices.length; i++) {
        var d = payload.devices[i];
        devSheet.appendRow([
          d.id,
          d.name,
          d.ip,
          d.model,
          d.type,
          d.location,
          translateStatus(d.status),
          d.latency,
          d.uptimePercentage / 100, // ใส่เศษส่วนเพื่อให้แสดง % ถูกต้อง
          parseIsoDate(d.lastSeen)
        ]);
        
        // จัดรูปแบบสถานะในแต่ละแถว
        formatStatusCell(devSheet, devSheet.getLastRow(), d.status);
      }
      
      // จัดรูปแบบคอลัมน์ % SLA
      if (payload.devices.length > 0) {
        var slaRange = devSheet.getRange(2, 9, payload.devices.length, 1);
        slaRange.setNumberFormat('0.00%');
      }
      
      // 2. ซิงก์เหตุการณ์ประวัติล่าสุดลงในแผ่นงาน 'Device Events'
      var eventSheet = getOrCreateSheet(ss, 'Device Events');
      eventSheet.clear();
      eventSheet.appendRow(['ID', 'วัน-เวลา', 'ชื่ออุปกรณ์', 'IP Address', 'สถานที่', 'ประเภทเหตุการณ์', 'รายละเอียด']);
      formatHeader(eventSheet);
      
      for (var j = 0; j < payload.logs.length; j++) {
        var l = payload.logs[j];
        eventSheet.appendRow([
          l.id,
          parseIsoDate(l.timestamp),
          l.deviceName,
          l.ip,
          l.location,
          translateType(l.type),
          l.message
        ]);
        formatEventRow(eventSheet, eventSheet.getLastRow(), l.type);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว' }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // ดึงข้อมูล อุปกรณ์
    var devices = [];
    var devSheet = ss.getSheetByName('Devices');
    if (devSheet && devSheet.getLastRow() > 1) {
      var devValues = devSheet.getRange(2, 1, devSheet.getLastRow() - 1, devSheet.getLastColumn()).getValues();
      for (var i = 0; i < devValues.length; i++) {
        var row = devValues[i];
        devices.push({
          id: row[0],
          name: row[1],
          ip: row[2],
          model: row[3],
          type: row[4],
          location: row[5],
          status: row[6],
          latency: row[7],
          sla: row[8],
          lastSeen: row[9]
        });
      }
    }
    
    // ดึงข้อมูลประวัติเหตุการณ์
    var events = [];
    var eventSheet = ss.getSheetByName('Device Events');
    if (eventSheet && eventSheet.getLastRow() > 1) {
      var numRows = Math.min(25, eventSheet.getLastRow() - 1);
      var startRow = eventSheet.getLastRow() - numRows + 1;
      var eventValues = eventSheet.getRange(startRow, 1, numRows, eventSheet.getLastColumn()).getValues();
      // วนย้อนกลับเพื่อเอาล่าสุดขึ้นก่อน
      for (var j = eventValues.length - 1; j >= 0; j--) {
        var row = eventValues[j];
        events.push({
          id: row[0],
          timestamp: row[1],
          deviceName: row[2],
          ip: row[3],
          location: row[4],
          type: row[5],
          message: row[6]
        });
      }
    }
    
    var html = getDashboardHtml(devices, events);
    return HtmlService.createHtmlOutput(html)
      .setTitle('E-Board Cloud Live Monitor')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch(err) {
    return HtmlService.createHtmlOutput('<h1>เกิดข้อผิดพลาดในการโหลดแดชบอร์ด</h1><p>' + err.toString() + '</p>');
  }
}

function getDashboardHtml(devices, events) {
  var total = devices.length;
  var online = 0;
  var offline = 0;
  var warning = 0;
  
  for (var i = 0; i < total; i++) {
    var status = devices[i].status;
    if (status.indexOf('Online') > -1) {
      online++;
    } else if (status.indexOf('Offline') > -1) {
      offline++;
    } else {
      warning++;
    }
  }
  
  var deviceCardsHtml = '';
  if (total === 0) {
    deviceCardsHtml = '<div class="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-100 shadow-sm font-medium">ไม่พบข้อมูลอุปกรณ์ในชีต Devices กรุณากดซิงก์ข้อมูลจากระบบ E-Board (Sync Now)</div>';
  } else {
    for (var i = 0; i < total; i++) {
      var d = devices[i];
      var statusColor = 'bg-emerald-500';
      var statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-100';
      var cardBorder = 'border-slate-100';
      var shadowPulse = '';
      
      if (d.status.indexOf('Offline') > -1) {
        statusColor = 'bg-rose-500';
        statusBg = 'bg-rose-50 text-rose-700 border-rose-100';
        cardBorder = 'border-rose-100';
        shadowPulse = 'shadow-md shadow-rose-100/50';
      } else if (d.status.indexOf('Latency') > -1) {
        statusColor = 'bg-amber-500';
        statusBg = 'bg-amber-50 text-amber-700 border-amber-100';
        cardBorder = 'border-amber-100';
      }
      
      var slaVal = parseFloat(d.sla);
      var slaPercent = isNaN(slaVal) ? '100.00%' : (slaVal * 100).toFixed(2) + '%';
      
      var latencyDisplay = d.latency + ' ms';
      if (d.latency === '' || d.latency === undefined || d.status.indexOf('Offline') > -1) {
        latencyDisplay = '--';
      }
      
      deviceCardsHtml += 
        '<div class="bg-white rounded-2xl border ' + cardBorder + ' p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between ' + shadowPulse + '">' +
          '<div>' +
            '<div class="flex items-start justify-between gap-2 mb-3">' +
              '<div>' +
                '<h3 class="font-bold text-slate-800 text-base leading-snug">' + d.name + '</h3>' +
                '<span class="text-xs text-slate-400 font-medium">' + d.ip + ' • ' + d.location + '</span>' +
              '</div>' +
              '<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ' + statusBg + '">' +
                '<span class="w-1.5 h-1.5 rounded-full ' + statusColor + '"></span>' +
                d.status +
              '</span>' +
            '</div>' +
            
            '<div class="grid grid-cols-2 gap-4 my-4 py-3 px-4 bg-slate-50 rounded-xl">' +
              '<div>' +
                '<span class="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">LATENCY</span>' +
                '<span class="text-lg font-extrabold text-slate-700">' + latencyDisplay + '</span>' +
              '</div>' +
              '<div>' +
                '<span class="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">SLA UPTIME</span>' +
                '<span class="text-lg font-extrabold text-slate-700">' + slaPercent + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          
          '<div class="border-t border-slate-50 pt-3 mt-1 flex justify-between items-center text-[11px] text-slate-400 font-medium">' +
            '<span>' + (d.model || d.type || 'Network Host') + '</span>' +
            '<span>ตรวจพบ: ' + formatTime(d.lastSeen) + '</span>' +
          '</div>' +
        '</div>';
    }
  }
  
  var eventRowsHtml = '';
  if (events.length === 0) {
    eventRowsHtml = '<tr><td colspan="5" class="py-8 text-center text-slate-400 text-xs font-medium">ไม่พบประวัติเหตุการณ์ล่วงหน้าในชีต Device Events</td></tr>';
  } else {
    for (var j = 0; j < events.length; j++) {
      var ev = events[j];
      var badgeColor = 'bg-emerald-100 text-emerald-800';
      if (ev.type.indexOf('OUTAGE') > -1) {
        badgeColor = 'bg-rose-100 text-rose-800';
      } else if (ev.type.indexOf('LATENCY') > -1) {
        badgeColor = 'bg-amber-100 text-amber-800';
      }
      
      eventRowsHtml += 
        '<tr class="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">' +
          '<td class="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">' + formatTime(ev.timestamp) + '</td>' +
          '<td class="py-3 px-4 text-xs font-semibold text-slate-800">' + ev.deviceName + '</td>' +
          '<td class="py-3 px-4 text-xs text-slate-500">' + ev.ip + '</td>' +
          '<td class="py-3 px-4 text-xs"><span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ' + badgeColor + '">' + ev.type + '</span></td>' +
          '<td class="py-3 px-4 text-xs text-slate-600 font-medium">' + ev.message + '</td>' +
        '</tr>';
    }
  }
  
  return '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      '<title>E-Board Cloud Live Monitor</title>' +
      '<script src="https://cdn.tailwindcss.com"></script>' +
      '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">' +
      '<style>' +
        'body { font-family: "Inter", sans-serif; background-color: #f8fafc; }' +
      '</style>' +
    '</head>' +
    '<body class="text-slate-800 min-h-screen pb-12">' +
      
      '<!-- Header Banner -->' +
      '<div class="bg-slate-900 text-white shadow-md relative overflow-hidden">' +
        '<div class="absolute inset-0 bg-gradient-to-r from-blue-900/30 to-indigo-900/30"></div>' +
        '<div class="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 relative z-10 flex flex-col sm:flex-row justify-between items-center gap-4">' +
          '<div class="flex items-center gap-3">' +
            '<div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-lg shadow-blue-500/20">⚡</div>' +
            '<div>' +
              '<h1 class="text-xl font-extrabold tracking-tight">E-Board Cloud</h1>' +
              '<p class="text-xs text-slate-400">Live Status & Monitor Dashboard (Google Web App)</p>' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-3">' +
            '<span class="text-xs text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">อัปเดตล่าสุด: \' + formatTime(new Date()) + \'</span>' +
            '<button onclick="window.location.reload()" class="bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 px-4 rounded-lg text-xs shadow-md shadow-blue-500/10 active:scale-95 transition-all flex items-center gap-1.5">' +
              '🔄 รีเฟรชข้อมูล' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      
      '<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">' +
        
        '<!-- Stats Grid -->' +
        '<div class="grid grid-cols-2 lg:grid-cols-4 gap-4">' +
          '<div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">' +
            '<div>' +
              '<span class="block text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">อุปกรณ์ทั้งหมด</span>' +
              '<span class="text-2xl font-black text-slate-800">' + total + '</span>' +
            '</div>' +
            '<div class="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-500 text-lg">🖥️</div>' +
          '</div>' +
          '<div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">' +
            '<div>' +
              '<span class="block text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">ปกติ (Online)</span>' +
              '<span class="text-2xl font-black text-emerald-600">' + online + '</span>' +
            '</div>' +
            '<div class="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 text-lg">🟢</div>' +
          '</div>' +
          '<div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">' +
            '<div>' +
              '<span class="block text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">ขัดข้อง (Offline)</span>' +
              '<span class="text-2xl font-black text-rose-600">' + offline + '</span>' +
            '</div>' +
            '<div class="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500 text-lg">🔴</div>' +
          '</div>' +
          '<div class="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">' +
            '<div>' +
              '<span class="block text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">หน่วงสูง (Latency)</span>' +
              '<span class="text-2xl font-black text-amber-600">' + warning + '</span>' +
            '</div>' +
            '<div class="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 text-lg">🟡</div>' +
          '</div>' +
        '</div>' +
        
        '<!-- Devices Cards Section -->' +
        '<div>' +
          '<h2 class="text-sm font-bold text-slate-600 mb-4 flex items-center gap-2">🖥️ สถานะอุปกรณ์ปัจจุบัน (Current Status)</h2>' +
          '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">' +
            deviceCardsHtml +
          '</div>' +
        '</div>' +
        
        '<!-- Log Events Section -->' +
        '<div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">' +
          '<div class="p-5 border-b border-slate-100 flex justify-between items-center">' +
            '<h2 class="text-sm font-bold text-slate-800">📋 ประวัติเหตุการณ์ล่าสุด (Recent Outage Logs)</h2>' +
            '<span class="text-xs text-slate-400 font-medium">แสดงล่าสุดสูงสุด 25 รายการ</span>' +
          '</div>' +
          '<div class="overflow-x-auto">' +
            '<table class="w-full text-left border-collapse">' +
              '<thead>' +
                '<tr class="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">' +
                  '<th class="py-3 px-4">วัน-เวลา</th>' +
                  '<th class="py-3 px-4">ชื่ออุปกรณ์</th>' +
                  '<th class="py-3 px-4">IP Address</th>' +
                  '<th class="py-3 px-4">ประเภท</th>' +
                  '<th class="py-3 px-4">รายละเอียด</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody class="divide-y divide-slate-50">' +
                eventRowsHtml +
              '</tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
        
      '</div>' +
      
      '<script>' +
        '// Auto-refresh every 60 seconds\\n' +
        'setTimeout(function() { window.location.reload(); }, 60000);\\n' +
      '</script>' +
    '</body>' +
    '</html>';
}

function formatTime(dateVal) {
  if (!dateVal) return '';
  var date = new Date(dateVal);
  if (isNaN(date.getTime())) return String(dateVal);
  
  var pad = function(n) { return n < 10 ? '0' + n : n; };
  var d = pad(date.getDate());
  var m = pad(date.getMonth() + 1);
  var y = date.getFullYear() + 543; // แปลงเป็น พ.ศ. ให้สวยงามตามสไตล์คนไทย
  var h = pad(date.getHours());
  var min = pad(date.getMinutes());
  var s = pad(date.getSeconds());
  
  return d + '/' + m + '/' + y + ' ' + h + ':' + min + ':' + s;
}

// --- ฟังก์ชันช่วยเหลือ (Helper Functions) ---

function getOrCreateSheet(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function formatHeader(sheet) {
  var range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setBackground('#1e293b') // Dark Slate
       .setFontColor('#ffffff')
       .setFontWeight('bold')
       .setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, sheet.getLastColumn());
}

function parseIsoDate(isoString) {
  if (!isoString) return '';
  try {
    return new Date(isoString);
  } catch(e) {
    return isoString;
  }
}

function translateStatus(status) {
  if (status === 'Online') return '🟢 Online';
  if (status === 'Offline') return '🔴 Offline';
  if (status === 'High Latency') return '🟡 High Latency';
  return status;
}

function translateType(type) {
  if (type === 'OUTAGE') return '🔴 OUTAGE (ระบบล่ม)';
  if (type === 'RECOVERY') return '🟢 RECOVERY (ใช้งานได้ปกติ)';
  if (type === 'HIGH_LATENCY') return '🟡 LATENCY (หน่วงสูง)';
  return type;
}

function formatStatusCell(sheet, row, status) {
  var range = sheet.getRange(row, 7); // คอลัมน์ที่ 7 คือ Status
  if (status === 'Online') {
    range.setBackground('#dcfce7').setFontColor('#15803d');
  } else if (status === 'Offline') {
    range.setBackground('#fee2e2').setFontColor('#b91c1c');
  } else {
    range.setBackground('#fef3c7').setFontColor('#b45309');
  }
}

function formatEventRow(sheet, row, type) {
  var range = sheet.getRange(row, 1, 1, sheet.getLastColumn());
  if (type === 'OUTAGE') {
    range.setBackground('#fef2f2'); // แดงอ่อน
  } else if (type === 'RECOVERY') {
    range.setBackground('#f0fdf4'); // เขียวอ่อน
  } else if (type === 'HIGH_LATENCY') {
    range.setBackground('#fffbeb'); // เหลืองอ่อน
  }
}`;

// --- Reusable UI Components for Settings ---

const SettingsCard = ({ 
  children, 
  title, 
  description, 
  icon: Icon,
  className = "",
  variant = "default" 
}: { 
  children: React.ReactNode, 
  title: string, 
  description: string, 
  icon: any,
  className?: string,
  variant?: "default" | "danger" | "highlight" | "info"
}) => {
  const variants = {
    default: "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    danger: "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30",
    highlight: "bg-gradient-to-br from-blue-50/80 to-white dark:from-slate-800 dark:to-slate-900 border-blue-100 dark:border-slate-700",
    info: "bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30"
  };

  const iconColors = {
    default: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    danger: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
    highlight: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
    info: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
  };

  return (
    <div className={`p-4 sm:p-6 rounded-xl sm:rounded-2xl border shadow-xs transition-all duration-300 hover:shadow-md ${variants[variant]} ${className}`}>
      <div className="flex items-start gap-3 sm:gap-4 mb-4 sm:mb-5">
        <div className={`p-2 sm:p-2.5 rounded-lg sm:rounded-xl shrink-0 ${iconColors[variant]}`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="min-w-0">
          <h3 className={`text-base sm:text-lg font-bold tracking-tight ${variant === 'danger' ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 sm:mt-1 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <div className="space-y-3 sm:space-y-4">
        {children}
      </div>
    </div>
  );
};

const CustomToggle = ({ 
  label, 
  description, 
  checked, 
  onChange,
  icon: Icon
}: { 
  label: string, 
  description?: string, 
  checked: boolean, 
  onChange: (c: boolean) => void,
  icon?: any
}) => (
  <div 
    onClick={() => onChange(!checked)}
    className={`
      group flex items-center justify-between p-3 sm:p-4 rounded-xl border cursor-pointer transition-all duration-200
      ${checked 
        ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30' 
        : 'bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'}
    `}
  >
    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-2">
      {Icon && (
        <Icon className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${checked ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'}`} />
      )}
      <div className="min-w-0">
        <p className={`font-bold text-xs sm:text-sm leading-snug truncate ${checked ? 'text-blue-900 dark:text-blue-200' : 'text-slate-700 dark:text-slate-300'}`}>
          {label}
        </p>
        {description && <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 line-clamp-1">{description}</p>}
      </div>
    </div>
    <div className={`
      w-10 h-6 sm:w-11 sm:h-6 rounded-full p-0.5 transition-colors duration-300 ease-in-out relative shrink-0
      ${checked ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}
    `}>
      <div className={`
        bg-white w-5 h-5 rounded-full shadow-md transform transition-transform duration-300 ease-in-out
        ${checked ? 'translate-x-4 sm:translate-x-5' : 'translate-x-0'}
      `}></div>
    </div>
  </div>
);

const RangeSlider = ({
  label,
  value,
  min,
  max,
  unit,
  onChange,
  colorClass = "accent-blue-600"
}: {
  label: string,
  value: number,
  min: number,
  max: number,
  unit: string,
  onChange: (v: number) => void,
  colorClass?: string
}) => (
  <div className="space-y-2 sm:space-y-3">
    <div className="flex justify-between items-end">
      <label className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">{label}</label>
      <span className="text-sm sm:text-base font-mono font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md">
        {value} <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-sans font-medium">{unit}</span>
      </span>
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      value={value} 
      onChange={(e) => onChange(parseInt(e.target.value))}
      className={`w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer ${colorClass}`}
    />
    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
      <span>{min}{unit}</span>
      <span>{max}{unit}</span>
    </div>
  </div>
);


// --- Main Component ---

export const Settings: React.FC<SettingsProps> = ({ settings, devices, onSave, onRestore, onClearLogs, onRestartServer }) => {
  const [localSettings, setLocalSettings] = React.useState(settings);
  const [isDirty, setIsDirty] = React.useState(false);
  const [isUnlocked, setIsUnlocked] = useState(!settings.hasAdminPin);
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [activeTab, setActiveTab] = useState('general');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<{ settings: any, devices: any, timestamp: string } | null>(null);
  const [showClearLogsConfirm, setShowClearLogsConfirm] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [isTestingGas, setIsTestingGas] = useState(false);
  const [isSyncingGas, setIsSyncingGas] = useState(false);
  const [isTestingLineFlex, setIsTestingLineFlex] = useState(false);
  const [isTestingLineAlert, setIsTestingLineAlert] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [isTestingDiscord, setIsTestingDiscord] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [unlockedPin, setUnlockedPin] = useState<string>(() => sessionStorage.getItem('netsentinel_admin_pin') || '');
  const [gitRepoUrl, setGitRepoUrl] = useState<string>('https://github.com/suphol4726/eboard-monitor.git');
  const [gitLastCommit, setGitLastCommit] = useState<string>('');
  const [dailyBackupsInfo, setDailyBackupsInfo] = useState<{ count: number; latest: string }>({ count: 0, latest: '' });
  const [isSelfUpdating, setIsSelfUpdating] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const windowsOneLinerCmd = `cd /d C:\\eboard-monitor && (if exist "C:\\Program Files\\Git\\cmd\\git.exe" set "PATH=%PATH%;C:\\Program Files\\Git\\cmd") && (if not exist .backup_data mkdir .backup_data) && (if exist devices.json copy /Y devices.json .backup_data\\devices.json.bak >nul) && (if exist settings.json copy /Y settings.json .backup_data\\settings.json.bak >nul) && (if exist logs.json copy /Y logs.json .backup_data\\logs.json.bak >nul) && call pm2 stop eboard-monitor & (for /f "tokens=5" %a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %a) & (if not exist .git (git init && git remote add origin https://github.com/suphol4726/eboard-monitor.git) else (git remote set-url origin https://github.com/suphol4726/eboard-monitor.git)) && git fetch --all && git reset --hard origin/main && (if exist .backup_data\\devices.json.bak copy /Y .backup_data\\devices.json.bak devices.json >nul) && (if exist .backup_data\\settings.json.bak copy /Y .backup_data\\settings.json.bak settings.json >nul) && (if exist .backup_data\\logs.json.bak copy /Y .backup_data\\logs.json.bak logs.json >nul) && (if exist dist\\server.cjs del /F /Q dist\\server.cjs) && call npm run build && call pm2 delete eboard-monitor & call pm2 start dist/server.cjs --name eboard-monitor --max-memory-restart 400M && call pm2 save`;

  const handleCopyUnlockCmd = () => {
    navigator.clipboard.writeText(windowsOneLinerCmd);
    setCopiedCmd(true);
    toast.success('คัดลอกคำสั่งปลดล็อก Port 3000 & อัปเดตแล้ว! นำไปวางในหน้าต่าง CMD แล้วกด Enter ได้เลย');
    setTimeout(() => setCopiedCmd(false), 3000);
  };

  const fetchUpdateInfo = async () => {
    try {
      const res = await fetch('/api/system/update-info');
      if (res.ok) {
        const data = await res.json();
        if (data.remoteUrl) setGitRepoUrl(data.remoteUrl);
        if (data.lastCommit) setGitLastCommit(data.lastCommit);
        if (typeof data.dailyBackupsCount === 'number') {
          setDailyBackupsInfo({ count: data.dailyBackupsCount, latest: data.latestDailyBackup || '' });
        }
      }
    } catch (_e) {}
  };

  const handleSelfUpdate = async () => {
    if (!gitRepoUrl.trim()) {
      toast.error('กรุณาวางลิงก์ GitHub Repository URL ที่ซิงก์จาก AI Studio ก่อนกดอัปเดต');
      return;
    }
    setIsSelfUpdating(true);
    const activePin = unlockedPin || sessionStorage.getItem('netsentinel_admin_pin') || '';
    try {
      const res = await fetch('/api/system/self-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: activePin,
          repoUrl: gitRepoUrl.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'อัปเดตโค้ดและรีสตาร์ตระบบสำเร็จ! กรุณารอ 3-5 วินาทีแล้วรีเฟรชหน้าเว็บ', { duration: 7000 });
      } else if (res.status === 404) {
        navigator.clipboard.writeText(windowsOneLinerCmd);
        toast.error('โปรเซส Node.js ตัวเก่ายังค้างยึด Port 3000 อยู่! ระบบได้คัดลอกคำสั่งปลดล็อกให้อัตโนมัติแล้ว กรุณานำไปวางใน CMD แล้วกด Enter 1 ครั้งครับ', { duration: 8000 });
      } else {
        toast.error(data.error || 'การอัปเดตล้มเหลว');
      }
    } catch (_e) {
      toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อสั่งอัปเดตได้');
    } finally {
      setIsSelfUpdating(false);
    }
  };

  const handleTestWebhook = async () => {
    if (!localSettings.alertWebhookUrl || !localSettings.alertWebhookUrl.trim()) {
      toast.error('กรุณาระบุ Webhook URL ก่อนทำการทดสอบ');
      return;
    }
    setIsTestingWebhook(true);
    try {
      const res = await fetch('/api/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: localSettings.alertWebhookUrl.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'ส่งข้อความทดสอบไปยัง Webhook สำเร็จ!');
      } else {
        toast.error(data.error || 'ไม่สามารถส่งข้อความ Webhook ได้');
      }
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Webhook');
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botToken: localSettings.telegramBotToken,
          chatId: localSettings.telegramChatId
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'ส่งข้อความทดสอบไปยัง Telegram สำเร็จ!');
      } else {
        toast.error(data.error || 'ไม่สามารถส่งข้อความ Telegram ได้');
      }
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Telegram API');
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleTestDiscord = async () => {
    setIsTestingDiscord(true);
    try {
      const res = await fetch('/api/discord/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: localSettings.discordWebhookUrl
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'ส่งข้อความทดสอบไปยัง Discord Webhook สำเร็จ!');
      } else {
        toast.error(data.error || 'ไม่สามารถส่งข้อความ Discord ได้');
      }
    } catch (e: any) {
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อกับ Discord Webhook');
    } finally {
      setIsTestingDiscord(false);
    }
  };

  const handleTestLineFlex = async () => {
    if (!localSettings.lineNotifyToken || !localSettings.lineUserId) {
      toast.error('กรุณาระบุ Channel Access Token และ User ID สำหรับ LINE ก่อนทำการทดสอบ');
      return;
    }
    setIsTestingLineFlex(true);
    try {
      const res = await fetch('/api/line/test-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localSettings.lineNotifyToken,
          userId: localSettings.lineUserId
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'ส่งรายงานสรุป LINE Flex Message สำเร็จ!');
      } else {
        toast.error(data.error || 'ไม่สามารถส่งรายงานสรุป LINE ได้');
      }
    } catch (e: any) {
      toast.error('การเชื่อมต่อล้มเหลว: ไม่สามารถส่งข้อความได้');
    } finally {
      setIsTestingLineFlex(false);
    }
  };

  const handleTestLineAlert = async () => {
    if (!localSettings.lineNotifyToken || !localSettings.lineUserId) {
      toast.error('กรุณาระบุ Channel Access Token และ User ID สำหรับ LINE ก่อนทำการทดสอบ');
      return;
    }
    setIsTestingLineAlert(true);
    try {
      const res = await fetch('/api/line/test-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: localSettings.lineNotifyToken,
          userId: localSettings.lineUserId
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'ส่งการแจ้งเตือนเหตุการณ์ทดสอบไปที่ LINE สำเร็จ!');
      } else {
        toast.error(data.error || 'ไม่สามารถส่งแจ้งเตือน LINE ได้');
      }
    } catch (e: any) {
      toast.error('การเชื่อมต่อล้มเหลว: ไม่สามารถส่งข้อความได้');
    } finally {
      setIsTestingLineAlert(false);
    }
  };

  const handleTestGas = async () => {
    if (!localSettings.gasWebAppUrl) {
      toast.error('กรุณาระบุ URL ของ Google Apps Script Web App ก่อนทำการทดสอบ');
      return;
    }
    setIsTestingGas(true);
    try {
      const res = await fetch('/api/gas/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: localSettings.gasWebAppUrl
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'ส่งข้อมูลทดสอบไปยัง GAS สำเร็จ!');
      } else {
        toast.error(data.error || 'ไม่สามารถเชื่อมต่อกับ GAS Web App ได้');
      }
    } catch (e: any) {
      toast.error('การเชื่อมต่อล้มเหลว: ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ระบบได้');
    } finally {
      setIsTestingGas(false);
    }
  };

  const handleSyncGas = async () => {
    setIsSyncingGas(true);
    try {
      const res = await fetch('/api/gas/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'ซิงก์ข้อมูลอุปกรณ์และ Log ทั้งหมดไปยัง Google Sheet สำเร็จ!');
      } else {
        toast.error(data.error || 'การซิงก์ข้อมูลล้มเหลว');
      }
    } catch (e: any) {
      toast.error('การเชื่อมต่อล้มเหลว: ไม่สามารถซิงก์ข้อมูลได้');
    } finally {
      setIsSyncingGas(false);
    }
  };

  const [copied, setCopied] = useState(false);
  const handleCopyCode = () => {
    navigator.clipboard.writeText(GAS_TEMPLATE_CODE);
    setCopied(true);
    toast.success('คัดลอกโค้ดต้นแบบแล้ว!');
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: 'general', label: 'ทั่วไป & ความปลอดภัย', icon: ShieldCheck },
    { id: 'monitoring', label: 'การตรวจสอบ (Monitoring)', icon: Activity },
    { id: 'notifications', label: 'การแจ้งเตือน (LINE / Alerts)', icon: Bell },
    { id: 'gas', label: 'Google Sheets Sync', icon: Cloud },
    { id: 'data', label: 'ข้อมูล & รายงาน (Reports)', icon: Database },
    { id: 'maintenance', label: 'การบำรุงรักษา (Maintenance)', icon: AlertTriangle },
  ];

  useEffect(() => {
    const initialSettings = { ...settings };
    if (settings.hasAdminPin) initialSettings.adminPin = '********';
    if (settings.hasLineNotifyToken) initialSettings.lineNotifyToken = '********';
    if (settings.hasLineUserId) initialSettings.lineUserId = '********';
    if (settings.hasSmtpPass) initialSettings.smtpPass = '********';
    if (settings.hasSmtpUser) initialSettings.smtpUser = '********';
    
    setLocalSettings(initialSettings);
    if (!settings.hasAdminPin) setIsUnlocked(true);
    fetchReports();
    fetchUpdateInfo();
  }, [settings]);

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports');
      if (res.ok) {
        const data = await res.json();
        setReports(data);
      }
    } catch (e: any) {
      if (e && (e.message === "Failed to fetch" || e.name === "TypeError")) {
        console.warn('Failed to fetch reports: server currently not reachable', e.message);
      } else {
        console.error('Failed to fetch reports:', e);
      }
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = pinInput.trim();
    if (!cleanPin) {
      toast.error("กรุณาระบุรหัส PIN");
      return;
    }
    if (isVerifying) return;

    setIsVerifying(true);
    const isValid = await verifyPin(cleanPin);
    setIsVerifying(false);

    if (isValid) {
      setIsUnlocked(true);
      setUnlockedPin(cleanPin);
      sessionStorage.setItem('netsentinel_admin_pin', cleanPin);
      setPinInput('');
      toast.success("ปลดล็อกหน้าการตั้งค่าเรียบร้อย");
    } else {
      toast.error("รหัส PIN ไม่ถูกต้อง");
      setPinInput('');
    }
  };

  const updateSetting = (key: keyof AppSettings, value: any) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const settingsToSave: any = { ...localSettings };
    console.log('[Settings] handleSubmit, settingsToSave:', settingsToSave);
    // If fields are still placeholder, don't send them to server to avoid overwriting
    if (settingsToSave.adminPin === '********') delete settingsToSave.adminPin;
    if (settingsToSave.lineNotifyToken === '********') delete settingsToSave.lineNotifyToken;
    if (settingsToSave.lineUserId === '********') delete settingsToSave.lineUserId;
    if (settingsToSave.smtpPass === '********') delete settingsToSave.smtpPass;
    if (settingsToSave.smtpUser === '********') delete settingsToSave.smtpUser;
    
    console.log('[Settings] Calling onSave with:', settingsToSave);
    onSave(settingsToSave);
    setIsDirty(false);
  };

  const handleClearLogsClick = () => {
    setShowClearLogsConfirm(true);
  };

  const confirmClearLogs = () => {
    onClearLogs();
    setShowClearLogsConfirm(false);
    toast.success("All logs have been cleared.");
  };

  const handleRestartServerClick = () => {
    setShowRestartConfirm(true);
  };

  const confirmRestartServer = () => {
    if (onRestartServer) onRestartServer();
    setShowRestartConfirm(false);
  };

  // Sound Preview
  const playPreviewSound = () => {
    if (localSettings.alertSoundUrl) {
      const audio = new Audio(localSettings.alertSoundUrl);
      audio.volume = 0.5;
      audio.play().catch(() => toast.error("Could not play sound. Check URL."));
    }
  };

  // Backup & Restore
  const handleBackup = () => {
    const backupData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      settings: localSettings,
      devices: devices
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `eboard_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success("Configuration backup downloaded.");
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawText = (event.target?.result as string || '').replace(/^\uFEFF/, '');
        const json = JSON.parse(rawText);
        if (json && json.settings && Array.isArray(json.devices)) {
          setShowRestoreConfirm({ 
            settings: json.settings, 
            devices: json.devices, 
            timestamp: json.timestamp || new Date().toISOString()
          });
        } else if (Array.isArray(json)) {
          setShowRestoreConfirm({
            settings: localSettings,
            devices: json,
            timestamp: new Date().toISOString()
          });
        } else {
          toast.error("รูปแบบไฟล์สำรองข้อมูลไม่ถูกต้อง");
        }
      } catch (err) {
        toast.error("ไม่สามารถอ่านไฟล์ JSON ได้ กรุณาตรวจสอบไฟล์");
      }
      if(fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  const confirmRestore = () => {
    if (!showRestoreConfirm) return;
    setLocalSettings(showRestoreConfirm.settings);
    onRestore({ settings: showRestoreConfirm.settings, devices: showRestoreConfirm.devices });
    setIsDirty(false);
    setShowRestoreConfirm(null);
    toast.success("System restored successfully!");
  };

  if (!isUnlocked) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-3 animate-in fade-in zoom-in duration-300">
        <div className="bg-white dark:bg-slate-800 p-6 sm:p-10 rounded-[2rem] sm:rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md text-center relative overflow-hidden">
          {/* Decorative background element */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>

          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/40 rounded-3xl flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-inner rotate-3 hover:rotate-0 transition-transform duration-500">
            <div className="p-3.5 sm:p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
              <Lock className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white mb-2 sm:mb-3 tracking-tight">ตั้งค่าระบบถูกล็อก</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6 sm:mb-10 text-xs sm:text-sm leading-relaxed">
            กรุณากรอกรหัส Admin PIN เพื่อเข้าแก้ไขการตั้งค่าระบบ
          </p>

          <form onSubmit={handleUnlock} className="space-y-6 sm:space-y-8">
            <div className="relative group">
              <KeyRound className="absolute left-4 sm:left-5 top-1/2 -translate-y-1/2 w-5 h-5 sm:w-6 sm:h-6 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type={showPin ? "text" : "password"}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="••••"
                autoFocus
                className="w-full bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-100 dark:border-slate-700 rounded-2xl sm:rounded-3xl pl-12 pr-12 sm:pl-14 sm:pr-14 py-4 sm:py-5 text-center text-2xl sm:text-3xl font-black tracking-[0.5em] focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700"
              />
              <button 
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500 transition-colors p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl"
              >
                {showPin ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
              </button>
            </div>
            <MotionButton 
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black py-4 sm:py-5 rounded-2xl sm:rounded-3xl shadow-2xl shadow-blue-600/30 transition-all flex items-center justify-center gap-3 group text-base sm:text-lg"
            >
              <Unlock className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform" />
              ปลดล็อกการตั้งค่า
            </MotionButton>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full pb-24">
      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 p-10 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md text-center relative overflow-hidden">
            {/* Decorative background element */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
            
            <div className="w-24 h-24 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/40 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner rotate-3 hover:rotate-0 transition-transform duration-500 relative z-10">
              <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
                <Upload className="w-10 h-10 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            
            <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 tracking-tight relative z-10">ยืนยันการกู้คืน?</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-10 text-sm leading-relaxed relative z-10">
              กู้คืนข้อมูลสำรองจากวันที่ {new Date(showRestoreConfirm.timestamp).toLocaleDateString()}?<br/>
              <span className="text-red-500 font-bold">คำเตือน: การตั้งค่าปัจจุบันจะถูกเขียนทับทั้งหมด</span>
            </p>
            
            <div className="flex gap-4 relative z-10">
              <button 
                type="button"
                onClick={() => setShowRestoreConfirm(null)}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold py-4 rounded-2xl transition-all hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                ยกเลิก
              </button>
              <button 
                type="button"
                onClick={confirmRestore}
                className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-blue-600/30 transition-all"
              >
                ยืนยันการกู้คืน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Logs Confirmation Modal */}
      {showClearLogsConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 p-10 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md text-center relative overflow-hidden">
            {/* Decorative background element */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/5 rounded-full blur-3xl"></div>
            
            <div className="w-24 h-24 bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/40 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner rotate-3 hover:rotate-0 transition-transform duration-500 relative z-10">
              <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
                <Trash2 className="w-10 h-10 text-red-600 dark:text-red-400" />
              </div>
            </div>
            
            <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 tracking-tight relative z-10">ล้างประวัติทั้งหมด?</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-10 text-sm leading-relaxed relative z-10">
              คุณแน่ใจหรือไม่ว่าต้องการลบประวัติการทำงานทั้งหมด?<br/>
              <span className="text-red-500 font-bold">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
            </p>
            
            <div className="flex gap-4 relative z-10">
              <button 
                type="button"
                onClick={() => setShowClearLogsConfirm(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold py-4 rounded-2xl transition-all hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                ยกเลิก
              </button>
              <button 
                type="button"
                onClick={confirmClearLogs}
                className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-red-600/30 transition-all"
              >
                ลบข้อมูลทันที
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart Server Confirmation Modal */}
      {showRestartConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-800 p-10 rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md text-center relative overflow-hidden">
            {/* Decorative background element */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl"></div>
            
            <div className="w-24 h-24 bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-900/40 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner rotate-3 hover:rotate-0 transition-transform duration-500 relative z-10">
              <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm">
                <Zap className="w-10 h-10 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
            
            <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-3 tracking-tight relative z-10">รีสตาร์ตเซิร์ฟเวอร์?</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-10 text-sm leading-relaxed relative z-10">
              คุณต้องการรีสตาร์ตเอนจินการทำงานหลักและเอนจินการตรวจสอบพื้นหลังใช่หรือไม่?<br/>
              <span className="text-amber-500 font-bold">เซิร์ฟเวอร์จะตัดการทำงานชั่วคราว (3-5 วินาที) แล้วเริ่มทำงานใหม่โดยอัตโนมัติ</span>
            </p>
            
            <div className="flex gap-4 relative z-10">
              <button 
                type="button"
                onClick={() => setShowRestartConfirm(false)}
                className="flex-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold py-4 rounded-2xl transition-all hover:bg-slate-200 dark:hover:bg-slate-600"
              >
                ยกเลิก
              </button>
              <button 
                type="button"
                onClick={confirmRestartServer}
                className="flex-1 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-black py-4 rounded-2xl shadow-xl shadow-amber-600/30 transition-all"
              >
                รีสตาร์ตทันที
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2 sm:gap-3">
            <Sliders className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-blue-600 shrink-0" />
            <span>การตั้งค่าระบบ (Settings)</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            ปรับแต่งค่าความหน่วง, การแจ้งเตือน LINE, Google Sheets Sync และการจัดการระบบ
          </p>
        </div>
        <MotionButton 
          onClick={() => {
            setIsUnlocked(false);
            toast.success("Settings Locked");
          }}
          className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-red-300 dark:hover:border-red-900/50 hover:text-red-600 dark:hover:text-red-400 font-bold text-xs sm:text-sm transition-all shadow-xs hover:shadow-lg hover:shadow-red-500/10 group cursor-pointer shrink-0"
        >
          <div className="p-1 bg-slate-50 dark:bg-slate-900 rounded-md group-hover:bg-red-50 dark:group-hover:bg-red-900/30 transition-colors">
            <Lock className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
          </div>
          <span>ล็อกการตั้งค่า (Lock)</span>
        </MotionButton>
      </div>

      {/* Tab Navigation - Mobile Smooth Scrollable Pills */}
      <div className="bg-slate-100/80 dark:bg-slate-800/80 p-1 sm:p-1.5 rounded-2xl mb-5 sm:mb-6 overflow-x-auto flex gap-1.5 custom-scrollbar border border-slate-200/60 dark:border-slate-700/60">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all shrink-0 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 font-black'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <tab.icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${activeTab === tab.id ? 'text-white' : 'text-slate-400'}`} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <SettingsCard
              title="General Information"
              description="Basic system identity settings."
              icon={Type}
            >
              <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">System Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. IP Monitor"
                    value={localSettings.systemName || ''}
                    onChange={(e) => updateSetting('systemName', e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    This name will appear in the dashboard header and browser tab title.
                  </p>
              </div>
            </SettingsCard>

            <SettingsCard
              title="Security (Admin PIN)"
              description="Protect settings from unauthorized changes."
              icon={ShieldCheck}
              variant="highlight"
            >
              <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Admin PIN</label>
                  <div className="relative">
                    <input 
                      type={showPin ? "text" : "password"}
                      placeholder="Set 4-6 digit PIN"
                      value={localSettings.adminPin || ''}
                      onChange={(e) => updateSetting('adminPin', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors font-mono tracking-widest"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-500"
                    >
                      {showPin ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    Leave empty to disable PIN lock. If set, you must enter it to access this page.
                  </p>
              </div>
            </SettingsCard>
          </div>
        )}

        {/* Top Grid: Monitoring & Simulation */}
        {activeTab === 'monitoring' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            
            {/* Main Monitoring Panel */}
            <div className="xl:col-span-8">
              <SettingsCard
                title="Monitoring Thresholds"
                description="Configure how strictly the system monitors device latency and availability."
                icon={Activity}
                className="h-full"
                variant="highlight"
              >
                <div className="grid md:grid-cols-2 gap-8">
                  <RangeSlider 
                    label="Ping Interval" 
                    value={localSettings.pingInterval} 
                    min={1} max={60} unit="s" 
                    onChange={(v) => updateSetting('pingInterval', v)}
                  />
                  
                  <RangeSlider 
                    label="Latency Warning" 
                    value={localSettings.warningThreshold} 
                    min={50} max={1000} unit="ms" 
                    onChange={(v) => updateSetting('warningThreshold', v)}
                    colorClass="accent-amber-500"
                  />

                  <div className="col-span-full pt-2">
                    <div className="p-4 rounded-xl bg-white/50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                          Request Timeout
                        </label>
                        <div className="flex items-center gap-4">
                          <input 
                            type="number"
                            value={localSettings.timeoutThreshold}
                            onChange={(e) => updateSetting('timeoutThreshold', parseInt(e.target.value))}
                            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
                          />
                          <span className="text-sm text-slate-500">milliseconds</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                          Time to wait for a response before considering the device offline.
                        </p>
                    </div>
                  </div>
                </div>
              </SettingsCard>
            </div>

            {/* Real Production Probe Engine Status Panel */}
            <div className="xl:col-span-4">
              <SettingsCard
                title="Production Probe Engine"
                description="ระบบตรวจสอบสถานะเครือข่ายจริงแบบ Multi-Stage"
                icon={Zap}
                className="h-full"
              >
                <div className="space-y-3">
                  <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="font-bold">Real ICMP & TCP Probe Active (v3.5.0)</p>
                      <p className="mt-1 text-emerald-700/80 dark:text-emerald-400/80 leading-relaxed">
                        ทำงานด้วย ICMP Ping จริง ควบคู่ TCP Port Probe พร้อมระบบ Double-Check Retry ป้องกันการแจ้งเตือนหลอก (False Offline)
                      </p>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/70 rounded-xl text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
                    <div className="flex justify-between">
                      <span>โหมดการทำงาน:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">100% Real Network (No Mockup)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Concurrent Workers:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">20 Probes / Batch</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Anti-False-Positive:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">Auto Retry 350ms</span>
                    </div>
                  </div>
                </div>
              </SettingsCard>
            </div>
          </div>
        )}

        {/* Data Retention Tab */}
        {activeTab === 'data' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
           {/* Data Retention */}
           <SettingsCard
              title="การเก็บรักษาข้อมูลประวัติ (Data Retention)"
              description="จัดการอายุและจำนวนรายการสูงสุดของประวัติเหตุการณ์ (Logs)"
              icon={Database}
           >
              <CustomToggle 
                  label="ลบประวัติเก่าอัตโนมัติ (Auto-Delete Logs)"
                  checked={localSettings.enableAutoDelete}
                  onChange={(v) => updateSetting('enableAutoDelete', v)}
                  icon={Clock}
              />

              <div className={`space-y-4 transition-all duration-300 ${localSettings.enableAutoDelete ? 'opacity-100' : 'opacity-40 pointer-events-none grayscale'}`}>
                 <RangeSlider 
                    label="ระยะเวลาเก็บประวัติ (Retention Period)" 
                    value={localSettings.logRetentionDays} 
                    min={1} max={90} unit=" วัน" 
                    onChange={(v) => updateSetting('logRetentionDays', v)}
                    colorClass="accent-emerald-500"
                  />
                  
                  <div>
                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">จำนวนบันทึกสูงสุด (Max Log Entries)</label>
                    <select 
                      value={localSettings.maxLogEntries}
                      onChange={(e) => updateSetting('maxLogEntries', parseInt(e.target.value))}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                       <option value={100}>100 รายการ</option>
                       <option value={500}>500 รายการ</option>
                       <option value={1000}>1,000 รายการ</option>
                       <option value={5000}>5,000 รายการ</option>
                    </select>
                  </div>
              </div>
           </SettingsCard>

           <SettingsCard
              title="สำรองและส่งออกรายงาน (Backup & Export)"
              description="สามารถส่งออกรายงาน PDF / Excel ได้ที่เมนูประวัติการทำงาน หรือสำรองฐานข้อมูล JSON ได้ที่แท็บการบำรุงรักษา"
              icon={FileJson}
              variant="info"
           >
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  ระบบบันทึกข้อมูลอุปกรณ์ (<code className="font-mono font-bold">devices.json</code>), ประวัติเหตุการณ์ (<code className="font-mono font-bold">logs.json</code>) และการตั้งค่า (<code className="font-mono font-bold">settings.json</code>) แบบ <strong>Atomic Write พร้อมไฟล์สำรองอัตโนมัติ (.bak)</strong> ป้องกันข้อมูลสูญหายกรณีไฟดับหรือเครื่องรีสตาร์ท
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleBackup}
                    className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    ดาวน์โหลดไฟล์สำรองข้อมูลระบบ (.JSON)
                  </button>
                </div>
              </div>
           </SettingsCard>
          </div>
        )}

        {/* Notifications & LINE Alerts Tab */}
        {activeTab === 'notifications' && (
          <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
           {/* Notifications */}
           <SettingsCard
              title="Notifications & LINE Alerts"
              description="ตั้งค่าการแจ้งเตือนผ่าน LINE Messaging API, Webhook, และเสียงแจ้งเตือนเมื่ออุปกรณ์มีปัญหา"
              icon={Bell}
           >
              <div className="space-y-4 mb-6">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Alert Triggers (เงื่อนไขการแจ้งเตือน)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <CustomToggle 
                      label="Offline Alert (OUTAGE)"
                      description="แจ้งเตือนเมื่ออุปกรณ์ออฟไลน์"
                      checked={localSettings.notifyOutage === true}
                      onChange={(v) => updateSetting('notifyOutage', v)}
                      icon={ShieldAlert}
                  />

                  <CustomToggle 
                      label="Recovery Alert (RECOVERY)"
                      description="แจ้งเตือนเมื่ออุปกรณ์ออนไลน์อีกครั้ง"
                      checked={localSettings.notifyRecovery === true}
                      onChange={(v) => updateSetting('notifyRecovery', v)}
                      icon={CheckCircle2}
                  />

                  <CustomToggle 
                      label="Latency Alert (WARNING)"
                      description="แจ้งเตือนเมื่ออุปกรณ์ล่าช้า/ความหน่วงสูง"
                      checked={localSettings.notifyWarning === true}
                      onChange={(v) => updateSetting('notifyWarning', v)}
                      icon={AlertTriangle}
                  />

                  <CustomToggle 
                      label="Save Latency to Logs"
                      description="บันทึกประวัติความหน่วงสูงลงในระบบ"
                      checked={localSettings.enableLatencyLogs === true}
                      onChange={(v) => updateSetting('enableLatencyLogs', v)}
                      icon={Activity}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                 <CustomToggle 
                     label="Sound Alerts"
                     description="Play audio on Critical/Offline events"
                     checked={localSettings.enableSoundAlerts}
                     onChange={(v) => updateSetting('enableSoundAlerts', v)}
                     icon={Volume2}
                 />
              </div>

              {/* Sound Selection UI */}
              <div className={`mt-4 space-y-3 transition-opacity duration-300 ${localSettings.enableSoundAlerts ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                 <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                    Alert Sound Style
                 </label>
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SOUND_PRESETS.map((preset) => (
                       <div 
                          key={preset.name}
                          onClick={() => updateSetting('alertSoundUrl', preset.url)}
                          className={`
                            cursor-pointer px-3 py-2 rounded-lg text-sm border flex items-center justify-between
                            ${localSettings.alertSoundUrl === preset.url 
                              ? 'bg-blue-600 text-white border-blue-600' 
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400'}
                          `}
                       >
                          <span>{preset.name}</span>
                          {localSettings.alertSoundUrl === preset.url && <CheckCircle2 className="w-4 h-4" />}
                       </div>
                    ))}
                 </div>
                 
                 <div className="flex gap-2 items-center mt-2">
                    <input 
                       type="text" 
                       placeholder="Or paste custom MP3 URL..."
                       value={localSettings.alertSoundUrl}
                       onChange={(e) => updateSetting('alertSoundUrl', e.target.value)}
                       className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-900 dark:text-white outline-none"
                    />
                    <button 
                       type="button" 
                       onClick={playPreviewSound}
                       className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50"
                       title="Test Sound"
                    >
                       <Play className="w-4 h-4" />
                    </button>
                 </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-700">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300">
                     Webhook URL (MS Teams / Slack / Discord / Power Automate)
                  </label>
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={isTestingWebhook}
                    className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm self-start sm:self-auto"
                  >
                    {isTestingWebhook ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 text-blue-600 dark:text-blue-400" />}
                    ทดสอบส่ง Webhook (Test Alert)
                  </button>
                </div>
                <input 
                   type="text" 
                   placeholder="https://default... หรือ https://hooks.slack.com/services/..."
                   value={localSettings.alertWebhookUrl || ''}
                   onChange={(e) => updateSetting('alertWebhookUrl', e.target.value)}
                   className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors font-mono text-xs"
                />
                <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                   <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                   รองรับ MS Teams (Workflows / Power Automate), Slack, และ Adaptive Cards
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-700 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    LINE Messaging API Credentials
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTestLineAlert}
                      disabled={isTestingLineAlert}
                      className="px-3 py-1.5 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs font-bold hover:bg-emerald-200 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm"
                    >
                      {isTestingLineAlert ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 text-emerald-600" />}
                      ทดสอบส่งแจ้งเตือนด่วน (Test Alert)
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                     Channel Access Token (Long-lived)
                  </label>
                  <input 
                     type="password" 
                     placeholder="Enter your Channel Access Token..."
                     value={localSettings.lineNotifyToken || ''}
                     onChange={(e) => updateSetting('lineNotifyToken', e.target.value)}
                     className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                     User ID / Group ID (เริ่มต้นด้วย U... หรือ C...)
                  </label>
                  <input 
                     type="text" 
                     placeholder="เช่น U1234567890abcdef1234567890abcdef"
                     value={localSettings.lineUserId || ''}
                     onChange={(e) => updateSetting('lineUserId', e.target.value)}
                     className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors font-mono text-xs"
                  />
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 mt-2">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                      แจ้งเตือนเหตุการณ์ด่วนเมื่อเครื่องดับ/กลับมาติด (Real-time Event Alert)
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                      หากเปิดไว้ LINE จะส่งการ์ดแจ้งเตือนทันทีที่มีอุปกรณ์ Outage หรือ Recovery
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input 
                      type="checkbox"
                      checked={localSettings.enableLineInstantAlerts === true}
                      onChange={(e) => updateSetting('enableLineInstantAlerts', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                  </label>
                </div>
                {/* LINE TROUBLESHOOTING & HELP BOX */}
                <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/50 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-bold">
                    <Info className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>ข้อแนะนำ & วิธีแก้ปัญหาเมื่อ LINE แจ้งเตือนไม่ส่ง / ส่งไม่ผ่าน</span>
                  </div>
                  <ul className="space-y-1.5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 pl-5 list-disc leading-relaxed">
                    <li>
                      <strong className="text-slate-800 dark:text-slate-100">กรณีใช้ LINE ร่วมกับระบบอื่น:</strong> บัญชี LINE Official Account แพ็กเกจฟรีจะมีโควต้า <strong>200 ข้อความ/เดือน</strong> (Push API) หากมีหลายระบบยิงพร้อมกัน โควต้าอาจเต็มได้
                    </li>
                    <li>
                      <strong className="text-slate-800 dark:text-slate-100">ผู้รับเป็นบุคคล (User ID ขึ้นต้นด้วย U...):</strong> ผู้ใช้งาน<strong>ต้องเคยกดเพิ่มเพื่อน (Add Friend)</strong> กับบอทของ Channel นี้ก่อนเสมอ LINE จึงจะยอมให้ส่ง
                    </li>
                    <li>
                      <strong className="text-slate-800 dark:text-slate-100">ผู้รับเป็นกลุ่ม (Group ID ขึ้นต้นด้วย C...):</strong> ต้อง<strong>เชิญบอทเข้ากลุ่ม LINE</strong> นั้นด้วย
                    </li>
                    <li>
                      <strong className="text-slate-800 dark:text-slate-100">Channel Access Token:</strong> ต้องเป็น <strong>Long-lived token</strong> จากแท็บ <em>Messaging API</em> ใน LINE Developers เท่านั้น (ไม่ใช่ LINE Notify Token)
                    </li>
                  </ul>
                </div>

                {/* TELEGRAM BOT NOTIFICATION */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <Send className="w-4 h-4 text-blue-500" />
                      Telegram Bot Alert Configuration
                    </h4>
                    <button
                      type="button"
                      onClick={handleTestTelegram}
                      disabled={isTestingTelegram}
                      className="px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded-lg text-xs font-bold hover:bg-blue-200 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isTestingTelegram ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      ทดสอบ Telegram
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Telegram Bot Token
                      </label>
                      <input 
                        type="password"
                        placeholder="123456789:ABCdefGhIJKlmNoPQ..."
                        value={localSettings.telegramBotToken || ''}
                        onChange={(e) => updateSetting('telegramBotToken', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Telegram Chat ID
                      </label>
                      <input 
                        type="text"
                        placeholder="-1001234567890 หรือ @channel"
                        value={localSettings.telegramChatId || ''}
                        onChange={(e) => updateSetting('telegramChatId', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* DISCORD WEBHOOK NOTIFICATION */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-indigo-500" />
                      Discord Webhook Alert Configuration
                    </h4>
                    <button
                      type="button"
                      onClick={handleTestDiscord}
                      disabled={isTestingDiscord}
                      className="px-3 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 rounded-lg text-xs font-bold hover:bg-indigo-200 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isTestingDiscord ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      ทดสอบ Discord
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Discord Webhook URL
                    </label>
                    <input 
                      type="text"
                      placeholder="https://discord.com/api/webhooks/..."
                      value={localSettings.discordWebhookUrl || ''}
                      onChange={(e) => updateSetting('discordWebhookUrl', e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* LINE Scheduled Summary Report Configuration */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800">
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white p-4 sm:p-5 shadow-xl border border-blue-400/30">
                    {/* Background glow effects */}
                    <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-indigo-400/20 rounded-full blur-2xl pointer-events-none" />

                    {/* Header Banner */}
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/15">
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-md border border-white/20 shrink-0 font-bold">
                          <MessageSquare className="w-5 h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm sm:text-base font-black text-white tracking-tight leading-snug">
                              รายงานสรุปสถานะ LINE Flex Message
                            </h4>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-white/20 text-white border border-white/30 backdrop-blur-sm shadow-sm shrink-0">
                              Flex Card
                            </span>
                          </div>
                          <p className="text-xs text-blue-100/90 mt-1 leading-relaxed">
                            ส่งการ์ดสรุปสถานะเครื่องเปิด/ปิดแยกหมวดหมู่ ส่งเข้า LINE บอทอัตโนมัติ
                          </p>
                        </div>
                      </div>

                      {/* Toggle Switch */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10 sm:border-none">
                        <span className="text-xs font-bold text-blue-100 sm:hidden">เปิดใช้งานรายงาน:</span>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input 
                            type="checkbox"
                            checked={localSettings.enableLineSummaryReport === true}
                            onChange={(e) => updateSetting('enableLineSummaryReport', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-black/30 border border-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-400 shadow-inner"></div>
                        </label>
                      </div>
                    </div>

                    {localSettings.enableLineSummaryReport && (
                      <div className="relative z-10 mt-4 space-y-3 pt-1 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Compact Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Frequency Selector */}
                          <div className="bg-black/20 backdrop-blur-md rounded-xl p-3 border border-white/15 shadow-inner">
                            <label className="block text-[11px] font-bold text-blue-100 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5 text-blue-200 shrink-0" />
                              รอบการส่งรายงาน
                            </label>
                            <select 
                              value={localSettings.lineSummaryType || 'daily'}
                              onChange={(e) => updateSetting('lineSummaryType', e.target.value as any)}
                              className="w-full bg-slate-900/90 sm:bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-xs text-white focus:border-white focus:ring-1 focus:ring-white outline-none transition-all cursor-pointer font-medium"
                            >
                              <option value="daily" className="bg-slate-800 text-white">📅 รายวัน (ส่งทุกวันตามเวลา)</option>
                              <option value="monthly" className="bg-slate-800 text-white">📆 รายเดือน (ส่งเฉพาะวันที่ระบุ)</option>
                              <option value="both" className="bg-slate-800 text-white">🔄 ทั้งรายวัน และ รายเดือน</option>
                            </select>
                          </div>

                          {/* Time Input */}
                          <div className="bg-black/20 backdrop-blur-md rounded-xl p-3 border border-white/15 shadow-inner">
                            <label className="block text-[11px] font-bold text-blue-100 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-blue-200 shrink-0" />
                              ตั้งเวลาส่งรายงาน (HH:mm)
                            </label>
                            <input 
                              type="time" 
                              value={localSettings.lineSummaryTime || '16:30'}
                              onChange={(e) => updateSetting('lineSummaryTime', e.target.value)}
                              className="w-full bg-slate-900/90 sm:bg-black/40 border border-white/20 rounded-lg px-3 py-2 text-xs text-white font-mono font-bold focus:border-white focus:ring-1 focus:ring-white outline-none transition-all"
                            />
                          </div>
                        </div>

                        {/* Monthly Day Setting (If applicable) */}
                        {(localSettings.lineSummaryType === 'monthly' || localSettings.lineSummaryType === 'both') && (
                          <div className="bg-black/20 backdrop-blur-md rounded-xl p-3 border border-white/15 shadow-inner flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <label className="text-xs font-semibold text-blue-100 flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-blue-200 shrink-0" />
                              วันที่ส่งรายงานประจำเดือน (วันที่ 1 - 31):
                            </label>
                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <span className="text-xs text-blue-200">วันที่</span>
                              <input 
                                type="number" 
                                min={1}
                                max={31}
                                value={localSettings.lineSummaryMonthlyDay || 1}
                                onChange={(e) => updateSetting('lineSummaryMonthlyDay', parseInt(e.target.value) || 1)}
                                className="w-20 bg-slate-900/90 sm:bg-black/40 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white text-center font-bold focus:border-white focus:ring-1 focus:ring-white outline-none"
                              />
                            </div>
                          </div>
                        )}

                        {/* Action Bar */}
                        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-white/15">
                          <span className="text-[11px] text-blue-100/90 flex items-center gap-1.5 font-medium leading-tight">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                            แสดงรายการครบทุกเครื่อง (รวม 28+ เครื่อง) ไม่ตัดทอน
                          </span>
                          <button 
                            type="button"
                            onClick={handleTestLineFlex}
                            disabled={isTestingLineFlex}
                            className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-blue-50 text-blue-700 active:scale-95 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-black/10 disabled:opacity-50 transition-all cursor-pointer shrink-0"
                          >
                            {isTestingLineFlex ? <Activity className="w-3.5 h-3.5 animate-spin text-blue-700" /> : <Play className="w-3.5 h-3.5 text-blue-700 fill-blue-700" />}
                            ทดสอบส่งรายงานสรุป LINE ทันที
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
           </SettingsCard>
        </div>
        )}

        {/* Google Sheets Sync Settings */}
        {activeTab === 'gas' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Left Column: Config Panel */}
            <div className="xl:col-span-6 space-y-6">
              <SettingsCard
                title="Google Sheets & Apps Script Integration"
                description="ซิงก์ข้อมูลสถานะอุปกรณ์และ Log เหตุการณ์เข้า Google Sheet โดยอัตโนมัติผ่าน Apps Script Web App"
                icon={Cloud}
                variant="highlight"
              >
                <div className="space-y-6">
                  <CustomToggle
                    label="เปิดใช้งาน Google Apps Script Sync"
                    description="เมื่อมีเหตุการณ์ อุปกรณ์จะส่งข้อมูลไปยังชีตโดยอัตโนมัติ"
                    checked={localSettings.enableGasSync === true}
                    onChange={(v) => updateSetting('enableGasSync', v)}
                    icon={Activity}
                  />

                  <div className={`space-y-4 pt-2 border-t border-slate-100 dark:border-slate-700 transition-all duration-300 ${localSettings.enableGasSync ? 'opacity-100' : 'opacity-50 pointer-events-none grayscale'}`}>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        Google Apps Script Web App URL
                      </label>
                      <input
                        type="text"
                        placeholder="https://script.google.com/macros/s/XXXXX/exec"
                        value={localSettings.gasWebAppUrl || ''}
                        onChange={(e) => updateSetting('gasWebAppUrl', e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-colors"
                      />
                      <p className="text-xs text-slate-400 mt-2">
                        วาง URL ของเว็บแอปที่ได้จากการเผยแพร่ (Deploy) โค้ดใน Google Apps Script
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      <CustomToggle
                        label="ซิงก์ข้อมูลอุปกรณ์"
                        description="เขียนทับข้อมูลอุปกรณ์ในหน้าชีต Devices ทุกครั้งที่ซิงก์"
                        checked={localSettings.syncDevicesToGas !== false}
                        onChange={(v) => updateSetting('syncDevicesToGas', v)}
                        icon={Server}
                      />

                      <CustomToggle
                        label="ซิงก์ข้อมูล Log ประวัติ"
                        description="อัปเดตข้อมูลประวัติเหตุการณ์ในหน้าชีต Device Events"
                        checked={localSettings.syncLogsToGas !== false}
                        onChange={(v) => updateSetting('syncLogsToGas', v)}
                        icon={Database}
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleTestGas}
                      disabled={isTestingGas}
                      className="px-4 py-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/50 text-xs font-bold flex items-center gap-2 disabled:opacity-50 transition-colors"
                    >
                      {isTestingGas ? <Activity className="w-4.5 h-4.5 animate-spin" /> : <Play className="w-4.5 h-4.5" />}
                      ทดสอบการเชื่อมต่อ (Test Connection)
                    </button>

                    <button
                      type="button"
                      onClick={handleSyncGas}
                      disabled={isSyncingGas || !localSettings.gasWebAppUrl}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50 disabled:hover:bg-emerald-600 shadow-md shadow-emerald-600/10 transition-all"
                    >
                      {isSyncingGas ? <Activity className="w-4.5 h-4.5 animate-spin" /> : <RefreshCw className="w-4.5 h-4.5" />}
                      ซิงก์ข้อมูลทั้งหมด (Sync Now)
                    </button>
                  </div>
                </div>
              </SettingsCard>
            </div>

            {/* Right Column: Code and Setup Instructions */}
            <div className="xl:col-span-6 space-y-6">
              <SettingsCard
                title="วิธีการติดตั้ง Google Apps Script"
                description="ทำตามขั้นตอนต่อไปนี้เพื่อเชื่อมโยงระบบ E-Board เข้ากับ Google Spreadsheet ของคุณ"
                icon={Code}
              >
                <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
                  <ol className="list-decimal pl-5 space-y-2 text-xs leading-relaxed">
                    <li>สร้าง <b>Google Sheet</b> แผ่นใหม่ขึ้นมา</li>
                    <li>ไปที่เมนู <b>ส่วนขยาย (Extensions)</b> &gt; <b>Apps Script</b></li>
                    <li>ลบโค้ดเดิมทั้งหมดในไฟล์ <code className="font-mono bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-red-600">รหัส.gs</code> ออก</li>
                    <li>คัดลอกโค้ดต้นแบบด้านล่างนี้ไปวางลงในหน้าต่างโปรเจกต์</li>
                    <li>กดไอคอนบันทึก 💾 หรือปุ่ม <code className="font-mono bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded">Ctrl + S</code></li>
                    <li>คลิกที่ปุ่ม <b>การทำให้ใช้งานได้ (Deploy)</b> &gt; <b>การทำให้ใช้งานได้ใหม่ (New deployment)</b></li>
                    <li>เลือกประเภทเป็น <b>เว็บแอป (Web App)</b></li>
                    <li>ตั้งค่าในหน้าต่าง Deployment:
                      <ul className="list-disc pl-5 mt-1 space-y-1">
                        <li>เรียกใช้งานในฐานะ: <b>ฉัน (อีเมลของคุณ)</b></li>
                        <li>ผู้มีสิทธิ์เข้าถึง: <b>ทุกคน (Anyone)</b> <span className="text-red-500 font-bold">(สำคัญมาก!)</span></li>
                      </ul>
                    </li>
                    <li>คลิกปุ่ม <b>ทำให้ใช้งานได้ (Deploy)</b> และให้สิทธิ์เข้าถึงบัญชี (Authorize Access) หากระบบร้องขอ</li>
                    <li>คัดลอก <b>URL ของเว็บแอป (Web App URL)</b> นำมาใส่ในช่องตั้งค่าด้านซ้าย</li>
                  </ol>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">โค้ดต้นแบบ Google Apps Script (Apps Script Code)</span>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'คัดลอกแล้ว!' : 'คัดลอกโค้ด'}
                      </button>
                    </div>

                    <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950">
                      <pre className="p-4 text-xs font-mono text-emerald-400 overflow-auto max-h-[250px] leading-relaxed custom-scrollbar whitespace-pre">
                        {GAS_TEMPLATE_CODE}
                      </pre>
                    </div>
                  </div>
                </div>
              </SettingsCard>
            </div>
          </div>
        )}

        {/* Configuration Management (Backup/Restore & 1-Click Update) */}
        {activeTab === 'maintenance' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <SettingsCard
              title="อัปเดตระบบอัตโนมัติในคลิกเดียว (1-Click Auto Update)"
              description="ดึงโค้ดเวอร์ชันล่าสุดจาก GitHub ที่ซิงก์กับ AI Studio มาติดตั้งและรีสตาร์ตเซิร์ฟเวอร์ทันที (ข้อมูลอุปกรณ์และการตั้งค่าเดิมไม่หาย)"
              icon={RefreshCw}
              variant="info"
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    GitHub Repository URL (ลิงก์โปรเจกต์ที่กด Export/Sync จาก AI Studio)
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={gitRepoUrl}
                      onChange={(e) => setGitRepoUrl(e.target.value)}
                      placeholder="https://github.com/ชื่อผู้ใช้ของคุณ/eboard-monitor.git"
                      className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={handleSelfUpdate}
                      disabled={isSelfUpdating}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSelfUpdating ? 'animate-spin' : ''}`} />
                      <span>{isSelfUpdating ? 'กำลังดึงโค้ด & Build ระบบใหม่...' : 'ดึงอัปเดตล่าสุด & รีสตาร์ตทันที'}</span>
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {gitLastCommit && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      เวอร์ชัน Git ล่าสุดบนเครื่อง: {gitLastCommit}
                    </p>
                  )}
                  {dailyBackupsInfo.count > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                      สำรองข้อมูลรายวันอัตโนมัติ: {dailyBackupsInfo.count}/7 วัน (ล่าสุด {dailyBackupsInfo.latest})
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 p-3.5 rounded-xl border border-slate-200/70 dark:border-slate-800 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <p className="font-bold text-slate-700 dark:text-slate-300">วิธีใช้งานให้ซิงก์จาก AI Studio ลงเครื่องจริงไวที่สุด:</p>
                    <button
                      type="button"
                      onClick={handleCopyUnlockCmd}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-700 dark:text-amber-300 rounded-lg font-bold text-xs transition-colors cursor-pointer self-start sm:self-auto"
                    >
                      {copiedCmd ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCmd ? 'คัดลอกคำสั่ง CMD แล้ว!' : 'คัดลอกคำสั่งปลดล็อก Port 3000 (สำหรับรันใน CMD ครั้งแรก)'}</span>
                    </button>
                  </div>
                  <p>1. บนหน้าเว็บ AI Studio กดไอคอน <b>GitHub</b> ด้านบนขวาเพื่อซิงก์โค้ดขึ้น <code className="font-mono">suphol4726/eboard-monitor</code></p>
                  <p>2. กดปุ่ม <b>"ดึงอัปเดตล่าสุด & รีสตาร์ตทันที"</b> ด้านบน ระบบจะดึงโค้ดใหม่ สั่ง Build และรีสตาร์ต PM2 เองโดยรักษาไฟล์ <code className="font-mono">devices.json</code>, <code className="font-mono">settings.json</code> และ <code className="font-mono">logs.json</code> เดิมไว้ 100%</p>
                  <p className="text-amber-600 dark:text-amber-400">หมายเหตุ: หากกดครั้งแรกแล้วขึ้น <b>API route not found</b> แปลว่าโปรเซส Node ตัวเก่ายังค้างยึด Port 3000 อยู่ ให้กดปุ่มสีเหลืองด้านขวาเพื่อคัดลอกคำสั่งไปวางใน CMD เพียงครั้งเดียว หรือดับเบิลคลิกไฟล์ <code className="font-mono">update-windows.bat</code> ครับ</p>
                </div>
              </div>
            </SettingsCard>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <SettingsCard
                title="Configuration Backup"
                description="Export or restore your system settings and device inventory."
                icon={FileJson}
                variant="info"
              >
              <div className="flex flex-col sm:flex-row gap-4">
                 <button 
                    type="button"
                    onClick={handleBackup}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold transition-all"
                 >
                    <Download className="w-5 h-5" />
                    Backup Config
                 </button>
                 
                 <button 
                    type="button"
                    onClick={handleRestoreClick}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold transition-all"
                 >
                    <Upload className="w-5 h-5" />
                    Restore Config
                 </button>
                 <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    className="hidden" 
                    accept=".json" 
                 />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                 Generated files include all devices, monitoring thresholds, and notification settings.
              </p>
           </SettingsCard>

           <SettingsCard
              title="Generated Reports"
              description="History of automated and manual reports."
              icon={Download}
              variant="default"
           >
              <div className="max-h-[200px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                 {reports.length > 0 ? reports.map((report) => (
                   <div key={report.name} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl group hover:border-blue-300 transition-all">
                      <div className="flex items-center gap-3">
                         <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                            <FileJson className="w-4 h-4" />
                         </div>
                         <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">{report.name}</p>
                            <p className="text-[10px] text-slate-500">{new Date(report.date).toLocaleDateString()} · {(report.size / 1024).toFixed(1)} KB</p>
                         </div>
                      </div>
                      <a 
                        href={`/api/reports/${report.name}`}
                        download
                        className="p-2 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                         <Download className="w-4 h-4" />
                      </a>
                   </div>
                 )) : (
                   <div className="text-center py-8">
                      <p className="text-xs text-slate-500 italic">No reports generated yet.</p>
                   </div>
                 )}
              </div>
              <div className="pt-2 flex justify-center">
                 <button 
                   type="button"
                   onClick={fetchReports}
                   className="text-[10px] font-bold text-blue-600 hover:underline"
                 >
                   Refresh List
                 </button>
              </div>
           </SettingsCard>
           </div>
        </div>
        )}

        {/* Danger Zone */}
        {activeTab === 'maintenance' && (
          <SettingsCard
             title="Danger Zone"
             description="Destructive actions and administrative operations."
             icon={ShieldAlert}
             variant="danger"
             className="border-dashed border-2 animate-in fade-in slide-in-from-bottom-4 duration-300"
          >
             <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-red-100 dark:border-red-900/30">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-full text-red-600">
                      <Trash2 className="w-5 h-5" />
                   </div>
                   <div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-200">Clear All Logs</h4>
                      <p className="text-xs text-slate-500">Permanently remove all recorded downtime history.</p>
                   </div>
                </div>
                <button 
                   type="button"
                   onClick={handleClearLogsClick}
                   className="w-full sm:w-auto px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm transition-colors shadow-lg shadow-red-600/20"
                >
                   Delete Data
                </button>
             </div>

             <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-900/30 mt-4">
                <div className="flex items-center gap-3">
                   <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-full text-amber-600">
                      <Zap className="w-5 h-5" />
                   </div>
                   <div>
                      <h4 className="font-bold text-slate-800 dark:text-slate-200">Restart Server Engine</h4>
                      <p className="text-xs text-slate-500">Reboot the background monitoring daemon. Perfect for resetting sockets, ARP caches, and schedules.</p>
                   </div>
                </div>
                <button 
                   type="button"
                   onClick={handleRestartServerClick}
                   className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-sm transition-colors shadow-lg shadow-amber-600/20"
                >
                   Restart Server
                </button>
             </div>
          </SettingsCard>
        )}

        {/* Sticky Action Bar */}
        <div className={`fixed bottom-20 md:bottom-6 left-1/2 transform -translate-x-1/2 z-40 w-[94vw] sm:w-auto max-w-lg transition-all duration-500 ${isDirty ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'}`}>
          <div className="bg-slate-900/95 dark:bg-white/95 backdrop-blur-md text-white dark:text-slate-900 px-4 py-2.5 sm:px-6 sm:py-3 rounded-2xl sm:rounded-full shadow-2xl flex items-center justify-between sm:justify-start gap-3 sm:gap-4 border border-slate-700/80 dark:border-slate-200/80">
            <span className="text-xs sm:text-sm font-bold truncate">มีการเปลี่ยนแปลงที่ยังไม่บันทึก</span>
            <div className="h-4 w-px bg-slate-600 dark:bg-slate-300 shrink-0"></div>
            <div className="flex items-center gap-2 shrink-0">
              <button 
                type="button" 
                onClick={() => {
                  setLocalSettings(settings); // Reset
                  setIsDirty(false);
                }}
                className="text-xs sm:text-sm text-slate-300 dark:text-slate-500 hover:text-white dark:hover:text-slate-900 font-medium px-2 py-1 rounded-lg transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <MotionButton 
                type="submit" 
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white px-4 py-1.5 sm:px-5 sm:py-2 rounded-xl sm:rounded-full text-xs sm:text-sm font-black shadow-lg shadow-blue-600/30 transition-all cursor-pointer whitespace-nowrap"
              >
                บันทึกการตั้งค่า
              </MotionButton>
            </div>
          </div>
        </div>

      </form>
    </div>
  );
};
