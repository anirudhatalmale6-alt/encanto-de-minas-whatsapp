require('dotenv').config();

const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const { handleMessage, sendFollowup } = require('./flow');
const { getStats, getLeads, getAllCodes } = require('./database');
const { ensureHeaders } = require('./sheets');
const { processPending } = require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ==================== WEBHOOK ENDPOINTS ====================

// Verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }

  console.warn('Webhook verification failed');
  return res.sendStatus(403);
});

// Incoming messages (POST)
app.post('/webhook', async (req, res) => {
  // Always respond 200 quickly to avoid retries
  res.sendStatus(200);

  try {
    const body = req.body;

    if (!body.object || body.object !== 'whatsapp_business_account') {
      return;
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages') continue;

        const value = change.value;
        if (!value || !value.messages) continue;

        const messages = value.messages;
        for (const message of messages) {
          const phone = message.from;
          console.log(`[${new Date().toISOString()}] Message from ${phone}: type=${message.type}`);

          // Mark as read
          const wa = require('./whatsapp');
          wa.markAsRead(message.id).catch(() => {});

          // Process message
          await handleMessage(phone, message);
        }
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

// ==================== QR CODE ENDPOINT ====================

app.get('/qrcode', async (req, res) => {
  try {
    const phoneNumber = process.env.WHATSAPP_PHONE_NUMBER || '5534998053310';
    const message = req.query.msg || 'Quero experimentar';
    const waLink = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

    const format = req.query.format || 'png';

    if (format === 'svg') {
      const svg = await QRCode.toString(waLink, {
        type: 'svg',
        width: 400,
        margin: 2,
        color: { dark: '#8B1A1A', light: '#FFFFFF' }
      });
      res.type('svg').send(svg);
    } else {
      const png = await QRCode.toBuffer(waLink, {
        width: 600,
        margin: 2,
        color: { dark: '#8B1A1A', light: '#FFFFFF' }
      });
      res.type('png').send(png);
    }
  } catch (err) {
    console.error('QR code generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// QR code data URL (for embedding)
app.get('/qrcode/data', async (req, res) => {
  try {
    const phoneNumber = process.env.WHATSAPP_PHONE_NUMBER || '5534998053310';
    const message = req.query.msg || 'Quero experimentar';
    const waLink = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

    const dataUrl = await QRCode.toDataURL(waLink, {
      width: 600,
      margin: 2,
      color: { dark: '#8B1A1A', light: '#FFFFFF' }
    });

    res.json({ qr: dataUrl, link: waLink });
  } catch (err) {
    console.error('QR code data URL error:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ==================== API ENDPOINTS ====================

app.get('/api/stats', (req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/leads', (req, res) => {
  try {
    const leads = getLeads();
    res.json(leads);
  } catch (err) {
    console.error('Leads error:', err);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

app.get('/api/codes', (req, res) => {
  try {
    const codes = getAllCodes();
    res.json(codes);
  } catch (err) {
    console.error('Codes error:', err);
    res.status(500).json({ error: 'Failed to fetch codes' });
  }
});

app.get('/api/leads/csv', (req, res) => {
  try {
    const leads = getLeads();
    const headers = [
      'Timestamp', 'Nome', 'Cidade', 'Telefone', 'Codigo',
      'Feedback', 'Quer Distribuir', 'CEP', 'Exp. Vendas',
      'Prazo', 'Dedicacao', 'Investimento', 'Avaliacao', 'Motivo Nao'
    ];

    let csv = headers.join(',') + '\n';
    for (const lead of leads) {
      const d = lead.data;
      const row = [
        lead.created_at,
        escapeCsv(d.name || ''),
        escapeCsv(d.city || ''),
        d.contact_phone || lead.phone,
        lead.code || '',
        escapeCsv(d.tasting_feedback || ''),
        d.wants_distribution || '',
        d.cep || '',
        escapeCsv(d.sales_experience || ''),
        d.start_timeline || '',
        d.dedication || '',
        d.investment || '',
        d.product_rating || '',
        escapeCsv(d.reason_not_distributor || '')
      ];
      csv += row.join(',') + '\n';
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=encanto-leads.csv');
    res.send('﻿' + csv); // BOM for Excel UTF-8
  } catch (err) {
    console.error('CSV export error:', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

function escapeCsv(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ==================== ADMIN PAGE ====================

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ==================== STARTUP ====================

async function start() {
  // Initialize Google Sheets headers
  try {
    await ensureHeaders();
  } catch (err) {
    console.warn('Google Sheets initialization skipped:', err.message);
  }

  // Process any pending followup messages from before restart
  try {
    await processPending(sendFollowup);
  } catch (err) {
    console.warn('Pending followup processing error:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  Encanto de Minas WhatsApp Bot`);
    console.log(`  Server running on port ${PORT}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`  Webhook URL: ${process.env.BASE_URL || 'http://localhost:' + PORT}/webhook`);
    console.log(`  Admin:       http://localhost:${PORT}/admin`);
    console.log(`  QR Code:     http://localhost:${PORT}/qrcode`);
    console.log(`  Landing:     http://localhost:${PORT}/`);
    console.log(`${'='.repeat(50)}\n`);
  });
}

start().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  const { closeDb } = require('./database');
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  const { closeDb } = require('./database');
  closeDb();
  process.exit(0);
});
