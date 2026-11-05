export interface IOption {
  label: string;
  value: string;
}

export interface IField {
  type: string;
  name: string;
  label: string;
  options?: IOption[];
  required?: boolean;
}

export interface IForm {
  phase: string;
  fields: IField[];
}

export type IFormResponses = Record<string, string | string[]>;

export type IQuestionType = 'text' | 'textarea' | 'email' | 'number' | 'date' | 'select' | 'radio' | 'checkbox';

export interface IQuestionTypeOption {
  value: IQuestionType;
  label: string;
}

export interface IFormAnswerOption {
  label: string;
  value: string;
  checked: boolean;
}

export interface IFormAnswer {
  name: string;
  type: string;
  required: boolean;
  value: string;
  options: IFormAnswerOption[];
}

export interface IFormAnswersModel {
  answers: IFormAnswer[];
}
