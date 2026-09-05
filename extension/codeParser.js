const path = require('path')
const parser = require('@babel/parser')

const PARSABLE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])
const ROUTE_METHODS = new Set(['get', 'post', 'put', 'delete', 'patch'])

function isParsable(filePath) {
  return PARSABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function parseSourceFile(source, filePath = '') {
  const ast = parser.parse(source, {
    sourceType: 'unambiguous',
    errorRecovery: false,
    plugins: [
      'jsx',
      'typescript',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'decorators-legacy',
      'dynamicImport',
      'optionalChaining',
      'nullishCoalescingOperator',
    ],
  })

  const symbols = []
  const imports = []
  const importKeys = new Set()
  const apiRoutes = []
  const topLevelNames = new Set()
  const addSymbol = (name, kind, node, methods = [], extendsName = null, properties = []) => {
    if (!name || topLevelNames.has(name)) return
    topLevelNames.add(name)
    symbols.push({
      id: `${filePath}::${name}`,
      name,
      kind,
      methods,
      properties,
      extendsName,
      line: node.loc?.start.line || null,
      column: node.loc?.start.column || null,
    })
  }

  for (const statement of ast.program.body) {
    if (statement.type === 'ImportDeclaration' && statement.source.value.startsWith('.')) {
      addImport(statement.source.value, statement.specifiers.map((item) => item.local.name))
      continue
    }

    if (statement.type === 'ExportNamedDeclaration' && statement.source?.value?.startsWith('.')) {
      addImport(statement.source.value, [])
      continue
    }

    if (statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration') {
      const declaration = statement.declaration
      if (declaration) collectDeclaration(declaration)
      continue
    }

    collectDeclaration(statement)
  }

  function collectDeclaration(declaration) {
    if (declaration.type === 'ClassDeclaration' || declaration.type === 'ClassExpression') {
      const methods = declaration.body.body
        .filter((item) => item.type === 'ClassMethod' || item.type === 'ClassPrivateMethod')
        .map((item) => getNodeName(item.key))
        .filter(Boolean)
      const properties = declaration.body.body
        .filter((item) => item.type === 'ClassProperty' || item.type === 'ClassPrivateProperty')
        .map((item) => getNodeName(item.key))
        .filter(Boolean)
      addSymbol(declaration.id?.name, 'class', declaration, methods, getNodeName(declaration.superClass), properties)
      return
    }

    if (declaration.type === 'FunctionDeclaration') {
      addSymbol(declaration.id?.name, 'function', declaration)
      return
    }

    if (declaration.type === 'VariableDeclaration') {
      declaration.declarations.forEach((item) => {
        if (item.id.type !== 'Identifier') return
        if (item.init?.type === 'ArrowFunctionExpression' || item.init?.type === 'FunctionExpression') {
          addSymbol(item.id.name, 'function', item)
        }
      })
    }
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'CallExpression' && isRouteCall(node)) {
      const route = node.arguments[0]
      const handler = node.arguments[1]
      if (route?.type === 'StringLiteral') {
        apiRoutes.push({
          method: node.callee.property.name.toUpperCase(),
          path: route.value,
          handler: getNodeName(handler) || 'anonymous',
          line: node.loc?.start.line || null,
        })
      }
    }
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require') {
      const source = node.arguments[0]
      if (source?.type === 'StringLiteral' && source.value.startsWith('.')) addImport(source.value, [])
    }
    if (node.type === 'ImportExpression') {
      const source = node.source
      if (source?.type === 'StringLiteral' && source.value.startsWith('.')) addImport(source.value, [])
    }
    Object.keys(node).forEach((key) => {
      if (key === 'loc' || key === 'tokens' || key === 'comments') return
      const value = node[key]
      if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') walk(value)
    })
  }

  walk(ast.program)
  return { symbols, imports, apiRoutes }

  function addImport(source, names) {
    const key = source
    if (importKeys.has(key)) return
    importKeys.add(key)
    imports.push({ source, names })
  }
}

function isRouteCall(node) {
  const callee = node.callee
  return callee?.type === 'MemberExpression'
    && !callee.computed
    && (callee.object.type === 'Identifier' || callee.object.type === 'MemberExpression')
    && callee.property.type === 'Identifier'
    && ROUTE_METHODS.has(callee.property.name)
}

function getNodeName(node) {
  if (!node) return null
  if (node.type === 'Identifier') return node.name
  if (node.type === 'StringLiteral') return node.value
  if (node.type === 'PrivateName') return `#${getNodeName(node.id)}`
  return null
}

module.exports = { isParsable, parseSourceFile }
