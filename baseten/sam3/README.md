# SAM 3 on Baseten

What Lab's photo flow calls to outline parts in a hardware photo.

## One-time setup

1. **Hugging Face access.** SAM 3's weights are gated. Sign in at https://huggingface.co/facebook/sam3,
   accept the licence, then create a **read** token under Settings → Access Tokens. Approval can take a while.
2. **Baseten API key.** Dashboard → Settings → API keys.
3. **Secret.** Dashboard → Settings → Secrets → add `hf_access_token` with the Hugging Face token as value.
   The name must match `config.yaml`.

## Deploy (from the repo root, on your machine)

```bash
pip install --upgrade truss
truss login            # paste the Baseten API key
truss push baseten/sam3 --publish
```

`--publish` matters: Lab calls the `/production/predict` address, which only a published deployment has.
The first start downloads ~3 GB of weights and takes a few minutes; watch the model's Logs tab.

## After the first deploy

- **Scaling:** min replicas **0**, max **1**. Zero means it sleeps when idle and credits are not spent; the
  cost is a 30–90 s wake-up that Lab shows as "Starting the GPU…".
- Copy the model id from the model page into `.env.local` / Vercel as `BASETEN_SAM3_MODEL_ID`, with your
  `BASETEN_API_KEY`.
- Optional: `BASETEN_PRICE_PER_MIN` (the A10G rate from Baseten's pricing page) so the usage panel shows cost.

## Try it from a terminal

```bash
curl -s -X POST "https://model-$BASETEN_SAM3_MODEL_ID.api.baseten.co/production/predict" \
  -H "Authorization: Api-Key $BASETEN_API_KEY" -H "Content-Type: application/json" \
  -d "{\"image\": \"$(base64 -i photo.jpg)\", \"prompt\": \"every distinct component\"}" | head -c 400
```

A 503 means the replica is still waking up; try again in a minute.

## If the deploy fails

Copy the first error from the Logs tab. The likely spots are the `transformers` version (SAM 3 needs a
recent release; raise the pin in `config.yaml`) and the gated download (the secret name or an unaccepted
licence). The inference code follows the model card; if a field name differs in your transformers
version, the error names it.
