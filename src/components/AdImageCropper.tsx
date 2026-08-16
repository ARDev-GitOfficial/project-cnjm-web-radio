import { Crop, ImageUp, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AD_BANNER_HEIGHT, AD_BANNER_WIDTH } from "../lib/ads";

const TARGET_ASPECT = AD_BANNER_WIDTH / AD_BANNER_HEIGHT;
const MAX_SOURCE_BYTES = 14 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 28_000_000;

export type CroppedAdImage = {
  fileName: string;
  contentType: "image/webp";
  width: number;
  height: number;
  dataUrl: string;
  dataBase64: string;
  size: number;
  sourceWidth: number;
  sourceHeight: number;
  wasUpscaled: boolean;
};

type LoadedImage = {
  url: string;
  width: number;
  height: number;
};

type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  file: File;
  onCancel: () => void;
  onApply: (image: CroppedAdImage) => void | Promise<void>;
};

export function AdImageCropper({ file, onCancel, onApply }: Props) {
  const [source, setSource] = useState<LoadedImage | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    setSource(null);
    setError("");
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);

    if (!file.type.startsWith("image/")) {
      setError("Envie uma imagem PNG, JPG ou WebP.");
      return undefined;
    }

    if (file.size > MAX_SOURCE_BYTES) {
      setError("Imagem muito pesada. Use um arquivo com até 14 MB para evitar travamentos.");
      return undefined;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    let cancelled = false;

    image.onload = () => {
      if (cancelled) return;
      const pixels = image.naturalWidth * image.naturalHeight;
      if (pixels > MAX_SOURCE_PIXELS) {
        setError("Imagem grande demais para cortar no navegador. Reduza o arquivo antes de enviar.");
        URL.revokeObjectURL(url);
        return;
      }

      setSource({ url, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      if (cancelled) return;
      setError("Não foi possível abrir a imagem.");
      URL.revokeObjectURL(url);
    };
    image.src = url;

    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const crop = useMemo(() => (source ? getCropBox(source.width, source.height, zoom, offsetX, offsetY) : null), [source, zoom, offsetX, offsetY]);
  const wasUpscaled = Boolean(crop && (crop.width < AD_BANNER_WIDTH || crop.height < AD_BANNER_HEIGHT));
  const imageStyle = source && crop
    ? {
        width: `${(source.width / crop.width) * 100}%`,
        height: `${(source.height / crop.height) * 100}%`,
        left: `${(-crop.x / crop.width) * 100}%`,
        top: `${(-crop.y / crop.height) * 100}%`,
      }
    : undefined;

  const applyCrop = async () => {
    if (!source || !crop || isApplying) return;

    setIsApplying(true);
    setError("");

    try {
      const dataUrl = await renderCrop(source.url, crop);
      const blob = await dataUrlToBlob(dataUrl);
      await onApply({
        fileName: toWebpFileName(file.name),
        contentType: "image/webp",
        width: AD_BANNER_WIDTH,
        height: AD_BANNER_HEIGHT,
        dataUrl,
        dataBase64: dataUrl.split(",")[1] || "",
        size: blob.size,
        sourceWidth: source.width,
        sourceHeight: source.height,
        wasUpscaled,
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível gerar o WebP final.");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="image-crop-modal" role="dialog" aria-modal="true" aria-label="Cortar imagem do anúncio">
      <div className="image-crop-card">
        <div className="image-crop-head">
          <span>
            <Crop size={17} /> Corte do anúncio
          </span>
          <button type="button" onClick={onCancel} aria-label="Fechar corte">
            <X size={18} />
          </button>
        </div>

        <div className="image-crop-grid">
          <div className="image-crop-stage">
            {source && crop ? (
              <div className="image-crop-preview">
                <img src={source.url} style={imageStyle} alt="Prévia do corte" draggable={false} />
                <span className="image-crop-frame" />
              </div>
            ) : (
              <div className="image-crop-empty">
                <ImageUp size={26} />
                <strong>{error || "Abrindo imagem..."}</strong>
              </div>
            )}
          </div>

          <div className="image-crop-controls">
            <div>
              <strong>Saída final</strong>
              <span>{AD_BANNER_WIDTH} x {AD_BANNER_HEIGHT}px · WebP</span>
              {source ? <small>Original: {source.width} x {source.height}px</small> : null}
            </div>

            {wasUpscaled ? (
              <p className="crop-warning">Essa imagem será ampliada para fechar o banner. Pode perder nitidez em telas grandes.</p>
            ) : null}

            {error && source ? <p className="form-warning">{error}</p> : null}

            <label className="crop-range">
              Zoom
              <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.currentTarget.value))} />
            </label>
            <label className="crop-range">
              Horizontal
              <input type="range" min="-1" max="1" step="0.01" value={offsetX} onChange={(event) => setOffsetX(Number(event.currentTarget.value))} />
            </label>
            <label className="crop-range">
              Vertical
              <input type="range" min="-1" max="1" step="0.01" value={offsetY} onChange={(event) => setOffsetY(Number(event.currentTarget.value))} />
            </label>

            <div className="crop-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setZoom(1);
                  setOffsetX(0);
                  setOffsetY(0);
                }}
                disabled={!source || isApplying}
              >
                <RotateCcw size={15} /> Centralizar
              </button>
              <button type="button" className="play-main slim" onClick={() => void applyCrop()} disabled={!source || Boolean(error) || isApplying}>
                {isApplying ? "Gerando..." : "Usar imagem"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getBaseCrop(width: number, height: number) {
  const sourceAspect = width / height;

  if (sourceAspect > TARGET_ASPECT) {
    return {
      width: height * TARGET_ASPECT,
      height,
    };
  }

  return {
    width,
    height: width / TARGET_ASPECT,
  };
}

function getCropBox(sourceWidth: number, sourceHeight: number, zoom: number, offsetX: number, offsetY: number): CropBox {
  const base = getBaseCrop(sourceWidth, sourceHeight);
  const width = Math.max(1, base.width / zoom);
  const height = Math.max(1, base.height / zoom);
  const maxX = Math.max(0, sourceWidth - width);
  const maxY = Math.max(0, sourceHeight - height);
  const centerX = maxX / 2;
  const centerY = maxY / 2;

  return {
    x: clamp(centerX + offsetX * centerX, 0, maxX),
    y: clamp(centerY + offsetY * centerY, 0, maxY),
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function renderCrop(src: string, crop: CropBox) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = AD_BANNER_WIDTH;
      canvas.height = AD_BANNER_HEIGHT;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        reject(new Error("Seu navegador não conseguiu preparar o corte."));
        return;
      }

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.fillStyle = "#030603";
      context.fillRect(0, 0, AD_BANNER_WIDTH, AD_BANNER_HEIGHT);
      context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, AD_BANNER_WIDTH, AD_BANNER_HEIGHT);
      resolve(canvas.toDataURL("image/webp", 0.86));
    };
    image.onerror = () => reject(new Error("Não foi possível renderizar o corte."));
    image.src = src;
  });
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

function toWebpFileName(fileName: string) {
  const cleanName = fileName.trim().replace(/\.[^.]+$/, "") || "anuncio";
  return `${cleanName}-1700x450.webp`;
}
