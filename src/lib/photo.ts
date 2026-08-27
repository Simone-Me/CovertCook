/**
 * Preparing a photograph for the album, in the only place it can be done.
 *
 * THE POINT OF THIS FILE IS EXIF. A photograph taken on a phone carries a block
 * of metadata, and in that block are GPS coordinates. Uploading one untouched
 * publishes the address of somebody's flat to everybody who was at the dinner,
 * and to anybody they ever forward it to. It is the single most consequential
 * thing this feature does, it is invisible when it goes wrong, and it cannot be
 * fixed later: by the time the file has reached a server, it has travelled.
 *
 * SO IT IS STRIPPED BY RE-DRAWING, NOT BY EDITING. There are libraries that
 * parse the EXIF block and remove the tags they know about. This does not use
 * one, on purpose: the guarantee they offer is "the tags we thought of are
 * gone", and the guarantee wanted here is "nothing but pixels left". Decoding
 * the image and re-encoding the canvas produces a file built from scratch —
 * there is no metadata to miss, because none of it is carried across. Camera
 * make, lens, timestamp and coordinates all go the same way, by construction.
 *
 * THE ONE THING THAT MUST SURVIVE IS ORIENTATION. It is also EXIF, so a naive
 * re-encode drops it and half the photographs arrive lying on their side.
 * `createImageBitmap(blob, { imageOrientation: 'from-image' })` applies the
 * rotation while decoding and hands back a bitmap that is already the right way
 * up — the rotation is baked into the pixels, which is where it belongs once
 * the metadata is going away. The `<img>` fallback below relies on the same
 * behaviour, which browsers have applied by default for several years.
 *
 * Downscaling rides along because it is the same operation: the album is looked
 * at on a phone, 1600px is more than that needs, and it is the difference
 * between a few thousand dinners on the free tier and a few hundred.
 */

// Long edge. Big enough that a photo stands up to being opened full-screen on a
// laptop, small enough that a dinner's worth of them is a couple of megabytes.
const MAX_EDGE = 1600

// JPEG rather than WebP as the output, despite WebP being smaller: every phone
// and every browser can open a JPEG the moment somebody saves one out of the
// album, which is the thing people do with photographs of their friends.
const QUALITY = 0.82

export const MAX_INPUT_BYTES = 12 * 1024 * 1024

export type PhotoProblem = 'NOT_AN_IMAGE' | 'TOO_LARGE' | 'UNREADABLE'

export class PhotoError extends Error {
  // Declared and assigned rather than a parameter property: the project builds
  // with `erasableSyntaxOnly`, which forbids the shorthand because it is the
  // one piece of TypeScript that emits code rather than disappearing.
  readonly problem: PhotoProblem

  constructor(problem: PhotoProblem) {
    super(problem)
    this.problem = problem
  }
}

/**
 * Decode, orient, downscale, re-encode. Returns a JPEG with no metadata at all.
 */
export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new PhotoError('NOT_AN_IMAGE')
  // Checked before decoding rather than after: a 60 MP file is a decode that
  // takes the tab down with it, and the message is the same either way.
  if (file.size > MAX_INPUT_BYTES) throw new PhotoError('TOO_LARGE')

  const source = await decode(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new PhotoError('UNREADABLE')
  context.drawImage(source as CanvasImageSource, 0, 0, width, height)

  // Free the decoded bitmap rather than waiting for the collector: these are
  // tens of megabytes uncompressed, on a phone, immediately after the camera
  // roll has already been open.
  if ('close' in source) source.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) throw new PhotoError('UNREADABLE')
  return blob
}

/**
 * `createImageBitmap` where it exists, an `<img>` where it does not.
 *
 * Both apply the EXIF orientation; only the first says so explicitly, which is
 * why it is preferred. The fallback exists for older Safari, where the
 * `imageOrientation` option is unsupported and the element does the same job.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Falls through: some browsers reject the option rather than ignoring it.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new PhotoError('UNREADABLE'))
      img.src = url
    })
  } finally {
    // Revoked as soon as the element has decoded. A blob URL left alive pins
    // the whole file in memory for as long as the tab is open.
    URL.revokeObjectURL(url)
  }
}
