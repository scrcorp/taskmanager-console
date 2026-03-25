"use client";

/**
 * 제품 Excel 가져오기 모달.
 *
 * Import products from Excel:
 * - Download template button
 * - Drag & drop / click file upload
 * - Upload button with result display (created, linked, skipped, errors)
 */

import React, { useCallback, useRef, useState } from "react";
import { Download, Upload, FileSpreadsheet, X } from "lucide-react";
import { Modal, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useDownloadProductTemplate, useImportProducts } from "@/hooks/useInventory";
import { parseApiError } from "@/lib/utils";
import type { ProductImportResult } from "@/hooks/useInventory";

interface ImportProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportProductsModal({ isOpen, onClose }: ImportProductsModalProps): React.ReactElement {
  const { toast } = useToast();
  const downloadTemplate = useDownloadProductTemplate();
  const importProducts = useImportProducts();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [result, setResult] = useState<ProductImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setSelectedFile(null);
    setResult(null);
    setIsDragging(false);
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

  const handleUpload = () => {
    if (!selectedFile) {
      toast({ type: "error", message: "Please select a file to upload." });
      return;
    }
    const formData = new FormData();
    formData.append("file", selectedFile);

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
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Products from Excel" size="md">
      <div className="flex flex-col gap-5">
        {/* Step 1: Download template */}
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

        {/* Step 2: Upload file */}
        <div>
          <p className="text-sm font-medium text-text-secondary mb-3">Upload Filled Template</p>

          {/* Drag & drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
              cursor-pointer transition-colors py-8 px-4
              ${isDragging
                ? "border-accent bg-accent-muted"
                : "border-border hover:border-accent/50 hover:bg-surface-hover"
              }
            `}
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
                    setResult(null);
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

        {/* Upload button */}
        <Button
          variant="primary"
          size="sm"
          onClick={handleUpload}
          disabled={!selectedFile}
          isLoading={importProducts.isPending}
        >
          <Upload size={14} />
          Upload & Import
        </Button>

        {/* Results */}
        {result && (
          <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
            <p className="text-sm font-semibold text-text">Import Results</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-success-muted p-3">
                <div className="text-xl font-bold text-success">{result.created}</div>
                <div className="text-xs text-text-muted mt-0.5">Created</div>
              </div>
              <div className="rounded-lg bg-accent-muted p-3">
                <div className="text-xl font-bold text-accent">{result.linked}</div>
                <div className="text-xs text-text-muted mt-0.5">Linked to stores</div>
              </div>
              <div className="rounded-lg bg-surface-hover p-3">
                <div className="text-xl font-bold text-text-secondary">{result.skipped}</div>
                <div className="text-xs text-text-muted mt-0.5">Skipped</div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-lg bg-danger-muted border border-danger/20 p-3">
                <p className="text-xs font-medium text-danger mb-2">
                  {result.errors.length} error(s):
                </p>
                <ul className="space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i} className="text-xs text-danger/80">
                      {err}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Close button */}
        <div className="flex justify-end pt-1 border-t border-border">
          <Button variant="secondary" size="sm" onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
