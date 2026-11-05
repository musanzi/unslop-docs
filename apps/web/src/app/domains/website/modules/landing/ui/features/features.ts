import { Component } from '@angular/core';

@Component({
  selector: 'landing-features',
  templateUrl: './features.html'
})
export class LandingFeatures {
  protected readonly features = [
    {
      title: 'Upload a DOCX',
      description: 'The planned first release accepts English and French DOCX files up to 10 MB and 10,000 words.'
    },
    {
      title: 'Read the writing assessment',
      description:
        'See writing patterns with examples from your document. Assessment and editing start automatically after validation, whatever the assessment finds.'
    },
    {
      title: 'Edit with your meaning intact',
      description:
        'Editing is designed to preserve your meaning, language, citations, quotations, and factual claims, without inventing evidence or references.'
    },
    {
      title: 'Download and review',
      description:
        'Download the revised DOCX and your original, then review the changes before submitting your work. Exact page layout preservation is outside the first release.'
    }
  ];
}
