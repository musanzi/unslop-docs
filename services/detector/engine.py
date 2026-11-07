"""Pinned local detector. No document content is sent to the model repository."""

import os

import torch
from torch import nn
from transformers import AutoConfig, AutoModel, AutoTokenizer, PreTrainedModel
from huggingface_hub import snapshot_download

from core import MAX_CHARACTERS, MAX_SEGMENTS, MIN_WORDS, MODEL_FILES, MODEL_ID, MODEL_REVISION, result, score_tokens


class OculusModel(PreTrainedModel):
    config_class = AutoConfig

    def __init__(self, config):
        super().__init__(config)
        self.model = AutoModel.from_config(config, trust_remote_code=False)
        self.classifier = nn.Linear(config.hidden_size, 1)
        self.post_init()

    def forward(self, input_ids, attention_mask, **kwargs):
        hidden = self.model(input_ids=input_ids, attention_mask=attention_mask)[0]
        mask = attention_mask.unsqueeze(-1).expand(hidden.size()).float()
        pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1e-9)
        return self.classifier(pooled.to(self.classifier.weight.dtype))


class Detector:
    def __init__(self):
        torch.set_num_threads(max(1, min(16, int(os.environ.get("DETECTOR_THREADS", "2")))))
        snapshot = snapshot_download(MODEL_ID, revision=MODEL_REVISION, allow_patterns=MODEL_FILES, local_files_only=True)
        self.tokenizer = AutoTokenizer.from_pretrained(snapshot, local_files_only=True, trust_remote_code=False)
        self.model, loading = OculusModel.from_pretrained(
            snapshot, local_files_only=True, trust_remote_code=False,
            use_safetensors=True, low_cpu_mem_usage=True, output_loading_info=True,
        )
        if any(loading.get(key) for key in ("missing_keys", "unexpected_keys", "mismatched_keys", "error_msgs")):
            raise RuntimeError("Detector weights do not match the pinned architecture")
        self.model.eval()
        self.capacity = 512 - self.tokenizer.num_special_tokens_to_add(pair=False)

    def predict(self, token_ids):
        inputs = self.tokenizer.prepare_for_model(
            token_ids, add_special_tokens=True, padding="max_length", max_length=512,
            truncation=False, return_tensors="pt", return_attention_mask=True, verbose=False,
        )
        inputs = {key: value.unsqueeze(0) if value.ndim == 1 else value for key, value in inputs.items()}
        with torch.inference_mode():
            return torch.sigmoid(self.model(**inputs).squeeze(-1)).item()

    def detect(self, text):
        if len(text.encode("utf-16-le")) // 2 > MAX_CHARACTERS:
            return result(text, reason="too_long")
        if len(text.split()) < MIN_WORDS:
            return result(text, reason="too_short")
        ids = self.tokenizer(text, add_special_tokens=False, truncation=False, verbose=False)["input_ids"]
        if not ids:
            return result(text, reason="too_short")
        if len(ids) > self.capacity * MAX_SEGMENTS:
            return result(text, reason="too_long", token_count=len(ids))
        score, count = score_tokens(ids, self.predict, self.capacity)
        return result(text, score=score, token_count=len(ids), segment_count=count)
