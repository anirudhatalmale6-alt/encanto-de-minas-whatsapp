const { google } = require('googleapis');
const path = require('path');

let sheetsClient = null;
let authClient = null;

async function getAuth() {
  if (authClient) return authClient;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyPath) {
    console.warn('GOOGLE_SERVICE_ACCOUNT_KEY not set - Google Sheets integration disabled');
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(keyPath),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    authClient = await auth.getClient();
    return authClient;
  } catch (err) {
    console.error('Google Sheets auth error:', err.message);
    return null;
  }
}

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  const auth = await getAuth();
  if (!auth) return null;

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

function formatTimestamp() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function appendLead(data) {
  const sheets = await getSheetsClient();
  if (!sheets) {
    console.warn('Sheets client not available - lead not saved to Google Sheets');
    console.log('Lead data (local only):', JSON.stringify(data));
    return false;
  }

  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) {
    console.warn('GOOGLE_SHEETS_ID not set');
    return false;
  }

  // Build row matching the sheet columns:
  // Timestamp | Name | City | Phone | Pickup Code | Tasting Feedback |
  // Wants Distribution | CEP | Sales Experience | Start Timeline |
  // Dedication | Investment Amount | Product Rating | Reason Not Distributor
  const row = [
    formatTimestamp(),
    data.name || '',
    data.city || '',
    data.phone || '',
    data.pickup_code || '',
    data.tasting_feedback || '',
    data.wants_distribution || '',
    data.cep || '',
    data.sales_experience || '',
    data.start_timeline || '',
    data.dedication || '',
    data.investment || '',
    data.product_rating || '',
    data.reason_not_distributor || ''
  ];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Leads!A:N',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [row]
      }
    });
    console.log(`Lead appended to Google Sheets for ${data.phone}`);
    return true;
  } catch (err) {
    console.error('Google Sheets append error:', err.message);
    return false;
  }
}

async function ensureHeaders() {
  const sheets = await getSheetsClient();
  if (!sheets) return;

  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) return;

  try {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Leads!A1:N1'
    });

    if (!resp.data.values || resp.data.values.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Leads!A1:N1',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            'Timestamp', 'Nome', 'Cidade', 'Telefone', 'Codigo Retirada',
            'Feedback Degustacao', 'Quer Distribuir', 'CEP',
            'Experiencia Vendas', 'Prazo Inicio', 'Dedicacao',
            'Investimento', 'Avaliacao Produto', 'Motivo Nao Distribuidor'
          ]]
        }
      });
      console.log('Google Sheets headers created');
    }
  } catch (err) {
    console.error('ensureHeaders error:', err.message);
  }
}

module.exports = {
  appendLead,
  ensureHeaders
};
