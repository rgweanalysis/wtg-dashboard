import * as XLSX from "xlsx";

const MAX_PREVIEW_ROWS = 25;
const MAX_RETURN_ROWS = 0; // Keep 0 for phase 1: parse/validate only, do not return full private data.

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

async function parseSpreadsheetFile(file, label) {
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
  const rows = normaliseRows(rawRows);
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
    data: MAX_RETURN_ROWS > 0 ? rows.slice(0, MAX_RETURN_ROWS) : undefined
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
    files[label] = await parseSpreadsheetFile(file, label);
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
          endpoints: ["POST /api/aaw/upload"],
          storageMode: "temporary-request-memory"
        });
      }

      if (url.pathname === "/api/aaw/upload" && request.method === "POST") {
        return await handleAAWUpload(request, env);
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
