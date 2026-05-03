const { getSession, upsertSession, deleteSession } = require('./database');
const { generateCode } = require('./codes');
const { scheduleFollowup, cancelFollowup, markFollowupSent } = require('./scheduler');
const { appendLead } = require('./sheets');
const wa = require('./whatsapp');
const path = require('path');
const fs = require('fs');

// Presentation image paths
const IMAGE_DIR = process.env.IMAGE_DIR || path.join(__dirname, '..', '..');
const PRESENTATION_IMAGES = [
  path.join(IMAGE_DIR, 'Imagem 01.jpg'),
  path.join(IMAGE_DIR, 'Imagem 02.jpg'),
  path.join(IMAGE_DIR, 'Imagem 03.jpg'),
  path.join(IMAGE_DIR, 'imagem 04.jpg'),
  path.join(IMAGE_DIR, 'imagem 05.jpg')
];

// Uploaded media IDs cache (populated at runtime)
const mediaIdCache = new Map();

async function getMediaId(filePath) {
  if (mediaIdCache.has(filePath)) {
    return mediaIdCache.get(filePath);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Image file not found: ${filePath}`);
    return null;
  }

  try {
    const mediaId = await wa.uploadMedia(filePath, 'image/jpeg');
    mediaIdCache.set(filePath, mediaId);
    return mediaId;
  } catch (err) {
    console.error(`Failed to upload media ${filePath}:`, err.message);
    return null;
  }
}

// Extract user message text from webhook payload
function extractMessage(message) {
  if (!message) return { text: null, type: null, buttonId: null, listId: null };

  if (message.type === 'text') {
    return { text: message.text.body.trim(), type: 'text', buttonId: null, listId: null };
  }

  if (message.type === 'interactive') {
    if (message.interactive.type === 'button_reply') {
      return {
        text: message.interactive.button_reply.title,
        type: 'button',
        buttonId: message.interactive.button_reply.id,
        listId: null
      };
    }
    if (message.interactive.type === 'list_reply') {
      return {
        text: message.interactive.list_reply.title,
        type: 'list',
        buttonId: null,
        listId: message.interactive.list_reply.id
      };
    }
  }

  return { text: null, type: null, buttonId: null, listId: null };
}

// Main flow handler
async function handleMessage(phone, message) {
  const { text, type, buttonId, listId } = extractMessage(message);

  if (!text && type !== 'button' && type !== 'list') {
    // Unsupported message type (image, audio, etc.)
    await wa.sendTextMessage(phone,
      'Desculpe, no momento só consigo processar mensagens de texto. Por favor, digite sua resposta.'
    );
    return;
  }

  // Check for restart command
  if (text && text.toLowerCase() === 'reiniciar') {
    cancelFollowup(phone);
    deleteSession(phone);
    await wa.sendTextMessage(phone,
      'Conversa reiniciada! Vamos começar de novo.'
    );
    await startWelcome(phone);
    return;
  }

  // Get or create session
  let session = getSession(phone);

  if (!session) {
    // New user - start welcome flow
    await startWelcome(phone);
    return;
  }

  const stage = session.stage;
  const data = session.data;

  try {
    switch (stage) {
      case 'ask_name':
        await handleAskName(phone, text, data);
        break;

      case 'ask_city':
        await handleAskCity(phone, text, data);
        break;

      case 'ask_phone':
        await handleAskPhone(phone, text, data);
        break;

      case 'code_sent':
        // User messaging after code sent but before followup
        await wa.sendTextMessage(phone,
          `Seu código de retirada é: *${data.pickup_code}*\n\nAguarde um momento, em breve entraremos em contato para saber o que achou dos nossos pães de queijo! 🧀`
        );
        break;

      case 'followup_sent':
        await handleTastingFeedback(phone, text, data);
        break;

      case 'distributor_question':
        await handleDistributorQuestion(phone, text, buttonId, data);
        break;

      // Distributor (Sim) path - Form 2
      case 'form2_name':
        await handleForm2Name(phone, text, data);
        break;

      case 'form2_cep':
        await handleForm2Cep(phone, text, data);
        break;

      case 'form2_sales':
        await handleForm2Sales(phone, text, data);
        break;

      case 'form2_timeline':
        await handleForm2Timeline(phone, text, buttonId, data);
        break;

      case 'form2_dedication':
        await handleForm2Dedication(phone, text, buttonId, data);
        break;

      case 'form2_investment':
        await handleForm2Investment(phone, text, buttonId, data);
        break;

      // Survey (Não) path
      case 'survey_rating':
        await handleSurveyRating(phone, text, buttonId, listId, data);
        break;

      case 'survey_reason':
        await handleSurveyReason(phone, text, listId, data);
        break;

      case 'completed':
        await wa.sendTextMessage(phone,
          'Obrigado! Sua conversa já foi finalizada.\n\nDigite *reiniciar* se quiser começar novamente.'
        );
        break;

      default:
        console.warn(`Unknown stage: ${stage} for ${phone}`);
        await startWelcome(phone);
        break;
    }
  } catch (err) {
    console.error(`Flow error for ${phone} at stage ${stage}:`, err);
    await wa.sendTextMessage(phone,
      'Desculpe, ocorreu um erro. Por favor, tente novamente ou digite *reiniciar*.'
    );
  }
}

// ==================== STAGE 1: WELCOME & REGISTRATION ====================

async function startWelcome(phone) {
  upsertSession(phone, 'ask_name', {});

  await wa.sendTextMessage(phone,
    'Bem-vindo(a) à *Encanto de Minas*! 🧀✨\n\n' +
    'Somos fabricantes de pão de queijo congelado artesanal, feito com ingredientes selecionados de Minas Gerais.\n\n' +
    'Vamos fazer um rápido cadastro para você experimentar nossos produtos!\n\n' +
    'Qual é o seu *nome*?'
  );
}

async function handleAskName(phone, text, data) {
  if (!text || text.length < 2) {
    await wa.sendTextMessage(phone, 'Por favor, digite seu nome completo.');
    return;
  }

  data.name = text;
  upsertSession(phone, 'ask_city', data);

  await wa.sendTextMessage(phone, `Prazer, ${text}! 😊\n\nQual é a sua *cidade*?`);
}

async function handleAskCity(phone, text, data) {
  if (!text || text.length < 2) {
    await wa.sendTextMessage(phone, 'Por favor, digite o nome da sua cidade.');
    return;
  }

  data.city = text;
  upsertSession(phone, 'ask_phone', data);

  await wa.sendTextMessage(phone,
    'Qual é o seu *número de telefone/WhatsApp*?\n\n(Pode ser este mesmo número ou outro que você prefira)'
  );
}

async function handleAskPhone(phone, text, data) {
  if (!text || text.length < 8) {
    await wa.sendTextMessage(phone, 'Por favor, digite um número de telefone válido.');
    return;
  }

  data.contact_phone = text;

  // Generate unique pickup code
  const code = generateCode(phone, data.name);
  data.pickup_code = code;

  upsertSession(phone, 'code_sent', data);

  await wa.sendTextMessage(phone,
    `✅ Cadastro realizado com sucesso!\n\n` +
    `🎫 Seu código de retirada é: *${code}*\n\n` +
    `Apresente este código no nosso stand para experimentar nossos deliciosos pães de queijo!\n\n` +
    `Após a degustação, enviaremos uma mensagem para saber o que achou. 😋`
  );

  // Schedule followup
  const delay = parseInt(process.env.FOLLOWUP_DELAY_MINUTES) || 5;
  scheduleFollowup(phone, delay, sendFollowup);
}

// ==================== STAGE 2: POST-TASTING FOLLOWUP ====================

async function sendFollowup(phone) {
  const session = getSession(phone);
  if (!session) return;

  // Only send followup if user is still at code_sent stage
  if (session.stage !== 'code_sent') {
    console.log(`Skipping followup for ${phone} - stage is ${session.stage}`);
    return;
  }

  markFollowupSent(phone);
  upsertSession(phone, 'followup_sent', session.data);

  await wa.sendTextMessage(phone,
    'Já experimentou nossos pães de queijo? O que achou? 🧀😋'
  );
}

async function handleTastingFeedback(phone, text, data) {
  if (!text || text.length < 2) {
    await wa.sendTextMessage(phone, 'Por favor, conte-nos o que achou dos nossos pães de queijo!');
    return;
  }

  data.tasting_feedback = text;
  upsertSession(phone, 'distributor_question', data);

  await wa.sendInteractiveButtons(phone,
    'Que ótimo saber sua opinião! 🙏\n\nGostaria de ser um *distribuidor Encanto de Minas*?',
    [
      { id: 'dist_sim', title: 'Sim' },
      { id: 'dist_nao', title: 'Não' }
    ]
  );
}

async function handleDistributorQuestion(phone, text, buttonId, data) {
  const answer = buttonId === 'dist_sim' ? 'Sim'
    : buttonId === 'dist_nao' ? 'Não'
    : text && text.toLowerCase().includes('sim') ? 'Sim'
    : text && text.toLowerCase().includes('não') ? 'Não'
    : null;

  if (!answer) {
    await wa.sendInteractiveButtons(phone,
      'Por favor, selecione uma das opções:',
      [
        { id: 'dist_sim', title: 'Sim' },
        { id: 'dist_nao', title: 'Não' }
      ]
    );
    return;
  }

  data.wants_distribution = answer;

  if (answer === 'Sim') {
    // Start distributor form
    upsertSession(phone, 'form2_name', data);
    await wa.sendTextMessage(phone,
      '🌟 Que ótimo! Vamos coletar algumas informações para avaliar sua candidatura.\n\nQual é o seu *nome completo*?'
    );
  } else {
    // Start survey
    upsertSession(phone, 'survey_rating', data);
    await sendRatingQuestion(phone);
  }
}

// ==================== STAGE 3A: DISTRIBUTOR PATH (Form 2) ====================

async function handleForm2Name(phone, text, data) {
  if (!text || text.length < 2) {
    await wa.sendTextMessage(phone, 'Por favor, digite seu nome completo.');
    return;
  }

  data.dist_name = text;
  upsertSession(phone, 'form2_cep', data);

  await wa.sendTextMessage(phone, 'Qual é o seu *CEP*?');
}

async function handleForm2Cep(phone, text, data) {
  if (!text || text.length < 5) {
    await wa.sendTextMessage(phone, 'Por favor, digite um CEP válido.');
    return;
  }

  data.cep = text;
  upsertSession(phone, 'form2_sales', data);

  await wa.sendTextMessage(phone, 'Já *trabalhou ou trabalha com vendas*? Conte-nos um pouco sobre sua experiência.');
}

async function handleForm2Sales(phone, text, data) {
  if (!text || text.length < 2) {
    await wa.sendTextMessage(phone, 'Por favor, nos conte sobre sua experiência com vendas.');
    return;
  }

  data.sales_experience = text;
  upsertSession(phone, 'form2_timeline', data);

  await wa.sendInteractiveButtons(phone,
    'Em quanto tempo pretende *começar este negócio*?',
    [
      { id: 'time_imediato', title: 'Imediatamente' },
      { id: 'time_2meses', title: 'Em 2 meses' },
      { id: 'time_4meses', title: 'Em 4 meses' }
    ]
  );
}

async function handleForm2Timeline(phone, text, buttonId, data) {
  const timelineMap = {
    'time_imediato': 'Imediatamente',
    'time_2meses': 'Em 2 meses',
    'time_4meses': 'Em 4 meses'
  };

  const answer = timelineMap[buttonId] || text;
  if (!answer) {
    await wa.sendInteractiveButtons(phone,
      'Por favor, selecione uma opção:',
      [
        { id: 'time_imediato', title: 'Imediatamente' },
        { id: 'time_2meses', title: 'Em 2 meses' },
        { id: 'time_4meses', title: 'Em 4 meses' }
      ]
    );
    return;
  }

  data.start_timeline = answer;
  upsertSession(phone, 'form2_dedication', data);

  await wa.sendInteractiveButtons(phone,
    'Pretende se dedicar à distribuição em *tempo integral ou parcial*?',
    [
      { id: 'ded_integral', title: 'Integral' },
      { id: 'ded_parcial', title: 'Parcial' }
    ]
  );
}

async function handleForm2Dedication(phone, text, buttonId, data) {
  const dedMap = {
    'ded_integral': 'Integral',
    'ded_parcial': 'Parcial'
  };

  const answer = dedMap[buttonId] || text;
  if (!answer) {
    await wa.sendInteractiveButtons(phone,
      'Por favor, selecione uma opção:',
      [
        { id: 'ded_integral', title: 'Integral' },
        { id: 'ded_parcial', title: 'Parcial' }
      ]
    );
    return;
  }

  data.dedication = answer;
  upsertSession(phone, 'form2_investment', data);

  await wa.sendInteractiveButtons(phone,
    'Quanto pretende *investir* neste negócio?',
    [
      { id: 'inv_25k', title: '25.000 a 35.000' },
      { id: 'inv_35k', title: '35.001 a 100.000' },
      { id: 'inv_100k', title: '100.001 a 350.000' }
    ]
  );
}

async function handleForm2Investment(phone, text, buttonId, data) {
  const invMap = {
    'inv_25k': 'R$ 25.000 a R$ 35.000',
    'inv_35k': 'R$ 35.001 a R$ 100.000',
    'inv_100k': 'R$ 100.001 a R$ 350.000'
  };

  const answer = invMap[buttonId] || text;
  if (!answer) {
    await wa.sendInteractiveButtons(phone,
      'Por favor, selecione a faixa de investimento:',
      [
        { id: 'inv_25k', title: '25.000 a 35.000' },
        { id: 'inv_35k', title: '35.001 a 100.000' },
        { id: 'inv_100k', title: '100.001 a 350.000' }
      ]
    );
    return;
  }

  data.investment = answer;
  upsertSession(phone, 'completed', data);

  // Send presentation images
  await wa.sendTextMessage(phone,
    '🌟 Obrigado por seu interesse!\n\nVeja nossa apresentação:'
  );

  for (const imgPath of PRESENTATION_IMAGES) {
    try {
      const mediaId = await getMediaId(imgPath);
      if (mediaId) {
        await wa.sendImage(phone, mediaId);
        // Small delay between images to avoid rate limiting
        await sleep(1000);
      }
    } catch (err) {
      console.error(`Failed to send image ${imgPath}:`, err.message);
    }
  }

  await wa.sendTextMessage(phone,
    '🙏 *Muito obrigado pelo seu interesse em ser um distribuidor Encanto de Minas!*\n\n' +
    'Nossa equipe entrará em contato em breve para dar continuidade.\n\n' +
    'Salve nosso WhatsApp para contato:\n📱 *(34) 99805-3310*\n\n' +
    'Até logo!'
  );

  // Save to Google Sheets
  await appendLead({
    name: data.name,
    city: data.city,
    phone: data.contact_phone || phone,
    pickup_code: data.pickup_code,
    tasting_feedback: data.tasting_feedback,
    wants_distribution: 'Sim',
    cep: data.cep,
    sales_experience: data.sales_experience,
    start_timeline: data.start_timeline,
    dedication: data.dedication,
    investment: data.investment
  });
}

// ==================== STAGE 3B: NON-DISTRIBUTOR SURVEY ====================

async function sendRatingQuestion(phone) {
  // Buttons for top 3 + list for remaining
  await wa.sendInteractiveList(phone,
    'O que achou dos nossos pães de queijo?',
    'Escolher avaliação',
    [
      {
        title: 'Avaliação',
        rows: [
          { id: 'rate_fantastico', title: 'Fantástico', description: 'Melhor pão de queijo que já provei!' },
          { id: 'rate_otimo', title: 'Ótimo', description: 'Muito bom, gostei bastante!' },
          { id: 'rate_bom', title: 'Bom', description: 'Gostei, é bom.' },
          { id: 'rate_normal', title: 'Normal', description: 'Nada de especial.' },
          { id: 'rate_ruim', title: 'Ruim', description: 'Não gostei.' }
        ]
      }
    ]
  );
}

async function handleSurveyRating(phone, text, buttonId, listId, data) {
  const ratingMap = {
    'rate_fantastico': 'Fantástico',
    'rate_otimo': 'Ótimo',
    'rate_bom': 'Bom',
    'rate_normal': 'Normal',
    'rate_ruim': 'Ruim'
  };

  const id = listId || buttonId;
  const answer = ratingMap[id] || text;

  if (!answer || !Object.values(ratingMap).includes(answer)) {
    await sendRatingQuestion(phone);
    return;
  }

  data.product_rating = answer;
  upsertSession(phone, 'survey_reason', data);

  await wa.sendInteractiveList(phone,
    'Por que não gostaria de ser um distribuidor?',
    'Escolher motivo',
    [
      {
        title: 'Motivo',
        rows: [
          { id: 'reason_produto', title: 'Não gostei dos produtos' },
          { id: 'reason_negocio', title: 'Não acredito no negócio' },
          { id: 'reason_tempo', title: 'Não tenho tempo' },
          { id: 'reason_dinheiro', title: 'Não tenho dinheiro' },
          { id: 'reason_outro', title: 'Outro' }
        ]
      }
    ]
  );
}

async function handleSurveyReason(phone, text, listId, data) {
  const reasonMap = {
    'reason_produto': 'Não gostei dos produtos',
    'reason_negocio': 'Não acredito no negócio',
    'reason_tempo': 'Não tenho tempo disponível',
    'reason_dinheiro': 'Não tenho dinheiro/crédito',
    'reason_outro': 'Outro'
  };

  const answer = reasonMap[listId] || text;

  if (!answer) {
    await wa.sendInteractiveList(phone,
      'Por favor, selecione o motivo:',
      'Escolher motivo',
      [
        {
          title: 'Motivo',
          rows: [
            { id: 'reason_produto', title: 'Não gostei dos produtos' },
            { id: 'reason_negocio', title: 'Não acredito no negócio' },
            { id: 'reason_tempo', title: 'Não tenho tempo' },
            { id: 'reason_dinheiro', title: 'Não tenho dinheiro' },
            { id: 'reason_outro', title: 'Outro' }
          ]
        }
      ]
    );
    return;
  }

  data.reason_not_distributor = answer;
  upsertSession(phone, 'completed', data);

  // Send catalog placeholder
  // TODO: Replace with actual catalog PDF URL or media ID when available
  await wa.sendTextMessage(phone,
    '📚 Confira nosso catálogo de produtos:\n(Em breve disponibilizaremos o catálogo completo em PDF)'
  );

  await wa.sendTextMessage(phone,
    'Obrigado por experimentar nossos produtos! 🙏\n\n' +
    'Salve nosso WhatsApp para contatos no futuro:\n' +
    '📱 *(34) 99805-3310*\n\n' +
    'Até a próxima!'
  );

  // Save to Google Sheets
  await appendLead({
    name: data.name,
    city: data.city,
    phone: data.contact_phone || phone,
    pickup_code: data.pickup_code,
    tasting_feedback: data.tasting_feedback,
    wants_distribution: 'Não',
    product_rating: data.product_rating,
    reason_not_distributor: data.reason_not_distributor
  });
}

// Utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  handleMessage,
  sendFollowup
};
