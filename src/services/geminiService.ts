import { Device, DowntimeLog } from "../types";
import { generateLocalIncidentReport } from "./analysisService";

export const generateAISummary = async (devices: Device[], logs: DowntimeLog[]): Promise<string> => {
  try {
    const response = await fetch('/api/ai/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ devices, logs }),
    });

    if (!response.ok) {
      let errorMsg = "Failed to generate AI summary";
      try {
        const errorData = await response.json();
        errorMsg = errorData.error || errorMsg;
      } catch (e) {
        // Not JSON
      }
      
      console.warn('AI Summary failed, falling back to local analysis:', errorMsg);
      return generateLocalIncidentReport(logs, devices);
    }

    const data = await response.json();
    if (!data.text) {
      console.warn('AI returned empty response, falling back to local analysis');
      return generateLocalIncidentReport(logs, devices);
    }
    return data.text;
  } catch (e: any) {
    console.error('AI Summary generation failed, falling back to local analysis:', e);
    return generateLocalIncidentReport(logs, devices);
  }
};
