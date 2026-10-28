"""SAM 3 inference for OpenIdea Lab, via Hugging Face transformers.

Input:  {"image": data URL or base64, "prompt": text, "threshold": 0.5 (optional)}
Output: {"segments": [{"index", "bbox": [x, y, w, h], "mask": PNG data URL, "score"}]}

SAM 3 does promptable concept segmentation: one text prompt returns every
instance that matches it. For a photo of hardware, "every distinct component"
is the default; the client may pass something narrower like "capacitor".

The API here follows the model card and the transformers docs:
  Sam3Model.from_pretrained("facebook/sam3"), Sam3Processor.from_pretrained(...),
  processor(images=..., text=...), model(**inputs),
  processor.post_process_instance_segmentation(outputs, threshold, mask_threshold, target_sizes).
Boxes come back as xyxy pixels; we convert to [x, y, w, h] for the client.
"""

import base64
import io
import os

import numpy as np
from PIL import Image

MODEL_ID = "facebook/sam3"


class Model:
    def __init__(self, **kwargs):
        self._secrets = kwargs.get("secrets", {})
        self._model = None
        self._processor = None
        self._device = "cpu"

    def load(self):
        import torch
        from transformers import Sam3Model, Sam3Processor

        token = None
        try:
            token = self._secrets.get("hf_access_token")
        except Exception:
            token = None
        if token:
            os.environ["HF_TOKEN"] = token

        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if self._device == "cuda" else torch.float32
        self._model = Sam3Model.from_pretrained(MODEL_ID, token=token, torch_dtype=dtype).to(self._device).eval()
        self._processor = Sam3Processor.from_pretrained(MODEL_ID, token=token)

    def predict(self, request: dict) -> dict:
        import torch

        image = _decode(request["image"])
        prompt = (request.get("prompt") or "every distinct component").strip()
        threshold = float(request.get("threshold") or 0.5)

        inputs = self._processor(images=image, text=prompt, return_tensors="pt").to(self._device)
        # Match the model's dtype for pixel values; ids stay integer.
        if "pixel_values" in inputs:
            inputs["pixel_values"] = inputs["pixel_values"].to(self._model.dtype)

        with torch.no_grad():
            outputs = self._model(**inputs)

        results = self._processor.post_process_instance_segmentation(
            outputs,
            threshold=threshold,
            mask_threshold=0.5,
            target_sizes=inputs.get("original_sizes").tolist(),
        )[0]

        segments = []
        masks = results.get("masks")
        boxes = results.get("boxes")
        scores = results.get("scores")
        if masks is None or boxes is None or scores is None:
            return {"segments": []}

        for i in range(len(scores)):
            x0, y0, x1, y1 = [int(round(float(v))) for v in boxes[i].tolist()]
            mask = masks[i].detach().cpu().numpy()
            segments.append(
                {
                    "index": i,
                    "bbox": [x0, y0, max(1, x1 - x0), max(1, y1 - y0)],
                    "mask": _encode_mask(mask),
                    "score": float(scores[i]),
                }
            )
        # Biggest, most confident parts first so the client's crops are useful even if it caps the count.
        segments.sort(key=lambda s: (-s["score"], -(s["bbox"][2] * s["bbox"][3])))
        for i, s in enumerate(segments):
            s["index"] = i
        return {"segments": segments}


def _decode(data: str) -> Image.Image:
    raw = data.split(",", 1)[1] if data.startswith("data:") else data
    return Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")


def _encode_mask(mask: np.ndarray) -> str:
    png = Image.fromarray((mask.astype(bool).astype(np.uint8) * 255), mode="L")
    buf = io.BytesIO()
    png.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
