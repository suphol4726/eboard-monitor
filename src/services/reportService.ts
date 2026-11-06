import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { Device, DowntimeLog, AppSettings, Translations, DeviceStatus } from '../types';

export const generatePDFReport = async (
  devices: Device[], 
  events: DowntimeLog[], 
  settings: AppSettings,
  aiSummary: string,
  _t: Translations,
  lang: string
) => {
  // Create a temporary container for the report
  const container = document.createElement('div');
  container.id = 'pdf-report-container';
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px'; 
  container.style.padding = '40px';
  container.style.backgroundColor = 'white';
  container.style.color = '#1e293b';
  container.style.fontFamily = lang === 'TH' ? "'Kanit', sans-serif" : "sans-serif";
  
  const now = new Date();
  const dateStr = now.toLocaleString(lang === 'TH' ? 'th-TH' : 'en-US');

  container.innerHTML = `
    <div style="background-color: #1d4ed8; color: white; padding: 30px; border-radius: 8px; margin-bottom: 30px;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 800;">IP MONITOR - SYSTEM REPORT</h1>
      <div style="display: flex; justify-content: space-between; margin-top: 15px; font-size: 14px; opacity: 0.9;">
        <span>Generated on: ${dateStr}</span>
        <span>Monitoring Interval: ${settings.pingInterval}s</span>
      </div>
    </div>

    <div style="margin-bottom: 30px;">
      <h2 style="font-size: 20px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;">
        ${lang === 'TH' ? 'สรุปภาพรวมระบบโดย AI' : 'AI Health Summary'}
      </h2>
      <p style="font-size: 15px; line-height: 1.6; color: #334155; white-space: pre-wrap;">
        ${aiSummary || (lang === 'TH' ? 'ไม่มีข้อมูลสรุป' : 'No summary available.')}
      </p>
    </div>

    <div style="margin-bottom: 30px;">
      <h2 style="font-size: 20px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;">
        ${lang === 'TH' ? 'สถานะอุปกรณ์ทั้งหมด' : 'Device Status Overview'}
      </h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background-color: #1d4ed8; color: white; text-align: left;">
            <th style="padding: 10px; border: 1px solid #e2e8f0;">Name</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0;">IP/Port</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0;">Type</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0;">Location</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0;">Status</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0;">Latency</th>
          </tr>
        </thead>
        <tbody>
          ${devices.map(d => `
            <tr>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.name}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.ip}${d.monitorPort ? `:${d.monitorPort}` : ''}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.type}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.location}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: bold; color: ${d.status === DeviceStatus.ONLINE ? '#10b981' : '#ef4444'}">
                ${d.status.toUpperCase()}
              </td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${d.latency}ms</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div>
      <h2 style="font-size: 20px; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 15px;">
        ${lang === 'TH' ? 'เหตุการณ์ล่าสุด' : 'Recent System Events'}
      </h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background-color: #475569; color: white; text-align: left;">
            <th style="padding: 10px; border: 1px solid #e2e8f0;">Timestamp</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0;">Type</th>
            <th style="padding: 10px; border: 1px solid #e2e8f0;">Message</th>
          </tr>
        </thead>
        <tbody>
          ${events.slice(0, 15).map(e => `
            <tr>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${new Date(e.timestamp).toLocaleString(lang === 'TH' ? 'th-TH' : 'en-US')}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${e.type}</td>
              <td style="padding: 8px; border: 1px solid #e2e8f0;">${e.message}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div style="margin-top: 50px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
      IP Monitor System Report - Generated automatically by E-Board
    </div>
  `;

  document.body.appendChild(container);

  try {
    // Wait for fonts to load
    await new Promise(resolve => setTimeout(resolve, 500));

    const imgData = await htmlToImage.toPng(container, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      skipFonts: false,
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    
    const fileName = `IP_Monitor_Report_${now.toISOString().split('T')[0]}.pdf`;
    
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);

    return fileName;
  } catch (error) {
    console.error('PDF Generation Error:', error);
    throw error;
  } finally {
    document.body.removeChild(container);
  }
};
