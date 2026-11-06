# Local AI detection

The app checks the original DOCX locally, rewrites with DeepSeek using the pinned unslop skill, and checks the revised DOCX locally. There is no GPTZero integration, detector API key, or detector subscription. DeepSeek rewriting still uses the configured paid account.

The detector uses [Oculus 2.0 Multilingual](https://huggingface.co/danibor/oculus-v2.0-multilingual/tree/e6b41a2159c78d480738317c3ea6a680073a7b32), pinned to revision `e6b41a2159c78d480738317c3ea6a680073a7b32`. The model card declares Apache 2.0, lists English and French, and describes DeepSeek-v3.2 training examples. The upstream model is based on [Desklib](https://huggingface.co/desklib/ai-text-detector-v1.01), whose owner says that the original model was trained for English only. This implementation uses the multilingual derivative, not the original model.

The model author's accuracy figures are not independent validation. Its training used GPTZero soft labels, which does not make its outputs GPTZero reports. There is no established university adoption or measured accuracy for this app's DeepSeek rewrites. Treat results as experimental signals and review the text. The implementation does not train a new detector or claim authorship certainty.

Compose starts the `detector` service and waits for its health check before starting the worker. No detector port is published. Model files download from Hugging Face on the first start and persist in the `detector_models` volume. No account is needed for this public model. Allow about 1.7 GB for weights, additional space for the runtime image, and about 4 GB of RAM for inference. CPU speed determines scan time. These are operational estimates, not guaranteed limits.

From the repository root, start the development stack with:

```sh
docker compose -f compose.dev.yml up -d --build
```

The production Compose file includes the same detector. Model downloads need network access on the first start. Cached inference sends no document text outside the server. The service keeps text only in memory, omits request logs, and returns only scores and metadata. Deleting a document stops the worker from accepting late results. An inference already running may finish in memory before the detector handles another request.

The worker uses `LOCAL_DETECTOR_URL`, defaulting to `http://detector:8090`, and `LOCAL_DETECTOR_TIMEOUT_MS`, defaulting to 300000. Compose fixes the origin to its private service. For a worker outside Compose, point the setting at a detector on a private interface. `DETECTOR_THREADS` defaults to 2. The worker's existing assessment and processing deadlines still apply. A longer detector timeout cannot extend those deadlines.

The service evaluates every token in balanced, non-overlapping windows of at most 510 content tokens. Two special tokens bring each model input to at most 512 tokens. It weights each window's sigmoid output by its content-token count and returns their mean as `aiScore`. The UI scales that mean to 0 through 100. It is a model score, not a calibrated document probability, classifier confidence, or percentage of text proved to be AI-generated. The weighting policy is part of this app and has not been independently calibrated.

The service returns an unavailable result with no score for fewer than 50 whitespace-delimited words, more than 150,000 UTF-16 code units, or more than 128 model windows. These are application limits. They do not establish an upstream accuracy threshold. The worker publishes an unavailable result so the user can still request editing. A transport or model failure instead uses the durable retry flow. An exhausted final check does not discard a valid revised download.

Both checks retain the model revision, aggregation method, input hash, character count, token count, segment count, and time. New results use `local-detector-v1`. The API exposes only this detector contract. Results stored under another contract return null, and saved document files remain intact. New request operation names prevent reuse of old DeepSeek assessment checkpoints.

The detector loads safetensors at the pinned revision with remote model code disabled. The local architecture implements the mean pooling and binary head described in the model card. Loading fails if checkpoint keys do not match. Detection and rewriting are separate providers, so there is no fallback to an LLM opinion when the detector fails.

Run the service tests without downloading weights:

```sh
python3 -m unittest discover -s services/detector -v
```

For real inference on synthetic English and French samples, build the image and run the smoke test. The read-only source mount exposes the test script. The named volume keeps the model download for subsequent runs.

```sh
docker build -t unslop-local-detector:test services/detector
docker run --rm --memory 4g --cpus 2 \
  -v unslop-detector-test-models:/models \
  -v "$PWD/services/detector:/app:ro" \
  unslop-local-detector:test python smoke.py
```

The smoke test checks model loading, repeatability, English and French inference, full-document coverage, and unavailable short inputs. It is not an accuracy benchmark. Before making accuracy claims, evaluate independently authored human samples, untouched model output, mixed documents, and actual DeepSeek rewrites in each language.

Verification on 2026-11-06 loaded the real pinned weights in the CPU test container and produced repeatable results for synthetic English and French samples. The French sample received a low AI score even though it was generated for the test. This is a concrete false negative, not evidence of accurate French detection. The longer sample used two model windows, and the short sample returned no score. The smoke test validates the runtime and coverage only.
