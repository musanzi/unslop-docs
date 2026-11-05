import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, computed, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OPTION_TYPES } from '@web/shared/data';
import { IField, IForm, IOption, IQuestionType, IQuestionTypeOption } from '@web/shared/interfaces';

@Component({
  selector: 'form-builder',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatDividerModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule
  ],
  templateUrl: './form-builder.html'
})
export class FormBuilder {
  value = model.required<IForm[]>();

  protected questionTypes: IQuestionTypeOption[] = [
    { value: 'text', label: 'Short answer' },
    { value: 'textarea', label: 'Paragraphe' },
    { value: 'email', label: 'Email address' },
    { value: 'number', label: 'Nombre' },
    { value: 'date', label: 'Date' },
    { value: 'select', label: 'Dropdown list' },
    { value: 'radio', label: 'Choix unique' },
    { value: 'checkbox', label: 'Checkboxes' }
  ];

  protected questionsCount = computed(() => this.value().reduce((count, section) => count + section.fields.length, 0));

  protected addSection(): void {
    this.value.update((sections) => [{ phase: `Section ${sections.length + 1}`, fields: [] }, ...sections]);
  }

  protected updateSection(sectionIndex: number, phase: string): void {
    this.updateSections(sectionIndex, (section) => ({ ...section, phase }));
  }

  protected deleteSection(sectionIndex: number): void {
    this.value.update((sections) => sections.filter((_, index) => index !== sectionIndex));
  }

  protected addQuestion(sectionIndex: number): void {
    this.updateSections(sectionIndex, (section) => {
      const fieldNumber = this.questionsCount() + 1;
      return {
        ...section,
        fields: [
          ...section.fields,
          {
            type: 'text',
            name: `field_${fieldNumber}`,
            label: '',
            placeholder: '',
            required: false
          }
        ]
      };
    });
  }

  protected updateQuestion(sectionIndex: number, questionIndex: number, changes: Partial<IField>): void {
    this.updateSections(sectionIndex, (section) => ({
      ...section,
      fields: section.fields.map((field, index) => (index === questionIndex ? { ...field, ...changes } : field))
    }));
  }

  protected updateQuestionType(sectionIndex: number, questionIndex: number, type: IQuestionType): void {
    const field = this.value()[sectionIndex].fields[questionIndex];
    this.updateQuestion(sectionIndex, questionIndex, {
      type,
      options: OPTION_TYPES.has(type) ? (field.options?.length ? field.options : [this.createOption(1)]) : undefined
    });
  }

  protected duplicateQuestion(sectionIndex: number, questionIndex: number): void {
    this.updateSections(sectionIndex, (section) => {
      const source = section.fields[questionIndex];
      const copy: IField = {
        ...source,
        name: `${source.name}_copy`,
        options: source.options?.map((option) => ({ ...option }))
      };
      const fields = [...section.fields];
      fields.splice(questionIndex + 1, 0, copy);
      return { ...section, fields };
    });
  }

  protected deleteQuestion(sectionIndex: number, questionIndex: number): void {
    this.updateSections(sectionIndex, (section) => ({
      ...section,
      fields: section.fields.filter((_, index) => index !== questionIndex)
    }));
  }

  protected reorderQuestions(sectionIndex: number, event: CdkDragDrop<IField[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    this.updateSections(sectionIndex, (section) => {
      const fields = [...section.fields];
      moveItemInArray(fields, event.previousIndex, event.currentIndex);
      return { ...section, fields };
    });
  }

  protected hasOptions(type: string): boolean {
    return OPTION_TYPES.has(type as IQuestionType);
  }

  protected addOption(sectionIndex: number, questionIndex: number): void {
    const options = this.value()[sectionIndex].fields[questionIndex].options ?? [];
    this.updateQuestion(sectionIndex, questionIndex, { options: [...options, this.createOption(options.length + 1)] });
  }

  protected updateOption(sectionIndex: number, questionIndex: number, optionIndex: number, label: string): void {
    const options = this.value()[sectionIndex].fields[questionIndex].options ?? [];
    this.updateQuestion(sectionIndex, questionIndex, {
      options: options.map((option, index) =>
        index === optionIndex ? { label, value: this.optionValue(label, optionIndex + 1) } : option
      )
    });
  }

  protected deleteOption(sectionIndex: number, questionIndex: number, optionIndex: number): void {
    const options = this.value()[sectionIndex].fields[questionIndex].options ?? [];
    this.updateQuestion(sectionIndex, questionIndex, {
      options: options.filter((_, index) => index !== optionIndex)
    });
  }

  private createOption(index: number): IOption {
    return { label: `Option ${index}`, value: `option_${index}` };
  }

  private optionValue(label: string, fallbackIndex: number): string {
    const value = label
      .trim()
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    return value || `option_${fallbackIndex}`;
  }

  private updateSections(sectionIndex: number, update: (section: IForm) => IForm): void {
    this.value.update((sections) =>
      sections.map((section, index) => (index === sectionIndex ? update(section) : section))
    );
  }
}
