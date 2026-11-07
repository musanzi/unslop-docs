# The detector selects Candidates, and Unslopify has no numeric target

Unslopify uses the detector to choose what to edit and which Candidate to keep. The generator never sees a score, and the product promises no AI detection rate. Priority is meaning, then writing quality, then score. We wanted to take documents from about 90% to under 10%, but two spikes on 2026-11-07 showed we could not do that while keeping meaning.

## Evidence

Both spikes used four DeepSeek-written documents, 4 Candidates per Scoring unit, and the pinned Unslop skill. Spike 2 used only the first two Scoring units of each document, so its starting rates differ from spike 1.

| Document | Spike 1: start | 1 pass | 3 passes | Spike 2: start | `deepseek-flash`, looser prompt, 3 passes | `deepseek-v4-pro`, current prompt, 1 pass | `deepseek-v4-pro`, looser prompt, 3 passes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Business report | 98% | 97% | 95% | 99% | 93% | 99% | 76% |
| Academic essay | 100% | 100% | 97% | 100% | 97% | 100% | 99% |
| Blog post | 83% | 74% | 51% | 88% | 36% | 88% | 70% |
| French report | 99% | 94% | 87% | 98% | 85% | 99% | 39% |

The sample is small and uses one model family, so it rules out these generators and prompts, not every approach.

The detector is also noisy on short text. The Gettysburg Address scored 87% at 64 words, while Austen, Thoreau, and Darwin scored 24%, 22%, and 9%. It refuses text under 50 words, so sentences cannot be scored.

The LLM meaning review rejected no Candidate in either spike. It passed a French rewrite that turned a rise of "près de 60 %" into "presque doublé" and dropped the source attribution. That rewrite produced the 39% result, so low scores can come from broken meaning.

## Considered Options

- **Telling the generator to beat the detector:** rejected because it trades writing quality for score.
- **Token-by-token steering (Adversarial Paraphrasing):** rejected because it is slow, gives the worst text, and needs per-token control that a hosted DeepSeek chat call does not provide.
- **A dedicated paraphrasing model:** not pursued. It would be a separate project and needs its own decision.

## Consequences

Formal documents will often show small changes, such as 98% to 95%, so the result screen leads with the writing changes. A stronger meaning check must exist before the looser prompt ships. Anyone reviving a numeric target should first show new evidence that beats these results with meaning intact.
