import { Component, computed, input, linkedSignal } from '@angular/core';
import { applyEach, form, FormField, required, submit, validate } from '@angular/forms/signals';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { IField, IForm, IFormAnswer, IFormAnswersModel, IFormResponses } from '@web/shared/interfaces';

@Component({
  selector: 'form-renderer',
  imports: [FormField, MatCheckboxModule, MatInputModule, MatRadioModule, MatSelectModule],
  templateUrl: './form-renderer.html'
})
export class FormRenderer {
  sections = input.required<IForm[]>();
  initialResponses = input<IFormResponses>({});
  readonly isEmpty = computed(() => !this.sections().some((section) => section.fields.length > 0));

  private answersModel = linkedSignal<IFormAnswersModel>(() => ({
    answers: this.sections().flatMap((section) => section.fields.map((field) => this.buildAnswer(field)))
  }));

  answerForm = form(this.answersModel, (schemaPath) => {
    applyEach(schemaPath.answers, (answer) => {
      required(answer.value, {
        message: 'This field is required.',
        when: ({ valueOf }) => valueOf(answer.required) && valueOf(answer.type) !== 'checkbox'
      });
      validate(answer.options, ({ value, valueOf }) =>
        valueOf(answer.required) && valueOf(answer.type) === 'checkbox' && !value().some((option) => option.checked)
          ? { kind: 'required', message: 'Select at least one option.' }
          : undefined
      );
    });
  });

  invalid = computed(() => this.answerForm().invalid());

  protected renderedSections = computed(() => {
    let answerIndex = 0;
    return this.sections().map((section) => ({
      phase: section.phase,
      questions: section.fields.map((field) => ({ field, answerIndex: answerIndex++ }))
    }));
  });

  responses(): IFormResponses {
    return Object.fromEntries(
      this.answersModel().answers.map((answer) => [
        answer.name,
        answer.type === 'checkbox'
          ? answer.options.filter((option) => option.checked).map((option) => option.label)
          : this.responseValue(answer)
      ])
    );
  }

  submit(handler: (responses: IFormResponses) => void | Promise<void>): void {
    if (this.isEmpty()) {
      return;
    }

    submit(this.answerForm, async () => handler(this.responses()));
  }

  protected fieldInputType(type: string): string {
    return type === 'email' || type === 'number' || type === 'date' ? type : 'text';
  }

  private buildAnswer(field: IField): IFormAnswer {
    const initial = this.initialResponses()[field.name];
    const options = (field.options ?? []).map((option) => ({
      ...option,
      checked: Array.isArray(initial) && (initial.includes(option.value) || initial.includes(option.label))
    }));
    const initialString = typeof initial === 'string' ? initial : '';
    const matched = options.find((option) => option.value === initialString || option.label === initialString);
    return {
      name: field.name,
      type: field.type,
      required: field.required ?? false,
      value: matched?.value ?? initialString,
      options
    };
  }

  private responseValue(answer: IFormAnswer): string {
    if (answer.type !== 'select' && answer.type !== 'radio') {
      return answer.value;
    }
    const selected = answer.options.find((option) => option.value === answer.value);
    return selected?.label ?? answer.value;
  }
}
