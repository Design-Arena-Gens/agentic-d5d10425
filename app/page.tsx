"use client";

import NextImage from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SliderControl } from "../components/slider-control";
import {
  type EffectSettings,
  OUTPUT_HEIGHT,
  OUTPUT_WIDTH,
  extractDataUrl,
  renderPlasterEffect
} from "../utils/plaster-effect";

const defaultSettings: EffectSettings = {
  depth: 62,
  luminosity: 8,
  sheen: 68,
  matte: 40,
  smoothness: 32,
  microDetail: 48,
  backgroundLift: 72,
  macroZoom: 18,
  standHeight: 24,
  vignette: 36
};

interface StatusMessage {
  tone: "idle" | "processing" | "ready" | "error";
  text: string;
}

const statusPalette: Record<StatusMessage["tone"], string> = {
  idle: "text-neutral-500",
  processing: "text-neutral-700",
  ready: "text-emerald-600",
  error: "text-rose-500"
};

const createImageElement = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to parse image"));
      image.src = url;
    };
    reader.onerror = () => reject(new Error("Unable to load file"));
    reader.readAsDataURL(file);
  });

export default function Page() {
  const [settings, setSettings] = useState(defaultSettings);
  const [status, setStatus] = useState<StatusMessage>({
    tone: "idle",
    text: "Upload a portrait bust to begin"
  });
  const [sourceImage, setSourceImage] = useState<HTMLImageElement | null>(null);
  const [processedPreview, setProcessedPreview] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== OUTPUT_WIDTH || canvas.height !== OUTPUT_HEIGHT) {
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
    }
  }, []);

  const handleProcess = useCallback(
    (image: HTMLImageElement | null, currentSettings: EffectSettings) => {
      const canvas = canvasRef.current;
      if (!canvas || !image) {
        setProcessedPreview(null);
        return;
      }

      const context = canvas.getContext("2d");
      if (!context) {
        setStatus({ tone: "error", text: "Canvas rendering not supported" });
        return;
      }

      try {
        setIsProcessing(true);
        renderPlasterEffect({
          source: image,
          context,
          settings: currentSettings
        });
        const url = extractDataUrl(canvas);
        setProcessedPreview(url);
        setStatus({
          tone: "ready",
          text: "Macro plaster interpretation ready"
        });
      } catch (error) {
        console.error(error);
        setStatus({
          tone: "error",
          text: "Processing failed — try another photo"
        });
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  useEffect(() => {
    handleProcess(sourceImage, settings);
  }, [handleProcess, sourceImage, settings]);

  const handleFileSelection = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const [file] = files;
      if (!file.type.startsWith("image/")) {
        setStatus({ tone: "error", text: "Please choose a valid image file" });
        return;
      }

      try {
        setStatus({ tone: "processing", text: "Analyzing sculpture proportions" });
        const image = await createImageElement(file);
        setSourceImage(image);
      } catch (error) {
        console.error(error);
        setStatus({ tone: "error", text: "Unable to read the selected image" });
      }
    },
    []
  );

  const reset = useCallback(() => {
    setSourceImage(null);
    setProcessedPreview(null);
    setSettings(defaultSettings);
    setStatus({ tone: "idle", text: "Upload a portrait bust to begin" });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const download = useCallback(() => {
    if (!processedPreview) return;
    const anchor = document.createElement("a");
    anchor.href = processedPreview;
    anchor.download = "plaster-bust-macro.png";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, [processedPreview]);

  const statusClass = useMemo(() => statusPalette[status.tone], [status]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 pb-16">
      <div className="flex w-full max-w-6xl flex-col gap-10 py-16">
        <header className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
          <span className="font-display text-sm uppercase tracking-[0.6em] text-neutral-500">
            Macro Plaster Studio
          </span>
          <h1 className="font-display text-4xl font-semibold text-neutral-900 sm:text-5xl">
            Transform Portraits into Couture Plaster Busts
          </h1>
          <p className="text-base text-neutral-600 sm:text-lg">
            Upload your subject and capture a hyper-stylized macro view with elongated
            proportions, cinematic lighting, and sculptural white plaster finish.
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="panel relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/70 via-white/30 to-neutral-200/20" />
            <div className="relative flex aspect-[3/4] items-center justify-center bg-neutral-100">
              {processedPreview ? (
                <NextImage
                  src={processedPreview}
                  alt="Plaster macro reinterpretation"
                  fill
                  unoptimized
                  priority
                  sizes="(max-width: 1024px) 90vw, 50vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center text-neutral-500">
                  <span className="text-sm uppercase tracking-[0.4em]">Awaiting Portrait</span>
                  <p className="max-w-sm text-sm">
                    For best results, provide a clear frontal headshot or bust photograph. The
                    macro stylizer will preserve identity while amplifying couture proportions,
                    smooth plaster texture, and sculptural lighting.
                  </p>
                </div>
              )}
            </div>
          </div>

          <aside className="panel flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="control-label">Input Photo</span>
                {processedPreview && (
                  <button
                    className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500 transition-colors hover:text-neutral-800"
                    onClick={reset}
                  >
                    Reset
                  </button>
                )}
              </div>
              <label
                className="group flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-6 text-center text-neutral-600 transition hover:border-neutral-400 hover:text-neutral-800"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleFileSelection(event.dataTransfer.files);
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => handleFileSelection(event.target.files)}
                />
                <span className="text-sm font-semibold uppercase tracking-[0.3em]">
                  Drop Portrait or Browse
                </span>
                <span className="text-xs text-neutral-500">
                  High-resolution, front-facing busts work best
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-3">
              <span className={`text-xs font-semibold uppercase tracking-[0.3em] ${statusClass}`}>
                {isProcessing ? "Rendering macro sculpt" : status.text}
              </span>
              {processedPreview && (
                <button
                  onClick={download}
                  className="rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-neutral-900/20 transition hover:bg-neutral-700"
                >
                  Download Macro Still
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4">
              <SliderControl
                label="Macro Depth"
                min={0}
                max={100}
                value={settings.depth}
                onChange={(value) => setSettings((prev) => ({ ...prev, depth: value }))}
              />
              <SliderControl
                label="Luminosity Bias"
                min={-50}
                max={50}
                value={settings.luminosity}
                onChange={(value) => setSettings((prev) => ({ ...prev, luminosity: value }))}
              />
              <SliderControl
                label="Sculpted Highlights"
                min={0}
                max={100}
                value={settings.sheen}
                onChange={(value) => setSettings((prev) => ({ ...prev, sheen: value }))}
              />
              <SliderControl
                label="Matte Shadows"
                min={0}
                max={100}
                value={settings.matte}
                onChange={(value) => setSettings((prev) => ({ ...prev, matte: value }))}
              />
              <SliderControl
                label="Surface Smoothness"
                min={0}
                max={100}
                value={settings.smoothness}
                onChange={(value) => setSettings((prev) => ({ ...prev, smoothness: value }))}
              />
              <SliderControl
                label="Micro Detail"
                min={0}
                max={100}
                value={settings.microDetail}
                onChange={(value) => setSettings((prev) => ({ ...prev, microDetail: value }))}
              />
              <SliderControl
                label="Background Lift"
                min={0}
                max={100}
                value={settings.backgroundLift}
                onChange={(value) => setSettings((prev) => ({ ...prev, backgroundLift: value }))}
              />
              <SliderControl
                label="Macro Zoom"
                min={0}
                max={40}
                value={settings.macroZoom}
                onChange={(value) => setSettings((prev) => ({ ...prev, macroZoom: value }))}
              />
              <SliderControl
                label="Stand Elevation"
                min={10}
                max={40}
                value={settings.standHeight}
                onChange={(value) => setSettings((prev) => ({ ...prev, standHeight: value }))}
              />
              <SliderControl
                label="Vignette Ease"
                min={0}
                max={60}
                value={settings.vignette}
                onChange={(value) => setSettings((prev) => ({ ...prev, vignette: value }))}
              />
            </div>
          </aside>
        </section>
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </main>
  );
}
