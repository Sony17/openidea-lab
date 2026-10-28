"""SAM 3 inference for OpenIdea Lab.

Input:  {"image": data URL, "prompt": text}
Output: {"segments": [{"index", "bbox": [x, y, w, h], "mask": PNG data URL, "score"}]}

The text prompt uses SAM 3's promptable concept segmentation: one call returns
every instance matching the prompt. For a hardware photo "every distinct
component" is a good default; the client can pass something narrower.
"""

import base64
import io

import numpy as np
from PIL import Image


class Model:
    def __init__(self, **kwargs):
        self._secrets = kwargs.get("secrets", {})
        self._model = None

    def load(self):
        import os
        import torch

        token = self._secrets.get("hf_access_token")
        if token:
            os.environ["HF_TOKEN"] = token
        # Import here so a missing dependency fails at load, with a clear log.
        from sam3 import build_sam3_image_model  # type: ignore

        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        self._model = build_sam3_image_model().to(self._device).eval()

    def predict(self, request: dict) -> dict:
        image = _decode(request["image"])
        prompt = request.get("prompt") or "every distinct component"

        with _no_grad():
            result = self._model.predict(image, text=prompt)  # type: ignore[attr-defined]

        segments = []
        for i, (mask, box, score) in enumerate(zip(result["masks"], result["boxes"], result["scores"])):
            if float(score) < 0.3:
                continue
            x0, y0, x1, y1 = [int(v) for v in box]
            segments.append(
                {
                    "index": i,
                    "bbox": [x0, y0, max(1, x1 - x0), max(1, y1 - y0)],
                    "mask": _encode_mask(np.asarray(mask)),
                    "score": float(score),
                }
            )
        return {"segments": segments}


def _decode(data_url: str) -> Image.Image:
    raw = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
    return Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")


def _encode_mask(mask: np.ndarray) -> str:
    png = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    buf = io.BytesIO()
    png.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _no_grad():
    import torch

    return torch.no_grad()
