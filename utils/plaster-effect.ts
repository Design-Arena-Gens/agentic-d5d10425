export interface EffectSettings {
  depth: number; // overall contour intensity
  luminosity: number; // brightness shift
  sheen: number; // highlight boosting
  matte: number; // shadow lift / matte finish
  smoothness: number; // smoothing vs detail
  microDetail: number; // fine detail boost
  backgroundLift: number; // whiteness of backdrop
  macroZoom: number; // camera proximity crop
  standHeight: number; // height of supporting cube in percent
  vignette: number; // vignette strength
}

export const OUTPUT_WIDTH = 900;
export const OUTPUT_HEIGHT = 1200;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const contrastTransform = (value: number, contrast: number) => {
  const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
  return clamp(factor * (value - 128) + 128, 0, 255);
};

const softLight = (base: number, blend: number) => {
  const b = base / 255;
  const c = blend / 255;
  const result = c < 0.5 ? 2 * b * c + b * b * (1 - 2 * c) :
    2 * b * (1 - c) + Math.sqrt(b) * (2 * c - 1);
  return clamp(result * 255, 0, 255);
};

const applySobel = (map: Float32Array, width: number, height: number) => {
  const result = new Float32Array(map.length);
  const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;

      let idx = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const sample = map[(y + ky) * width + (x + kx)];
          gx += sample * kernelX[idx];
          gy += sample * kernelY[idx];
          idx++;
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      result[y * width + x] = magnitude;
    }
  }

  return result;
};

const gaussianBlur = (
  source: Float32Array,
  width: number,
  height: number,
  radius: number
) => {
  if (radius <= 0) return source;

  const horizontal = new Float32Array(source.length);
  const vertical = new Float32Array(source.length);
  const kernelSize = radius * 2 + 1;
  const kernel = new Float32Array(kernelSize);
  let kernelSum = 0;

  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    const value = Math.exp(-(x * x) / (2 * radius * radius));
    kernel[i] = value;
    kernelSum += value;
  }

  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= kernelSum;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let accum = 0;
      for (let k = -radius; k <= radius; k++) {
        const sampleX = clamp(x + k, 0, width - 1);
        accum += source[y * width + sampleX] * kernel[k + radius];
      }
      horizontal[y * width + x] = accum;
    }
  }

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let accum = 0;
      for (let k = -radius; k <= radius; k++) {
        const sampleY = clamp(y + k, 0, height - 1);
        accum += horizontal[sampleY * width + x] * kernel[k + radius];
      }
      vertical[y * width + x] = accum;
    }
  }

  return vertical;
};

const normaliseArray = (source: Float32Array) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < source.length; i++) {
    const value = source[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = max - min || 1;
  const target = new Float32Array(source.length);

  for (let i = 0; i < source.length; i++) {
    target[i] = (source[i] - min) / range;
  }

  return target;
};

interface RenderConfig {
  settings: EffectSettings;
  source: CanvasImageSource;
  context: CanvasRenderingContext2D;
}

const cropToAspect = (
  source: CanvasImageSource,
  aspectRatio: number,
  zoomFactor: number
) => {
  const width = "width" in source ? (source as HTMLImageElement | HTMLVideoElement | HTMLCanvasElement).width : OUTPUT_WIDTH;
  const height = "height" in source ? (source as HTMLImageElement | HTMLVideoElement | HTMLCanvasElement).height : OUTPUT_HEIGHT;

  const ratio = width / height;
  let cropWidth = width;
  let cropHeight = height;

  if (ratio > aspectRatio) {
    cropWidth = height * aspectRatio;
  } else {
    cropHeight = width / aspectRatio;
  }

  const zoom = clamp(zoomFactor, 0, 60) / 100 + 1;
  cropWidth /= zoom;
  cropHeight /= zoom;

  const offsetX = (width - cropWidth) / 2;
  const offsetY = (height - cropHeight) / 2;

  return { offsetX, offsetY, cropWidth, cropHeight };
};

export const renderPlasterEffect = ({
  source,
  context,
  settings
}: RenderConfig) => {
  const width = OUTPUT_WIDTH;
  const height = OUTPUT_HEIGHT;

  const { offsetX, offsetY, cropWidth, cropHeight } = cropToAspect(
    source,
    width / height,
    settings.macroZoom
  );

  context.save();
  context.clearRect(0, 0, width, height);

  const background = context.createLinearGradient(0, 0, 0, height);
  const lift = clamp(settings.backgroundLift, 0, 100) / 100;
  background.addColorStop(0, `rgba(250,250,247,${0.85 + lift * 0.1})`);
  background.addColorStop(1, `rgba(242,242,236,${0.9 + lift * 0.08})`);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.filter = "none";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    offsetX,
    offsetY,
    cropWidth,
    cropHeight,
    0,
    0,
    width,
    height
  );

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const luminance = new Float32Array(width * height);

  for (let i = 0; i < data.length; i += 4) {
    const gray =
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const index = i / 4;
    luminance[index] = gray;
  }

  const blurRadius = Math.round(clamp(settings.smoothness, 0, 100) / 18);
  const smoothed = gaussianBlur(luminance, width, height, blurRadius);
  const detailSource = new Float32Array(luminance.length);

  for (let i = 0; i < luminance.length; i++) {
    detailSource[i] = luminance[i] - smoothed[i];
  }

  const normalisedDetail = normaliseArray(detailSource);
  const detailStrength = clamp(settings.microDetail, 0, 100) / 100;

  const sobelMap = applySobel(smoothed, width, height);
  const normalisedSobel = normaliseArray(sobelMap);

  const depthStrength = clamp(settings.depth, 0, 100) / 100;
  const sheenStrength = clamp(settings.sheen, 0, 100) / 100;
  const matteStrength = clamp(settings.matte, 0, 100) / 100;
  const luminosityShift = (clamp(settings.luminosity, -50, 50) / 50) * 15;

  for (let i = 0; i < data.length; i += 4) {
    const idx = i / 4;
    let value = smoothed[idx];

    value = contrastTransform(value, 30 + depthStrength * 90);
    value = clamp(value + luminosityShift, 0, 255);

    const micro = (normalisedDetail[idx] - 0.5) * 80 * detailStrength;
    value = clamp(value + micro, 0, 255);

    const contour = (normalisedSobel[idx] - 0.4) * 140 * depthStrength;
    value = clamp(value + contour, 0, 255);

    if (value > 210) {
      const boost = (value - 210) * 0.8 * sheenStrength;
      value = clamp(softLight(value, value + boost), 0, 255);
    }

    if (value < 80) {
      const liftShadows = (80 - value) * 0.6 * matteStrength;
      value = clamp(value + liftShadows, 0, 255);
    }

    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  context.putImageData(imageData, 0, 0);

  const vignetteStrength = clamp(settings.vignette, 0, 100) / 100;
  if (vignetteStrength > 0) {
    const gradient = context.createRadialGradient(
      width / 2,
      height * 0.55,
      width * 0.25,
      width / 2,
      height * 0.55,
      Math.max(width, height) * 0.7
    );
    gradient.addColorStop(0, "rgba(255,255,255,0)");
    gradient.addColorStop(
      1,
      `rgba(210,210,205,${0.35 * vignetteStrength})`
    );
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  const standPercent = clamp(settings.standHeight, 10, 45) / 100;
  const standHeight = height * standPercent;
  const standWidth = width * (0.36 + 0.08 * depthStrength);
  const standX = width / 2 - standWidth / 2;
  const standY = height - standHeight;

  const standGradient = context.createLinearGradient(standX, standY, standX, standY + standHeight);
  standGradient.addColorStop(0, "#ffffff");
  standGradient.addColorStop(0.5, "#f3f3f1");
  standGradient.addColorStop(1, "#e4e4df");

  context.fillStyle = standGradient;
  context.fillRect(standX, standY, standWidth, standHeight);

  const standShadow = context.createLinearGradient(
    standX,
    standY,
    standX + standWidth,
    standY + standHeight
  );
  standShadow.addColorStop(0, "rgba(0,0,0,0.12)");
  standShadow.addColorStop(0.25, "rgba(0,0,0,0.05)");
  standShadow.addColorStop(0.75, "rgba(0,0,0,0.02)");
  standShadow.addColorStop(1, "rgba(0,0,0,0.14)");
  context.globalCompositeOperation = "multiply";
  context.fillStyle = standShadow;
  context.fillRect(standX, standY, standWidth, standHeight);
  context.globalCompositeOperation = "source-over";

  const basePad = height * 0.04;
  const baseShadow = context.createLinearGradient(
    0,
    height - basePad,
    0,
    height
  );
  baseShadow.addColorStop(0, "rgba(0,0,0,0.18)");
  baseShadow.addColorStop(0.7, "rgba(0,0,0,0.05)");
  baseShadow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = baseShadow;
  context.fillRect(0, height - basePad, width, basePad);

  context.restore();
};

export const extractDataUrl = (canvas: HTMLCanvasElement) =>
  canvas.toDataURL("image/png", 0.92);
