function isFunctionNode(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression'
  )
}

function insideFunctionBody(comment, functions) {
  const [start] = comment.range
  return functions.some((fn) => fn.body.type === 'BlockStatement' && start > fn.body.range[0] && start < fn.body.range[1])
}

export default {
  meta: {
    type: 'suggestion',
    messages: { noComment: 'Comments inside functions are not allowed. Name things so the code explains itself.' },
    schema: [],
  },
  create(context) {
    const functions = []
    return {
      ':function'(node) {
        if (isFunctionNode(node)) functions.push(node)
      },
      'Program:exit'() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (insideFunctionBody(comment, functions)) {
            context.report({ loc: comment.loc, messageId: 'noComment' })
          }
        }
      },
    }
  },
}
