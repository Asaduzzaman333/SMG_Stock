import { getIssueEntries, getPurchaseEntries } from "./api-client.js";

const EXPORT_FLAGS = ["Design Requirement", "Purchased", "Replace", "New", "Extra"];
const EXPORT_RECEIVED_FLAGS = ["Purchased", "Replace", "New", "Extra"];

function toExportQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function groupKey(entry) {
  return [entry.itemType || "-", entry.brand || "-", entry.model || "-", entry.item || "-"].join("|||");
}

function ensureGroup(groups, entry) {
  const key = groupKey(entry);

  if (!groups.has(key)) {
    groups.set(key, {
      itemType: entry.itemType || "-",
      brand: entry.brand || "-",
      model: entry.model || "-",
      item: entry.item || "-",
      flags: Object.fromEntries(EXPORT_FLAGS.map((flag) => [flag, 0])),
      issued: 0,
    });
  }

  return groups.get(key);
}

function matchesFilters(entry, filters = {}) {
  const itemTypeMatch = !filters.itemType || filters.itemType === "all" || entry.itemType === filters.itemType;
  const brandMatch = !filters.brand || filters.brand === "all" || entry.brand === filters.brand;
  const modelMatch = !filters.model || filters.model === "all" || entry.model === filters.model;
  return itemTypeMatch && brandMatch && modelMatch;
}

function buildStockSummarySheet(entries, issues, filters = {}) {
  const groups = new Map();

  entries.filter((entry) => matchesFilters(entry, filters)).forEach((entry) => {
    const group = ensureGroup(groups, entry);
    const flag = entry.flag || "-";

    if (group.flags[flag] !== undefined) {
      group.flags[flag] += toExportQuantity(entry.quantity);
    }
  });

  issues.filter((entry) => matchesFilters(entry, filters)).forEach((entry) => {
    ensureGroup(groups, entry).issued += toExportQuantity(entry.quantity);
  });

  const rows = [...groups.values()]
    .sort(
      (a, b) =>
        a.itemType.localeCompare(b.itemType) ||
        a.brand.localeCompare(b.brand) ||
        a.model.localeCompare(b.model) ||
        a.item.localeCompare(b.item),
    )
    .map((group) => {
      const received = EXPORT_RECEIVED_FLAGS.reduce((sum, flag) => sum + group.flags[flag], 0);

      return [
        group.itemType,
        group.brand,
        group.model,
        group.item,
        ...EXPORT_FLAGS.map((flag) => group.flags[flag] || ""),
        group.issued || "",
        received - group.issued,
      ];
    });

  return {
    rows: [
      ["Item Type", "Brand", "Model", "Item", ...EXPORT_FLAGS, "Issued", "Stock"],
      ...rows,
    ],
  };
}

function buildPurchaseSummarySheet(entries, filters = {}) {
  const groups = new Map();

  entries.filter((entry) => matchesFilters(entry, filters)).forEach((entry) => {
    const group = ensureGroup(groups, entry);
    const flag = entry.flag || "-";
    const quantity = toExportQuantity(entry.quantity);

    if (group.flags[flag] !== undefined) {
      group.flags[flag] += quantity;
    }

    if (EXPORT_RECEIVED_FLAGS.includes(flag)) {
      group.total = (group.total || 0) + quantity;
    }
  });

  const rows = [...groups.values()]
    .sort(
      (a, b) =>
        a.itemType.localeCompare(b.itemType) ||
        a.brand.localeCompare(b.brand) ||
        a.model.localeCompare(b.model) ||
        a.item.localeCompare(b.item),
    )
    .map((group) => [
      group.itemType,
      group.brand,
      group.model,
      group.item,
      ...EXPORT_FLAGS.map((flag) => group.flags[flag] || ""),
      group.total || "",
    ]);

  return {
    rows: [
      ["Item Type", "Brand", "Model", "Item", ...EXPORT_FLAGS, "Total Purchases"],
      ...rows,
    ],
  };
}

function buildIssueSummarySheet(issues, filters = {}) {
  const groups = new Map();

  issues.filter((entry) => matchesFilters(entry, filters)).forEach((entry) => {
    const key = [
      groupKey(entry),
      entry.entity || "-",
      entry.fromBin || "-",
      entry.receivedBy || "-",
      entry.receivedDate || "-",
    ].join("|||");

    if (!groups.has(key)) {
      groups.set(key, {
        itemType: entry.itemType || "-",
        brand: entry.brand || "-",
        model: entry.model || "-",
        item: entry.item || "-",
        entity: entry.entity || "-",
        fromBin: entry.fromBin || "-",
        receivedBy: entry.receivedBy || "-",
        receivedDate: entry.receivedDate || "-",
        issued: 0,
      });
    }

    groups.get(key).issued += toExportQuantity(entry.quantity);
  });

  const rows = [...groups.values()]
    .sort(
      (a, b) =>
        a.itemType.localeCompare(b.itemType) ||
        a.brand.localeCompare(b.brand) ||
        a.model.localeCompare(b.model) ||
        a.item.localeCompare(b.item) ||
        a.entity.localeCompare(b.entity) ||
        a.fromBin.localeCompare(b.fromBin) ||
        a.receivedBy.localeCompare(b.receivedBy) ||
        a.receivedDate.localeCompare(b.receivedDate),
    )
    .map((group) => [
      group.itemType,
      group.brand,
      group.model,
      group.item,
      group.entity,
      group.fromBin,
      group.receivedBy,
      group.receivedDate,
      group.issued || "",
    ]);

  return {
    rows: [
      ["Item Type", "Brand", "Model", "Item", "Entity", "From BIN", "Received By", "Received Date", "Total Issues"],
      ...rows,
    ],
  };
}

function buildPurchaseRows(entries) {
  return [
    [
      "Item Type",
      "Date",
      "Brand",
      "Model",
      "Item",
      "Rate",
      "Quantity",
      "Currency",
      "Flag",
      "Via",
      "Storage Slot",
      "Remarks",
    ],
    ...entries.map((entry) => [
      entry.itemType || "",
      entry.date || "",
      entry.brand || "",
      entry.model || "",
      entry.item || "",
      Number(entry.rate) || "",
      toExportQuantity(entry.quantity),
      entry.currency || "",
      entry.flag || "",
      entry.via || "",
      entry.storageSlot || "",
      entry.remarks || "",
    ]),
  ];
}

function buildIssueRows(entries) {
  return [
    [
      "Entity",
      "Date",
      "Item Type",
      "Brand",
      "Model",
      "Item",
      "Quantity",
      "From BIN",
      "Issued To",
      "Received By",
      "Received Date",
      "Remarks",
    ],
    ...entries.map((entry) => [
      entry.entity || "",
      entry.date || "",
      entry.itemType || "",
      entry.brand || "",
      entry.model || "",
      entry.item || "",
      toExportQuantity(entry.quantity),
      entry.fromBin || "",
      entry.issuedTo || "",
      entry.receivedBy || "",
      entry.receivedDate || "",
      entry.remarks || "",
    ]),
  ];
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index) {
  let name = "";
  let number = index + 1;

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}

function sheetXml(rows, merges = []) {
  const sheetData = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const cellRef = `${columnName(columnIndex)}${rowIndex + 1}`;

          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${cellRef}"><v>${value}</v></c>`;
          }

          return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  const mergeCells = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((merge) => `<mergeCell ref="${merge}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetData}</sheetData>${mergeCells}</worksheet>`;
}

function workbookXml(sheetNames) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames
    .map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("")}</sheets></workbook>`;
}

function workbookRelsXml(sheetCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("")}</Relationships>`;
}

function contentTypesXml(sheetCount) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("")}</Types>`;
}

function rootRelsXml() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
}

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    return crc >>> 0;
  });
}

const crcTable = makeCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function textBytes(text) {
  return [...new TextEncoder().encode(text)];
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = textBytes(file.name);
    const dataBytes = textBytes(file.content);
    const crc = crc32(dataBytes);
    const localHeader = [
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(crc),
      ...uint32(dataBytes.length),
      ...uint32(dataBytes.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...nameBytes,
    ];

    localParts.push(...localHeader, ...dataBytes);
    centralParts.push(
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(crc),
      ...uint32(dataBytes.length),
      ...uint32(dataBytes.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
      ...nameBytes,
    );
    offset += localHeader.length + dataBytes.length;
  });

  const endRecord = [
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(files.length),
    ...uint16(files.length),
    ...uint32(centralParts.length),
    ...uint32(localParts.length),
    ...uint16(0),
  ];

  return new Uint8Array([...localParts, ...centralParts, ...endRecord]);
}

function createWorkbook(sheets) {
  const sheetNames = sheets.map((sheet) => sheet.name);
  const files = [
    { name: "[Content_Types].xml", content: contentTypesXml(sheets.length) },
    { name: "_rels/.rels", content: rootRelsXml() },
    { name: "xl/workbook.xml", content: workbookXml(sheetNames) },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml(sheets.length) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: sheetXml(sheet.rows, sheet.merges),
    })),
  ];

  return createZip(files);
}

export async function exportReport(preLoadedEntries, preLoadedIssues, exportType = "all") {
  if (exportType && typeof exportType === "object" && exportType.type === "custom-summary") {
    const workbook = createWorkbook([
      {
        name: exportType.sheetName || "Summary",
        rows: exportType.rows || [],
      },
    ]);
    const blob = new Blob([workbook], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${exportType.filename || `SMG_Stock_Summary_${new Date().toISOString().slice(0, 10)}`}.xlsx`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
    return;
  }

  const entries = Array.isArray(preLoadedEntries) ? preLoadedEntries : await getPurchaseEntries();
  const issues = Array.isArray(preLoadedIssues) ? preLoadedIssues : await getIssueEntries();
  const exportConfig =
    typeof exportType === "string"
      ? { type: exportType }
      : { type: exportType?.type || "all", filters: exportType?.filters || {} };
  const { type, filters } = exportConfig;

  let sheets = [];
  let filename = `SMG_Stock_Report_${new Date().toISOString().slice(0, 10)}`;

  if (type === "purchases" || type === "all") {
    sheets.push({
      name: type === "all" ? "Purchase Entries" : "Purchase Summary",
      rows: type === "all" ? buildPurchaseRows(entries) : buildPurchaseSummarySheet(entries, filters).rows,
    });
  }

  if (type === "issues" || type === "all") {
    sheets.push({
      name: type === "all" ? "Issue Register" : "Issue Summary",
      rows: type === "all" ? buildIssueRows(issues) : buildIssueSummarySheet(issues, filters).rows,
    });
  }

  if (type === "stock" || type === "all") {
    const summarySheet = buildStockSummarySheet(entries, issues, filters);
    sheets.push({
      name: "Stock Summary",
      rows: summarySheet.rows,
      merges: summarySheet.merges,
    });
  }

  if (type === "purchases") {
    filename = `SMG_Stock_Purchase_Summary_${new Date().toISOString().slice(0, 10)}`;
  } else if (type === "issues") {
    filename = `SMG_Stock_Issue_Summary_${new Date().toISOString().slice(0, 10)}`;
  } else if (type === "stock") {
    filename = `SMG_Stock_Inventory_Summary_${new Date().toISOString().slice(0, 10)}`;
  }

  const workbook = createWorkbook(sheets);
  const blob = new Blob([workbook], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.xlsx`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
