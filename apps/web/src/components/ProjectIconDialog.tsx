import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, TrashIcon } from "lucide-react";

import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { resolveServerHttpUrl } from "~/lib/serverUrl";

const ICON_PATH = ".rowl/icon.png";
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/x-icon"];

interface ProjectIconDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  projectCwd: string;
  onSave: (iconDataUrl: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

async function resizeImageToDataUrl(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.addEventListener("load", () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to create canvas context"));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    });
    img.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    });
    img.src = url;
  });
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result as string));
    reader.addEventListener("error", () => reject(new Error("Failed to read file")));
    reader.readAsDataURL(file);
  });
}

export function ProjectIconDialog({
  open,
  onOpenChange,
  projectName,
  projectCwd,
  onSave,
  onRemove,
}: ProjectIconDialogProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [iconTimestamp, setIconTimestamp] = useState(() => Date.now());

  const currentIconSrc = resolveServerHttpUrl(
    `/api/project-favicon?cwd=${encodeURIComponent(projectCwd)}&t=${iconTimestamp}`,
  );

  const reset = useCallback(() => {
    setPreview(null);
    setSelectedFile(null);
    setError(null);
    setIsSaving(false);
    setIsRemoving(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (open) {
      setIconTimestamp(Date.now());
    }
  }, [open]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Please select a PNG, JPEG, SVG, or ICO file.");
      return;
    }

    setError(null);

    try {
      let dataUrl: string;
      if (file.type === "image/svg+xml" || file.type === "image/x-icon") {
        dataUrl = await fileToDataUrl(file);
      } else {
        dataUrl = await resizeImageToDataUrl(file, 64);
      }
      setSelectedFile(file);
      setPreview(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process image.");
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!preview) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave(preview);
      setIconTimestamp(Date.now());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save icon.");
      setIsSaving(false);
    }
  }, [preview, onSave, onOpenChange]);

  const handleRemove = useCallback(async () => {
    setIsRemoving(true);
    setError(null);
    try {
      await onRemove();
      setIconTimestamp(Date.now());
      onOpenChange(false);
    } catch {
      setIconTimestamp(Date.now());
      onOpenChange(false);
    }
  }, [onRemove, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Project Icon</DialogTitle>
          <DialogDescription>
            Choose an icon for <strong>{projectName}</strong>. The icon is saved as{" "}
            <code className="text-xs">{ICON_PATH}</code> in your project.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {preview ? (
                <img
                  src={preview}
                  alt="Icon preview"
                  className="size-16 rounded-lg object-contain border bg-background"
                />
              ) : (
                <div className="flex size-16 items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30">
                  <ImageIcon className="size-8 text-muted-foreground/40" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
              <span>Current:</span>
              <img
                src={currentIconSrc}
                alt=""
                className="size-4 rounded-sm object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <span className="font-mono">{ICON_PATH}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSaving || isRemoving}
            >
              <ImageIcon className="size-4" />
              {selectedFile ? "Change icon" : "Select icon"}
            </Button>
            {selectedFile && (
              <p className="text-xs text-muted-foreground/60 text-center">
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </DialogPanel>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving || isRemoving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleRemove}
            disabled={isSaving || isRemoving}
            className="text-destructive hover:text-destructive"
          >
            <TrashIcon className="size-4" />
            {isRemoving ? "Removing..." : "Remove"}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!selectedFile || isSaving || isRemoving}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
