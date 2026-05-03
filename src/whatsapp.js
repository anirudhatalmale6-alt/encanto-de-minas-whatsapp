const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const API_URL = 'https://graph.facebook.com/v21.0';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json'
  };
}

function getPhoneId() {
  return process.env.WHATSAPP_PHONE_ID;
}

async function sendTextMessage(to, text) {
  try {
    const resp = await axios.post(
      `${API_URL}/${getPhoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text }
      },
      { headers: getHeaders() }
    );
    return resp.data;
  } catch (err) {
    console.error('sendTextMessage error:', err.response?.data || err.message);
    throw err;
  }
}

async function sendInteractiveButtons(to, body, buttons, header = null, footer = null) {
  // WhatsApp allows max 3 buttons
  const buttonObjects = buttons.slice(0, 3).map((btn, i) => ({
    type: 'reply',
    reply: {
      id: btn.id || `btn_${i}`,
      title: btn.title.substring(0, 20) // max 20 chars
    }
  }));

  const interactive = {
    type: 'button',
    body: { text: body }
  };

  if (header) {
    interactive.header = { type: 'text', text: header };
  }
  if (footer) {
    interactive.footer = { text: footer };
  }
  interactive.action = { buttons: buttonObjects };

  try {
    const resp = await axios.post(
      `${API_URL}/${getPhoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive
      },
      { headers: getHeaders() }
    );
    return resp.data;
  } catch (err) {
    console.error('sendInteractiveButtons error:', err.response?.data || err.message);
    throw err;
  }
}

async function sendInteractiveList(to, body, buttonText, sections, header = null, footer = null) {
  const interactive = {
    type: 'list',
    body: { text: body }
  };

  if (header) {
    interactive.header = { type: 'text', text: header };
  }
  if (footer) {
    interactive.footer = { text: footer };
  }

  interactive.action = {
    button: buttonText.substring(0, 20),
    sections: sections.map(section => ({
      title: section.title.substring(0, 24),
      rows: section.rows.map(row => ({
        id: row.id,
        title: row.title.substring(0, 24),
        description: row.description ? row.description.substring(0, 72) : undefined
      }))
    }))
  };

  try {
    const resp = await axios.post(
      `${API_URL}/${getPhoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive
      },
      { headers: getHeaders() }
    );
    return resp.data;
  } catch (err) {
    console.error('sendInteractiveList error:', err.response?.data || err.message);
    throw err;
  }
}

async function uploadMedia(filePath, mimeType) {
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', fs.createReadStream(filePath), {
      contentType: mimeType,
      filename: path.basename(filePath)
    });
    form.append('type', mimeType);

    const resp = await axios.post(
      `${API_URL}/${getPhoneId()}/media`,
      form,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          ...form.getHeaders()
        }
      }
    );
    return resp.data.id;
  } catch (err) {
    console.error('uploadMedia error:', err.response?.data || err.message);
    throw err;
  }
}

async function sendImage(to, imageIdOrUrl, caption = null) {
  const imageObj = {};

  // If it looks like a media ID (numeric), use id; otherwise use link
  if (/^\d+$/.test(imageIdOrUrl)) {
    imageObj.id = imageIdOrUrl;
  } else {
    imageObj.link = imageIdOrUrl;
  }

  if (caption) {
    imageObj.caption = caption;
  }

  try {
    const resp = await axios.post(
      `${API_URL}/${getPhoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: imageObj
      },
      { headers: getHeaders() }
    );
    return resp.data;
  } catch (err) {
    console.error('sendImage error:', err.response?.data || err.message);
    throw err;
  }
}

async function sendDocument(to, documentIdOrUrl, filename, caption = null) {
  const docObj = { filename };

  if (/^\d+$/.test(documentIdOrUrl)) {
    docObj.id = documentIdOrUrl;
  } else {
    docObj.link = documentIdOrUrl;
  }

  if (caption) {
    docObj.caption = caption;
  }

  try {
    const resp = await axios.post(
      `${API_URL}/${getPhoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: docObj
      },
      { headers: getHeaders() }
    );
    return resp.data;
  } catch (err) {
    console.error('sendDocument error:', err.response?.data || err.message);
    throw err;
  }
}

async function markAsRead(messageId) {
  try {
    await axios.post(
      `${API_URL}/${getPhoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId
      },
      { headers: getHeaders() }
    );
  } catch (err) {
    // Non-critical, just log
    console.error('markAsRead error:', err.response?.data || err.message);
  }
}

module.exports = {
  sendTextMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendImage,
  sendDocument,
  uploadMedia,
  markAsRead
};
