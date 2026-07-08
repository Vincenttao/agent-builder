// Exposes the templates root directory to the API's TemplateEngine.
// Plain JS (no build) so it resolves at runtime and under ts-jest.
const path = require('node:path');

function getRoot() {
  return __dirname;
}

function agentTemplateDir() {
  return path.join(__dirname, 'agent');
}

function workflowTemplateDir() {
  return path.join(__dirname, 'workflow');
}

module.exports = { getRoot, agentTemplateDir, workflowTemplateDir };
