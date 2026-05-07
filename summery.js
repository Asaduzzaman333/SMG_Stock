import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  logoutCurrentUser,
  requireAuth,
  subscribeToIssueEntries,
  subscribeToPurchaseEntries,
} from "./api-client.js";
import { exportReport } from "./export-report.js";

const h = React.createElement;

const VIEW_TITLES = {
  purchases: "Purchases Summery",
  issues: "Issues Summery",
  stock: "Stock Summery",
};
const EXPORT_BUTTON_LABELS = {
  purchases: "Export Purchase Summary",
  issues: "Export Issue Summary",
  stock: "Export Stock Summary",
};
const EXPORT_FILENAMES = {
  purchases: "SMG_Stock_Purchase_Summary",
  issues: "SMG_Stock_Issue_Summary",
  stock: "SMG_Stock_Inventory_Summary",
};

function waitForWindowLoad() {
  if (document.readyState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.addEventListener("load", resolve, { once: true });
  });
}

function finishPageLoad() {
  const pageLoader = document.querySelector("#pageLoader");
  document.body.classList.remove("is-loading");
  document.body.classList.add("is-ready");
  window.setTimeout(() => pageLoader?.remove(), 650);
}

function formatRequestError(error, fallback) {
  if (!error) {
    return fallback;
  }

  const code = error.code ? ` (${error.code})` : "";
  const message = error.message ? ` ${error.message}` : "";
  return `${fallback}${code}${message}`;
}

function toQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function uniqueValues(rows, key) {
  return [...new Set(rows.map((entry) => entry[key]).filter(Boolean))].sort();
}

function baseKey(entry) {
  return [entry.itemType || "-", entry.brand || "-", entry.model || "-", entry.item || "-"].join("|||");
}

function sortBaseRows(rows) {
  return rows.sort(
    (a, b) =>
      a.itemType.localeCompare(b.itemType) ||
      a.brand.localeCompare(b.brand) ||
      a.model.localeCompare(b.model) ||
      a.item.localeCompare(b.item),
  );
}

function ensurePurchaseGroup(groups, entry) {
  const key = baseKey(entry);

  if (!groups.has(key)) {
    groups.set(key, {
      itemType: entry.itemType || "-",
      brand: entry.brand || "-",
      model: entry.model || "-",
      item: entry.item || "-",
      total: 0,
    });
  }

  return groups.get(key);
}

function ensureIssueGroup(groups, entry) {
  const key = [
    baseKey(entry),
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

  return groups.get(key);
}

function matchesFilters(entry, filters) {
  const itemTypeMatch = filters.itemType === "all" || entry.itemType === filters.itemType;
  const brandMatch = filters.brand === "all" || entry.brand === filters.brand;
  const modelMatch = filters.model === "all" || entry.model === filters.model;
  return itemTypeMatch && brandMatch && modelMatch;
}

function buildPurchaseRows(entries, filters) {
  const groups = new Map();

  entries.filter((entry) => matchesFilters(entry, filters)).forEach((entry) => {
    const key = [baseKey(entry), entry.via || "-"].join("|||");

    if (!groups.has(key)) {
      groups.set(key, {
        itemType: entry.itemType || "-",
        brand: entry.brand || "-",
        model: entry.model || "-",
        item: entry.item || "-",
        via: entry.via || "-",
        totalPurchases: 0,
      });
    }

    groups.get(key).totalPurchases += toQuantity(entry.quantity);
  });

  return [...groups.values()].sort(
    (a, b) =>
      a.itemType.localeCompare(b.itemType) ||
      a.brand.localeCompare(b.brand) ||
      a.model.localeCompare(b.model) ||
      a.item.localeCompare(b.item) ||
      a.via.localeCompare(b.via),
  );
}

function buildIssueRows(issues, filters) {
  const groups = new Map();

  issues.filter((entry) => matchesFilters(entry, filters)).forEach((entry) => {
    ensureIssueGroup(groups, entry).issued += toQuantity(entry.quantity);
  });

  return [...groups.values()].sort(
    (a, b) =>
      a.itemType.localeCompare(b.itemType) ||
      a.brand.localeCompare(b.brand) ||
      a.model.localeCompare(b.model) ||
      a.item.localeCompare(b.item) ||
      a.entity.localeCompare(b.entity) ||
      a.fromBin.localeCompare(b.fromBin) ||
      a.receivedBy.localeCompare(b.receivedBy) ||
      a.receivedDate.localeCompare(b.receivedDate),
  );
}

function buildStockRows(entries, issues, filters) {
  const groups = new Map();

  entries.filter((entry) => matchesFilters(entry, filters)).forEach((entry) => {
    const group = ensurePurchaseGroup(groups, entry);
    group.total += toQuantity(entry.quantity);
  });

  issues.filter((entry) => matchesFilters(entry, filters)).forEach((entry) => {
    const group = ensurePurchaseGroup(groups, entry);
    group.issued = (group.issued || 0) + toQuantity(entry.quantity);
  });

  return sortBaseRows([...groups.values()].map((group) => ({ issued: 0, ...group })));
}

function SelectFilter({ id, label, allLabel, value, values, onChange }) {
  const selectedValue = values.includes(value) ? value : "all";

  return h(
    "label",
    null,
    h("span", null, label),
    h(
      "select",
      { id, value: selectedValue, onChange: (event) => onChange(event.target.value) },
      h("option", { value: "all" }, `All ${allLabel}`),
      values.map((option) => h("option", { key: option, value: option }, option)),
    ),
  );
}

function SummaryHead({ activeView }) {
  if (activeView === "purchases") {
    return h(
      "thead",
      { id: "summaryHead" },
      h(
        "tr",
        null,
        ["Item Type", "Brand", "Model", "Item", "Supplier", "Total Purchases"].map((heading) =>
          h("th", { key: heading }, heading),
        ),
      ),
    );
  }

  if (activeView === "issues") {
    return h(
      "thead",
      { id: "summaryHead" },
      h(
        "tr",
        null,
        ["Item Type", "Brand", "Model", "Item", "Entity", "Total Issues"].map((heading) =>
          h("th", { key: heading }, heading),
        ),
      ),
    );
  }

  return h(
    "thead",
    { id: "summaryHead" },
    h(
      "tr",
      null,
      ["Item Type", "Brand", "Model", "Item", "Purchases", "Issues", "Stock"].map((heading) => h("th", { key: heading }, heading)),
    ),
  );
}

function SummaryRows({ activeView, rows, loadError, isLoading }) {
  if (loadError) {
    return h("tbody", { id: "summaryRows" }, h("tr", { className: "empty-row" }, h("td", { colSpan: 9 }, loadError)));
  }

  if (isLoading) {
    return h("tbody", { id: "summaryRows" }, h("tr", { className: "empty-row" }, h("td", { colSpan: 9 }, "Loading summary data...")));
  }

  if (activeView === "purchases") {
    if (rows.length === 0) {
      return h("tbody", { id: "summaryRows" }, h("tr", { className: "empty-row" }, h("td", { colSpan: 6 }, "No purchase data found.")));
    }

    return h(
      "tbody",
      { id: "summaryRows" },
      rows.map((row) =>
        h(
          "tr",
          { key: [baseKey(row), row.via].join("|||") },
          h("td", { className: "sticky-col item-type-cell" }, row.itemType),
          h("td", { className: "sticky-col brand-cell" }, row.brand),
          h("td", { className: "sticky-col model-cell" }, row.model),
          h("td", { className: "sticky-col item-cell" }, row.item),
          h("td", null, row.via),
          h("td", { className: "qty-cell" }, row.totalPurchases || ""),
        ),
      ),
    );
  }

  if (activeView === "issues") {
    if (rows.length === 0) {
      return h("tbody", { id: "summaryRows" }, h("tr", { className: "empty-row" }, h("td", { colSpan: 6 }, "No issue data found.")));
    }

    return h(
      "tbody",
      { id: "summaryRows" },
      rows.map((row) =>
        h(
          "tr",
          { key: [baseKey(row), row.entity, row.fromBin, row.receivedBy, row.receivedDate].join("|||") },
          h("td", { className: "sticky-col item-type-cell" }, row.itemType),
          h("td", { className: "sticky-col brand-cell" }, row.brand),
          h("td", { className: "sticky-col model-cell" }, row.model),
          h("td", { className: "sticky-col item-cell" }, row.item),
          h("td", null, row.entity),
          h("td", { className: "qty-cell" }, row.issued || ""),
        ),
      ),
    );
  }

  if (rows.length === 0) {
    return h("tbody", { id: "summaryRows" }, h("tr", { className: "empty-row" }, h("td", { colSpan: 7 }, "No stock data found.")));
  }

  return h(
    "tbody",
    { id: "summaryRows" },
    rows.map((row) => {
      const stock = row.total - row.issued;

      return h(
        "tr",
        { key: baseKey(row) },
        h("td", { className: "sticky-col item-type-cell" }, row.itemType),
        h("td", { className: "sticky-col brand-cell" }, row.brand),
        h("td", { className: "sticky-col model-cell" }, row.model),
        h("td", { className: "sticky-col item-cell" }, row.item),
        h("td", { className: "qty-cell" }, row.total || ""),
        h("td", { className: "qty-cell" }, row.issued || ""),
        h("td", { className: `stock-cell ${stock < 0 ? "negative" : ""}` }, stock),
      );
    }),
  );
}

function exportRowsForView(activeView, rows) {
  if (activeView === "purchases") {
    return [
      ["Item Type", "Brand", "Model", "Item", "Supplier", "Total Purchases"],
      ...rows.map((row) => [row.itemType, row.brand, row.model, row.item, row.via, row.totalPurchases || ""]),
    ];
  }

  if (activeView === "issues") {
    return [
      ["Item Type", "Brand", "Model", "Item", "Entity", "Total Issues"],
      ...rows.map((row) => [row.itemType, row.brand, row.model, row.item, row.entity, row.issued || ""]),
    ];
  }

  return [
    ["Item Type", "Brand", "Model", "Item", "Purchases", "Issues", "Stock"],
    ...rows.map((row) => [row.itemType, row.brand, row.model, row.item, row.total || "", row.issued || "", row.total - row.issued]),
  ];
}

function SummeryApp() {
  const [entries, setEntries] = useState([]);
  const [issues, setIssues] = useState([]);
  const [activeView, setActiveView] = useState("stock");
  const [filters, setFilters] = useState({ itemType: "all", brand: "all", model: "all" });
  const [purchaseLoaded, setPurchaseLoaded] = useState(false);
  const [issueLoaded, setIssueLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let stopEntriesSubscription = null;
    let stopIssueEntriesSubscription = null;
    let isActive = true;

    async function initPage() {
      try {
        await requireAuth("/login");

        const loadSummery = new Promise((resolve) => {
          let hasPurchaseData = false;
          let hasIssueData = false;
          const settleWhenReady = () => {
            if (hasPurchaseData && hasIssueData) {
              resolve();
            }
          };

          stopEntriesSubscription = subscribeToPurchaseEntries(
            (updatedEntries) => {
              if (!isActive) {
                return;
              }
              setEntries(updatedEntries);
              setPurchaseLoaded(true);
              hasPurchaseData = true;
              settleWhenReady();
            },
            (error) => {
              if (!isActive) {
                return;
              }
              setLoadError(formatRequestError(error, "Summary load failed."));
              setPurchaseLoaded(true);
              hasPurchaseData = true;
              console.error(error);
              settleWhenReady();
            },
          );

          stopIssueEntriesSubscription = subscribeToIssueEntries(
            (updatedEntries) => {
              if (!isActive) {
                return;
              }
              setIssues(updatedEntries);
              setIssueLoaded(true);
              hasIssueData = true;
              settleWhenReady();
            },
            (error) => {
              if (!isActive) {
                return;
              }
              setLoadError(formatRequestError(error, "Issue summary load failed."));
              setIssueLoaded(true);
              hasIssueData = true;
              console.error(error);
              settleWhenReady();
            },
          );
        });

        await Promise.all([waitForWindowLoad(), loadSummery]);
        if (isActive) {
          finishPageLoad();
        }
      } catch (error) {
        if (isActive && error.message !== "Auth required") {
          setLoadError(formatRequestError(error, "Authentication check failed."));
          finishPageLoad();
        }
      }
    }

    initPage();

    return () => {
      isActive = false;
      stopEntriesSubscription?.();
      stopIssueEntriesSubscription?.();
    };
  }, []);

  const allRows = useMemo(() => [...entries, ...issues], [entries, issues]);
  const options = useMemo(
    () => ({
      itemType: uniqueValues(allRows, "itemType"),
      brand: uniqueValues(allRows, "brand"),
      model: uniqueValues(allRows, "model"),
    }),
    [allRows],
  );
  const effectiveFilters = {
    itemType: options.itemType.includes(filters.itemType) ? filters.itemType : "all",
    brand: options.brand.includes(filters.brand) ? filters.brand : "all",
    model: options.model.includes(filters.model) ? filters.model : "all",
  };
  const summaryRows = useMemo(() => {
    if (activeView === "purchases") {
      return buildPurchaseRows(entries, effectiveFilters);
    }

    if (activeView === "issues") {
      return buildIssueRows(issues, effectiveFilters);
    }

    return buildStockRows(entries, issues, effectiveFilters);
  }, [activeView, entries, issues, effectiveFilters.itemType, effectiveFilters.brand, effectiveFilters.model]);
  const isLoading = !purchaseLoaded || !issueLoaded;

  async function handleExport() {
    setExporting(true);

    try {
      await exportReport(null, null, {
        type: "custom-summary",
        sheetName: VIEW_TITLES[activeView],
        filename: `${EXPORT_FILENAMES[activeView]}_${new Date().toISOString().slice(0, 10)}`,
        rows: exportRowsForView(activeView, summaryRows),
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await logoutCurrentUser();
      window.location.replace("/login");
    } catch (error) {
      setLoadError(formatRequestError(error, "Logout failed."));
      setLoggingOut(false);
    }
  }

  return h(
    "div",
    { className: "shell" },
    h(
      "aside",
      { className: "sidebar", "aria-label": "Main navigation" },
      h(
        "a",
        { className: "brand", href: "/", "aria-label": "SMG Stock home" },
        h("img", { className: "brand-logo", src: "/smg-logo-blue.png", alt: "SMG Stock logo" }),
        h("span", null, h("strong", null, "SMG Stock")),
      ),
      h(
        "nav",
        { className: "nav-list" },
        h("a", { className: "nav-item", href: "/" }, "Purchases & Inventory"),
        h("a", { className: "nav-item active", href: "/summery" }, "Summery"),
      ),
    ),
    h(
      "main",
      { className: "content" },
      h(
        "header",
        { className: "topbar" },
        h("div", null, h("p", { className: "eyebrow" })),
        h("div", { className: "section-heading" }, h("h2", null, "Summery")),
        h(
          "div",
          { className: "top-actions" },
          h("button", { className: "ghost-btn", id: "exportReportBtn", type: "button", onClick: handleExport, disabled: exporting }, exporting ? "Preparing Export..." : EXPORT_BUTTON_LABELS[activeView]),
          h("a", { className: "primary-btn", href: "/" }, "Back to Inventory"),
          h("button", { className: "ghost-btn logout-btn", id: "logoutBtn", type: "button", onClick: handleLogout, disabled: loggingOut }, "Logout"),
        ),
      ),
      h(
        "section",
        { className: "section-block", "aria-label": "Summery" },
        h(
          "article",
          { className: "summary-controls panel" },
          h(SelectFilter, {
            id: "itemTypeFilter",
            label: "Item Type",
            allLabel: "Item Types",
            value: effectiveFilters.itemType,
            values: options.itemType,
            onChange: (itemType) => setFilters((current) => ({ ...current, itemType })),
          }),
          h(SelectFilter, {
            id: "brandFilter",
            label: "Brand",
            allLabel: "Brands",
            value: effectiveFilters.brand,
            values: options.brand,
            onChange: (brand) => setFilters((current) => ({ ...current, brand })),
          }),
          h(SelectFilter, {
            id: "modelFilter",
            label: "Model",
            allLabel: "Models",
            value: effectiveFilters.model,
            values: options.model,
            onChange: (model) => setFilters((current) => ({ ...current, model })),
          }),
        ),
        h(
          "article",
          { className: "table-panel pivot-panel" },
          h(
            "div",
            { className: "panel-header" },
            h("div", null, h("h2", { id: "summaryTitle" }, VIEW_TITLES[activeView])),
            h(
              "div",
              { className: "summary-tabs", role: "tablist", "aria-label": "Summery type" },
              ["purchases", "issues", "stock"].map((view) =>
                h(
                  "button",
                  {
                    key: view,
                    className: `summary-tab${activeView === view ? " active" : ""}`,
                    type: "button",
                    "aria-selected": String(activeView === view),
                    onClick: () => setActiveView(view),
                  },
                  view === "purchases" ? "Purchases" : view === "issues" ? "Issues" : "Stock",
                ),
              ),
            ),
          ),
          h(
            "div",
            { className: "table-wrap" },
            h("table", { className: "pivot-table" }, h(SummaryHead, { activeView }), h(SummaryRows, { activeView, rows: summaryRows, loadError, isLoading })),
          ),
        ),
      ),
    ),
  );
}

createRoot(document.querySelector("#root")).render(h(SummeryApp));
