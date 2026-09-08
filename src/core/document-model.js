/**
 * @typedef {{type:'message', role:'user'|'assistant'|'unknown', html:string}} Message
 * @typedef {{type:'conversation', metadata:{source:string}, items:Message[]}
 * | {type:'document', metadata:{source:string}, html:string}} SemanticDocument
 * @typedef {{code:string, message:string, itemIndex?:number}} Diagnostic
 */

export function conversation(items, source) {
  return { type: 'conversation', metadata: { source }, items };
}

export function document(html, source) {
  return { type: 'document', metadata: { source }, html };
}
