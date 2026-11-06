import html2pdf from 'html2pdf.js';
import { Device, DeviceStatus, DowntimeLog, formatLocation } from '../types';

export interface ExportReportParams {
  systemName: string;
  devices: Device[];
  logs: DowntimeLog[];
  aiSummaryText?: string;
  periodLabel?: string;
  elementToCapture?: HTMLElement;
}

export const generateExecutiveReportHtml = ({
  systemName,
  devices,
  logs,
  aiSummaryText,
  periodLabel = 'ข้อมูลเรียลไทม์ล่าสุด'
}: ExportReportParams): string => {
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
    minute: '2-digit',
    second: '2-digit'
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

  // Group by location for summary statistics
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

  return `
    <div class="executive-report-document" style="
      font-family: 'Kanit', 'Prompt', 'Sarabun', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      padding: 16px 20px;
      line-height: 1.5;
      box-sizing: border-box;
      width: 100%;
      max-width: 860px;
      margin: 0 auto;
    ">
      <!-- 1. Header Banner -->
      <div style="
        background: linear-gradient(135deg, #1e3a8a 0%, #1e1b4b 100%);
        border-radius: 12px;
        padding: 18px 20px;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
        box-sizing: border-box;
      ">
        <div style="display: flex; align-items: center; gap: 14px; flex: 1;">
          <div style="
            width: 50px;
            height: 50px;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          ">
            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#67e8f9" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
              <span style="background: rgba(255,255,255,0.22); color: #93c5fd; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; letter-spacing: 0.5px; border: 1px solid rgba(255,255,255,0.25); white-space: nowrap;">
                EXECUTIVE REPORT
              </span>
              <span style="color: #bfdbfe; font-size: 11px; font-weight: 500;">
                ระบบตรวจจับเครือข่าย & จออัจฉริยะ (${periodLabel})
              </span>
            </div>
            <h1 style="margin: 0; font-size: 19px; font-weight: 800; color: #ffffff; line-height: 1.3;">
              ${systemName || 'E-Board'} - สรุปสถานะการทำงานระบบ
            </h1>
            <p style="margin: 3px 0 0 0; font-size: 11px; color: #cbd5e1; line-height: 1.3;">
              โรงเรียนสาธิต มศว ประสานมิตร (ฝ่ายมัธยม) • แผนกเทคโนโลยีสารสนเทศ
            </p>
          </div>
        </div>
        <div style="text-align: right; background: rgba(255,255,255,0.12); padding: 8px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.2); flex-shrink: 0; min-width: 140px; box-sizing: border-box;">
          <div style="font-size: 10px; color: #93c5fd; font-weight: 600; margin-bottom: 2px; white-space: nowrap;">วันที่ออกรายงาน</div>
          <div style="font-size: 11.5px; font-weight: 700; color: #ffffff; white-space: nowrap; line-height: 1.3;">${dateStr}</div>
          <div style="font-size: 10.5px; color: #cbd5e1; margin-top: 2px; white-space: nowrap;">เวลา ${timeStr} น.</div>
        </div>
      </div>

      <!-- 2. Modern 4-Stats Cards Grid -->
      <div style="
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        margin-bottom: 16px;
      ">
        <!-- Card 1: Total -->
        <div style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 10px 12px;
          border-left: 4px solid #3b82f6;
          box-sizing: border-box;
        ">
          <div style="font-size: 10.5px; font-weight: 600; color: #64748b; margin-bottom: 2px; display: flex; align-items: center; justify-content: space-between;">
            <span>อุปกรณ์ทั้งหมด</span>
            <span style="font-size: 12px;">📦</span>
          </div>
          <div style="font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.2;">
            ${total} <span style="font-size: 11px; font-weight: 600; color: #64748b;">เครื่อง</span>
          </div>
          <div style="font-size: 9.5px; color: #64748b; margin-top: 4px;">
            เปิดเฝ้าระวัง Active 100%
          </div>
        </div>

        <!-- Card 2: Online -->
        <div style="
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 10px;
          padding: 10px 12px;
          border-left: 4px solid #10b981;
          box-sizing: border-box;
        ">
          <div style="font-size: 10.5px; font-weight: 600; color: #166534; margin-bottom: 2px; display: flex; align-items: center; justify-content: space-between;">
            <span>สถานะออนไลน์</span>
            <span style="font-size: 12px;">🟢</span>
          </div>
          <div style="font-size: 20px; font-weight: 800; color: #059669; line-height: 1.2;">
            ${online} <span style="font-size: 11px; font-weight: 600; color: #166534;">เครื่อง</span>
          </div>
          <div style="font-size: 9.5px; color: #15803d; margin-top: 4px; font-weight: 600;">
            คิดเป็น ${onlinePct}% ${warning > 0 ? `(หน่วง ${warning})` : 'ของระบบ'}
          </div>
        </div>

        <!-- Card 3: Offline -->
        <div style="
          background: ${offline > 0 ? '#fef2f2' : '#f8fafc'};
          border: 1px solid ${offline > 0 ? '#fecaca' : '#e2e8f0'};
          border-radius: 10px;
          padding: 10px 12px;
          border-left: 4px solid ${offline > 0 ? '#ef4444' : '#94a3b8'};
          box-sizing: border-box;
        ">
          <div style="font-size: 10.5px; font-weight: 600; color: ${offline > 0 ? '#991b1b' : '#64748b'}; margin-bottom: 2px; display: flex; align-items: center; justify-content: space-between;">
            <span>สถานะออฟไลน์</span>
            <span style="font-size: 12px;">${offline > 0 ? '🔴' : '⚪'}</span>
          </div>
          <div style="font-size: 20px; font-weight: 800; color: ${offline > 0 ? '#dc2626' : '#64748b'}; line-height: 1.2;">
            ${offline} <span style="font-size: 11px; font-weight: 600; color: #991b1b;">เครื่อง</span>
          </div>
          <div style="font-size: 9.5px; color: ${offline > 0 ? '#b91c1c' : '#64748b'}; margin-top: 4px; font-weight: 600;">
            ${offline > 0 ? `พบปัญหา ${offlinePct}% (มีบันทึกหมายเหตุ)` : 'ไม่มีอุปกรณ์ขัดข้อง'}
          </div>
        </div>

        <!-- Card 4: SLA -->
        <div style="
          background: #eef2ff;
          border: 1px solid #c7d2fe;
          border-radius: 10px;
          padding: 10px 12px;
          border-left: 4px solid #6366f1;
          box-sizing: border-box;
        ">
          <div style="font-size: 10.5px; font-weight: 600; color: #3730a3; margin-bottom: 2px; display: flex; align-items: center; justify-content: space-between;">
            <span>SLA Uptime เฉลี่ย</span>
            <span style="font-size: 12px;">⚡</span>
          </div>
          <div style="font-size: 20px; font-weight: 800; color: #4f46e5; line-height: 1.2;">
            ${avgSla}<span style="font-size: 13px; font-weight: 700;">%</span>
          </div>
          <div style="width: 100%; height: 4px; background: #c7d2fe; border-radius: 2px; margin-top: 5px; overflow: hidden;">
            <div style="width: ${avgSla}%; height: 100%; background: #4f46e5; border-radius: 2px;"></div>
          </div>
        </div>
      </div>

      <!-- 3. AI & Executive Summary -->
      <div style="
        background: #f8fafc;
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 12px 16px;
        margin-bottom: 16px;
        box-sizing: border-box;
      ">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;">
          <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; display: flex; align-items: center; gap: 6px;">
            <span>🛡️</span> บทวิเคราะห์และข้อสรุปผู้บริหาร (Executive Insights)
          </div>
          <span style="font-size: 9.5px; background: #e0e7ff; color: #3730a3; padding: 2px 7px; border-radius: 4px; font-weight: 600; white-space: nowrap;">
            AI & System Analytics
          </span>
        </div>
        <div style="font-size: 10.5px; color: #334155; line-height: 1.6;">
          ${aiSummaryText 
            ? aiSummaryText.replace(/<[^>]*>/g, '') 
            : `ระบบภาพรวมทำงานได้ที่ระดับความพร้อมใช้งาน (SLA) <strong>${avgSla}%</strong> มีอุปกรณ์พร้อมให้บริการปกติจำนวน <strong>${online} เครื่อง</strong> จากทั้งหมด ${total} เครื่อง ${offline > 0 ? `โดยตรวจพบอุปกรณ์สถานะออฟไลน์จำนวน <strong>${offline} เครื่อง</strong> ซึ่งมีการบันทึกสาเหตุ/หมายเหตุการปิดจอหรือการบำรุงรักษาไว้เรียบร้อยแล้ว` : 'อุปกรณ์ทุกเครื่องสามารถตอบสนองการเชื่อมต่อได้อย่างสมบูรณ์ ไม่พบเหตุขัดข้องผิดปกติ'}`}
        </div>
      </div>

      <!-- 4. Location Distribution Summary Badges -->
      ${locationStats.length > 0 ? `
        <div style="margin-bottom: 16px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 14px; box-sizing: border-box;">
          <div style="font-size: 11.5px; font-weight: 700; color: #1e293b; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
            <span>🏢</span> สรุปสถานะตามอาคารและสถานที่ (${locationStats.length} โซน/อาคาร)
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${locationStats.map(([loc, stat]) => `
              <div style="
                background: ${stat.offline > 0 ? '#fff1f2' : '#f0fdf4'};
                border: 1px solid ${stat.offline > 0 ? '#fecaca' : '#bbf7d0'};
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 10px;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                white-space: nowrap;
              ">
                <span style="font-weight: 600; color: #1e293b;">${loc}</span>
                <span style="background: ${stat.offline > 0 ? '#fee2e2' : '#dcfce7'}; color: ${stat.offline > 0 ? '#dc2626' : '#15803d'}; padding: 1.5px 5px; border-radius: 4px; font-size: 9.5px; font-weight: 700;">
                  ${stat.online}/${stat.total}
                </span>
                ${stat.offline > 0 ? `<span style="color: #ef4444; font-weight: 700; font-size: 9.5px;">(ดับ ${stat.offline})</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- 5. Devices Inventory Table -->
      <div style="margin-bottom: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; display: flex; align-items: center; gap: 6px;">
            <span>📋</span> รายการอุปกรณ์เครือข่ายและหมายเหตุ (Device Inventory)
          </div>
          <span style="font-size: 10px; color: #64748b; font-weight: 600;">ทั้งหมด ${devices.length} รายการ</span>
        </div>

        <table style="
          width: 100%;
          border-collapse: collapse;
          font-size: 10px;
          background: #ffffff;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #cbd5e1;
        ">
          <thead>
            <tr style="background: #1e3a8a; color: #ffffff;">
              <th style="padding: 7px 5px; text-align: center; width: 30px; font-weight: 700; border-right: 1px solid rgba(255,255,255,0.15);">#</th>
              <th style="padding: 7px 8px; text-align: left; font-weight: 700; border-right: 1px solid rgba(255,255,255,0.15);">ชื่ออุปกรณ์ (Device Name)</th>
              <th style="padding: 7px 8px; text-align: left; font-weight: 700; width: 110px; border-right: 1px solid rgba(255,255,255,0.15);">IP Address</th>
              <th style="padding: 7px 8px; text-align: left; font-weight: 700; border-right: 1px solid rgba(255,255,255,0.15);">สถานที่ / ชั้น</th>
              <th style="padding: 7px 6px; text-align: center; font-weight: 700; width: 70px; border-right: 1px solid rgba(255,255,255,0.15);">สถานะ</th>
              <th style="padding: 7px 8px; text-align: left; font-weight: 700; border-right: 1px solid rgba(255,255,255,0.15);">หมายเหตุ (Remarks)</th>
              <th style="padding: 7px 6px; text-align: right; font-weight: 700; width: 50px; border-right: 1px solid rgba(255,255,255,0.15);">Ping</th>
              <th style="padding: 7px 6px; text-align: right; font-weight: 700; width: 50px;">SLA</th>
            </tr>
          </thead>
          <tbody>
            ${devices.map((d, i) => {
              const isOffline = d.status === DeviceStatus.OFFLINE;
              const isWarning = d.status === DeviceStatus.WARNING;
              const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
              return `
                <tr style="background-color: ${rowBg}; border-bottom: 1px solid #e2e8f0; page-break-inside: avoid;">
                  <td style="padding: 6px 5px; text-align: center; color: #64748b; font-weight: 600;">${i + 1}</td>
                  <td style="padding: 6px 8px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                    ${d.name}
                    ${d.type ? `<div style="font-size: 8.5px; font-weight: 400; color: #64748b; margin-top: 1px;">${d.type} ${d.model ? `• ${d.model}` : ''}</div>` : ''}
                  </td>
                  <td style="padding: 6px 8px; font-family: monospace; font-size: 9.5px; color: #334155; font-weight: 600; white-space: nowrap;">
                    ${d.ip}${d.monitorPort ? `:${d.monitorPort}` : ''}
                  </td>
                  <td style="padding: 6px 8px; color: #475569; font-size: 9.5px; line-height: 1.3;">
                    ${formatLocation(d.location, d.floor)}
                  </td>
                  <td style="padding: 6px 5px; text-align: center;">
                    <span style="
                      display: inline-block;
                      padding: 2px 6px;
                      border-radius: 9999px;
                      font-size: 9px;
                      font-weight: 700;
                      white-space: nowrap;
                      background: ${isOffline ? '#fee2e2' : isWarning ? '#fef3c7' : '#dcfce7'};
                      color: ${isOffline ? '#dc2626' : isWarning ? '#d97706' : '#15803d'};
                      border: 1px solid ${isOffline ? '#fecaca' : isWarning ? '#fde68a' : '#bbf7d0'};
                    ">
                      ${isOffline ? '🔴 ดับ' : isWarning ? '🟡 ช้า' : '🟢 ปกติ'}
                    </span>
                  </td>
                  <td style="padding: 6px 8px; font-size: 9.5px; line-height: 1.3;">
                    ${d.remarks 
                      ? `<span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: 600; border: 1px solid #fde68a; display: inline-block;">📝 ${d.remarks}</span>` 
                      : `<span style="color: #94a3b8;">-</span>`}
                  </td>
                  <td style="padding: 6px 6px; text-align: right; font-family: monospace; font-size: 9.5px; font-weight: 600; color: ${isWarning ? '#d97706' : '#0f172a'}; white-space: nowrap;">
                    ${d.latency}ms
                  </td>
                  <td style="padding: 6px 6px; text-align: right; font-weight: 700; font-size: 9.5px; color: ${(d.uptimePercentage || 100) < 95 ? '#dc2626' : '#059669'}; white-space: nowrap;">
                    ${d.uptimePercentage || 100}%
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <!-- 6. Incident History Table (If Available) -->
      ${logs && logs.length > 0 ? `
        <div style="margin-bottom: 16px; page-break-inside: avoid;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
            <div style="font-size: 12px; font-weight: 700; color: #991b1b; display: flex; align-items: center; gap: 6px;">
              <span>🚨</span> ประวัติบันทึกเหตุการณ์ขัดข้องล่าสุด (Incident Logs)
            </div>
            <span style="font-size: 10px; color: #64748b; font-weight: 600;">แสดงล่าสุด 12 รายการ</span>
          </div>

          <table style="
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5px;
            background: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid #cbd5e1;
          ">
            <thead>
              <tr style="background: #991b1b; color: #ffffff;">
                <th style="padding: 6px 5px; text-align: center; width: 30px; font-weight: 700;">#</th>
                <th style="padding: 6px 7px; text-align: left; width: 125px; font-weight: 700;">วัน-เวลาที่เกิดเหตุ</th>
                <th style="padding: 6px 7px; text-align: left; font-weight: 700;">ชื่ออุปกรณ์</th>
                <th style="padding: 6px 7px; text-align: left; width: 95px; font-weight: 700;">IP Address</th>
                <th style="padding: 6px 7px; text-align: left; font-weight: 700;">สถานที่</th>
                <th style="padding: 6px 7px; text-align: left; font-weight: 700;">รายละเอียดเหตุการณ์</th>
              </tr>
            </thead>
            <tbody>
              ${logs.slice(0, 12).map((l, idx) => `
                <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fff1f2'}; border-bottom: 1px solid #fecaca; page-break-inside: avoid;">
                  <td style="padding: 5px; text-align: center; color: #991b1b; font-weight: 600;">${idx + 1}</td>
                  <td style="padding: 5px 7px; color: #475569; white-space: nowrap;">${new Date(l.timestamp).toLocaleString('th-TH')}</td>
                  <td style="padding: 5px 7px; font-weight: 700; color: #0f172a;">${l.deviceName}</td>
                  <td style="padding: 5px 7px; font-family: monospace; font-size: 9px; color: #334155; white-space: nowrap;">${l.ip}</td>
                  <td style="padding: 5px 7px; color: #475569;">${formatLocation(l.location)}</td>
                  <td style="padding: 5px 7px; color: #b91c1c; font-weight: 600;">${l.message}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <!-- 7. Footer Sign-off -->
      <div style="
        border-top: 1.5px solid #e2e8f0;
        padding-top: 10px;
        margin-top: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 9.5px;
        color: #64748b;
        page-break-inside: avoid;
      ">
        <div>
          <strong>ผู้จัดทำรายงาน:</strong> แผนกเทคโนโลยีสารสนเทศ โรงเรียนสาธิต มศว ประสานมิตร (ฝ่ายมัธยม)
        </div>
        <div style="text-align: right;">
          เอกสารสรุปผู้บริหาร • สร้างอัตโนมัติโดยระบบ E-Board IP Monitor
        </div>
      </div>
    </div>
  `;
};

// Open High Quality Native Print / Save as PDF Window
export const printExecutiveReport = (params: ExportReportParams) => {
  const htmlBody = generateExecutiveReportHtml(params);
  const now = new Date();
  const dateFileStr = now.toISOString().split('T')[0];
  const titleStr = `${(params.systemName || 'E-Board')}_Executive_Report_${dateFileStr}`;

  const printWindow = window.open('', '_blank', 'width=950,height=850,menubar=no,toolbar=no,location=no,status=no');
  if (!printWindow) {
    // If pop-up is blocked by browser, fallback to direct PDF export
    exportToPdf(params);
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <title>${titleStr}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&family=Prompt:wght@300;400;500;600;700&family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 6mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Kanit', 'Prompt', 'Sarabun', -apple-system, BlinkMacSystemFont, Tahoma, Arial, sans-serif;
      background-color: #f1f5f9;
      color: #0f172a;
      padding: 20px;
    }
    .print-bar {
      max-width: 860px;
      margin: 0 auto 16px auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #1e293b;
      color: #ffffff;
      padding: 12px 18px;
      border-radius: 10px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .print-btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
    }
    .print-btn:hover {
      background: #1d4ed8;
    }
    .paper-sheet {
      background: #ffffff;
      max-width: 860px;
      margin: 0 auto;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    @media print {
      body {
        background-color: #ffffff !important;
        padding: 0 !important;
      }
      .no-print, .print-bar {
        display: none !important;
      }
      .paper-sheet {
        box-shadow: none !important;
        border-radius: 0 !important;
        max-width: 100% !important;
      }
      tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <div style="font-size: 13px; font-weight: 600;">
      📄 หน้าต่างพิมพ์รายงานผู้บริหาร (กด "พิมพ์ / บันทึก PDF" แล้วเลือก "Save as PDF" ได้ทันที คมชัดระดับเวกเตอร์ 100%)
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="print-btn" onclick="window.print()">
        🖨️ พิมพ์ / บันทึก PDF
      </button>
      <button class="print-btn" style="background: #475569;" onclick="window.close()">
        ปิดหน้าต่าง
      </button>
    </div>
  </div>
  <div class="paper-sheet">
    ${htmlBody}
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`);
  printWindow.document.close();
};

export const exportToExcel = async ({
  systemName,
  devices,
  logs,
  periodLabel = 'ข้อมูล Realtime ปัจจุบัน'
}: ExportReportParams) => {
  const generatedTime = new Date().toLocaleString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    calendar: 'buddhist'
  });
  const dateStr = new Date().toISOString().split('T')[0];

  const onlineCount = devices.filter(d => d.status === DeviceStatus.ONLINE || d.status === DeviceStatus.WARNING).length;
  const offlineCount = devices.filter(d => d.status === DeviceStatus.OFFLINE).length;
  const warningCount = devices.filter(d => d.status === DeviceStatus.WARNING).length;
  const totalCount = devices.length;
  const avgSla = totalCount > 0
    ? (devices.reduce((acc, d) => acc + (d.uptimePercentage || 100), 0) / totalCount).toFixed(2)
    : '100.00';

  const xmlContent = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
    <style>
      body { font-family: 'Sarabun', Tahoma, 'Segoe UI', Arial, sans-serif; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
      th { background-color: #1e3a8a; color: #ffffff; border: 1px solid #1d4ed8; padding: 10px 12px; text-align: left; font-weight: bold; }
      td { border: 1px solid #cbd5e1; padding: 8px 10px; color: #1e293b; }
      tr:nth-child(even) td { background-color: #f8fafc; }
      .title { font-size: 20px; font-weight: bold; color: #1e3a8a; margin-bottom: 5px; }
      .meta { font-size: 12px; color: #64748b; margin-bottom: 15px; }
      .section-header { font-size: 15px; font-weight: bold; color: #1e3a8a; margin-top: 20px; margin-bottom: 10px; }
      .kpi-label { font-weight: bold; background-color: #f1f5f9; width: 300px; }
      .badge-online { color: #059669; font-weight: bold; }
      .badge-offline { color: #dc2626; font-weight: bold; }
      .badge-remark { color: #d97706; font-weight: bold; background-color: #fef3c7; }
    </style>
  </head>
  <body>
    <div class="title">${systemName || 'E-Board'} - รายงานสรุปสถานะเครือข่ายสำหรับผู้บริหาร (Executive Report)</div>
    <div class="meta">รายงานสถานะระบบและอุปกรณ์เครือข่าย | วันที่ออกรายงาน: ${generatedTime} | ช่วงเวลา: ${periodLabel}</div>
    
    <div class="section-header">1. สรุปภาพรวมสถิติระบบ (Executive Summary)</div>
    <table>
      <tr><th style="width: 320px;">ตัวชี้วัด (Metric)</th><th>รายละเอียด (Detail)</th></tr>
      <tr><td class="kpi-label">ชื่อระบบ (System Name)</td><td>${systemName || 'E-Board'}</td></tr>
      <tr><td class="kpi-label">จำนวนอุปกรณ์ทั้งหมด (Total Devices)</td><td>${totalCount} เครื่อง</td></tr>
      <tr><td class="kpi-label">สถานะออนไลน์ปกติ (Online)</td><td class="badge-online">${onlineCount} เครื่อง (${((onlineCount / (totalCount || 1)) * 100).toFixed(1)}%)</td></tr>
      <tr><td class="kpi-label">สถานะขัดข้อง/ออฟไลน์ (Offline)</td><td class="badge-offline">${offlineCount} เครื่อง</td></tr>
      <tr><td class="kpi-label">สถานะ Latency สูง (Warning)</td><td>${warningCount} เครื่อง</td></tr>
      <tr><td class="kpi-label">อัตราความพร้อมใช้งานเฉลี่ย (System SLA Uptime)</td><td><b>${avgSla}%</b></td></tr>
    </table>

    <div class="section-header">2. รายการอุปกรณ์ สถานะ และหมายเหตุ (Device Inventory & Status)</div>
    <table>
      <thead>
        <tr>
          <th>ลำดับ</th>
          <th>ชื่ออุปกรณ์</th>
          <th>IP Address</th>
          <th>ประเภท</th>
          <th>สถานที่ / ชั้น</th>
          <th>สถานะ</th>
          <th>หมายเหตุ (Remarks)</th>
          <th>Latency</th>
          <th>Uptime SLA</th>
          <th>ตรวจพบครั้งล่าสุด</th>
        </tr>
      </thead>
      <tbody>
        ${devices.map((d, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><b>${d.name}</b></td>
            <td>${d.ip}${d.monitorPort ? `:${d.monitorPort}` : ''}</td>
            <td>${d.type}</td>
            <td>${formatLocation(d.location, d.floor)}</td>
            <td class="${d.status === DeviceStatus.OFFLINE ? 'badge-offline' : 'badge-online'}">${d.status === DeviceStatus.OFFLINE ? '🔴 Offline' : '🟢 Online'}</td>
            <td class="${d.remarks ? 'badge-remark' : ''}">${d.remarks || '-'}</td>
            <td>${d.latency} ms</td>
            <td>${d.uptimePercentage || 100}%</td>
            <td>${d.lastSeen ? new Date(d.lastSeen).toLocaleString('th-TH') : '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="section-header">3. ประวัติเหตุการณ์ขัดข้อง (Incident Logs History)</div>
    <table>
      <thead>
        <tr>
          <th>ลำดับ</th>
          <th>เวลาที่เกิดเหตุ</th>
          <th>ชื่ออุปกรณ์</th>
          <th>IP Address</th>
          <th>สถานที่</th>
          <th>ประเภทเหตุการณ์</th>
          <th>รายละเอียด</th>
        </tr>
      </thead>
      <tbody>
        ${logs.length > 0 ? logs.map((l, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${new Date(l.timestamp).toLocaleString('th-TH')}</td>
            <td>${l.deviceName}</td>
            <td>${l.ip}</td>
            <td>${formatLocation(l.location)}</td>
            <td>${l.type}</td>
            <td>${l.message}</td>
          </tr>
        `).join('') : '<tr><td colspan="7" style="text-align:center;">ไม่มีประวัติเหตุการณ์ขัดข้อง</td></tr>'}
      </tbody>
    </table>
  </body>
  </html>`;

  const blob = new Blob(['\uFEFF' + xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(systemName || 'E-Board').replace(/[^a-zA-Z0-9]/g, '_')}_Executive_Report_${dateStr}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportToPdf = async (params: ExportReportParams) => {
  const { systemName } = params;
  const now = new Date();
  const dateFileStr = now.toISOString().split('T')[0];
  const filenameStr = `${(systemName || 'E-Board').replace(/[^a-zA-Z0-9ก-๙]/g, '_')}_Executive_Report_${dateFileStr}.pdf`;

  const reportHtml = generateExecutiveReportHtml(params);

  // Use a hidden iframe to isolate the document from Tailwind v4's oklch color variables
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '-9999px';
  iframe.style.width = '860px';
  iframe.style.height = '1200px';
  iframe.style.border = '0';
  iframe.style.zIndex = '-9999';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('Unable to access iframe document');
    }

    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@300;400;500;600;700;800&family=Prompt:wght@300;400;500;600;700&family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Kanit', 'Prompt', 'Sarabun', -apple-system, BlinkMacSystemFont, Tahoma, Arial, sans-serif !important;
      background-color: #ffffff !important;
      color: #0f172a !important;
      width: 860px;
    }
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  </style>
</head>
<body>
  ${reportHtml}
</body>
</html>`);
    iframeDoc.close();

    if (iframeDoc.fonts) {
      await iframeDoc.fonts.ready;
    }
    // Allow DOM reflow and font glyph rendering
    await new Promise(resolve => setTimeout(resolve, 400));

    const elementToExport = iframeDoc.querySelector('.executive-report-document') || iframeDoc.body;

    const opt = {
      margin: [8, 6, 8, 6],
      filename: filenameStr,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        letterRendering: true,
        scrollY: 0,
        windowWidth: 860,
        onclone: (clonedDoc: Document) => {
          // Remove any stylesheets containing oklch / oklab or color-mix functions that cause html2canvas to fail
          const styleTags = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
          styleTags.forEach(tag => {
            const content = tag.textContent || '';
            if (content.includes('oklch') || content.includes('oklab') || content.includes('color-mix')) {
              tag.remove();
            }
          });
        }
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait',
        compress: true
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // Use html2pdf to generate multi-page PDF cleanly
    await (html2pdf as any)().set(opt).from(elementToExport).save();
  } catch (error) {
    console.error('PDF export error fallback to print:', error);
    printExecutiveReport(params);
  } finally {
    if (iframe && document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }
};
