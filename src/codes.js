const { codeExists, insertCode, getCode, redeemCode } = require('./database');

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: 0/O, 1/I

function generateCode(phone, name) {
  let code;
  let attempts = 0;
  const maxAttempts = 100;

  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
    }
    attempts++;
    if (attempts >= maxAttempts) {
      throw new Error('Could not generate unique code after maximum attempts');
    }
  } while (codeExists(code));

  insertCode(code, phone, name);
  return code;
}

function validateCode(code) {
  const normalized = code.toUpperCase().trim();
  return getCode(normalized);
}

function markCodeRedeemed(code) {
  const normalized = code.toUpperCase().trim();
  redeemCode(normalized);
}

module.exports = {
  generateCode,
  validateCode,
  markCodeRedeemed
};
