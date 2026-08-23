import { LanguageSupport, LRLanguage } from '@codemirror/language'
import { styleTags, tags } from '@lezer/highlight'
import { parser } from '@grafana/lezer-logql'

export const logqlLanguage = LRLanguage.define({
  parser: parser.configure({ props: [styleTags({
    'String': tags.string, 'Number Duration Bytes': tags.number,
    'Identifier LabelName': tags.variableName, 'Matcher FilterOp ConvOp VectorOp RangeOp': tags.operator,
    'Json Logfmt Pattern Regexp Unpack Decolorize': tags.keyword,
    'LineComment': tags.comment
  })] }),
  languageData: { commentTokens: { line: '#' }, closeBrackets: { brackets: ['(', '[', '{', '"', '`'] } }
})
export const logql = () => new LanguageSupport(logqlLanguage)
