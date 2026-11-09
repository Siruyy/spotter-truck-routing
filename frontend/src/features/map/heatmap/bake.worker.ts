import { bakeFrames, type BakeInput } from './bake'

export interface BakeRequest extends BakeInput {
  id: number
}

export interface BakeResponse {
  id: number
  layer: BakeInput['layer']
  frames: ImageBitmap[]
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<BakeRequest>) => void) | null
  postMessage: (message: BakeResponse, transfer: Transferable[]) => void
}

const scope = self as unknown as WorkerScope

scope.onmessage = async (event) => {
  const req = event.data
  const raw = bakeFrames(req)
  const frames = await Promise.all(
    raw.map((pixels) =>
      createImageBitmap(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, req.width, req.height), {
        premultiplyAlpha: 'premultiply',
      }),
    ),
  )
  scope.postMessage({ id: req.id, layer: req.layer, frames }, frames)
}
