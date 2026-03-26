"use client";

/**
 * 제품 Excel 가져오기 모달 — 2단계 플로우.
 *
 * Step 1: Download template + Upload Excel file → Preview
 * Step 2: Preview table with checkboxes (duplicate warnings highlighted) → Confirm import
 */

import React, { useCallback, useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, X, AlertTriangle } from "lucide-react";
import { Modal, Button, Badge } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useDownloadProductTemplate, usePreviewImport, useImportProducts } from "@/hooks/useInventory";
import { parseApiError, cn } from "@/lib/utils";
import type { ImportPreviewItem, ProductImportResult } from "@/hooks/useInventory";

interface ImportProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportProductsModal({ isOpen, onClose }: ImportProductsModalProps): React.ReactElement {
  const { toast } = useToast();
  const downloadTemplate = useDownloadProductTemplate();
  const previewImport = usePreviewImport();
  const importProducts = useImportProducts();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewItems, setPreviewItems] = useState<ImportPreviewItem[]>([]);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<1 | 2>(1);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setSelectedFile(null);
    setIsDragging(false);
    setPreviewItems([]);
    setSelectedRows(new Set());
    setStep(1);
    setResult(null);
    onClose();
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadTemplate();
      toast({ type: "success", message: "Template downloaded." });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to download template.") });
    }
  };

  const handleFile = (file: File) => {
    const isExcel =
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.type === "application/vnd.ms-excel" ||
      file.name.endsWith(".xlsx") ||
      file.name.endsWith(".xls");
    if (!isExcel) {
      toast({ type: "error", message: "Please upload an Excel file (.xlsx or .xls)." });
      return;
    }
    setSelectedFile(file);
    setResult(null);
    setStep(1);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  /** Step 1 → Step 2: preview */
  const handlePreview = () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append("file", selectedFile);

    previewImport.mutate(formData, {
      onSuccess: (data) => {
        if (data.error) {
          toast({ type: "error", message: data.error });
          return;
        }
        const items = data.items ?? [];
        setPreviewItems(items);
        setSelectedRows(new Set(items.map((_, i) => i)));
        setStep(2);
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Preview failed.") });
      },
    });
  };

  const toggleRow = (idx: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedRows.size === previewItems.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(previewItems.map((_, i) => i)));
    }
  };

  /** Step 2 → Import selected only */
  const handleImport = () => {
    if (!selectedFile || selectedRows.size === 0) return;
    const formData = new FormData();
    formData.append("file", selectedFile);
    // Send 1-based row numbers of selected items
    const selectedRowNumbers = Array.from(selectedRows).map((idx) => previewItems[idx].row);
    formData.append("selected_rows", JSON.stringify(selectedRowNumbers));

    importProducts.mutate(formData, {
      onSuccess: (data) => {
        setResult(data);
        toast({ type: "success", message: `Import complete: ${data.created} created, ${data.linked} linked.` });
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Import failed.") });
      },
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Products from Excel" size="lg">
      <div className="flex flex-col gap-5">
        {step === 1 && !result && (
          <>
            {/* Download template */}
            <div>
              <p className="text-sm text-text-secondary mb-3">
                Download the template, fill in your product data, then upload it below.
              </p>
              <Button variant="secondary" size="sm" onClick={handleDownloadTemplate}>
                <Download size={14} />
                Download Template
              </Button>
            </div>

            <div className="h-px bg-border" />

            {/* Upload file */}
            <div>
              <p className="text-sm font-medium text-text-secondary mb-3">Upload Filled Template</p>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-8 px-4",
                  isDragging
                    ? "border-accent bg-accent-muted"
                    : "border-border hover:border-accent/50 hover:bg-surface-hover",
                )}
              >
                <FileSpreadsheet size={28} className="text-text-muted" />
                {selectedFile ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">{selectedFile.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="p-0.5 rounded text-text-muted hover:text-danger transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-text-secondary">
                      Drag & drop an Excel file here, or <span className="text-accent">click to browse</span>
                    </p>
                    <p className="text-xs text-text-muted">.xlsx or .xls</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {/* Preview button */}
            <Button
              variant="primary"
              size="sm"
              onClick={handlePreview}
              disabled={!selectedFile}
              isLoading={previewImport.isPending}
            >
              <Upload size={14} />
              Preview
            </Button>
          </>
        )}

        {step === 2 && !result && (
          <>
            {/* Preview table */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-text">
                {previewItems.length} item(s) found — {selectedRows.size} selected
              </p>
              <Button variant="secondary" size="sm" onClick={() => { setStep(1); setPreviewItems([]); }}>
                Back
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface z-10">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left w-10">
                      <input
                        type="checkbox"
                        checked={previewItems.length > 0 && selectedRows.size === previewItems.length}
                        onChange={toggleAll}
                        className="w-4 h-4 accent-accent cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">#</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">Code</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">Category</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">Stores</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {previewItems.map((item, idx) => (
                    <tr
                      key={idx}
                      className={cn(
                        "border-b border-border/60 last:border-b-0 transition-colors",
                        selectedRows.has(idx) ? "bg-surface" : "bg-surface/30 opacity-50",
                        item.duplicate_name && "bg-warning-muted/30",
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedRows.has(idx)}
                          onChange={() => toggleRow(idx)}
                          className="w-4 h-4 accent-accent cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2 text-text-muted text-xs">{item.row}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-text">{item.name}</span>
                        {item.duplicate_name && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <AlertTriangle size={12} className="text-warning" />
                            <span className="text-xs text-warning">
                              Similar: {item.duplicate_name}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-text-muted font-mono">{item.code || "auto"}</td>
                      <td className="px-3 py-2 text-xs text-text-secondary">{item.category || "-"}</td>
                      <td className="px-3 py-2 text-xs text-text-secondary">{item.store_codes || "-"}</td>
                      <td className="px-3 py-2">
                        <Badge variant={item.action === "link" ? "accent" : "success"}>
                          {item.action === "link" ? "Link" : "Create"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Import button */}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleImport}
                disabled={selectedRows.size === 0}
                isLoading={importProducts.isPending}
              >
                <Upload size={14} />
                Import {selectedRows.size} Item(s)
              </Button>
            </div>
          </>
        )}

        {/* Results */}
        {result && (
          <>
            <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
              <p className="text-sm font-semibold text-text">Import Results</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-success-muted p-3">
                  <div className="text-xl font-bold text-success">{result.created ?? 0}</div>
                  <div className="text-xs text-text-muted mt-0.5">Created</div>
                </div>
                <div className="rounded-lg bg-accent-muted p-3">
                  <div className="text-xl font-bold text-accent">{result.linked ?? 0}</div>
                  <div className="text-xs text-text-muted mt-0.5">Linked to stores</div>
                </div>
                <div className="rounded-lg bg-surface-hover p-3">
                  <div className="text-xl font-bold text-text-secondary">
                    {Array.isArray(result.skipped) ? result.skipped.length : result.skipped ?? 0}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">Skipped</div>
                </div>
              </div>
              {((result.errors?.length ?? 0) > 0 || result.error || (result.validation_errors?.length ?? 0) > 0) && (
                <div className="rounded-lg bg-danger-muted border border-danger/20 p-3">
                  {result.error && (
                    <p className="text-sm font-medium text-danger mb-2">{result.error}</p>
                  )}
                  <p className="text-xs font-medium text-danger mb-2">
                    {(result.errors?.length || 0) + (result.validation_errors?.length || 0)} error(s):
                  </p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {(result.errors ?? []).map((err, i) => (
                      <li key={`e-${i}`} className="text-xs text-danger/80">{err}</li>
                    ))}
                    {(result.validation_errors ?? []).map((err, i) => (
                      <li key={`v-${i}`} className="text-xs text-danger/80">{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              {((result.warnings?.length ?? 0) > 0) && (
                <div className="rounded-lg bg-warning-muted border border-warning/20 p-3">
                  <p className="text-xs font-medium text-warning mb-2">
                    {result.warnings?.length ?? 0} warning(s):
                  </p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto">
                    {(result.warnings ?? []).map((w, i) => (
                      <li key={`w-${i}`} className="text-xs text-warning/80">{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-1 border-t border-border">
              <Button variant="secondary" size="sm" onClick={handleClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
