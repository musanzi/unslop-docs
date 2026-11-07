# Score the AI detection rate with Oculus

On November 7, 2026, the owner accepted the pinned Oculus 2.0 Multilingual model as the only source of the **AI detection rate**. This supersedes the assessment method, scoring formula, and terminology in [ADR 0006](0006-assess-writing-patterns-with-deepseek.md), and its removal of the local detector. [ADR 0005](0005-separate-assessment-from-user-requested-editing.md) still separates detection from user-requested editing. DeepSeek now only edits.

The decision follows a comparison with results from ZCAS University. The owner does not know which detector ZCAS uses.

| Document             | ZCAS | Unslop rules and edit history | Oculus |
| -------------------- | ---- | ----------------------------- | ------ |
| `CHAPITRE 3.docx`    | 90%  | 36                            | 93     |
| `CHAPITRE 3 ok.docx` | 0%   | 43                            | 46     |

Rule matching and edit history ranked the pair backwards. The unslop rules measure weak writing, so clean machine prose matched none of them, while clumsy reworded prose did. DOCX edit history differed by one point, because both files were fresh saved copies. A rewrite also copies that metadata unchanged. Neither signal contributes to the rate.

Oculus ranked the pair correctly and came within three points on the rejected document, but it overstated the accepted document by 46 points. Two documents do not establish accuracy. The model is trained on GPTZero labels, its rate is not a calibrated probability, and its earlier smoke test recorded a French false negative. The interface shows the rate without a caveat by owner decision. Evaluate 20 to 30 documents with known institutional results, including French ones, before changing bands or thresholds.

Detection runs once, on the original. The revised document receives no rate, and the interface keeps its single circle. Assessment no longer sends text to DeepSeek. Student text reaches only the detector service, which has no network route outside the Compose network.

Production containers on the default bridge network cannot resolve external names, and builds use the host network. The image therefore contains the pinned model and runs offline, instead of downloading it at startup. A benchmark on the production server, whose virtual CPU exposes no AVX or SSE4.2, measured 5.2 seconds per 510-token window with four threads, 91 seconds for a 17-window document, and 1.82 GB peak memory. Detection therefore gets a 10-minute deadline, four CPUs, and a 4 GB limit. The single worker processes documents one at a time.

The owner cleared all data for the beta launch and replaced the migration history with one migration, `1794049887155-Init`, generated with `pnpm db:migrate`. Entities do not describe the allowance table, check constraints, partial indexes, reservation trigger, or role rows, and TypeORM emitted the shared `user_status` type twice. The file therefore carries those additions by hand.
