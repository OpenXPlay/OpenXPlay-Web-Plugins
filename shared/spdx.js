// SPDX-FileCopyrightText: 2026 OpenXPlay.org
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Created by riko chen on 2026-10-16

// Validate expression syntax without maintaining an SPDX licence registry.
export function spdxExpression(value) {
  if (typeof value!=='string') return false;
  const tokens=value.match(/\(|\)|[^\s()]+/g)??[];let position=0;
  const identifier=token=>typeof token==='string' && !['AND','OR','WITH'].includes(token) && /^(?:DocumentRef-[A-Za-z0-9.-]+:)?[A-Za-z0-9][A-Za-z0-9.+-]*$/.test(token);
  function atom() {
    if(tokens[position]==='('){position++;if(!expression() || tokens[position++]!==')')return false;return true;}
    if(!identifier(tokens[position++]))return false;
    if(tokens[position]==='WITH'){position++;if(!identifier(tokens[position++]))return false;}
    return true;
  }
  function conjunction(){if(!atom())return false;while(tokens[position]==='AND'){position++;if(!atom())return false;}return true;}
  function expression(){if(!conjunction())return false;while(tokens[position]==='OR'){position++;if(!conjunction())return false;}return true;}
  return expression() && position===tokens.length;
}
export function languageTag(value) {
  if(/^x(?:-[a-z0-9]{1,8})+$/i.test(value))return true;
  if(/^(?:en-GB-oed|i-(?:ami|bnn|default|enochian|hak|klingon|lux|mingo|navajo|pwn|tao|tay|tsu)|sgn-(?:BE-FR|BE-NL|CH-DE)|art-lojban|cel-gaulish|no-bok|no-nyn|zh-(?:guoyu|hakka|min|min-nan|xiang))$/i.test(value))return true;
  try{return Intl.getCanonicalLocales(value).length===1;}catch{return false;}
}
