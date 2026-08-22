import { delimitedIndent, foldInside, foldNodeProp, indentNodeProp, LanguageSupport, LRLanguage } from '@codemirror/language'
import { styleTags, tags } from '@lezer/highlight'
import { parser } from '@grafana/lezer-traceql'

/** CodeMirror language support backed by Grafana's canonical TraceQL parser. */
export const traceqlLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [styleTags({
      'String': tags.string,
      'Integer Float Duration': tags.number,
      'Static': tags.bool,
      'IntrinsicField': tags.propertyName,
      'AttributeField': tags.variableName,
      'Resource Span Parent Event Instrumentation Link': tags.namespace,
      'And Or FieldOp ScalarOp ComparisonOp Pipe Desc Anc Gt Lt ExperimentalOp UnionStructuralOp': tags.operator,
      'Aggregate AggregateExpression GroupOperation SelectOperation CoalesceOperation MetricsOperationBasicType MetricsOverTimeType MetricsAggregatorFunctionType MetricsOperationHistogram MetricsOperationQuantile MetricsOperationCompare': tags.function(tags.variableName),
      'With': tags.keyword,
      'LineComment BlockComment': tags.comment
    }), indentNodeProp.add({
      SpansetFilter: delimitedIndent({ closing: '}' }),
      WrappedSpansetPipeline: delimitedIndent({ closing: ')' })
    }), foldNodeProp.add({
      SpansetFilter: foldInside,
      WrappedSpansetPipeline: foldInside
    })]
  }),
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    closeBrackets: { brackets: ['(', '[', '{', "'", '"', '`'] },
    indentOnInput: /^\s*[})]$/
  }
})

export function traceql(): LanguageSupport {
  return new LanguageSupport(traceqlLanguage)
}
