import {
  GREETING_DARK_TEXT_LUMINANCE,
  GREETING_SAMPLING_CANVAS_HEIGHT,
  GREETING_SAMPLING_CANVAS_WIDTH,
  GREETING_SWITCH_THRESHOLD,
  type RectLike,
  type WelcomeGreetingEstimateInput,
  type WelcomeGreetingEstimateResult,
  type WelcomeGreetingResolved,
} from './types'

interface SourceRect extends RectLike { }

interface DecodedImage {
  width: number
  height: number
  source: CanvasImageSource
  cleanup?: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function srgbToLinear(value: number): number {
  const normalized = value / 255
  if (normalized <= 0.04045) {
    return normalized / 12.92
  }
  return ((normalized + 0.055) / 1.055) ** 2.4
}

function calculateLuminanceFromImageData(data: Uint8ClampedArray): number {
  const pixelCount = data.length / 4
  if (pixelCount === 0) return 1

  let luminanceSum = 0
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255
    const r = srgbToLinear(data[index] ?? 0)
    const g = srgbToLinear(data[index + 1] ?? 0)
    const b = srgbToLinear(data[index + 2] ?? 0)

    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    luminanceSum += luminance * alpha + (1 - alpha)
  }

  return luminanceSum / pixelCount
}

async function decodeImageBlob(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob)
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      cleanup: () => bitmap.close(),
    }
  }

  if (typeof Image === 'undefined') {
    throw new Error('Image decode is not supported in current runtime')
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()
      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Failed to decode welcome greeting image'))
      nextImage.src = objectUrl
    })

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      source: image,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

function createSamplingContext(): CanvasRenderingContext2D {
  if (typeof document === 'undefined') {
    throw new Error('Canvas sampling is unavailable in current runtime')
  }

  const canvas = document.createElement('canvas')
  canvas.width = GREETING_SAMPLING_CANVAS_WIDTH
  canvas.height = GREETING_SAMPLING_CANVAS_HEIGHT

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('Failed to create canvas context for welcome greeting estimation')
  }
  return context
}

function resolveImageDimension(
  fromInput: number | undefined,
  fromDecode: number,
): number {
  if (Number.isFinite(fromInput) && (fromInput as number) > 0) {
    return Math.round(fromInput as number)
  }
  return fromDecode
}

export function mapViewportRectToSourceRect(params: {
  targetRect: RectLike
  viewportWidth: number
  viewportHeight: number
  imageWidth: number
  imageHeight: number
}): SourceRect {
  const { targetRect, viewportWidth, viewportHeight, imageWidth, imageHeight } = params

  const scale = Math.max(viewportWidth / imageWidth, viewportHeight / imageHeight)
  const renderWidth = imageWidth * scale
  const renderHeight = imageHeight * scale
  const offsetX = (viewportWidth - renderWidth) / 2
  const offsetY = (viewportHeight - renderHeight) / 2

  const srcX = clamp((targetRect.left - offsetX) / scale, 0, imageWidth)
  const srcY = clamp((targetRect.top - offsetY) / scale, 0, imageHeight)
  const srcW = clamp(targetRect.width / scale, 1, Math.max(1, imageWidth - srcX))
  const srcH = clamp(targetRect.height / scale, 1, Math.max(1, imageHeight - srcY))

  return {
    left: srcX,
    top: srcY,
    width: srcW,
    height: srcH,
  }
}

export function decideWelcomeGreetingResolved(params: {
  luminance: number
  darkTextLuminance?: number
  switchThreshold?: number
}): {
  resolved: WelcomeGreetingResolved
  contrastWhite: number
  contrastDark: number
} {
  const luminance = clamp(params.luminance, 0, 1)
  const darkTextLuminance = clamp(
    params.darkTextLuminance ?? GREETING_DARK_TEXT_LUMINANCE,
    0,
    1,
  )
  const threshold = params.switchThreshold ?? GREETING_SWITCH_THRESHOLD

  const contrastWhite = (1 + 0.05) / (luminance + 0.05)
  const contrastDark = (luminance + 0.05) / (darkTextLuminance + 0.05)
  const shouldForceLight
    = contrastWhite > contrastDark
    && contrastWhite - contrastDark >= threshold

  return {
    resolved: shouldForceLight ? 'force-light' : 'default',
    contrastWhite,
    contrastDark,
  }
}

export async function estimateWelcomeGreetingReadability(
  input: WelcomeGreetingEstimateInput,
): Promise<WelcomeGreetingEstimateResult> {
  const context = createSamplingContext()
  const decoded = await decodeImageBlob(input.imageBlob)

  try {
    const imageWidth = resolveImageDimension(input.imageWidth, decoded.width)
    const imageHeight = resolveImageDimension(input.imageHeight, decoded.height)

    const sourceRect = mapViewportRectToSourceRect({
      targetRect: input.targetRect,
      viewportWidth: input.viewportWidth,
      viewportHeight: input.viewportHeight,
      imageWidth,
      imageHeight,
    })

    console.log('[ThemeBackground][WelcomeGreeting][Sample]', {
      viewport: {
        width: input.viewportWidth,
        height: input.viewportHeight,
      },
      image: {
        width: imageWidth,
        height: imageHeight,
      },
      targetRect: input.targetRect,
      sourceRect,
    })

    context.clearRect(0, 0, GREETING_SAMPLING_CANVAS_WIDTH, GREETING_SAMPLING_CANVAS_HEIGHT)
    context.drawImage(
      decoded.source,
      sourceRect.left,
      sourceRect.top,
      sourceRect.width,
      sourceRect.height,
      0,
      0,
      GREETING_SAMPLING_CANVAS_WIDTH,
      GREETING_SAMPLING_CANVAS_HEIGHT,
    )

    const pixelData = context.getImageData(
      0,
      0,
      GREETING_SAMPLING_CANVAS_WIDTH,
      GREETING_SAMPLING_CANVAS_HEIGHT,
    ).data
    const luminance = calculateLuminanceFromImageData(pixelData)
    const decision = decideWelcomeGreetingResolved({ luminance })

    console.log('[ThemeBackground][WelcomeGreeting][Decision]', {
      luminance: Number(luminance.toFixed(4)),
      contrastWhite: Number(decision.contrastWhite.toFixed(3)),
      contrastDark: Number(decision.contrastDark.toFixed(3)),
      resolved: decision.resolved,
    })

    return {
      resolved: decision.resolved,
      luminance,
      contrastWhite: decision.contrastWhite,
      contrastDark: decision.contrastDark,
    }
  } finally {
    decoded.cleanup?.()
  }
}
