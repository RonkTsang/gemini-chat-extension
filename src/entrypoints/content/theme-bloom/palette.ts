import { themePresets, type ThemePreset } from '@/entrypoints/content/gemini-theme'

const SAMPLE_EDGE_LENGTH = 96
const DEFAULT_CLUSTER_COUNT = 5
const MAX_CLUSTER_ITERATIONS = 8
const GRAY_CHROMA_THRESHOLD = 0.04
const COLORED_POPULATION_THRESHOLD = 0.08
const DISTANCE_EPSILON = 1e-9

export interface OklabColor {
  lightness: number
  a: number
  b: number
}

export interface OklchColor {
  lightness: number
  chroma: number
  hue: number
}

export interface ThemeBloomSampledColor {
  hex: string
  population: number
  lightness: number
  chroma: number
}

export interface ThemeBloomPaletteResult {
  sampledColors: ThemeBloomSampledColor[]
  accentColor: string
  presetKey: string
  presetDistance: number
}

interface RgbColor {
  red: number
  green: number
  blue: number
}

interface ImageSample extends RgbColor {
  lab: OklabColor
}

interface ColorCluster extends RgbColor {
  lab: OklabColor
  population: number
  sampleOrder: number
}

interface RgbaSample extends RgbColor {
  alpha: number
}

export class ThemeBloomPaletteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ThemeBloomPaletteError'
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function linearizeSrgb(channel: number): number {
  const normalized = clamp(channel, 0, 255) / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function delinearizeSrgb(channel: number): number {
  const normalized = clamp(channel, 0, 1)
  return normalized <= 0.0031308
    ? normalized * 12.92
    : 1.055 * normalized ** (1 / 2.4) - 0.055
}

function cubeRoot(value: number): number {
  return Math.cbrt(value)
}

/** Converts an sRGB colour to OKLab using the published Ottosson matrices. */
export function srgbToOklab(red: number, green: number, blue: number): OklabColor {
  const r = linearizeSrgb(red)
  const g = linearizeSrgb(green)
  const b = linearizeSrgb(blue)

  const l = cubeRoot(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = cubeRoot(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = cubeRoot(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return {
    lightness: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

export function oklabToOklch(color: OklabColor): OklchColor {
  const chroma = Math.sqrt(color.a ** 2 + color.b ** 2)
  const hue = (Math.atan2(color.b, color.a) * 180 / Math.PI + 360) % 360

  return {
    lightness: color.lightness,
    chroma,
    hue,
  }
}

export function srgbToOklch(red: number, green: number, blue: number): OklchColor {
  return oklabToOklch(srgbToOklab(red, green, blue))
}

function oklabToSrgb(color: OklabColor): RgbColor {
  const l = color.lightness + 0.3963377774 * color.a + 0.2158037573 * color.b
  const m = color.lightness - 0.1055613458 * color.a - 0.0638541728 * color.b
  const s = color.lightness - 0.0894841775 * color.a - 1.291485548 * color.b

  const l3 = l ** 3
  const m3 = m ** 3
  const s3 = s ** 3

  return {
    red: Math.round(delinearizeSrgb(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3) * 255),
    green: Math.round(delinearizeSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3) * 255),
    blue: Math.round(delinearizeSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3) * 255),
  }
}

function channelToHex(channel: number): string {
  return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0')
}

function rgbToHex(color: RgbColor): string {
  return `#${channelToHex(color.red)}${channelToHex(color.green)}${channelToHex(color.blue)}`
}

function hexToRgb(hex: string): RgbColor {
  const normalized = hex.replace('#', '')
  if (!/^[\da-f]{6}$/i.test(normalized)) {
    throw new ThemeBloomPaletteError(`Invalid preset colour: ${hex}`)
  }

  return {
    red: Number.parseInt(normalized.slice(0, 2), 16),
    green: Number.parseInt(normalized.slice(2, 4), 16),
    blue: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function squaredLabDistance(first: OklabColor, second: OklabColor): number {
  return (first.lightness - second.lightness) ** 2
    + (first.a - second.a) ** 2
    + (first.b - second.b) ** 2
}

function averageLab(samples: ImageSample[]): OklabColor {
  const total = samples.reduce(
    (sum, sample) => ({
      lightness: sum.lightness + sample.lab.lightness,
      a: sum.a + sample.lab.a,
      b: sum.b + sample.lab.b,
    }),
    { lightness: 0, a: 0, b: 0 },
  )

  return {
    lightness: total.lightness / samples.length,
    a: total.a / samples.length,
    b: total.b / samples.length,
  }
}

function selectSeedIndexes(samples: ImageSample[], clusterCount: number): number[] {
  const firstSeed = samples.reduce((bestIndex, sample, index) => {
    const candidate = oklabToOklch(sample.lab)
    const best = oklabToOklch(samples[bestIndex].lab)
    if (candidate.chroma > best.chroma + DISTANCE_EPSILON) return index
    return bestIndex
  }, 0)
  const selected = [firstSeed]

  while (selected.length < clusterCount) {
    let furthestIndex = -1
    let furthestDistance = -1

    samples.forEach((sample, index) => {
      if (selected.includes(index)) return
      const nearestDistance = Math.min(
        ...selected.map((seedIndex) => squaredLabDistance(sample.lab, samples[seedIndex].lab)),
      )
      if (nearestDistance > furthestDistance + DISTANCE_EPSILON) {
        furthestIndex = index
        furthestDistance = nearestDistance
      }
    })

    if (furthestIndex === -1 || furthestDistance <= DISTANCE_EPSILON) break
    selected.push(furthestIndex)
  }

  return selected
}

function clusterSamples(samples: ImageSample[]): ColorCluster[] {
  if (samples.length === 0) {
    throw new ThemeBloomPaletteError('The image does not contain visible pixels')
  }

  const seedIndexes = selectSeedIndexes(samples, Math.min(DEFAULT_CLUSTER_COUNT, samples.length))
  let centers = seedIndexes.map((index) => samples[index].lab)
  let assignments = new Array<number>(samples.length).fill(0)

  for (let iteration = 0; iteration < MAX_CLUSTER_ITERATIONS; iteration += 1) {
    let changed = false
    const buckets = centers.map(() => [] as ImageSample[])

    samples.forEach((sample, sampleIndex) => {
      let nearestIndex = 0
      let nearestDistance = Number.POSITIVE_INFINITY
      centers.forEach((center, centerIndex) => {
        const distance = squaredLabDistance(sample.lab, center)
        if (distance < nearestDistance - DISTANCE_EPSILON) {
          nearestIndex = centerIndex
          nearestDistance = distance
        }
      })
      if (assignments[sampleIndex] !== nearestIndex) changed = true
      assignments[sampleIndex] = nearestIndex
      buckets[nearestIndex].push(sample)
    })

    centers = centers.map((center, index) => (
      buckets[index].length > 0 ? averageLab(buckets[index]) : center
    ))
    if (!changed && iteration > 0) break
  }

  const buckets = centers.map(() => [] as ImageSample[])
  samples.forEach((sample, index) => buckets[assignments[index]].push(sample))

  return buckets
    .map((bucket, clusterIndex) => {
      if (bucket.length === 0) return null
      const rgb = bucket.reduce(
        (sum, sample) => ({
          red: sum.red + sample.red,
          green: sum.green + sample.green,
          blue: sum.blue + sample.blue,
        }),
        { red: 0, green: 0, blue: 0 },
      )
      return {
        red: rgb.red / bucket.length,
        green: rgb.green / bucket.length,
        blue: rgb.blue / bucket.length,
        lab: averageLab(bucket),
        population: bucket.length / samples.length,
        sampleOrder: clusterIndex,
      }
    })
    .filter((cluster): cluster is ColorCluster => cluster !== null)
}

function scoreAccent(cluster: ColorCluster): number {
  const lch = oklabToOklch(cluster.lab)
  const lightnessFitness = clamp(1 - Math.abs(lch.lightness - 0.62) / 0.42, 0.15, 1)
  return Math.sqrt(cluster.population) * lch.chroma ** 1.2 * lightnessFitness
}

function selectAccentCluster(clusters: ColorCluster[]): ColorCluster {
  return clusters.reduce((best, cluster) => {
    const scoreDifference = scoreAccent(cluster) - scoreAccent(best)
    if (scoreDifference > DISTANCE_EPSILON) return cluster
    if (Math.abs(scoreDifference) > DISTANCE_EPSILON) return best

    if (cluster.population > best.population + DISTANCE_EPSILON) return cluster
    if (Math.abs(cluster.population - best.population) > DISTANCE_EPSILON) return best

    const clusterChroma = oklabToOklch(cluster.lab).chroma
    const bestChroma = oklabToOklch(best.lab).chroma
    if (clusterChroma > bestChroma + DISTANCE_EPSILON) return cluster
    return cluster.sampleOrder < best.sampleOrder ? cluster : best
  })
}

export function getThemeBloomPresetDistance(
  accent: OklchColor,
  presetColor: OklchColor,
): number {
  const hueDistance = Math.min(
    Math.abs(accent.hue - presetColor.hue),
    360 - Math.abs(accent.hue - presetColor.hue),
  ) / 180
  const chromaDistance = Math.abs(accent.chroma - presetColor.chroma)
    / Math.max(accent.chroma, presetColor.chroma, 0.1)
  const lightnessDistance = Math.abs(accent.lightness - presetColor.lightness)
  return 0.75 * hueDistance + 0.15 * chromaDistance + 0.10 * lightnessDistance
}

export function matchThemeBloomPreset(
  accent: OklchColor,
  presets: readonly ThemePreset[] = themePresets,
): { key: string; distance: number } {
  const colorPresets = presets.filter((preset) => preset.key !== 'gray')
  if (colorPresets.length === 0) {
    throw new ThemeBloomPaletteError('No colour theme presets are available')
  }

  const match = colorPresets.reduce<{ key: string; distance: number } | null>(
    (best, preset) => {
      const rgb = hexToRgb(preset.primary)
      const distance = getThemeBloomPresetDistance(accent, srgbToOklch(rgb.red, rgb.green, rgb.blue))
      if (!best || distance < best.distance - DISTANCE_EPSILON) {
        return { key: preset.key, distance }
      }
      return best
    },
    null,
  )

  if (!match) throw new ThemeBloomPaletteError('No colour theme presets are available')
  return match
}

export function calculateThemeBloomPaletteFromPixels(
  pixels: readonly RgbaSample[],
  presets: readonly ThemePreset[] = themePresets,
): ThemeBloomPaletteResult {
  const samples = pixels
    .filter((pixel) => pixel.alpha > 0)
    .map((pixel) => ({
      red: pixel.red,
      green: pixel.green,
      blue: pixel.blue,
      lab: srgbToOklab(pixel.red, pixel.green, pixel.blue),
    }))
  const clusters = clusterSamples(samples)
  const sampledColors = clusters.map((cluster) => {
    const lch = oklabToOklch(cluster.lab)
    return {
      hex: rgbToHex(cluster),
      population: cluster.population,
      lightness: lch.lightness,
      chroma: lch.chroma,
    }
  })
  const maxClusterChroma = Math.max(...sampledColors.map((color) => color.chroma))
  const coloredPopulation = sampledColors.reduce(
    (sum, color) => sum + (color.chroma >= GRAY_CHROMA_THRESHOLD ? color.population : 0),
    0,
  )

  if (
    maxClusterChroma < GRAY_CHROMA_THRESHOLD
    || coloredPopulation < COLORED_POPULATION_THRESHOLD
  ) {
    const gray = clusters.reduce((best, cluster) => (
      cluster.population > best.population ? cluster : best
    ))
    return {
      sampledColors,
      accentColor: rgbToHex(gray),
      presetKey: 'gray',
      presetDistance: 0,
    }
  }

  const accent = selectAccentCluster(clusters)
  const accentLch = oklabToOklch(accent.lab)
  const preset = matchThemeBloomPreset(accentLch, presets)
  return {
    sampledColors,
    accentColor: rgbToHex(accent),
    presetKey: preset.key,
    presetDistance: preset.distance,
  }
}

function getSampleDimensions(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, SAMPLE_EDGE_LENGTH / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function createSamplingCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  throw new ThemeBloomPaletteError('Canvas is unavailable in this environment')
}

export async function calculateThemeBloomPalette(file: File): Promise<ThemeBloomPaletteResult> {
  if (typeof createImageBitmap !== 'function') {
    throw new ThemeBloomPaletteError('Image decoding is unavailable in this environment')
  }

  const bitmap = await createImageBitmap(file)
  try {
    const dimensions = getSampleDimensions(bitmap.width, bitmap.height)
    const canvas = createSamplingCanvas(dimensions.width, dimensions.height)
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new ThemeBloomPaletteError('Canvas 2D context is unavailable')

    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height)
    const imageData = context.getImageData(0, 0, dimensions.width, dimensions.height).data
    const pixels: RgbaSample[] = []
    for (let index = 0; index < imageData.length; index += 4) {
      pixels.push({
        red: imageData[index],
        green: imageData[index + 1],
        blue: imageData[index + 2],
        alpha: imageData[index + 3],
      })
    }
    return calculateThemeBloomPaletteFromPixels(pixels)
  } catch (error) {
    if (error instanceof ThemeBloomPaletteError) throw error
    throw new ThemeBloomPaletteError('Image decoding failed while sampling its colours')
  } finally {
    bitmap.close?.()
  }
}

/** Exposed for deterministic conversion tests. */
export function oklabToDisplaySrgb(color: OklabColor): RgbColor {
  return oklabToSrgb(color)
}
