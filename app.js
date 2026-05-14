import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  addIssueEntry,
  addPurchaseEntry,
  deleteIssueEntry,
  deletePurchaseEntry,
  getIssueEntries,
  getPurchaseEntries,
  subscribeToIssueEntries,
  subscribeToPurchaseEntries,
  updateIssueEntry,
  updatePurchaseEntry,
} from "./api-client.js";
import { exportReport } from "./export-report.js";
import { sessionManager } from "./session-manager.js";

const h = React.createElement;

const purchaseInitial = {
  itemType: "",
  date: "",
  brand: "",
  model: "",
  item: "",
  rate: "",
  quantity: "",
  currency: "BDT",
  via: "",
  storageSlot: "",
  remarks: "",
};

const issueInitial = {
  entity: "",
  date: "",
  itemType: "",
  brand: "",
  model: "",
  item: "",
  quantity: "",
  fromBin: "",
  issuedTo: "",
  receivedBy: "",
  receivedDate: "",
  remarks: "",
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

function fieldValue(entry, key, fallback = "") {
  return entry?.[key] ?? fallback;
}

function displayValue(value, fallback = "-") {
  return value || fallback;
}

function toPositiveQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function normalizeOptionValue(value) {
  return String(value || "").trim();
}

function normalizedCompareValue(value) {
  return normalizeOptionValue(value).toLowerCase();
}

function valueMatchesSelection(optionValue, selectedValue) {
  const selected = normalizedCompareValue(selectedValue);

  if (!selected) {
    return true;
  }

  const option = normalizedCompareValue(optionValue);
  return option === selected || option.includes(selected);
}

function stockCompositeKey(entry) {
  return [
    normalizeOptionValue(entry.itemType),
    normalizeOptionValue(entry.brand),
    normalizeOptionValue(entry.model),
    normalizeOptionValue(entry.item),
    normalizeOptionValue(entry.storageSlot || entry.fromBin),
  ].join("|||");
}

function buildAvailableStock(entries, issues, excludedIssueId = null) {
  const stock = new Map();

  entries.forEach((entry) => {
    const key = stockCompositeKey(entry);
    const current = stock.get(key);
    const quantity = toPositiveQuantity(entry.quantity);

    if (!current) {
      stock.set(key, {
        itemType: normalizeOptionValue(entry.itemType),
        brand: normalizeOptionValue(entry.brand),
        model: normalizeOptionValue(entry.model),
        item: normalizeOptionValue(entry.item),
        fromBin: normalizeOptionValue(entry.storageSlot),
        quantity,
      });
      return;
    }

    current.quantity += quantity;
  });

  issues.forEach((entry) => {
    if (excludedIssueId && entry.id === excludedIssueId) {
      return;
    }

    const key = stockCompositeKey(entry);
    const current = stock.get(key);

    if (!current) {
      return;
    }

    current.quantity = Math.max(0, current.quantity - toPositiveQuantity(entry.quantity));
  });

  return [...stock.values()].filter((entry) => entry.quantity > 0);
}

function distinctValues(rows, field) {
  return [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getAvailableQuantityForIssue(rows, form) {
  if (!form.itemType || !form.brand || !form.model || !form.item) {
    return 0;
  }

  const filteredByType = rows.filter((row) => valueMatchesSelection(row.itemType, form.itemType));
  const filteredByBrand = filteredByType.filter((row) => valueMatchesSelection(row.brand, form.brand));
  const filteredByModel = filteredByBrand.filter((row) => valueMatchesSelection(row.model, form.model));
  const filteredByItem = filteredByModel.filter((row) => valueMatchesSelection(row.item, form.item));

  if (form.fromBin) {
    return filteredByItem
      .filter((row) => valueMatchesSelection(row.fromBin, form.fromBin))
      .reduce((sum, row) => sum + row.quantity, 0);
  }

  return filteredByItem.reduce((sum, row) => sum + row.quantity, 0);
}

function DataList({ id, values }) {
  return h(
    "datalist",
    { id },
    values.map((value) => h("option", { key: value, value })),
  );
}

function TextInput({ label, name, value, onChange, type = "text", list, placeholder, required = false, ...rest }) {
  return h(
    "label",
    null,
    h("span", null, label),
    h("input", {
      name,
      type,
      list,
      placeholder,
      required,
      autoComplete: "off",
      value,
      onChange,
      ...rest,
    }),
  );
}

function TextArea({ label, name, value, onChange, placeholder }) {
  return h(
    "label",
    { className: "wide-field" },
    h("span", null, label),
    h("textarea", {
      name,
      rows: 4,
      placeholder,
      value,
      onChange,
    }),
  );
}

function SelectInput({ label, name, value, onChange, options, placeholder }) {
  return h(
    "label",
    null,
    h("span", null, label),
    h(
      "select",
      { name, required: false, value, onChange },
      placeholder ? h("option", { value: "" }, placeholder) : null,
      options.map((option) => h("option", { key: option, value: option }, option)),
    ),
  );
}

function PurchaseForm({
  form,
  isEditing,
  isSaving,
  panelRef,
  status,
  show,
  onChange,
  onClose,
  onSubmit,
}) {
  const itemTypeRef = useRef(null);

  useEffect(() => {
    if (show) {
      window.setTimeout(() => itemTypeRef.current?.focus(), 0);
    }
  }, [show]);

  return h(
    "article",
    { className: `form-panel${show ? "" : " is-hidden"}`, id: "purchaseFormPanel", "aria-labelledby": "purchase-form-title", ref: panelRef },
    h(
      "div",
      { className: "panel-header" },
      h("div", null, h("p", { className: "eyebrow" }, "Purchase Entry"), h("h2", { id: "purchase-form-title" }, "Add New Product Purchase")),
      h("button", { className: "small-btn", type: "button", onClick: onClose }, "Close"),
    ),
    h(
      "form",
      { className: "purchase-form", id: "purchaseForm", onSubmit },
      h(
        "label",
        null,
        h("span", null, "Item Type"),
        h("input", {
          ref: itemTypeRef,
          name: "itemType",
          type: "text",
          list: "itemTypeOptions",
          placeholder: "Smoke Detection (FDS)",
          required: false,
          value: form.itemType,
          onChange,
        }),
        h(DataList, { id: "itemTypeOptions", values: ["Smoke Detection (FDS)", "Single Needle Machine spare"] }),
      ),
      h(TextInput, { label: "Date", name: "date", type: "date", value: form.date, onChange }),
      h(TextInput, { label: "Brand", name: "brand", placeholder: "Brand name", value: form.brand, onChange }),
      h(TextInput, { label: "Model", name: "model", placeholder: "Product model or item name", value: form.model, onChange }),
      h(TextInput, { label: "Item", name: "item", placeholder: "Item name", value: form.item, onChange }),
      h(TextInput, { label: "Rate", name: "rate", type: "number", min: "0", step: "0.01", placeholder: "0.00", value: form.rate, onChange }),
      h(TextInput, { label: "Quantity", name: "quantity", type: "number", min: "0", step: "1", placeholder: "0", value: form.quantity, onChange }),
      h(SelectInput, { label: "Currency", name: "currency", value: form.currency, onChange, options: ["BDT", "USD", "EUR", "CNY"], placeholder: "Select One" }),
      h(
        "label",
        null,
        h("span", null, "Supplier"),
        h("input", { name: "via", type: "text", list: "viaOptions", placeholder: "Select or type supplier", required: false, value: form.via, onChange }),
        h(DataList, { id: "viaOptions", values: ["Asian", "Direct", "MAMICO"] }),
      ),
      h(TextInput, { label: "Storage Slot", name: "storageSlot", placeholder: "Rack A3 / Box 12 / Floor 2", value: form.storageSlot, onChange }),
      h(TextArea, { label: "Remarks", name: "remarks", placeholder: "Purchase notes, approval details, or delivery instruction", value: form.remarks, onChange }),
      h(
        "div",
        { className: "form-actions" },
        h("p", { id: "purchaseFormStatus", "aria-live": "polite" }, status),
        h("button", { className: "primary-btn", id: "purchaseSubmitBtn", type: "submit", disabled: isSaving }, isEditing ? "Update Entry" : "Add Entry"),
      ),
    ),
  );
}

function IssueForm({ form, isEditing, isSaving, panelRef, status, show, onChange, onClose, onSubmit, stockOptions, availableQuantity }) {
  const entityRef = useRef(null);

  useEffect(() => {
    if (show) {
      window.setTimeout(() => entityRef.current?.focus(), 0);
    }
  }, [show]);

  return h(
    "article",
    { className: `form-panel${show ? "" : " is-hidden"}`, id: "issueFormPanel", "aria-labelledby": "issue-form-title", ref: panelRef },
    h(
      "div",
      { className: "panel-header" },
      h("div", null, h("p", { className: "eyebrow" }, "Issue Entry"), h("h2", { id: "issue-form-title" }, "Add Issue Register Entry")),
      h("button", { className: "small-btn", type: "button", onClick: onClose }, "Close"),
    ),
    h(
      "form",
      { className: "purchase-form", id: "issueForm", onSubmit, autoComplete: "off" },
      h(
        "label",
        null,
        h("span", null, "Entity"),
        h("input", { ref: entityRef, name: "entity", type: "text", list: "entityOptions", placeholder: "Select or type entity", required: true, autoComplete: "off", value: form.entity, onChange }),
        h(DataList, { id: "entityOptions", values: ["SSIL", "SML", "Lumbini"] }),
      ),
      h(TextInput, { label: "Date", name: "date", type: "date", value: form.date, onChange }),
      h(
        "label",
        null,
        h("span", null, "Item Type"),
        h("input", { name: "itemType", type: "text", list: "issueItemTypeOptions", placeholder: "Smoke Detection (FDS)", required: true, autoComplete: "off", value: form.itemType, onChange }),
        h(DataList, { id: "issueItemTypeOptions", values: stockOptions.itemTypes }),
      ),
      h(
        "label",
        null,
        h("span", null, "Brand"),
        h("input", {
          name: "brand",
          type: "text",
          list: "issueBrandOptions",
          placeholder: "Brand name",
          required: true,
          disabled: stockOptions.brands.length === 0,
          autoComplete: "off",
          value: form.brand,
          onChange,
        }),
        h(DataList, { id: "issueBrandOptions", values: stockOptions.brands }),
      ),
      h(
        "label",
        null,
        h("span", null, "Model"),
        h("input", {
          name: "model",
          type: "text",
          list: "issueModelOptions",
          placeholder: "Product model or item name",
          required: true,
          disabled: stockOptions.models.length === 0,
          autoComplete: "off",
          value: form.model,
          onChange,
        }),
        h(DataList, { id: "issueModelOptions", values: stockOptions.models }),
      ),
      h(
        "label",
        null,
        h("span", null, "Item"),
        h("input", {
          name: "item",
          type: "text",
          list: "issueItemOptions",
          placeholder: "Item name",
          required: true,
          disabled: stockOptions.items.length === 0,
          autoComplete: "off",
          value: form.item,
          onChange,
        }),
        h(DataList, { id: "issueItemOptions", values: stockOptions.items }),
      ),
      h(
        "label",
        null,
        h("span", null, "From BIN"),
        h("input", {
          name: "fromBin",
          type: "text",
          list: "issueBinOptions",
          placeholder: "BIN A3 / Rack 2",
          required: stockOptions.bins.length > 0,
          disabled: stockOptions.bins.length === 0,
          autoComplete: "off",
          value: form.fromBin,
          onChange,
        }),
        h(DataList, { id: "issueBinOptions", values: stockOptions.bins }),
      ),
      h(TextInput, {
        label: "Quantity",
        name: "quantity",
        type: "number",
        min: "1",
        max: availableQuantity > 0 ? String(availableQuantity) : undefined,
        step: "1",
        placeholder: availableQuantity > 0 ? `Available ${availableQuantity}` : "0",
        value: form.quantity,
        onChange,
      }),
      h(TextInput, { label: "Issued To", name: "issuedTo", placeholder: "Department, person, or site", value: form.issuedTo, onChange }),
      h(TextInput, { label: "Received By", name: "receivedBy", placeholder: "Receiver name", value: form.receivedBy, onChange }),
      h(TextInput, { label: "Received Date", name: "receivedDate", type: "date", value: form.receivedDate, onChange }),
      h(TextArea, { label: "Remarks", name: "remarks", placeholder: "Issue notes or reference", value: form.remarks, onChange }),
      h(
        "div",
        { className: "form-actions" },
        h("p", { id: "issueFormStatus", "aria-live": "polite" }, status),
        h("button", { className: "primary-btn", id: "issueSubmitBtn", type: "submit", disabled: isSaving }, isEditing ? "Update Issue" : "Add Issue"),
      ),
    ),
  );
}

function PurchaseTable({ entries, isLoading, error, onEdit, onDelete }) {
  let rows = null;

  if (error) {
    rows = h("tr", { className: "empty-row" }, h("td", { colSpan: 12 }, error));
  } else if (isLoading) {
    rows = h("tr", { className: "empty-row" }, h("td", { colSpan: 12 }, "Loading entries..."));
  } else if (entries.length === 0) {
    rows = h("tr", { className: "empty-row" }, h("td", { colSpan: 12 }, "No purchase entry added yet."));
  } else {
    rows = entries.map((entry, index) =>
      h(
        "tr",
        { key: entry.id || index },
        h("td", null, displayValue(entry.itemType)),
        h("td", null, displayValue(entry.date, "")),
        h("td", null, displayValue(entry.brand)),
        h("td", null, displayValue(entry.model, "")),
        h("td", null, displayValue(entry.item)),
        h("td", null, displayValue(entry.rate, "")),
        h("td", null, entry.quantity || 1),
        h("td", null, displayValue(entry.currency, "")),
        h("td", null, displayValue(entry.via, "")),
        h("td", null, displayValue(entry.storageSlot)),
        h("td", null, displayValue(entry.remarks)),
        h(
          "td",
          null,
          h(
            "div",
            { className: "row-actions" },
            h("button", { className: "action-btn edit", type: "button", onClick: () => onEdit(index) }, "Edit"),
            h("button", { className: "action-btn delete", type: "button", onClick: () => onDelete(index) }, "Delete"),
          ),
        ),
      ),
    );
  }

  return h(
    "article",
    { className: "table-panel" },
    h("div", { className: "panel-header" }, h("div", null, h("p", { className: "eyebrow" }, "Purchase Entries"))),
    h(
      "div",
      { className: "table-wrap" },
      h(
        "table",
        null,
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ["Item Type", "Date", "Brand", "Model", "Item", "Rate", "Quantity", "Currency", "Supplier", "Storage Slot", "Remarks", "Actions"].map((heading) =>
              h("th", { key: heading }, heading),
            ),
          ),
        ),
        h("tbody", { id: "purchaseEntries" }, rows),
      ),
    ),
  );
}

function IssueTable({ entries, isLoading, error, onEdit, onDelete }) {
  let rows = null;

  if (error) {
    rows = h("tr", { className: "empty-row" }, h("td", { colSpan: 13 }, error));
  } else if (isLoading) {
    rows = h("tr", { className: "empty-row" }, h("td", { colSpan: 13 }, "Loading issue entries..."));
  } else if (entries.length === 0) {
    rows = h("tr", { className: "empty-row" }, h("td", { colSpan: 13 }, "No issue entry added yet."));
  } else {
    rows = entries.map((entry, index) =>
      h(
        "tr",
        { key: entry.id || index },
        h("td", null, displayValue(entry.entity)),
        h("td", null, displayValue(entry.date)),
        h("td", null, displayValue(entry.itemType)),
        h("td", null, displayValue(entry.brand)),
        h("td", null, displayValue(entry.model)),
        h("td", null, displayValue(entry.item)),
        h("td", null, entry.quantity || 1),
        h("td", null, displayValue(entry.fromBin)),
        h("td", null, displayValue(entry.issuedTo)),
        h("td", null, displayValue(entry.receivedBy)),
        h("td", null, displayValue(entry.receivedDate)),
        h("td", null, displayValue(entry.remarks)),
        h(
          "td",
          null,
          h(
            "div",
            { className: "row-actions" },
            h("button", { className: "action-btn edit", type: "button", onClick: () => onEdit(index) }, "Edit"),
            h("button", { className: "action-btn delete", type: "button", onClick: () => onDelete(index) }, "Delete"),
          ),
        ),
      ),
    );
  }

  return h(
    "article",
    { className: "table-panel" },
    h("div", { className: "panel-header" }, h("div", null, h("p", { className: "eyebrow" }, "Issue Register"))),
    h(
      "div",
      { className: "table-wrap" },
      h(
        "table",
        null,
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ["Entity", "Date", "Item Type", "Brand", "Model", "Item", "Quantity", "From BIN", "Issued To", "Received By", "Received Date", "Remarks", "Actions"].map((heading) =>
              h("th", { key: heading }, heading),
            ),
          ),
        ),
        h("tbody", { id: "issueEntries" }, rows),
      ),
    ),
  );
}

function App() {
  const [entries, setEntries] = useState([]);
  const [issues, setIssues] = useState([]);
  const [purchaseForm, setPurchaseForm] = useState(purchaseInitial);
  const [issueForm, setIssueForm] = useState(issueInitial);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingIssueIndex, setEditingIssueIndex] = useState(null);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [purchaseStatus, setPurchaseStatus] = useState("");
  const [issueStatus, setIssueStatus] = useState("");
  const [purchaseLoading, setPurchaseLoading] = useState(true);
  const [issueLoading, setIssueLoading] = useState(true);
  const [purchaseError, setPurchaseError] = useState("");
  const [issueError, setIssueError] = useState("");
  const [purchaseSaving, setPurchaseSaving] = useState(false);
  const [issueSaving, setIssueSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const purchasePanelRef = useRef(null);
  const issuePanelRef = useRef(null);
  const editingIssueId = editingIssueIndex !== null ? issues[editingIssueIndex]?.id || null : null;
  const availableStockRows = useMemo(() => buildAvailableStock(entries, issues, editingIssueId), [entries, issues, editingIssueId]);
  const issueFilteredByType = useMemo(
    () => availableStockRows.filter((row) => valueMatchesSelection(row.itemType, issueForm.itemType)),
    [availableStockRows, issueForm.itemType],
  );
  const issueFilteredByBrand = useMemo(
    () => issueFilteredByType.filter((row) => valueMatchesSelection(row.brand, issueForm.brand)),
    [issueFilteredByType, issueForm.brand],
  );
  const issueFilteredByModel = useMemo(
    () => issueFilteredByBrand.filter((row) => valueMatchesSelection(row.model, issueForm.model)),
    [issueFilteredByBrand, issueForm.model],
  );
  const issueFilteredByItem = useMemo(
    () => issueFilteredByModel.filter((row) => valueMatchesSelection(row.item, issueForm.item)),
    [issueFilteredByModel, issueForm.item],
  );
  const issueFilteredByBin = useMemo(
    () => issueFilteredByItem.filter((row) => valueMatchesSelection(row.fromBin, issueForm.fromBin)),
    [issueFilteredByItem, issueForm.fromBin],
  );
  const issueStockOptions = useMemo(
    () => ({
      itemTypes: distinctValues(availableStockRows, "itemType"),
      brands: distinctValues(issueFilteredByType, "brand"),
      models: distinctValues(issueFilteredByBrand, "model"),
      items: distinctValues(issueFilteredByModel, "item"),
      bins: distinctValues(issueFilteredByItem, "fromBin"),
    }),
    [availableStockRows, issueFilteredByType, issueFilteredByBrand, issueFilteredByModel, issueFilteredByItem],
  );
  const availableIssueQuantity = useMemo(() => {
    if (!issueForm.itemType || !issueForm.brand || !issueForm.model || !issueForm.item) {
      return 0;
    }

    if (issueForm.fromBin) {
      return issueFilteredByBin.reduce((sum, row) => sum + row.quantity, 0);
    }

    return issueFilteredByItem.reduce((sum, row) => sum + row.quantity, 0);
  }, [issueFilteredByBin, issueFilteredByItem, issueForm.itemType, issueForm.brand, issueForm.model, issueForm.item, issueForm.fromBin]);

  useEffect(() => {
    let stopEntriesSubscription = null;
    let stopIssueEntriesSubscription = null;
    let isActive = true;

    async function initPage() {
      try {
        // First, ensure session is initialized and user is authenticated
        const user = await sessionManager.requireAuth("/login");
        
        if (!isActive) {
          return;
        }

        const loadEntries = new Promise((resolve) => {
          let settled = false;
          const settle = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };

          getPurchaseEntries()
            .then((loadedEntries) => {
              if (isActive && Array.isArray(loadedEntries) && loadedEntries.length > 0) {
                setEntries(loadedEntries);
              }
            })
            .catch((error) => console.error("Initial purchase fetch failed:", error));

          stopEntriesSubscription = subscribeToPurchaseEntries(
            (updatedEntries) => {
              if (!isActive) {
                return;
              }
              setEntries(updatedEntries);
              setPurchaseLoading(false);
              setPurchaseError("");
              settle();
            },
            (error) => {
              if (!isActive) {
                return;
              }
              setPurchaseLoading(false);
              setPurchaseError(formatRequestError(error, "Data load failed."));
              console.error(error);
              settle();
            },
          );
        });

        const loadIssues = new Promise((resolve) => {
          let settled = false;
          const settle = () => {
            if (!settled) {
              settled = true;
              resolve();
            }
          };

          getIssueEntries()
            .then((loadedEntries) => {
              if (isActive && Array.isArray(loadedEntries) && loadedEntries.length > 0) {
                setIssues(loadedEntries);
              }
            })
            .catch((error) => console.error("Initial issue fetch failed:", error));

          stopIssueEntriesSubscription = subscribeToIssueEntries(
            (updatedEntries) => {
              if (!isActive) {
                return;
              }
              setIssues(updatedEntries);
              setIssueLoading(false);
              setIssueError("");
              settle();
            },
            (error) => {
              if (!isActive) {
                return;
              }
              setIssueLoading(false);
              setIssueError(formatRequestError(error, "Issue load failed."));
              console.error(error);
              settle();
            },
          );
        });

        const timeoutPromise = new Promise((resolve) => {
          window.setTimeout(resolve, 10000);
        });

        await Promise.race([Promise.all([waitForWindowLoad(), loadEntries, loadIssues]), timeoutPromise]);
        if (isActive) {
          finishPageLoad();
        }
      } catch (error) {
        console.error("Page init error:", error);
        if (isActive && error.message !== "Authentication required") {
          setPurchaseLoading(false);
          setPurchaseError(formatRequestError(error, "Authentication check failed."));
        }
        finishPageLoad();
      }
    }

    initPage();

    return () => {
      isActive = false;
      stopEntriesSubscription?.();
      stopIssueEntriesSubscription?.();
    };
  }, []);

  function scrollPanel(ref) {
    window.setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function handlePurchaseChange(event) {
    const { name, value } = event.target;
    setPurchaseForm((current) => ({ ...current, [name]: value }));
  }

  function handleIssueChange(event) {
    const { name, value } = event.target;
    setIssueForm((current) => {
      const next = { ...current, [name]: value };

      if (name === "itemType") {
        next.brand = "";
        next.model = "";
        next.item = "";
        next.fromBin = "";
        next.quantity = "";
      } else if (name === "brand") {
        next.model = "";
        next.item = "";
        next.fromBin = "";
        next.quantity = "";
      } else if (name === "model") {
        next.item = "";
        next.fromBin = "";
        next.quantity = "";
      } else if (name === "item") {
        next.fromBin = "";
        next.quantity = "";
      } else if (name === "fromBin") {
        const nextAvailableQuantity = getAvailableQuantityForIssue(availableStockRows, next);
        const currentQuantity = toPositiveQuantity(next.quantity);
        const hasRequiredFields = next.itemType && next.brand && next.model && next.item;

        if (hasRequiredFields) {
          if (nextAvailableQuantity <= 0) {
            next.quantity = "";
          } else if (currentQuantity > nextAvailableQuantity) {
            next.quantity = String(nextAvailableQuantity);
          }
        }
      }

      return next;
    });
  }

  function openNewPurchase() {
    setEditingIndex(null);
    setPurchaseForm(purchaseInitial);
    setPurchaseStatus("");
    setShowPurchaseForm(true);
    scrollPanel(purchasePanelRef);
  }

  function openNewIssue() {
    setEditingIssueIndex(null);
    setIssueForm(issueInitial);
    setIssueStatus("");
    setShowIssueForm(true);
    scrollPanel(issuePanelRef);
  }

  function closePurchase() {
    setEditingIndex(null);
    setPurchaseForm(purchaseInitial);
    setPurchaseStatus("");
    setShowPurchaseForm(false);
  }

  function closeIssue() {
    setEditingIssueIndex(null);
    setIssueForm(issueInitial);
    setIssueStatus("");
    setShowIssueForm(false);
  }

  async function submitPurchase(event) {
    event.preventDefault();
    setPurchaseSaving(true);

    try {
      if (editingIndex === null) {
        await addPurchaseEntry(purchaseForm);
        setPurchaseStatus("Entry added.");
      } else {
        await updatePurchaseEntry(entries[editingIndex].id, purchaseForm);
        setEditingIndex(null);
        setPurchaseStatus("Entry updated.");
      }

      setPurchaseForm(purchaseInitial);
    } catch (error) {
      setPurchaseStatus(formatRequestError(error, "Save failed."));
      console.error(error);
    } finally {
      setPurchaseSaving(false);
    }
  }

  async function submitIssue(event) {
    event.preventDefault();
    setIssueSaving(true);

    try {
      const requestedQuantity = toPositiveQuantity(issueForm.quantity);

      if (requestedQuantity <= 0) {
        throw new Error("Issue quantity must be greater than zero.");
      }

      const hasRequiredFields = issueForm.itemType && issueForm.brand && issueForm.model && issueForm.item;
      
      if (hasRequiredFields && availableIssueQuantity <= 0) {
        throw new Error("No stock available for the selected issue item.");
      }

      if (hasRequiredFields && requestedQuantity > availableIssueQuantity) {
        throw new Error(`Only ${availableIssueQuantity} item(s) available in stock.`);
      }

      if (editingIssueIndex === null) {
        await addIssueEntry(issueForm);
        setIssueStatus("Issue added.");
      } else {
        await updateIssueEntry(issues[editingIssueIndex].id, issueForm);
        setEditingIssueIndex(null);
        setIssueStatus("Issue updated.");
      }

      setIssueForm(issueInitial);
    } catch (error) {
      setIssueStatus(formatRequestError(error, "Issue save failed."));
      console.error(error);
    } finally {
      setIssueSaving(false);
    }
  }

  function editPurchase(index) {
    const entry = entries[index];
    setEditingIndex(index);
    setPurchaseForm({
      itemType: fieldValue(entry, "itemType"),
      date: fieldValue(entry, "date"),
      brand: fieldValue(entry, "brand"),
      model: fieldValue(entry, "model"),
      item: fieldValue(entry, "item"),
      rate: fieldValue(entry, "rate"),
      quantity: fieldValue(entry, "quantity", 1),
      currency: fieldValue(entry, "currency", ""),
      via: fieldValue(entry, "via"),
      storageSlot: fieldValue(entry, "storageSlot"),
      remarks: fieldValue(entry, "remarks"),
    });
    setPurchaseStatus("Editing selected entry.");
    setShowPurchaseForm(true);
    scrollPanel(purchasePanelRef);
  }

  function editIssue(index) {
    const entry = issues[index];
    setEditingIssueIndex(index);
    setIssueForm({
      entity: fieldValue(entry, "entity"),
      date: fieldValue(entry, "date"),
      itemType: fieldValue(entry, "itemType"),
      brand: fieldValue(entry, "brand"),
      model: fieldValue(entry, "model"),
      item: fieldValue(entry, "item"),
      quantity: fieldValue(entry, "quantity", 1),
      fromBin: fieldValue(entry, "fromBin"),
      issuedTo: fieldValue(entry, "issuedTo"),
      receivedBy: fieldValue(entry, "receivedBy"),
      receivedDate: fieldValue(entry, "receivedDate"),
      remarks: fieldValue(entry, "remarks"),
    });
    setIssueStatus("Editing selected issue.");
    setShowIssueForm(true);
    scrollPanel(issuePanelRef);
  }

  async function removePurchase(index) {
    try {
      await deletePurchaseEntry(entries[index].id);
      setPurchaseStatus("Entry deleted.");
    } catch (error) {
      setPurchaseStatus(formatRequestError(error, "Delete failed."));
      console.error(error);
    }
  }

  async function removeIssue(index) {
    try {
      await deleteIssueEntry(issues[index].id);
      setIssueStatus("Issue deleted.");
    } catch (error) {
      setIssueStatus(formatRequestError(error, "Issue delete failed."));
      console.error(error);
    }
  }

  async function handleExport() {
    setExporting(true);

    try {
      await exportReport(entries, issues);
    } finally {
      setExporting(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);

    try {
      await sessionManager.logout();
      window.location.replace("/login");
    } catch (error) {
      setPurchaseStatus(formatRequestError(error, "Logout failed."));
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
        { className: "brand", href: "#", "aria-label": "SMG Equipment Stock home" },
        h("img", { className: "brand-logo", src: "/smg-logo-blue.png", alt: "SMG Equipment Stock logo" }),
        h("span", null, h("strong", null, "SMG Equipment Stock")),
      ),
      h(
        "nav",
        { className: "nav-list" },
        h("a", { className: "nav-item active", href: "#purchases-inventory" }, "Purchases & Inventory"),
        h("a", { className: "nav-item", href: "#issue-register" }, "Issue Register"),
        h("a", { className: "nav-item", href: "/summery" }, "Summery"),
      ),
    ),
    h(
      "main",
      { className: "content" },
      h(
        "header",
        { className: "topbar" },
        h("div", { className: "section-heading" }, h("h2", null, "Purchases & Inventory")),
        h(
          "div",
          { className: "top-actions" },
          h("button", { className: "ghost-btn", id: "exportReportBtn", type: "button", onClick: handleExport, disabled: exporting }, exporting ? "Preparing Report..." : "Export Report"),
          h("button", { className: "primary-btn", id: "newPurchaseBtn", type: "button", onClick: openNewPurchase }, "New Purchase"),
          h("button", { className: "primary-btn", id: "newIssueBtn", type: "button", onClick: openNewIssue }, "New Issue"),
          h("button", { className: "ghost-btn logout-btn", id: "logoutBtn", type: "button", onClick: handleLogout, disabled: loggingOut }, "Logout"),
        ),
      ),
      h(
        "section",
        { className: "section-block", id: "purchases-inventory", "aria-label": "Purchases and Inventory" },
        h(PurchaseForm, {
          form: purchaseForm,
          isEditing: editingIndex !== null,
          isSaving: purchaseSaving,
          panelRef: purchasePanelRef,
          status: purchaseStatus,
          show: showPurchaseForm,
          onChange: handlePurchaseChange,
          onClose: closePurchase,
          onSubmit: submitPurchase,
        }),
        h(PurchaseTable, {
          entries,
          isLoading: purchaseLoading,
          error: purchaseError,
          onEdit: editPurchase,
          onDelete: removePurchase,
        }),
      ),
      h(
        "section",
        { className: "section-block", id: "issue-register", "aria-label": "Issue Register" },
        h(IssueForm, {
          form: issueForm,
          isEditing: editingIssueIndex !== null,
          isSaving: issueSaving,
          panelRef: issuePanelRef,
          status: issueStatus,
          show: showIssueForm,
          onChange: handleIssueChange,
          onClose: closeIssue,
          onSubmit: submitIssue,
          stockOptions: issueStockOptions,
          availableQuantity: availableIssueQuantity,
        }),
        h(IssueTable, {
          entries: issues,
          isLoading: issueLoading,
          error: issueError,
          onEdit: editIssue,
          onDelete: removeIssue,
        }),
      ),
    ),
  );
}

createRoot(document.querySelector("#root")).render(h(App));
