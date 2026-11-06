# Assess writing patterns with DeepSeek

On November 6, 2026, the owner accepted replacing local AI detection with a DeepSeek writing assessment. Assessment measures writing problems such as filler, vague claims, repetition, and inflated language. The AI-style score does not establish authorship: human writing can contain these patterns, and AI writing can contain none.

Assessment starts automatically after upload and sends document text to DeepSeek before the user requests editing. Update the upload disclosure to explain this transfer. This accepts API usage for documents that users never rewrite in exchange for assessing specific writing problems.

Use the same pinned unslop rules that guide editing, interpreted in context for English and French. Each finding requires an exact quotation, a rule ID, and a concrete explanation. A listed word or punctuation mark alone does not justify a finding. Contextual assessment takes precedence over treating the editing rules as a literal blacklist.

DeepSeek identifies and explains writing problems. Application code calculates the AI-style score from the severity and coverage of validated findings using fixed rules. Use the same rules before and after rewriting. A score that stays the same or increases does not prevent download, and assessment must not force an improvement.

Assign each assessed sentence a severity of 0 for no finding, 1 for minor problems, 2 for clear problems, or 3 for severe problems. DeepSeek assigns severity with supporting evidence, and the application validates the findings. Use the highest validated severity in a sentence rather than adding findings together. Calculate the score as `100 * sum(sentence words * sentence severity) / (3 * total assessed words)`. Include sentences with no findings in the denominator. Word counts cover assessed prose only.

Score the document's own prose, including prose in tables. Exclude quotations, citations, reference lists, and code from scoring. Protected material may provide context for assessing the surrounding prose.

Remove the local detector service, model files, configuration, tests, and stored detector results. Preserve uploaded originals, revised downloads, accounts, and usage history. Do not retain legacy detector results or compare them with the new AI-style scores.

This decision replaces the local-detector requirement and the assessment data-transfer policy in the product specification. The owner accepted the scoring formula and deletion scope. Implementation includes a migration to clear old results and deployment cleanup for the model cache. ADR 0005 remains the basis for separating assessment from user-requested editing.
