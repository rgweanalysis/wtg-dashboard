import * as XLSX from "xlsx";

const MAX_PREVIEW_ROWS = 25;
const MAX_RETURN_ROWS = 0; // parse/validate endpoint: do not return full source rows.

function jsonResponse(request, env, body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(request, env)
    }
  });
}

function corsHeaders(request, env) {
  const requestOrigin = request.headers.get("Origin") || "*";
  const allowedRaw = env.ALLOWED_ORIGIN || "*";
  const allowed = allowedRaw.split(",").map((item) => item.trim()).filter(Boolean);
  const allowOrigin = allowed.includes("*") || allowed.includes(requestOrigin)
    ? requestOrigin
    : allowed[0] || "*";

  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400"
  };
}

function normaliseCellValue(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  return String(value).trim();
}

function normaliseRows(rows) {
  return rows.map((row) => {
    const clean = {};
    for (const [key, value] of Object.entries(row)) {
      clean[String(key).trim()] = normaliseCellValue(value);
    }
    return clean;
  });
}

async function parseSpreadsheetFile(file, label, returnRows = false) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error(`${label} is not a valid uploaded file.`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: true,
    raw: false
  });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error(`${label} file does not contain any sheets.`);
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false
  });
  const rows = normaliseRows(rawRows).filter((row) => Object.values(row).some((value) => value !== null && value !== ""));
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    label,
    fileName: file.name || label,
    fileType: file.type || "unknown",
    fileSizeBytes: file.size || bytes.byteLength,
    sheetName,
    rowsCount: rows.length,
    columns,
    preview: rows.slice(0, MAX_PREVIEW_ROWS),
    rows: returnRows ? rows : undefined,
    data: !returnRows && MAX_RETURN_ROWS > 0 ? rows.slice(0, MAX_RETURN_ROWS) : undefined
  };
}

function stringifyRowsForBrowser(rows) {
  return (rows || []).map((row) => {
    const clean = {};
    for (const [key, value] of Object.entries(row || {})) {
      clean[String(key).trim()] = value == null ? "" : String(value).trim();
    }
    return clean;
  });
}

function orderedColumnsFromRows(rows) {
  const columns = [];
  const seen = new Set();
  for (const row of rows || []) {
    for (const key of Object.keys(row || {})) {
      const cleanKey = String(key).trim();
      if (!cleanKey || seen.has(cleanKey)) continue;
      seen.add(cleanKey);
      columns.push(cleanKey);
    }
  }
  return columns;
}

async function parseGenericTableFile(file, label) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new Error(`${label} is not a valid uploaded file.`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const fileName = file.name || label;
  const lowerName = fileName.toLowerCase();
  let workbook;

  if (lowerName.endsWith(".csv") || lowerName.endsWith(".txt")) {
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
    workbook = XLSX.read(text, { type: "string", cellDates: false, raw: false });
  } else {
    workbook = XLSX.read(bytes, { type: "array", cellDates: false, raw: false });
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error(`${label} file does not contain any sheets.`);
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const rows = stringifyRowsForBrowser(rawRows).filter((row) => Object.values(row).some((value) => String(value || "").trim() !== ""));
  const columns = orderedColumnsFromRows(rows);

  return {
    label,
    fileName,
    fileType: file.type || "unknown",
    fileSizeBytes: file.size || bytes.byteLength,
    sheetName,
    rowsCount: rows.length,
    columns,
    header: columns,
    data: rows,
    preview: rows.slice(0, MAX_PREVIEW_ROWS)
  };
}

function autoMapAWSColumns(columns) {
  return {
    device: findBestColumn(columns, [
      { terms: ["device", "wtg", "turbine", "device wtg", "اسم التوربينة", "التربينة"], score: 50 },
      { terms: ["asset", "unit", "tag", "object", "equipment"], score: 20 }
    ]),
    event: findBestColumn(columns, [
      { terms: ["event name", "alarm name", "event", "alarm", "fault", "warning", "اسم الإنذار"], score: 50 },
      { terms: ["subevent", "categorization", "categorisation"], score: 25 }
    ]),
    category: findBestColumn(columns, [
      { terms: ["category", "categorization", "categorisation", "category event", "الفئة", "توصيف"], score: 50 },
      { terms: ["type", "state"], score: 10 }
    ]),
    duration: findBestColumn(columns, [
      { terms: ["duration", "total duration", "duration hh mm ss", "مدة"], score: 50 },
      { terms: ["time"], score: 5, exclude: ["start", "end", "date"] }
    ]),
    start: findBestColumn(columns, [
      { terms: ["start date", "start time", "start", "event start", "بداية الحدث", "تاريخ البداية"], score: 50 }
    ]),
    end: findBestColumn(columns, [
      { terms: ["end date", "end time", "end", "event end", "نهاية الحدث", "تاريخ النهاية"], score: 50 }
    ]),
    subevent: findBestColumn(columns, [
      { terms: ["subevent", "subevent categorization", "subevent / categorization", "categorization description", "categorisation description"], score: 50 }
    ])
  };
}

function classifyAWSCategory(row, colMap) {
  const categoryKey = colMap.category;
  const subeventKey = colMap.subevent;
  const raw = categoryKey ? String(row[categoryKey] || "").trim() : "";
  const hasSub = !!(subeventKey && String(row[subeventKey] || "").trim());
  if (hasSub) return "Other";
  if (!raw || raw.toLowerCase() === "unknown" || raw === "غير معروف" || raw === "بدون فئة") return "Other";
  const lc = raw.toLowerCase();
  if (lc.includes("alarm") || raw === "إنذار") return "Alarm";
  if (lc.includes("state") || raw === "حالة") return "State";
  if (lc.includes("warning") || raw === "تحذير") return "Warning";
  return "Other";
}

function summarizeAWSRows(rows, colMap) {
  const categories = { Alarm: 0, State: 0, Warning: 0, Other: 0 };
  const devices = new Set();
  const events = new Set();
  for (const row of rows || []) {
    const cat = classifyAWSCategory(row, colMap);
    categories[cat] = (categories[cat] || 0) + 1;
    if (colMap.device && row[colMap.device]) devices.add(String(row[colMap.device]).trim());
    const eventValue = colMap.event && row[colMap.event] ? String(row[colMap.event]).trim() : "";
    if (eventValue) events.add(eventValue);
  }
  return {
    totalRows: rows.length,
    categories,
    devicesCount: devices.size,
    eventsCount: events.size
  };
}


function parseAWSDurationSeconds(value) {
  if (value == null) return 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/;+$/g, "").replace(/,/g, ".");
  const dayMatch = cleaned.match(/(?:(\d+(?:\.\d+)?)\s*d(?:ay)?s?)?\s*(\d{1,3}):(\d{1,2})(?::(\d{1,2}(?:\.\d+)?))?/i);
  if (dayMatch) {
    const days = parseFloat(dayMatch[1] || "0") || 0;
    const a = parseFloat(dayMatch[2] || "0") || 0;
    const b = parseFloat(dayMatch[3] || "0") || 0;
    const c = parseFloat(dayMatch[4] || "0") || 0;
    // If there are three clock parts: HH:MM:SS. If only two: MM:SS.
    if (dayMatch[4] != null) return (days * 86400) + (a * 3600) + (b * 60) + c;
    return (days * 86400) + (a * 60) + b;
  }
  const parts = cleaned.split(":").map((part) => parseFloat(part));
  if (parts.length === 3 && parts.every(Number.isFinite)) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2 && parts.every(Number.isFinite)) return (parts[0] * 60) + parts[1];
  const num = parseFloat(cleaned.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function formatAWSDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseAWSDateValue(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial date fallback.
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const millis = epoch.getTime() + value * 86400000;
    const d = new Date(millis);
    return isNaN(d.getTime()) ? null : d;
  }
  let raw = String(value).trim();
  if (!raw) return null;
  raw = raw.replace(/[\u200e\u200f]/g, "").replace(/\s+/g, " ");
  const direct = new Date(raw.replace(/\//g, "-").replace(" ", "T"));
  if (!isNaN(direct.getTime())) return direct;

  const m = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    let a = parseInt(m[1], 10);
    let b = parseInt(m[2], 10);
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    // Prefer DD/MM/YYYY unless first field is clearly month-impossible.
    let day = a;
    let month = b;
    if (a <= 12 && b > 12) { day = b; month = a; }
    const h = parseInt(m[4] || "0", 10);
    const min = parseInt(m[5] || "0", 10);
    const sec = parseInt(m[6] || "0", 10);
    const d = new Date(year, month - 1, day, h, min, sec);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getAWSCell(row, key) {
  if (!row || !key) return "";
  const value = row[key];
  return value == null ? "" : String(value).trim();
}

function getAWSDevice(row, colMap) {
  const value = getAWSCell(row, colMap.device);
  if (!value || value.toLowerCase() === "unknown" || value === "غير معروف") return "";
  return value;
}

function getAWSEventName(row, colMap) {
  const primary = getAWSCell(row, colMap.event);
  if (primary && primary.toLowerCase() !== "unknown" && primary !== "غير معروف") return primary;
  const sub = getAWSCell(row, colMap.subevent);
  return sub && sub.toLowerCase() !== "unknown" && sub !== "غير معروف" ? sub : "";
}

function getAWSEventCode(row, colMap) {
  const text = getAWSEventName(row, colMap);
  const m = String(text || "").match(/\b(\d{2,5})\b/);
  return m ? m[1] : "";
}

function getAWSRowBounds(row, colMap) {
  const start = parseAWSDateValue(getAWSCell(row, colMap.start));
  const end = parseAWSDateValue(getAWSCell(row, colMap.end)) || start;
  return { start, end };
}

function dayKeyUTC(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isAWSWarning903(row, colMap) {
  const category = classifyAWSCategory(row, colMap);
  const eventName = getAWSEventName(row, colMap).toLowerCase();
  const code = getAWSEventCode(row, colMap);
  if (category !== "Warning") return false;
  if (code === "903") return true;
  return eventName.includes("903") && (eventName.includes("person") || eventName.includes("authoriz") || eventName.includes("turbine"));
}

function buildAWSEmergencyIncidents(rows, colMap) {
  // Count every AWS row where the turbine entered WindTurbine Emergency.
  // Do NOT de-duplicate by start timestamp: many exported AWS files store dates
  // at day precision (00:00), so several emergency occurrences on the same day
  // can share the same parsed start time. De-duplicating by timestamp collapses
  // them incorrectly into one incident.
  const incidents = [];
  let order = 0;
  for (const row of rows || []) {
    const category = classifyAWSCategory(row, colMap);
    const eventName = getAWSEventName(row, colMap);
    if (category !== "State") continue;
    if (!/windturbine/i.test(eventName) || !/(^|\b)emergency(\b|$)/i.test(eventName)) continue;
    const bounds = getAWSRowBounds(row, colMap);
    if (!bounds.start) continue;
    const startMs = bounds.start.getTime();
    if (!Number.isFinite(startMs)) continue;
    incidents.push({ start: bounds.start, end: bounds.end || bounds.start, eventName, order: order++ });
  }
  incidents.sort((a, b) => (a.start - b.start) || (a.order - b.order));
  return incidents;
}

function medianNumber(values) {
  const arr = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function buildAWSBackendAnalysis(rows, colMap) {
  const categories = { Alarm: { count: 0, durationSeconds: 0 }, State: { count: 0, durationSeconds: 0 }, Warning: { count: 0, durationSeconds: 0 }, Other: { count: 0, durationSeconds: 0 } };
  const devices = new Map();
  const events = new Map();
  const dateKeys = new Set();
  const excludedWarning903Turbines = new Set();

  for (const row of rows || []) {
    const category = classifyAWSCategory(row, colMap);
    const device = getAWSDevice(row, colMap);
    const eventName = getAWSEventName(row, colMap) || "Unknown";
    const durationSeconds = parseAWSDurationSeconds(getAWSCell(row, colMap.duration));
    const bounds = getAWSRowBounds(row, colMap);
    if (bounds.start) dateKeys.add(dayKeyUTC(bounds.start));
    if (categories[category]) {
      categories[category].count += 1;
      categories[category].durationSeconds += durationSeconds;
    }
    if (device) {
      if (!devices.has(device)) devices.set(device, { device, totalCount: 0, totalDurationSeconds: 0, alarmCount: 0, warningCount: 0, stateCount: 0 });
      const d = devices.get(device);
      d.totalCount += 1;
      d.totalDurationSeconds += durationSeconds;
      if (category === "Alarm") d.alarmCount += 1;
      else if (category === "Warning") d.warningCount += 1;
      else if (category === "State") d.stateCount += 1;
      if (isAWSWarning903(row, colMap)) excludedWarning903Turbines.add(device);
    }
    const eventKey = `${category}||${eventName}`;
    if (!events.has(eventKey)) events.set(eventKey, { category, eventName, count: 0, durationSeconds: 0, devices: new Map() });
    const e = events.get(eventKey);
    e.count += 1;
    e.durationSeconds += durationSeconds;
    if (device) e.devices.set(device, (e.devices.get(device) || 0) + 1);
  }

  const topDurationByDevice = Array.from(devices.values())
    .sort((a, b) => (b.totalDurationSeconds - a.totalDurationSeconds) || (b.totalCount - a.totalCount) || a.device.localeCompare(b.device))
    .slice(0, 20)
    .map((item) => ({ ...item, totalDurationFormatted: formatAWSDuration(item.totalDurationSeconds) }));

  const eventSummary = Array.from(events.values())
    .map((item) => ({
      category: item.category,
      eventName: item.eventName,
      count: item.count,
      durationSeconds: item.durationSeconds,
      durationFormatted: formatAWSDuration(item.durationSeconds),
      devicesCount: item.devices.size,
      turbineBreakdown: Array.from(item.devices.entries()).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])).slice(0, 20).map(([device, count]) => `${device} (${count})`).join(" • ")
    }))
    .sort((a, b) => (b.count - a.count) || (b.durationSeconds - a.durationSeconds) || a.eventName.localeCompare(b.eventName));

  const topRepeatedAlarmWarning = eventSummary
    .filter((item) => item.category === "Alarm" || item.category === "Warning")
    .filter((item) => !(item.category === "Warning" && /(^|\D)903(\D|$)/.test(item.eventName)))
    .map((item) => {
      const original = events.get(`${item.category}||${item.eventName}`);
      const kept = Array.from(original.devices.entries()).filter(([device]) => !excludedWarning903Turbines.has(device));
      const totalCount = kept.reduce((sum, [, count]) => sum + count, 0);
      return {
        category: item.category,
        eventName: item.eventName,
        totalCount,
        turbineBreakdown: kept.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])).slice(0, 20).map(([device, count]) => `${device} (${count})`).join(" • ")
      };
    })
    .filter((item) => item.totalCount > 0)
    .sort((a, b) => (b.totalCount - a.totalCount) || a.eventName.localeCompare(b.eventName))
    .slice(0, 20);

  const rowsByDevice = new Map();
  for (const row of rows || []) {
    const device = getAWSDevice(row, colMap);
    if (!device) continue;
    if (!rowsByDevice.has(device)) rowsByDevice.set(device, []);
    rowsByDevice.get(device).push(row);
  }

  const emergencyRows = [];
  const allEmergencyIntervals = [];
  for (const [device, deviceRows] of rowsByDevice.entries()) {
    const incidents = buildAWSEmergencyIncidents(deviceRows, colMap);
    if (!incidents.length) continue;
    const alarmRows = deviceRows
      .map((row) => {
        const bounds = getAWSRowBounds(row, colMap);
        const category = classifyAWSCategory(row, colMap);
        if (!bounds.start || category !== "Alarm") return null;
        return { start: bounds.start, end: bounds.end || bounds.start, eventName: getAWSEventName(row, colMap) || "Unknown alarm" };
      })
      .filter(Boolean)
      .sort((a, b) => a.start - b.start);
    const priorAlarmCounts = {};
    for (const incident of incidents) {
      let latest = null;
      for (const alarm of alarmRows) {
        if (alarm.start.getTime() < incident.start.getTime()) latest = alarm;
        else break;
      }
      if (latest && latest.eventName) priorAlarmCounts[latest.eventName] = (priorAlarmCounts[latest.eventName] || 0) + 1;
    }
    const gaps = [];
    for (let i = 1; i < incidents.length; i += 1) {
      // Recurrence gap is measured between emergency start times, not previous end time.
      // This avoids zero gaps when an AWS state interval spans until the next state change.
      const minutes = Math.max(0, (incidents[i].start.getTime() - incidents[i - 1].start.getTime()) / 60000);
      gaps.push(minutes);
      allEmergencyIntervals.push(minutes);
    }
    const sortedGaps = gaps.slice().sort((a, b) => a - b);
    const topPriorAlarms = Object.entries(priorAlarmCounts).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])).slice(0, 3).map(([name, count]) => `${name} (${count})`);
    emergencyRows.push({
      device,
      incidentCount: incidents.length,
      gapSamples: gaps.length,
      avgGapMinutes: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
      medianGapMinutes: medianNumber(gaps),
      minGapMinutes: sortedGaps.length ? sortedGaps[0] : null,
      maxGapMinutes: sortedGaps.length ? sortedGaps[sortedGaps.length - 1] : null,
      topPriorAlarms,
      lastEmergencyStart: incidents[incidents.length - 1].start ? incidents[incidents.length - 1].start.toISOString() : ""
    });
  }
  emergencyRows.sort((a, b) => (b.incidentCount - a.incidentCount) || ((a.avgGapMinutes ?? Number.POSITIVE_INFINITY) - (b.avgGapMinutes ?? Number.POSITIVE_INFINITY)) || a.device.localeCompare(b.device));

  return {
    version: "aws-backend-analysis-v3",
    rowsAnalyzed: Array.isArray(rows) ? rows.length : 0,
    categories: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, { ...value, durationFormatted: formatAWSDuration(value.durationSeconds) }])),
    datesCount: Array.from(dateKeys).filter(Boolean).length,
    devicesCount: devices.size,
    eventsCount: events.size,
    excludedWarning903Turbines: Array.from(excludedWarning903Turbines).sort(),
    topDurationByDevice,
    topRepeatedAlarmWarning,
    eventSummary: eventSummary.slice(0, 50),
    emergencyRecurrence: {
      totalTurbines: emergencyRows.length,
      totalIncidents: emergencyRows.reduce((sum, row) => sum + row.incidentCount, 0),
      avgGapMinutes: allEmergencyIntervals.length ? allEmergencyIntervals.reduce((a, b) => a + b, 0) / allEmergencyIntervals.length : null,
      medianGapMinutes: medianNumber(allEmergencyIntervals),
      rows: emergencyRows.slice(0, 50)
    }
  };
}

async function handleAWSUpload(request, env) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse(request, env, {
      success: false,
      message: "Expected multipart/form-data with an AWS file."
    }, 400);
  }

  const form = await request.formData();
  const file = form.get("file") || form.get("aws");
  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonResponse(request, env, {
      success: false,
      message: "No valid AWS file was uploaded. Send a file field named file or aws."
    }, 400);
  }

  const parsed = await parseGenericTableFile(file, "aws");
  const selectedColumns = autoMapAWSColumns(parsed.columns);
  const summary = summarizeAWSRows(parsed.data, selectedColumns);
  const analysis = buildAWSBackendAnalysis(parsed.data, selectedColumns);

  return jsonResponse(request, env, {
    success: true,
    module: "AWS",
    phase: "backend-upload-parse",
    storageMode: "temporary-request-memory",
    persistentStorage: false,
    note: "AWS file was parsed inside Cloudflare Worker memory for this request only. It is not saved after the response is returned.",
    receivedAt: new Date().toISOString(),
    file: {
      fileName: parsed.fileName,
      fileType: parsed.fileType,
      fileSizeBytes: parsed.fileSizeBytes,
      sheetName: parsed.sheetName,
      rowsCount: parsed.rowsCount,
      columns: parsed.columns,
      preview: parsed.preview
    },
    parsed: {
      header: parsed.header,
      data: parsed.data
    },
    selectedColumns,
    summary,
    analysis
  });
}

function normalizeValue(value) {
  return value == null ? "" : String(value).trim().toUpperCase();
}

function normalizeHeaderName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u200f\u200e]/g, "")
    .replace(/[_\-\/\\]+/g, " ")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreColumn(header, rules) {
  const h = normalizeHeaderName(header);
  if (!h) return -9999;
  let score = -9999;
  for (const rule of rules) {
    if (rule.exclude && rule.exclude.some((term) => h.includes(term))) continue;
    const terms = Array.isArray(rule.terms) ? rule.terms : [rule.terms];
    const matched = rule.all
      ? terms.every((term) => h.includes(term))
      : terms.some((term) => h === term || h.includes(term));
    if (matched) score = Math.max(score, rule.score || 1);
  }
  return score;
}

function findBestColumn(columns, rules) {
  let best = "";
  let bestScore = -9999;
  for (const column of columns || []) {
    const score = scoreColumn(column, rules);
    if (score > bestScore) {
      bestScore = score;
      best = column;
    }
  }
  return bestScore > -9999 ? best : "";
}

function autoMapColumns(columns) {
  return {
    device: findBestColumn(columns, [
      { terms: ["wtg tag", "wtg", "turbine", "device", "tag", "unit", "object", "asset", "equipment"], score: 30 },
      { terms: ["name"], score: 5, exclude: ["alarm", "event", "time", "date"] }
    ]),
    alarm: findBestColumn(columns, [
      { terms: ["alarm code", "warning code", "fault code", "event code", "code"], score: 40 },
      { terms: ["alarm name", "alarm", "event", "fault", "warning"], score: 20, exclude: ["time", "date", "activation", "duration", "days", "now"] },
      { terms: ["description", "message", "text"], score: 5, exclude: ["time", "date"] }
    ]),
    desc: findBestColumn(columns, [
      { terms: ["alarm description", "event description", "description", "desc", "alarm text", "event text", "message", "text"], score: 30 },
      { terms: ["alarm name", "event name"], score: 15, exclude: ["time", "date"] }
    ]),
    time: findBestColumn(columns, [
      { terms: ["alarm activation time", "activation time", "active alarm activation time"], score: 100 },
      { terms: ["activation", "activated", "raised", "start", "occurred", "occurrence"], score: 80, exclude: ["time to now", "duration", "days"] },
      { terms: ["timestamp", "date time", "datetime", "date"], score: 60, exclude: ["time to now", "duration", "days"] },
      { terms: ["time"], score: 20, exclude: ["time to now", "duration", "days", "now"] }
    ])
  };
}

function buildKey(row, columns, includeTime, normalize) {
  const device = row[columns.device];
  const alarm = row[columns.alarm];
  if (device == null || alarm == null) return "";
  const dev = normalize ? normalizeValue(device) : String(device).trim();
  const alc = normalize ? normalizeValue(alarm) : String(alarm).trim();
  let key = `${dev}||${alc}`;
  if (includeTime && columns.time && row[columns.time]) {
    const time = normalize ? normalizeValue(row[columns.time]) : String(row[columns.time]).trim();
    key += `||${time}`;
  }
  return key;
}

function indexBy(rows, columns, includeTime, normalize) {
  const map = new Map();
  for (const row of rows) {
    const key = buildKey(row, columns, includeTime, normalize);
    if (!key) continue;
    const object = map.get(key) || { count: 0, row };
    object.count += 1;
    map.set(key, object);
  }
  return map;
}

function groupResultsByAlarm(inputArray) {
  const groupedMap = new Map();

  for (const row of inputArray) {
    const { alarm, device, description } = row;
    let entry = groupedMap.get(alarm);
    if (!entry) {
      entry = {
        alarm,
        description: description || "",
        devicesList: []
      };
      groupedMap.set(alarm, entry);
    }
    if (device) entry.devicesList.push(device);
  }

  const outputArray = [];
  for (const entry of groupedMap.values()) {
    entry.devices = entry.devicesList
      .sort((a, b) => String(a).localeCompare(String(b), "ar"))
      .join(", ");
    delete entry.devicesList;
    outputArray.push(entry);
  }

  return outputArray.sort((a, b) => String(a.alarm).localeCompare(String(b.alarm), "ar"));
}

function parseDateTimeFlexible(value) {
  if (value == null) return null;
  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(/[\u200f\u200e]/g, "");

  // Excel sometimes sends dates as serial numbers. Convert common serial range before trying Date.parse.
  const numericText = text.replace(/,/g, "");
  if (/^-?\d+(?:\.\d+)?$/.test(numericText)) {
    const serial = Number(numericText);
    if (serial > 20000 && serial < 100000) {
      return new Date((serial - 25569) * 86400 * 1000);
    }
  }

  let date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date;

  let match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (match) {
    let day = parseInt(match[1], 10);
    let month = parseInt(match[2], 10) - 1;
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    let hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7] ? match[7].toUpperCase() : "";
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    return new Date(year, month, day, hour, minute, second);
  }

  match = text.match(/^(\d{1,2})[\/-]([A-Za-z]{3})[\/-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (match) {
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    let day = parseInt(match[1], 10);
    const month = monthNames.indexOf(match[2].toUpperCase());
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    let hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7] ? match[7].toUpperCase() : "";
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    if (month >= 0) return new Date(year, month, day, hour, minute, second);
  }

  return null;
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return "";
  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const two = (number) => String(number).padStart(2, "0");
  return `${two(hours)}:${two(minutes)}:${two(seconds)}`;
}

function parseNumberFlexible(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim().replace(/,/g, ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function parseDurationToHours(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value).trim();
  if (!text) return null;

  const hms = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hms) {
    const hours = Number(hms[1]);
    const minutes = Number(hms[2] || 0);
    const seconds = Number(hms[3] || 0);
    return hours + minutes / 60 + seconds / 3600;
  }

  const daysMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:d|day|days)/i);
  const hoursMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:h|hour|hours)/i);
  if (daysMatch || hoursMatch) {
    return (daysMatch ? Number(daysMatch[1]) * 24 : 0) + (hoursMatch ? Number(hoursMatch[1]) : 0);
  }

  return parseNumberFlexible(text);
}

function formatDurationFromHours(hours) {
  if (hours == null || !Number.isFinite(hours) || hours < 0) return "";
  return formatDuration(hours * 60 * 60 * 1000);
}

function buildLubricationRowsFromToday(rowsToday, selectedToday) {
  const result = [];
  if (!rowsToday || !rowsToday.length) return result;

  const sourceColumns = Object.keys(rowsToday[0] || {});
  const descColumn = selectedToday.desc;

  // Prefer the real activation/start time. Do not accidentally use "Alarm Time to Now" as activation time.
  const preferredActivationColumn = findBestColumn(sourceColumns, [
    { terms: ["alarm activation time", "activation time", "active alarm activation time"], score: 100 },
    { terms: ["activation", "activated", "raised", "start", "occurred", "occurrence"], score: 80, exclude: ["time to now", "duration", "days", "now"] },
    { terms: ["timestamp", "date time", "datetime", "date"], score: 60, exclude: ["time to now", "duration", "days", "now"] }
  ]);
  const selectedTimeLooksLikeDuration = selectedToday.time && scoreColumn(selectedToday.time, [
    { terms: ["time to now", "duration", "days", "now"], score: 10 }
  ]) > -9999;
  const timeColumn = preferredActivationColumn || (!selectedTimeLooksLikeDuration ? selectedToday.time : "");

  const durationColumn = findBestColumn(sourceColumns, [
    { terms: ["alarm time to now", "time to now"], score: 100 },
    { terms: ["alarm duration", "duration"], score: 80 },
    { terms: ["elapsed"], score: 50 }
  ]);

  const daysColumn = findBestColumn(sourceColumns, [
    { terms: ["days"], score: 100 },
    { terms: ["day"], score: 70 }
  ]);

  const now = new Date();

  for (const row of rowsToday) {
    const deviceValue = row[selectedToday.device] ?? "";
    const alarmValue = row[selectedToday.alarm] ?? "";
    const descValue = descColumn ? (row[descColumn] ?? "") : "";
    const textForSearch = [alarmValue, descValue].join(" ").toLowerCase();
    if (!textForSearch.includes("lubrication")) continue;

    const activationRaw = timeColumn ? row[timeColumn] : "";
    const activationString = activationRaw == null ? "" : String(activationRaw).trim();
    let durationString = durationColumn ? String(row[durationColumn] ?? "").trim() : "";
    let daysString = daysColumn ? String(row[daysColumn] ?? "").trim() : "";
    let durationHours = 0;

    const sourceDays = parseNumberFlexible(daysString);
    if (sourceDays != null) durationHours = sourceDays * 24;

    if (!durationHours && durationString) {
      const parsedDurationHours = parseDurationToHours(durationString);
      if (parsedDurationHours != null && Number.isFinite(parsedDurationHours)) {
        durationHours = parsedDurationHours;
        if (!daysString) daysString = (parsedDurationHours / 24).toFixed(1);
      }
    }

    if (timeColumn && activationString) {
      const activationDate = parseDateTimeFlexible(activationString);
      if (activationDate) {
        const diffMs = now - activationDate;
        if (diffMs >= 0) {
          const days = diffMs / (1000 * 60 * 60 * 24);
          durationString = formatDuration(diffMs);
          daysString = days.toFixed(1);
          durationHours = diffMs / (1000 * 60 * 60);
        }
      }
    }

    if (!durationString && durationHours) durationString = formatDurationFromHours(durationHours);
    if (!daysString && durationHours) daysString = (durationHours / 24).toFixed(1);

    result.push({
      device: String(deviceValue).trim(),
      alarm: String(alarmValue).trim(),
      activation: activationString,
      duration: durationString,
      days: daysString,
      durationHours
    });
  }

  return result.sort((a, b) => (b.durationHours || 0) - (a.durationHours || 0));
}

function asBoolean(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const text = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(text);
}

function filterActiveRows(rows, statusOnly) {
  if (!statusOnly) return rows;
  const keys = Object.keys(rows[0] || {});
  const statusKey = keys.find((key) => /^(status|state)$/i.test(key));
  if (!statusKey) return rows;
  return rows.filter((row) => String(row[statusKey] || "").toUpperCase().includes("ACTIVE"));
}

function buildAAWComparison({ today, yesterday, daybefore, options }) {
  const includeTime = !!options.includeTime;
  const normalize = options.normalize !== false;
  const statusOnly = !!options.statusOnly;

  const selectedToday = autoMapColumns(today.columns);
  const selectedYesterday = autoMapColumns(yesterday.columns);
  const selectedDayBefore = daybefore ? autoMapColumns(daybefore.columns) : { device: "", alarm: "", desc: "", time: "" };

  if (!selectedToday.device || !selectedToday.alarm || !selectedYesterday.device || !selectedYesterday.alarm) {
    throw new Error("Could not auto-map required AAW columns. Required columns: turbine/device and alarm/event for today and yesterday files.");
  }

  const rowsToday = filterActiveRows(today.rows || [], statusOnly);
  const rowsYesterday = filterActiveRows(yesterday.rows || [], statusOnly);
  const hasDayBefore = !!(daybefore && daybefore.rows && daybefore.rows.length);
  const rowsDayBefore = hasDayBefore ? filterActiveRows(daybefore.rows || [], statusOnly) : [];

  const selectedD = { ...selectedDayBefore };
  if (hasDayBefore) {
    if (!selectedD.device) selectedD.device = selectedYesterday.device;
    if (!selectedD.alarm) selectedD.alarm = selectedYesterday.alarm;
    if (!selectedD.desc) selectedD.desc = selectedYesterday.desc;
    if (!selectedD.time) selectedD.time = selectedYesterday.time;
  }

  const idxToday = indexBy(rowsToday, selectedToday, includeTime, normalize);
  const idxYesterday = indexBy(rowsYesterday, selectedYesterday, includeTime, normalize);
  const idxDayBefore = hasDayBefore ? indexBy(rowsDayBefore, selectedD, includeTime, normalize) : null;
  const parseKey = (key) => {
    const [device, alarm, time] = key.split("||");
    return { device, alarm, time };
  };

  const repeated = [];
  const news = [];
  const cleared = [];
  const repeated3 = [];

  for (const [key, valueToday] of idxToday.entries()) {
    if (idxYesterday.has(key)) {
      const valueYesterday = idxYesterday.get(key);
      const todayRow = valueToday.row;
      const yesterdayRow = valueYesterday.row;
      const description = selectedToday.desc ? (todayRow[selectedToday.desc] || "") : (selectedYesterday.desc ? (yesterdayRow[selectedYesterday.desc] || "") : "");
      const parsed = parseKey(key);
      repeated.push({ device: parsed.device, alarm: parsed.alarm, description, count: `${valueToday.count}/${valueYesterday.count}` });
    } else {
      const todayRow = valueToday.row;
      const description = selectedToday.desc ? (todayRow[selectedToday.desc] || "") : "";
      const parsed = parseKey(key);
      news.push({ device: parsed.device, alarm: parsed.alarm, description });
    }
  }

  for (const [key, valueYesterday] of idxYesterday.entries()) {
    if (!idxToday.has(key)) {
      const yesterdayRow = valueYesterday.row;
      const description = selectedYesterday.desc ? (yesterdayRow[selectedYesterday.desc] || "") : "";
      const parsed = parseKey(key);
      cleared.push({ device: parsed.device, alarm: parsed.alarm, description });
    }
  }

  if (hasDayBefore) {
    for (const [key, valueToday] of idxToday.entries()) {
      if (idxYesterday.has(key) && idxDayBefore.has(key)) {
        const todayRow = valueToday.row;
        const parsed = parseKey(key);
        const description =
          selectedToday.desc && todayRow[selectedToday.desc] ? todayRow[selectedToday.desc] :
          selectedYesterday.desc && idxYesterday.get(key).row[selectedYesterday.desc] ? idxYesterday.get(key).row[selectedYesterday.desc] :
          selectedD.desc && idxDayBefore.get(key).row[selectedD.desc] ? idxDayBefore.get(key).row[selectedD.desc] : "";
        repeated3.push({ device: parsed.device, alarm: parsed.alarm, description });
      }
    }
  }

  const groupedRepeated = groupResultsByAlarm(repeated);
  const groupedNews = groupResultsByAlarm(news);
  const groupedCleared = groupResultsByAlarm(cleared);
  const groupedRepeated3 = groupResultsByAlarm(repeated3);
  const repeated3Set = new Set(groupedRepeated3.map((entry) => entry.alarm));
  const repeated3Pairs = [];

  if (hasDayBefore) {
    for (const key of idxToday.keys()) {
      if (idxYesterday.has(key) && idxDayBefore.has(key)) {
        const parts = key.split("||");
        if (parts.length >= 2) repeated3Pairs.push(`${parts[0]}||${parts[1]}`);
      }
    }
  }

  const lubricationRows = buildLubricationRowsFromToday(rowsToday, selectedToday);

  return {
    success: true,
    module: "AAW",
    phase: "backend-calculation",
    storageMode: "temporary-request-memory",
    persistentStorage: false,
    note: "AAW files were parsed and compared inside Cloudflare Worker memory for this request only. They are not saved after the response is returned.",
    receivedAt: new Date().toISOString(),
    options: { includeTime, normalize, statusOnly },
    selectedColumns: {
      today: selectedToday,
      yesterday: selectedYesterday,
      daybefore: selectedD
    },
    source: {
      today: { fileName: today.fileName, rowsCount: today.rowsCount, columns: today.columns },
      yesterday: { fileName: yesterday.fileName, rowsCount: yesterday.rowsCount, columns: yesterday.columns },
      daybefore: daybefore ? { fileName: daybefore.fileName, rowsCount: daybefore.rowsCount, columns: daybefore.columns } : null
    },
    stats: {
      today: today.rowsCount,
      yesterday: yesterday.rowsCount,
      daybefore: daybefore ? daybefore.rowsCount : null,
      filteredToday: rowsToday.length,
      filteredYesterday: rowsYesterday.length,
      filteredDayBefore: hasDayBefore ? rowsDayBefore.length : null,
      repeated: groupedRepeated.length,
      news: groupedNews.length,
      cleared: groupedCleared.length,
      repeated3: hasDayBefore ? groupedRepeated3.length : null,
      lubrication: lubricationRows.length
    },
    results: {
      repeated: groupedRepeated.map((row) => ({ ...row, highlight: repeated3Set.has(row.alarm) })),
      news: groupedNews.map((row) => ({ ...row, highlight: false })),
      cleared: groupedCleared.map((row) => ({ ...row, highlight: false })),
      repeated3: groupedRepeated3,
      lubrication: lubricationRows
    },
    highlight: {
      repeated3Alarms: Array.from(repeated3Set),
      repeated3Pairs: Array.from(new Set(repeated3Pairs))
    }
  };
}

async function handleAAWUpload(request, env) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse(request, env, {
      success: false,
      message: "Expected multipart/form-data with today, yesterday, and optional daybefore files."
    }, 400);
  }

  const form = await request.formData();
  const inputFiles = {
    today: form.get("today") || form.get("file"),
    yesterday: form.get("yesterday"),
    daybefore: form.get("daybefore")
  };

  const provided = Object.entries(inputFiles).filter(([, file]) => file && typeof file.arrayBuffer === "function");
  if (provided.length === 0) {
    return jsonResponse(request, env, {
      success: false,
      message: "No valid AAW file was uploaded. Send at least the today file."
    }, 400);
  }

  const files = {};
  for (const [label, file] of provided) {
    files[label] = await parseSpreadsheetFile(file, label, false);
  }

  return jsonResponse(request, env, {
    success: true,
    module: "AAW",
    phase: "upload-and-parse",
    storageMode: "temporary-request-memory",
    persistentStorage: false,
    note: "Files were parsed in Cloudflare Worker memory for this request only. They are not saved after the response is returned.",
    receivedAt: new Date().toISOString(),
    files
  });
}

async function handleAAWCompare(request, env) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonResponse(request, env, {
      success: false,
      message: "Expected multipart/form-data with today, yesterday, and optional daybefore files."
    }, 400);
  }

  const form = await request.formData();
  const todayFile = form.get("today") || form.get("file");
  const yesterdayFile = form.get("yesterday");
  const dayBeforeFile = form.get("daybefore");

  if (!todayFile || typeof todayFile.arrayBuffer !== "function" || !yesterdayFile || typeof yesterdayFile.arrayBuffer !== "function") {
    return jsonResponse(request, env, {
      success: false,
      message: "AAW backend comparison requires today and yesterday files."
    }, 400);
  }

  const today = await parseSpreadsheetFile(todayFile, "today", true);
  const yesterday = await parseSpreadsheetFile(yesterdayFile, "yesterday", true);
  const daybefore = dayBeforeFile && typeof dayBeforeFile.arrayBuffer === "function"
    ? await parseSpreadsheetFile(dayBeforeFile, "daybefore", true)
    : null;

  const payload = buildAAWComparison({
    today,
    yesterday,
    daybefore,
    options: {
      includeTime: asBoolean(form.get("includeTime"), false),
      normalize: asBoolean(form.get("normalize"), true),
      statusOnly: asBoolean(form.get("statusOnly"), false)
    }
  });

  return jsonResponse(request, env, payload);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env)
      });
    }

    try {
      if (url.pathname === "/" || url.pathname === "/api/health") {
        return jsonResponse(request, env, {
          success: true,
          service: "WTG AAW Cloudflare Backend",
          status: "ok",
          endpoints: ["POST /api/aaw/upload", "POST /api/aaw/compare", "POST /api/aws/upload"],
          storageMode: "temporary-request-memory"
        });
      }

      if (url.pathname === "/api/aaw/upload" && request.method === "POST") {
        return await handleAAWUpload(request, env);
      }

      if (url.pathname === "/api/aaw/compare" && request.method === "POST") {
        return await handleAAWCompare(request, env);
      }

      if (url.pathname === "/api/aws/upload" && request.method === "POST") {
        return await handleAWSUpload(request, env);
      }

      return jsonResponse(request, env, {
        success: false,
        message: "Not found"
      }, 404);
    } catch (error) {
      console.error(error);
      return jsonResponse(request, env, {
        success: false,
        message: "Backend failed while processing the request.",
        error: error && error.message ? error.message : String(error)
      }, 500);
    }
  }
};
