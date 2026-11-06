
import { Device, DowntimeLog, DeviceStatus } from '../types';

export const generateLocalIncidentReport = (logs: DowntimeLog[], devices: Device[]): string => {
  const now = new Date();
  const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  // 1. Filter Logs (Last 24 Hours)
  const recentLogs = logs.filter(l => new Date(l.timestamp) > past24h);
  const outageLogs = recentLogs.filter(l => l.type === 'OUTAGE');
  
  // 2. Statistics
  const totalOutages = outageLogs.length;
  const uniqueAffectedDevices = new Set(outageLogs.map(l => l.deviceId)).size;
  
  // 3. Identify Top Offenders
  const deviceFaults: Record<string, number> = {};
  outageLogs.forEach(l => {
    deviceFaults[l.deviceName] = (deviceFaults[l.deviceName] || 0) + 1;
  });
  const sortedOffenders = Object.entries(deviceFaults).sort(([,a], [,b]) => b - a);
  
  // 4. Identify Current Status
  const offlineDevices = devices.filter(d => d.status === DeviceStatus.OFFLINE);
  const warningDevices = devices.filter(d => d.status === DeviceStatus.WARNING);

  // 5. Generate HTML Report (Thai Language) - Restored Structure with Gradient Header (Hex Colors for PDF compatibility)
  let html = `<div class="report-container font-sans mx-auto p-6 bg-white" style="color: #1e293b; max-width: 800px;">
      <!-- Header Section: Blue-Cyan Gradient (Using Hex for html2canvas compatibility) -->
      <div class="mb-6 p-8 rounded-2xl text-white shadow-lg" style="background: linear-gradient(to right, #1d4ed8, #2563eb, #06b6d4);">
        <h1 class="text-3xl font-bold mb-2">IP Monitor - รายงานสรุปสถานการณ์เครือข่าย</h1>
        <p class="text-sm opacity-90">วันที่ออกรายงาน: ${now.toLocaleString('th-TH', { 
          day: 'numeric', 
          month: 'numeric', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          calendar: 'buddhist'
        })}</p>
      </div>

      <!-- Section 1: System Overview -->
      <div class="mb-8">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2" style="color: #1e293b;">
          <span style="color: #2563eb;">1.</span> ภาพรวมระบบ (System Overview)
        </h3>
        <ul class="list-disc pl-6 space-y-2" style="color: #334155;">
          <li>อุปกรณ์ทั้งหมดในระบบ: <strong>${devices.length} เครื่อง</strong></li>
          <li>สถานะปัจจุบัน: <span style="font-weight: bold; color: ${offlineDevices.length > 0 ? '#dc2626' : '#10b981'};">
            ${offlineDevices.length > 0 ? `พบอุปกรณ์ออฟไลน์ ${offlineDevices.length} เครื่อง` : 'ปกติ (All Systems Operational)'}
          </span></li>
          <li>เหตุการณ์ขัดข้องใน 24 ชม. ที่ผ่านมา: <strong>${totalOutages} ครั้ง</strong></li>
          <li>จำนวนอุปกรณ์ที่ได้รับผลกระทบ: <strong>${uniqueAffectedDevices} เครื่อง</strong></li>
        </ul>
      </div>

      <!-- Section 2: Urgent Actions (Only if issues exist) -->
      ${(offlineDevices.length > 0 || warningDevices.length > 0) ? `
      <div class="mb-8">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2" style="color: #dc2626;">
          <span style="color: #dc2626;">2.</span> ปัญหาเร่งด่วน (Urgent Issues)
        </h3>
        <div class="border rounded-2xl p-6 shadow-sm" style="background-color: #fef2f2; border-color: #fee2e2;">
           <ul class="list-none space-y-3">
              ${offlineDevices.map(d => `<li class="flex items-center gap-3 text-base" style="color: #b91c1c;">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: #dc2626;"></span>
                <span class="font-bold" style="color: #dc2626;">${d.name}</span> 
                <span style="color: #4b5563;">(${d.ip}) - สถานะ:</span> 
                <span class="font-bold" style="color: #dc2626;">OFFLINE</span> 
                <span style="color: #6b7280;">(${d.location})</span>
              </li>`).join('')}
              ${warningDevices.map(d => `<li class="flex items-center gap-3 text-base" style="color: #b45309;">
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: #f59e0b;"></span>
                <span class="font-bold" style="color: #d97706;">${d.name}</span> 
                <span style="color: #4b5563;">(${d.ip}) - สถานะ:</span> 
                <span class="font-bold" style="color: #d97706;">High Latency</span> 
                <span style="color: #6b7280;">(${d.location})</span>
              </li>`).join('')}
           </ul>
        </div>
      </div>
      ` : ''}

      <!-- Section 3: Incident Analysis -->
      <div class="mb-8">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2" style="color: #1e293b;">
          <span style="color: #2563eb;">3.</span> การวิเคราะห์ปัญหา (Incident Analysis)
        </h3>
        <p class="mb-4" style="color: #475569;">จากการวิเคราะห์ข้อมูล Log พบรูปแบบปัญหาดังนี้:</p>
        <ul class="list-disc pl-6 space-y-3 mb-6" style="color: #334155;">
          ${sortedOffenders.length > 0 ? `
            <li><strong>อุปกรณ์ที่มีปัญหาบ่อยที่สุด:</strong> คือ "${sortedOffenders[0][0]}" ดับไปทั้งหมด ${sortedOffenders[0][1]} ครั้ง ควรตรวจสอบสาย LAN, Power Supply หรือความร้อนของอุปกรณ์</li>
          ` : '<li>ไม่พบอุปกรณ์ที่มีการขัดข้องซ้ำซ้อน</li>'}
          
          ${(() => {
            const locationCounts: Record<string, number> = {};
            outageLogs.forEach(l => { locationCounts[l.location] = (locationCounts[l.location] || 0) + 1; });
            const topLocation = Object.entries(locationCounts).sort(([,a], [,b]) => b - a)[0];
            if (topLocation && topLocation[1] > 3) {
              return `<li><strong>พื้นที่ที่น่าสงสัย:</strong> โซน "${topLocation[0]}" มีการแจ้งเตือนหลายครั้ง (${topLocation[1]} ครั้ง) อาจเกิดจาก Switch ต้นทาง หรือระบบไฟในบริเวณนั้นขัดข้อง</li>`;
            }
            return `<li><strong>การกระจายตัวของปัญหา:</strong> เป็นแบบสุ่ม (Random) ไม่พบความผิดปกติที่เชื่อมโยงกันเป็นกลุ่มชัดเจน</li>`;
          })()}
        </ul>

        <!-- Recent Logs Box -->
        <div class="border rounded-xl p-5" style="background-color: #f8fafc; border-color: #e2e8f0;">
          <p class="font-bold mb-3 border-b pb-2" style="color: #334155; border-color: #e2e8f0;">รายละเอียดเหตุการณ์ขัดข้อง (ล่าสุด 10 รายการใน 24 ชม.):</p>
          <ul class="space-y-2">
            ${[...outageLogs].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10).map(log => {
              const timeStr = new Date(log.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return `<li class="text-sm flex items-center gap-2" style="color: #475569;">
                <span class="font-mono text-xs w-20" style="color: #94a3b8;">${timeStr} น.</span>
                <span>- อุปกรณ์: <strong>${log.deviceName}</strong> (${log.ip}) ณ <strong>${log.location}</strong></span>
              </li>`;
            }).join('')}
            ${outageLogs.length > 10 ? `<li class="text-xs italic mt-2" style="color: #94a3b8;">... และเหตุการณ์อื่นๆ อีก ${outageLogs.length - 10} รายการ</li>` : ''}
          </ul>
        </div>
      </div>

      <!-- Section 4: Recommendations -->
      <div class="mb-8">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2" style="color: #1e293b;">
          <span style="color: #2563eb;">4.</span> ข้อแนะนำ (Recommendations)
        </h3>
        <ol class="list-decimal pl-6 space-y-2" style="color: #334155;">
          <li>ตรวจสอบการเชื่อมต่อทางกายภาพ (สาย LAN/Fiber) ของอุปกรณ์ที่มีปัญหา</li>
          <li>หมั่นตรวจสอบ Log อย่างน้อยวันละ 1 ครั้ง</li>
          ${offlineDevices.length > 0 ? '<li>ดำเนินการเข้าพื้นที่เพื่อตรวจสอบอุปกรณ์ที่ Offline ทันที</li>' : ''}
        </ol>
      </div>
      
      <!-- Footer -->
      <div class="mt-12 pt-6 border-t text-center text-xs" style="border-color: #f1f5f9; color: #94a3b8;">
        Generated by IP Monitor On-Premise AI Engine
      </div>
    </div>
  `;

  return html;
};
