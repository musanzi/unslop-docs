import { BadRequestException } from '@nestjs/common';
import { DocxDocument } from './docx-model';

const signals = {
  en: 'the and that this these those with from which their they were have has been would could should through before after because why who will your our you does not',
  fr: 'les des une dans pour avec sont est cette ces nous vous leur leurs ont aux qui que sur plus pas ne au du elle elles ils mais comme être était ses',
  es: 'el los las del una unos unas por para con son este esta estos estas sus pero porque fueron han también más como todo año ellos nuestras nuestro antes hay muy sin',
  de: 'der die das den dem des ein eine einer und ist sind mit für nicht sich auch auf als zu im wir sie haben ihre dieser diese dieses wird werden können müssen',
  pt: 'uma umas uns dos das não são pelo pela pelos pelas também muito mais seus suas isso esse essa estão foram aos numa nas nos você vocês',
  it: 'gli della delle degli dello nella nelle sono non che per questo questa questi queste anche hanno essere dalla dallo degli siamo',
  nl: 'het een van voor zijn niet met deze dit dat ook als wordt worden heeft hebben hun maar door naar om bij wij kunnen'
};

export function documentLanguage(text: string): DocxDocument['language'] {
  const uncertain: DocxDocument['language'] = { status: 'uncertain', languages: [] };
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 120) return uncertain;
  const reject = () => {
    throw new BadRequestException(
      'This document appears to use an unsupported language. Upload a document in English or French, or a mixture of both.'
    );
  };
  const nonLatin = letters.filter((letter) => !/\p{Script=Latin}/u.test(letter)).length;
  if (nonLatin / letters.length > 0.6) reject();
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length < 30) return uncertain;
  const scores = Object.entries(signals).map(([language, vocabulary]) => {
    const dictionary = new Set(vocabulary.split(' '));
    const matches = words.filter((word) => dictionary.has(word));
    return { language, hits: matches.length, distinct: new Set(matches).size };
  });
  const supported = scores.filter((score) => score.language === 'en' || score.language === 'fr');
  const supportedHits = supported.reduce((total, score) => total + score.hits, 0);
  if (
    scores.some(
      (score) =>
        !['en', 'fr'].includes(score.language) &&
        score.distinct >= 6 &&
        score.hits >= 12 &&
        score.hits / words.length >= 0.15 &&
        score.hits > supportedHits * 1.5
    )
  )
    reject();
  const languages: ('en' | 'fr')[] = [];
  for (const score of supported) {
    if (score.distinct >= 5 && score.hits >= 8 && (score.language === 'en' || score.language === 'fr'))
      languages.push(score.language);
  }
  return languages.length ? { status: 'supported', languages } : uncertain;
}
