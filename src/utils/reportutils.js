import { defaultOperators, toFullOption } from "react-querybuilder";

const operatorTranslations = {
  '=': 'يساوي',
  '!=': 'لا يساوي',
  '<': 'اصغر من',
  '>': 'اكبر من',
  '<=': 'اصغر من او يساوي',
  '>=': 'اكبر من او يساوي',
  'contains': 'يحتوي علي',
  'beginsWith': 'يبدأ ب',
  'endsWith': 'ينتهي ب',
  'doesNotContain': 'لا يحتوي علي',
  'doesNotBeginWith': 'لا يبدأ ب',
  'doesNotEndWith': 'لا ينتهي ب',
  'null': 'فارغ',
  'notNull': 'ليس فارغ',
  'in': 'في',
  'notIn': 'ليس في',
  'between': 'بين',
  'notBetween': 'ليس بين'
};

export const arabicOperators = defaultOperators.map((op) => ({
  ...op,
  label: operatorTranslations[op.name] ?? op.label,
}));

export const validator = (r) => !!r.value;

export function transformFields(fields) {
  return fields.map(field => {
    let operators = arabicOperators;
    if (field.inputType === 'number') {
      operators = operators.filter(op => ['=', '!=', '>', '<', '<=', '>=', 'null', 'notNull'].includes(op.name));
      return {
        ...field,
        operators,
        validator
      };
    } else if (field.inputType === 'date' || field.inputType === 'time' || field.inputType === 'datetime-local') {
      operators = operators.filter(op => ['=', '!=', '>', '<', '<=', '>=', 'null', 'notNull', 'between', 'notBetween'].includes(op.name));
      return {
        ...field,
        operators
      };
    } else if (field.valueEditorType === 'checkbox') {
      operators = operators.filter(op => ['='].includes(op.name));
      return {
        ...field,
        operators
      };
    } else {
      return {
        ...field,
        operators: operators.filter(op => !['>', '<', '<=', '>='].includes(op.name)),
        validator
      }
    }
  }).map(field => toFullOption(field));
}
