# Separate assessment from user-requested editing

Publish the assessment before editing so users can preview their document, inspect its estimated AI-style score, and choose rewrite strength. Start editing only when the user clicks **Unslopify**. The extra lifecycle states replace automatic editing and joint publication of assessment and revision in ADR 0003.

The first assessment and an idle preview hold no document allowance reservation. Reserve a slot atomically when editing is requested and charge it when the revised document is ready. This avoids abandoned previews holding document allowance slots. There is no separate assessment allowance or user action. Request throttling and processing resource limits bound abuse without creating another product allowance.

Assess the revised document automatically before showing its result. Do not require a target score or another confirmation. A failed final assessment does not discard a usable DOCX after bounded retries; report the score as unavailable. This accepts an occasional missing final score in exchange for delivering the user's document.

PostgreSQL remains the lifecycle store. Each processing stage has a bounded deadline, and the time a user spends at the preview is outside either stage's deadline. Failed editing can retain the successful assessment. The reservation-month policy in ADR 0001 still applies, using the reservation created when editing starts.
